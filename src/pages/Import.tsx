import { useState, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import RestoreIcon from '@mui/icons-material/Restore';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RefreshIcon from '@mui/icons-material/Refresh';
import { buildPreview, commitPreview, type ImportPreview } from '../import';
import { usdCents } from '../lib';
import { db } from '../db';
import { sha256 } from '../hash';
import {
  exportToJson,
  importFromJson,
  parseAndValidate,
  triggerDownload,
  type BackupFile,
  BackupValidationError,
} from '../backup';
import { SEED_VERSION } from '../seed';
import {
  checkPermission,
  requestPermission,
  scanFolder,
  postImport,
  type PendingFile,
} from '../watchFolder';
import type { WatchFolderConfig } from '../types';

const SOURCE_LABELS: Record<string, string> = {
  chase: 'Chase',
  'boa-credit': 'BOA Credit Card',
  'boa-checking': 'BOA Checking',
  'truist-checking': 'Truist Checking',
};

export default function Import() {
  const [previews, setPreviews] = useState<ImportPreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [committedSummary, setCommittedSummary] = useState<string | null>(null);
  const [newUncategorizedCount, setNewUncategorizedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Backup/restore state
  const [exportSummary, setExportSummary] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restorePreview, setRestorePreview] = useState<BackupFile | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  // Watch folder state
  const watchSetting = useLiveQuery(() => db.settings.get('watchFolder'), []);
  const watchConfig = watchSetting?.value as WatchFolderConfig | undefined;
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  const onScanWatchFolder = useCallback(async () => {
    if (!watchConfig?.handle) return;
    setScanning(true);
    setScanError(null);
    try {
      let perm = await checkPermission(watchConfig.handle);
      if (perm === 'prompt') perm = await requestPermission(watchConfig.handle);
      if (perm !== 'granted') {
        setScanError('Folder access not granted. Open Settings to re-grant.');
        return;
      }
      const result = await scanFolder(watchConfig.handle);
      setPendingFiles(result.pending);
      setSkippedCount(result.skipped.length);
      setLastScanAt(result.scannedAt);
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }, [watchConfig?.handle]);

  // Auto-scan when the page is shown and when config is first available.
  useEffect(() => {
    if (!watchConfig?.handle) return;
    let cancelled = false;
    (async () => {
      const perm = await checkPermission(watchConfig.handle);
      if (perm === 'granted' && !cancelled) {
        await onScanWatchFolder();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchConfig?.handle]);

  // Re-scan when the tab regains focus.
  useEffect(() => {
    if (!watchConfig?.handle) return;
    const onFocus = () => onScanWatchFolder();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onScanWatchFolder();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [watchConfig?.handle, onScanWatchFolder]);

  const onPreviewWatchFolder = async () => {
    if (pendingFiles.length === 0) return;
    setIsProcessing(true);
    setCommittedSummary(null);
    const results: ImportPreview[] = [];
    for (const pf of pendingFiles) {
      const p = await buildPreview(pf.name, pf.text, pf.contentHash);
      results.push(p);
    }
    setPreviews(results);
    setIsProcessing(false);
  };

  const onExport = async () => {
    setExportSummary(null);
    const { json, suggestedFilename, counts } = await exportToJson(SEED_VERSION);
    triggerDownload(suggestedFilename, json);
    const total =
      counts.accounts +
      counts.transactions +
      counts.categories +
      counts.rules +
      counts.merchantOverrides +
      counts.budgets +
      counts.imports;
    setExportSummary(
      `Downloaded ${suggestedFilename} (${counts.transactions} transactions, ${counts.rules} rules, ${total} rows total).`
    );
  };

  const onRestoreFileChosen = async (file: File) => {
    setRestoreError(null);
    setRestorePreview(null);
    try {
      const text = await file.text();
      const parsed = parseAndValidate(text);
      setRestorePreview(parsed);
    } catch (e) {
      if (e instanceof BackupValidationError) setRestoreError(e.message);
      else setRestoreError((e as Error).message);
    }
  };

  const onConfirmRestore = async () => {
    if (!restorePreview) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const json = JSON.stringify(restorePreview);
      const report = await importFromJson(json);
      setRestoreSummary(
        `Restored ${report.restored.transactions} transactions, ${report.restored.rules} rules, ${report.restored.budgets} budgets. Reloading…`
      );
      setRestorePreview(null);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setRestoreError((e as Error).message);
      setIsRestoring(false);
    }
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setIsProcessing(true);
    setCommittedSummary(null);
    const results: ImportPreview[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      // Compute the contentHash so manually-imported files participate in
      // future watch-folder dedup.
      const contentHash = await sha256(text);
      const p = await buildPreview(file.name, text, contentHash);
      results.push(p);
    }
    setPreviews(results);
    setIsProcessing(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onCommit = async () => {
    setIsProcessing(true);
    let imported = 0;
    let dups = 0;
    let archived = 0;
    let newUncategorized = 0;
    for (const p of previews) {
      if (p.error) continue;
      const res = await commitPreview(p);
      imported += res.imported;
      dups += res.skippedDuplicates;
      // Count how many freshly-imported (non-duplicate) rows landed in
      // Uncategorized — drives the "Sort them now →" prompt below.
      newUncategorized += p.rows.filter(
        (r) => !r.duplicate && r.category === 'Uncategorized'
      ).length;
      // If this preview corresponds to a watch-folder file, run the
      // configured post-import action (leave / move / delete).
      const pf = pendingFiles.find((x) => x.name === p.filename);
      if (
        pf &&
        watchConfig?.handle &&
        watchConfig.postImportAction !== 'leave'
      ) {
        try {
          await postImport(
            watchConfig.handle,
            pf.parentHandle,
            pf.fileHandle,
            watchConfig.postImportAction
          );
          archived++;
        } catch {
          /* best-effort archive */
        }
      }
    }
    const archiveMsg =
      archived > 0
        ? watchConfig?.postImportAction === 'delete'
          ? `, deleted ${archived} source file${archived === 1 ? '' : 's'}`
          : `, moved ${archived} file${archived === 1 ? '' : 's'} to .imported/`
        : '';
    setCommittedSummary(
      `Imported ${imported} new transaction${imported === 1 ? '' : 's'}, skipped ${dups} duplicate${dups === 1 ? '' : 's'}${archiveMsg}.`
    );
    setNewUncategorizedCount(newUncategorized);
    setPreviews([]);
    setPendingFiles([]);
    setIsProcessing(false);
    // Re-scan to clear out the now-imported files
    if (watchConfig?.handle) onScanWatchFolder();
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h5">Import Transactions</Typography>

      {/* Watch folder */}
      {watchConfig && (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              flexWrap="wrap"
              gap={1}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <FolderOpenIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Watch folder: {watchConfig.name}
                  </Typography>
                </Stack>
                {lastScanAt && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 3.5, display: 'block' }}
                  >
                    Last scanned {new Date(lastScanAt).toLocaleString()}
                    {skippedCount > 0 && (
                      <> · {skippedCount} file{skippedCount === 1 ? '' : 's'} already imported (skipped)</>
                    )}
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={onScanWatchFolder}
                disabled={scanning}
              >
                {scanning ? 'Scanning…' : 'Scan now'}
              </Button>
            </Stack>

            {scanError && <Alert severity="warning">{scanError}</Alert>}

            {pendingFiles.length > 0 && previews.length === 0 && (
              <Alert
                severity="info"
                action={
                  <Button
                    size="small"
                    variant="contained"
                    onClick={onPreviewWatchFolder}
                    disabled={isProcessing}
                  >
                    Preview {pendingFiles.length} file
                    {pendingFiles.length === 1 ? '' : 's'}
                  </Button>
                }
              >
                <strong>
                  {pendingFiles.length} new CSV file
                  {pendingFiles.length === 1 ? '' : 's'} ready
                </strong>{' '}
                in your watch folder.
                <br />
                <Typography variant="caption" sx={{ display: 'block' }}>
                  {pendingFiles.map((f) => f.name).join(' · ')}
                </Typography>
              </Alert>
            )}

            {pendingFiles.length === 0 && lastScanAt && !scanError && (
              <Alert severity="success">
                No new files in the watch folder. Drop CSVs into{' '}
                <code>{watchConfig.name}</code> and they'll appear here on the
                next scan.
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      {!watchConfig && (
        <Alert severity="info" sx={{ '.MuiAlert-message': { width: '100%' } }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            spacing={2}
            flexWrap="wrap"
          >
            <Typography variant="body2">
              Want auto-detected CSV imports? Connect a watch folder in Settings.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              href="/settings"
              startIcon={<FolderOpenIcon />}
            >
              Go to Settings
            </Button>
          </Stack>
        </Alert>
      )}

      {/* Backup & Restore */}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Backup & restore
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Export a single JSON file containing every transaction, rule,
              category, override, and budget. Keep it somewhere safe (iCloud
              Drive, Time Machine, anywhere outside the browser). Restore
              from it if your browser data gets wiped or you switch machines.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={onExport}
            >
              Export backup
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              onClick={() => restoreInputRef.current?.click()}
              disabled={isRestoring}
            >
              Restore from backup…
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onRestoreFileChosen(f);
                // Reset the input so picking the same file twice still fires onChange.
                e.target.value = '';
              }}
            />
          </Stack>
          {exportSummary && <Alert severity="success">{exportSummary}</Alert>}
          {restoreError && <Alert severity="error">{restoreError}</Alert>}
          {restoreSummary && (
            <Alert severity="success">{restoreSummary}</Alert>
          )}
          {restorePreview && !isRestoring && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => setRestorePreview(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="contained"
                    onClick={onConfirmRestore}
                  >
                    Replace all current data
                  </Button>
                </Stack>
              }
            >
              <strong>This backup will REPLACE everything currently in the app.</strong>
              <br />
              Exported{' '}
              {new Date(restorePreview.exportedAt).toLocaleString()} · contains{' '}
              {restorePreview.counts.transactions} transactions,{' '}
              {restorePreview.counts.rules} rules,{' '}
              {restorePreview.counts.categories} categories,{' '}
              {restorePreview.counts.merchantOverrides} merchant overrides,{' '}
              {restorePreview.counts.budgets} budgets. App seed version v
              {restorePreview.appSeedVersion}.
            </Alert>
          )}
          {isRestoring && <LinearProgress />}
        </Stack>
      </Paper>

      <Divider />

      <Paper
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        sx={{
          p: 6,
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'rgba(0,0,0,0.15)',
          bgcolor: dragOver ? 'rgba(25,118,210,0.04)' : 'white',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        component="label"
      >
        <input
          type="file"
          accept=".csv,.CSV"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6">Drop CSV files here or click to choose</Typography>
        <Typography variant="body2" color="text.secondary">
          Supports Chase, Bank of America credit, and BOA checking exports
        </Typography>
      </Paper>

      {isProcessing && <LinearProgress />}
      {committedSummary && <Alert severity="success">{committedSummary}</Alert>}
      {newUncategorizedCount > 0 && (
        <Alert
          severity="info"
          action={
            <Button
              component={RouterLink}
              to="/sort"
              size="small"
              variant="contained"
              sx={{ textTransform: 'none' }}
            >
              Sort now →
            </Button>
          }
          onClose={() => setNewUncategorizedCount(0)}
        >
          <strong>{newUncategorizedCount}</strong>{' '}
          new transaction{newUncategorizedCount === 1 ? '' : 's'} landed in
          Uncategorized. One decision per merchant; the rapid-triage view
          finishes a stack like this in a couple of minutes.
        </Alert>
      )}

      {previews.length > 0 && (
        <Stack spacing={2}>
          {previews.map((p, i) => (
            <PreviewCard key={i} preview={p} />
          ))}
          <Box>
            <Button
              variant="contained"
              size="large"
              onClick={onCommit}
              disabled={
                isProcessing ||
                previews.every((p) => p.error || p.newCount === 0)
              }
            >
              Import {previews.reduce((a, b) => a + b.newCount, 0)} new transactions
            </Button>
            <Button
              sx={{ ml: 1 }}
              onClick={() => {
                setPreviews([]);
                setCommittedSummary(null);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

function PreviewCard({ preview }: { preview: ImportPreview }) {
  if (preview.error) {
    return (
      <Alert severity="error">
        <strong>{preview.filename}:</strong> {preview.error}
      </Alert>
    );
  }
  const sortedCats = Object.entries(preview.byCategory).sort(
    (a, b) => b[1] - a[1]
  );
  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {preview.filename}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {SOURCE_LABELS[preview.source!] || preview.source} ·{' '}
            {preview.totalCount} transactions ({preview.newCount} new,{' '}
            {preview.duplicateCount} duplicates)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip label={`${preview.newCount} new`} color="primary" size="small" />
          {preview.duplicateCount > 0 && (
            <Chip
              label={`${preview.duplicateCount} dup`}
              color="default"
              size="small"
            />
          )}
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
        {sortedCats.map(([cat, n]) => (
          <Chip
            key={cat}
            label={`${cat} · ${n}`}
            size="small"
            variant={cat === 'Uncategorized' ? 'filled' : 'outlined'}
            color={cat === 'Uncategorized' ? 'warning' : 'default'}
          />
        ))}
      </Stack>
      <Table size="small" sx={{ mt: 2 }}>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Category</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {preview.rows.slice(0, 5).map((r, i) => (
            <TableRow key={i} sx={{ opacity: r.duplicate ? 0.4 : 1 }}>
              <TableCell>{r.parsed.date}</TableCell>
              <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.parsed.description}
              </TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell align="right">
                {usdCents.format(r.parsed.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {preview.rows.length > 5 && (
        <Typography variant="caption" color="text.secondary">
          + {preview.rows.length - 5} more rows
        </Typography>
      )}
    </Paper>
  );
}
