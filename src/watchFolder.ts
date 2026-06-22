import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq, ne, inArray, between, desc, asc } from 'drizzle-orm';
/**
 * Watch-folder integration via the File System Access API.
 *
 * High-level model:
 *   - User picks a folder once → handle persists to Dexie
 *   - Each scan: list files, hash content, filter to ones not yet imported
 *   - Browser permission can lapse between sessions → we re-prompt on demand
 *
 * Supported in Chrome/Edge (full) and Safari 16.4+ (full).
 * Firefox: not yet supported → caller should fall back to drag-and-drop.
 */


import { sha256 } from './hash';
import { detectSource, type ParseResult } from './parsers';
import type {
  PostImportAction,
  WatchFolderConfig,
} from './types';

const SETTINGS_KEY = 'watchFolder';

export function isWatchFolderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown })
      .showDirectoryPicker === 'function'
  );
}

export async function getConfig(): Promise<WatchFolderConfig | null> {
  const row = await (await db.select().from(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY)))[0];
  return (row?.value as WatchFolderConfig | undefined) ?? null;
}

export async function setConfig(config: WatchFolderConfig): Promise<void> {
  await db.insert(schema.settings).values({ key: SETTINGS_KEY, value: config }).onConflictDoNothing();
}

export async function clearConfig(): Promise<void> {
  await db.delete(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY));
}

export interface PickerResult {
  handle: FileSystemDirectoryHandle;
  name: string;
}

export async function pickFolder(): Promise<PickerResult> {
  if (!isWatchFolderSupported()) {
    throw new Error('Folder picker is not supported in this browser');
  }
  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts: {
        mode: 'read' | 'readwrite';
      }) => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  const handle = await picker({ mode: 'readwrite' });
  return { handle, name: handle.name };
}

type PermState = 'granted' | 'prompt' | 'denied';

interface HandleWithPermissions extends FileSystemDirectoryHandle {
  queryPermission?: (opts: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermState>;
  requestPermission?: (opts: {
    mode: 'read' | 'readwrite';
  }) => Promise<PermState>;
}

export async function checkPermission(
  handle: FileSystemDirectoryHandle
): Promise<PermState> {
  const h = handle as HandleWithPermissions;
  if (!h.queryPermission) return 'granted'; // browser doesn't gate, assume OK
  return await h.queryPermission({ mode: 'readwrite' });
}

export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<PermState> {
  const h = handle as HandleWithPermissions;
  if (!h.requestPermission) return 'granted';
  return await h.requestPermission({ mode: 'readwrite' });
}

export interface PendingFile {
  /** Display name; includes subfolder path when found below the root (e.g.
   *  `Chase/2026/january.csv`). */
  name: string;
  contentHash: string;
  text: string;
  source: ReturnType<typeof detectSource>;
  fileHandle: FileSystemFileHandle;
  /** Directory containing the file — needed by postImport to remove the
   *  file from the right parent when the watch folder has subfolders. */
  parentHandle: FileSystemDirectoryHandle;
  size: number;
}

export interface SkippedFile {
  /** Display name, may include subfolder path. */
  name: string;
  reason: 'already-imported' | 'unknown-format';
  contentHash?: string;
  importedAt?: string;
}

export interface ScanResult {
  pending: PendingFile[];
  skipped: SkippedFile[];
  scannedAt: string;
}

/** How many directories deep we'll descend. Five levels is plenty for the
 *  typical `Banking/2026/Chase/` shape and prevents runaway recursion if a
 *  user accidentally points us at a huge folder tree. */
const MAX_SCAN_DEPTH = 5;

/**
 * Recursively walk the folder (and subfolders, up to MAX_SCAN_DEPTH), hash
 * every CSV, and bucket each as:
 *   - already-imported (hash matches a row in the `imports` table)
 *   - unknown-format (no parser detects it; the user will see this and may
 *     either ignore or share the file format with us to add a parser)
 *   - pending (a new, recognizable file ready to import)
 *
 * Subfolder support means a folder like
 *   Banking/2026/Chase/jan.csv
 *   Banking/2026/BOA/jan.csv
 * works without flattening. Files report their relative path in `name`.
 *
 * CSV files only — anything else is silently ignored (so a user's folder
 * can also hold backups, notes, screenshots, etc. without noise). Hidden
 * entries (any name starting with `.`) are skipped, including our own
 * `.imported/` archive.
 */
export async function scanFolder(
  handle: FileSystemDirectoryHandle
): Promise<ScanResult> {
  const pending: PendingFile[] = [];
  const skipped: SkippedFile[] = [];

  // Pre-load all imported hashes (1 query, then in-memory lookup)
  const imports = await db.select().from(schema.imports);
  const importedHashes = new Map<string, string>();
  for (const imp of imports) {
    if (imp.contentHash) {
      importedHashes.set(imp.contentHash, imp.importedAt);
    }
  }

  await walkDirectory(handle, '', 0, importedHashes, pending, skipped);

  return {
    pending,
    skipped,
    scannedAt: new Date().toISOString(),
  };
}

async function walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  pathPrefix: string,
  depth: number,
  importedHashes: Map<string, string>,
  pending: PendingFile[],
  skipped: SkippedFile[]
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;

  for await (const [name, entry] of (
    dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>
  )) {
    // Skip hidden entries (.imported/, .DS_Store, .git/, etc.)
    if (name.startsWith('.')) continue;

    const relPath = pathPrefix ? `${pathPrefix}/${name}` : name;

    if (entry.kind === 'directory') {
      await walkDirectory(
        entry as FileSystemDirectoryHandle,
        relPath,
        depth + 1,
        importedHashes,
        pending,
        skipped
      );
      continue;
    }

    if (entry.kind !== 'file') continue;
    if (!/\.csv$/i.test(name)) continue;

    const fileHandle = entry as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const text = await file.text();
    const contentHash = await sha256(text);

    if (importedHashes.has(contentHash)) {
      skipped.push({
        name: relPath,
        reason: 'already-imported',
        contentHash,
        importedAt: importedHashes.get(contentHash),
      });
      continue;
    }

    const source = detectSource(text);
    if (!source) {
      skipped.push({
        name: relPath,
        reason: 'unknown-format',
        contentHash,
      });
      continue;
    }

    pending.push({
      name: relPath,
      contentHash,
      text,
      source,
      fileHandle,
      parentHandle: dirHandle,
      size: file.size,
    });
  }
}

/**
 * After a successful import, optionally move the file out of the watch
 * folder so the next scan doesn't see it.
 *
 * - 'leave'  — no-op.
 * - 'delete' — removes the file from its containing directory.
 * - 'move'   — copies to `.imported/{YYYY-MM}/` at the WATCH-FOLDER ROOT
 *              (kept flat regardless of how deep the source was nested),
 *              then deletes the original.
 *
 * `parentHandle` is the directory the file lives in — at the root that's
 * the same as `folderHandle`, but for files found in subfolders it's the
 * subfolder. This lets us delete via the correct parent.
 */
export async function postImport(
  folderHandle: FileSystemDirectoryHandle,
  parentHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle,
  action: PostImportAction
): Promise<void> {
  if (action === 'leave') return;

  if (action === 'delete') {
    await parentHandle.removeEntry(fileHandle.name);
    return;
  }

  // Move: copy to .imported/{YYYY-MM}/ at the watch-folder root, then
  // delete the original from its parent directory.
  const date = new Date();
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const importedRoot = await folderHandle.getDirectoryHandle('.imported', {
    create: true,
  });
  const monthFolder = await importedRoot.getDirectoryHandle(ym, {
    create: true,
  });
  // If a file with the same name already exists in the archive, prefix
  // with timestamp. This also covers the case where two subfolders held
  // files with identical base names.
  let targetName = fileHandle.name;
  try {
    await monthFolder.getFileHandle(targetName);
    // exists — pick a unique name
    const stamp = date.toISOString().replace(/[:.]/g, '-');
    targetName = `${stamp}-${targetName}`;
  } catch {
    /* file does not exist → use original name */
  }
  const src = await fileHandle.getFile();
  const dest = await monthFolder.getFileHandle(targetName, { create: true });
  const writable = await dest.createWritable();
  await writable.write(await src.arrayBuffer());
  await writable.close();
  await parentHandle.removeEntry(fileHandle.name);
}

export interface ImportSummary {
  filename: string;
  source: string;
  newCount: number;
  duplicateCount: number;
  totalRows: number;
}

// Re-export ParseResult shape for callers that want to use it.
export type { ParseResult };
