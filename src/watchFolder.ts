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

import { db } from './db';
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
  const row = await db.settings.get(SETTINGS_KEY);
  return (row?.value as WatchFolderConfig | undefined) ?? null;
}

export async function setConfig(config: WatchFolderConfig): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: config });
}

export async function clearConfig(): Promise<void> {
  await db.settings.delete(SETTINGS_KEY);
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
  name: string;
  contentHash: string;
  text: string;
  source: ReturnType<typeof detectSource>;
  fileHandle: FileSystemFileHandle;
  size: number;
}

export interface SkippedFile {
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

/**
 * Iterate every file in the folder, hash each, and bucket as:
 *   - already-imported (hash matches a row in the `imports` table)
 *   - unknown-format (no parser detects it; the user will see this and may
 *     either ignore or share the file format with us to add a parser)
 *   - pending (a new, recognizable file ready to import)
 *
 * CSV files only — anything else is silently ignored (so a user's folder
 * can also hold backups, notes, screenshots, etc. without noise).
 */
export async function scanFolder(
  handle: FileSystemDirectoryHandle
): Promise<ScanResult> {
  const pending: PendingFile[] = [];
  const skipped: SkippedFile[] = [];

  // Pre-load all imported hashes (1 query, then in-memory lookup)
  const imports = await db.imports.toArray();
  const importedHashes = new Map<string, string>();
  for (const imp of imports) {
    if (imp.contentHash) {
      importedHashes.set(imp.contentHash, imp.importedAt);
    }
  }

  // Iterate folder entries
  for await (const [name, entry] of (
    handle as unknown as AsyncIterable<[string, FileSystemHandle]>
  )) {
    if (entry.kind !== 'file') continue;
    if (!/\.csv$/i.test(name)) continue;
    // Don't re-scan our own .imported/ archive
    if (name.startsWith('.')) continue;

    const fileHandle = entry as FileSystemFileHandle;
    const file = await fileHandle.getFile();
    const text = await file.text();
    const contentHash = await sha256(text);

    if (importedHashes.has(contentHash)) {
      skipped.push({
        name,
        reason: 'already-imported',
        contentHash,
        importedAt: importedHashes.get(contentHash),
      });
      continue;
    }

    const source = detectSource(text);
    if (!source) {
      skipped.push({
        name,
        reason: 'unknown-format',
        contentHash,
      });
      continue;
    }

    pending.push({
      name,
      contentHash,
      text,
      source,
      fileHandle,
      size: file.size,
    });
  }

  return {
    pending,
    skipped,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * After a successful import, optionally move the file out of the watch
 * folder so the next scan doesn't see it. The "move" archives to
 * `.imported/{YYYY-MM}/filename` within the same folder; "delete" removes.
 */
export async function postImport(
  folderHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle,
  action: PostImportAction
): Promise<void> {
  if (action === 'leave') return;

  if (action === 'delete') {
    await folderHandle.removeEntry(fileHandle.name);
    return;
  }

  // Move: copy to .imported/{YYYY-MM}/ then delete the original.
  const date = new Date();
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const importedRoot = await folderHandle.getDirectoryHandle('.imported', {
    create: true,
  });
  const monthFolder = await importedRoot.getDirectoryHandle(ym, {
    create: true,
  });
  // If a file with the same name already exists in the archive, prefix with timestamp
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
  await folderHandle.removeEntry(fileHandle.name);
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
