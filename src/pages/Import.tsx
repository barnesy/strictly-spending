import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { api } from '../api';
import { Link as RouterLink } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
  Grid,
} from '@mui/material';
import Papa from 'papaparse';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import RestoreIcon from '@mui/icons-material/Restore';
import {
  buildPreview,
  commitPreview,
  updatePreviewAccount,
  updatePreviewAccountMapping,
  findBestMatchingAccount,
  type ImportPreview,
} from '../domain/import';
import { usdCents } from '../lib';
import { useAccounts } from '../hooks/queries';
import { queryClient } from '../queryClient';

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
import type { Account, CsvMapping, CsvAccountTarget, ParsedTransaction } from '../types';
import { SimpleFinBankSyncCard } from '../components/SimpleFinBankSyncCard';
import { UNIFORM_TOOLBAR_BUTTON_SX } from '../components/AccountFilterDropdown';

const SOURCE_LABELS: Record<string, string> = {
  chase: 'Chase',
  'boa-credit': 'BOA Credit Card',
  'boa-checking': 'BOA Checking',
  'truist-checking': 'Truist Checking',
};

export default function Import() {
  const { data: accounts = [] } = useAccounts();
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

  const onExport = async () => {
    setExportSummary(null);
    const { json, suggestedFilename, counts } = await exportToJson(SEED_VERSION);
    await triggerDownload(suggestedFilename, json);
    const total =
      counts.accounts +
      counts.transactions +
      counts.categories +
      counts.rules +
      counts.merchantOverrides +
      counts.budgets +
      counts.imports;
    setExportSummary(
      `Saved ${suggestedFilename} (${counts.transactions} transactions, ${counts.rules} rules, ${total} rows total).`
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
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        // Compute the contentHash so manually-imported files participate in
        // future watch-folder dedup.
        const contentHash = await sha256(text);
        const p = await buildPreview(file.name, text, contentHash);
        results.push(p);
      }
      setPreviews(results);
    } catch (e) {
      console.error("Failed to parse files:", e);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleTauriFiles = useCallback(async (paths: string[]) => {
    setIsProcessing(true);
    setCommittedSummary(null);
    const results: ImportPreview[] = [];
    try {
      for (const path of paths) {
        if (!path.toLowerCase().endsWith('.csv')) continue;
        try {
          const text = await readTextFile(path);
          const name = path.split(/[/\\]/).pop() || 'Unknown.csv';
          const contentHash = await sha256(text);
          const p = await buildPreview(name, text, contentHash);
          results.push(p);
        } catch (e) {
          console.error("Failed to read dropped file:", path, e);
        }
      }
      setPreviews(results);
    } catch (e) {
      console.error("Failed to parse Tauri files:", e);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenDrop: (() => void) | undefined;
    let unlistenDragDrop: (() => void) | undefined;
    
    if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
      listen<unknown>('tauri://drop', (event) => {
        const payload = event.payload as { paths?: string[] } | string[];
        const paths = Array.isArray(payload) ? payload : payload?.paths;
        if (paths && paths.length > 0) handleTauriFiles(paths);
      }).then(u => {
        if (active) {
          unlistenDrop = u;
        } else if (typeof u === 'function') {
          try { u(); } catch {}
        }
      }).catch(console.error);

      listen<unknown>('tauri://drag-drop', (event) => {
        const payload = event.payload as { paths?: string[] } | string[];
        const paths = Array.isArray(payload) ? payload : payload?.paths;
        if (paths && paths.length > 0) handleTauriFiles(paths);
      }).then(u => {
        if (active) {
          unlistenDragDrop = u;
        } else if (typeof u === 'function') {
          try { u(); } catch {}
        }
      }).catch(console.error);
    }
    
    return () => {
      active = false;
      if (unlistenDrop) {
        try { unlistenDrop(); } catch {}
      }
      if (unlistenDragDrop) {
        try { unlistenDragDrop(); } catch {}
      }
    };
  }, [handleTauriFiles]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onCommit = async (forceDuplicates = false) => {
    setIsProcessing(true);
    try {
      let imported = 0;
      let dups = 0;
      let newUncategorized = 0;
      for (const p of previews) {
        if (p.error) continue;
        const res = await commitPreview(p, forceDuplicates);
        imported += res.imported;
        dups += res.skippedDuplicates;
        // Count how many freshly-imported (non-duplicate) rows landed in
        // Uncategorized — drives the "Sort them now →" prompt below.
        newUncategorized += p.rows.filter(
          (r) => (forceDuplicates || !r.duplicate) && r.category === 'Uncategorized'
        ).length;
      }
      setCommittedSummary(
        forceDuplicates
          ? `Force imported ${imported} transaction${imported === 1 ? '' : 's'}.`
          : `Imported ${imported} new transaction${imported === 1 ? '' : 's'}, skipped ${dups} duplicate${dups === 1 ? '' : 's'}.`
      );
      setNewUncategorizedCount(newUncategorized);
      setPreviews([]);
      window.dispatchEvent(new Event('db-update'));
      await queryClient.invalidateQueries();
    } catch (e: any) {
      console.error("Failed to commit import previews:", e);
      window.alert("Import Failed: " + (e.message || String(e)));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateRow = (previewIdx: number, rowIdx: number, newCategory: string) => {
    setPreviews(prev => {
      const copy = [...prev];
      const newPreview = { ...copy[previewIdx] };
      const newRows = [...newPreview.rows];
      newRows[rowIdx] = { ...newRows[rowIdx], category: newCategory };
      
      // Update the byCategory counts
      const oldCategory = newPreview.rows[rowIdx].category;
      const newByCategory = { ...newPreview.byCategory };
      newByCategory[oldCategory] = (newByCategory[oldCategory] || 1) - 1;
      newByCategory[newCategory] = (newByCategory[newCategory] || 0) + 1;
      if (newByCategory[oldCategory] === 0) delete newByCategory[oldCategory];
      
      newPreview.byCategory = newByCategory;
      newPreview.rows = newRows;
      copy[previewIdx] = newPreview;
      return copy;
    });
  };

  const handleUpdateAccount = async (
    previewIdx: number,
    target: { id?: number; name: string; institution?: string; type?: string }
  ) => {
    setIsProcessing(true);
    try {
      const updated = await updatePreviewAccount(previews[previewIdx], target);
      setPreviews((prev) => {
        const copy = [...prev];
        copy[previewIdx] = updated;
        return copy;
      });
    } catch (err) {
      console.error('Failed to update preview account:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateAccountMapping = async (
    previewIdx: number,
    fileAccountName: string,
    target: { id?: number; name: string; institution?: string; type?: string }
  ) => {
    setIsProcessing(true);
    try {
      const updated = await updatePreviewAccountMapping(previews[previewIdx], fileAccountName, target);
      setPreviews((prev) => {
        const copy = [...prev];
        copy[previewIdx] = updated;
        return copy;
      });
    } catch (err) {
      console.error('Failed to update preview account mapping:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveMapping = async (
    index: number,
    mappingData: Omit<CsvMapping, 'headerHash' | 'headers'>,
    headers: string[],
    rawText: string,
    contentHash?: string
  ) => {
    setIsProcessing(true);
    try {
      const headerHash = headers.join(',');
      const fullMapping: CsvMapping = {
        ...mappingData,
        headerHash,
        headers,
      };
      
      await api.putCsvMapping(fullMapping);
      
      const p = await buildPreview(previews[index].filename, rawText, contentHash);
      if (mappingData.accountMappings) {
        const targetMap: Record<string, number> = {};
        for (const [k, v] of Object.entries(mappingData.accountMappings)) {
          if (v.accountId) {
            targetMap[v.accountName] = v.accountId;
            targetMap[k] = v.accountId;
          }
        }
        p.targetAccountMap = targetMap;
      }
      setPreviews((prev) => {
        const copy = [...prev];
        copy[index] = p;
        return copy;
      });
    } catch (e) {
      console.error('Failed to save mapping:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Stack spacing={{ xs: 2, sm: 3 }}>
      <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}>Import</Typography>

      <SimpleFinBankSyncCard />

      <Divider />

      {/* Backup & Restore */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
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
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={onExport}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Export backup
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              onClick={() => restoreInputRef.current?.click()}
              disabled={isRestoring}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
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
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setRestorePreview(null)}
                    sx={UNIFORM_TOOLBAR_BUTTON_SX}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="contained"
                    onClick={onConfirmRestore}
                    sx={UNIFORM_TOOLBAR_BUTTON_SX}
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
          p: { xs: 3, sm: 6 },
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'rgba(25,118,210,0.04)' : 'background.paper',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        component="label"
      >
        <input
          id="csv-file-input"
          data-testid="csv-file-input"
          type="file"
          accept=".csv,.CSV"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <CloudUploadIcon sx={{ fontSize: { xs: 36, sm: 48 }, color: 'text.secondary', mb: 1 }} />
        <Typography variant="h6" sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>Drop CSV files here or click to choose</Typography>
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
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
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
          {previews.map((p, i) => {
            if (p.requiresMapping) {
              return (
                <ColumnMapperCard
                  key={i}
                  preview={p}
                  accounts={accounts}
                  onSave={(mappingData) =>
                    handleSaveMapping(i, mappingData, p.headers || [], p.rawText || '', p.contentHash)
                  }
                  onCancel={() => {
                    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                />
              );
            }
            return (
              <PreviewCard
                key={i}
                preview={p}
                accounts={accounts}
                onUpdateRow={(rIdx, cat) => handleUpdateRow(i, rIdx, cat)}
                onUpdateAccount={(target) => handleUpdateAccount(i, target)}
                onUpdateAccountMapping={(fileAcc, target) => handleUpdateAccountMapping(i, fileAcc, target)}
              />
            );
          })}
          {previews.every((p) => !p.error && p.newCount === 0 && p.duplicateCount > 0) && (
            <Alert severity="info" sx={{ mt: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                All transactions in this file are already in Strictly Spending
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Strictly Spending detected that all {previews.reduce((a, b) => a + b.duplicateCount, 0)} transactions already exist in your database (matching records with the same date, amount, account, and merchant). They were skipped to protect against duplicate entries.
              </Typography>
            </Alert>
          )}

          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            {previews.some((p) => p.newCount > 0) ? (
              <Button
                variant="contained"
                size="large"
                onClick={() => onCommit(false)}
                disabled={
                  isProcessing ||
                  previews.some((p) => p.requiresMapping) ||
                  previews.every((p) => p.error || p.newCount === 0)
                }
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Import {previews.reduce((a, b) => a + b.newCount, 0)} new transactions
              </Button>
            ) : (
              <Button
                variant="contained"
                size="large"
                component={RouterLink}
                to="/transactions"
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                View in Transactions
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={() => {
                setPreviews([]);
                setCommittedSummary(null);
              }}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              {previews.every((p) => p.newCount === 0) ? 'Done' : 'Cancel'}
            </Button>
            {previews.every((p) => !p.error && p.newCount === 0 && p.duplicateCount > 0) && (
              <Button
                size="small"
                color="warning"
                variant="outlined"
                onClick={() => onCommit(true)}
                disabled={isProcessing}
                sx={{ ...UNIFORM_TOOLBAR_BUTTON_SX, ml: { xs: 0, sm: 'auto' } }}
              >
                Force import duplicates anyway
              </Button>
            )}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}

function PreviewCard({
  preview,
  accounts = [],
  onUpdateRow,
  onUpdateAccount,
  onUpdateAccountMapping,
}: {
  preview: ImportPreview;
  accounts?: Account[];
  onUpdateRow: (idx: number, newCategory: string) => void;
  onUpdateAccount: (target: { id?: number; name: string; institution?: string; type?: string }) => void;
  onUpdateAccountMapping: (
    fileAccountName: string,
    target: { id?: number; name: string; institution?: string; type?: string }
  ) => void;
}) {
  const fileAccountGroups = useMemo(() => {
    const map = new Map<string, { count: number; sample: ParsedTransaction }>();
    for (const r of preview.rows) {
      const key = r.parsed.fileAccountName || r.parsed.accountName || 'Default';
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, { count: 1, sample: r.parsed });
      }
    }
    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      sample: data.sample,
    }));
  }, [preview.rows]);

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

  const isMultiAccount = fileAccountGroups.length > 1;

  const currentAccountName = preview.targetAccountName || preview.rows[0]?.parsed.accountName || '';
  const currentAccountId = preview.targetAccountId;
  const matchedAccount = currentAccountId
    ? accounts.find((a) => a.id === currentAccountId)
    : accounts.find((a) => a.name.toLowerCase() === currentAccountName.toLowerCase());

  const selectValue = preview.targetAccountId
    ? String(preview.targetAccountId)
    : matchedAccount?.id
    ? String(matchedAccount.id)
    : '__file_default__';

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
            {preview.filename}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isMultiAccount
              ? `${preview.rows[0]?.parsed.institution || 'Bank of America'} · ${fileAccountGroups.length} accounts in file`
              : preview.source === 'custom' && preview.rows.length > 0
              ? `${preview.rows[0].parsed.institution} (${currentAccountName})`
              : SOURCE_LABELS[preview.source!] || preview.source}{' '}
            · {preview.totalCount} transactions ({preview.newCount} new,{' '}
            {preview.duplicateCount} duplicates)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
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

      {preview.newCount === 0 && preview.duplicateCount > 0 && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          All {preview.duplicateCount} transactions in this file already exist in your database. Strictly Spending skipped them to protect against duplicate entries.
        </Alert>
      )}

      {/* Account Selector Section */}
      {isMultiAccount ? (
        <Box sx={{ mt: 1.5, p: 2, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Map Accounts in File ({fileAccountGroups.length} accounts detected)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This file contains transactions across multiple accounts. Confirm or customize which account each group routes to:
              </Typography>
            </Box>
            {fileAccountGroups.map((group) => {
              const mappedId =
                preview.targetAccountMap?.[group.name] ||
                preview.targetAccountMap?.[group.sample.accountName];
              const matchedAcc = mappedId
                ? accounts.find((a) => a.id === mappedId)
                : accounts.find(
                    (a) =>
                      a.name.toLowerCase() === group.sample.accountName.toLowerCase() ||
                      a.name.toLowerCase() === group.name.toLowerCase()
                  );
              const groupSelectVal = mappedId
                ? String(mappedId)
                : matchedAcc?.id
                ? String(matchedAcc.id)
                : '__file_default__';

              return (
                <Stack
                  key={group.name}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                  sx={{
                    p: 1.5,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ minWidth: { xs: 0, sm: 220 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {group.name}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={`${group.count} transactions`} />
                      <Chip
                        size="small"
                        label={
                          matchedAcc
                            ? `${matchedAcc.institution} • ${matchedAcc.name}`
                            : `${group.sample.accountName} (New)`
                        }
                        color={matchedAcc ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </Stack>
                  </Box>
                  <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 320 } }}>
                    <InputLabel id={`map-account-label-${group.name}`}>Choose Account</InputLabel>
                    <Select
                      labelId={`map-account-label-${group.name}`}
                      label="Choose Account"
                      value={groupSelectVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__file_default__') {
                          onUpdateAccountMapping(group.name, {
                            name: group.name,
                            institution: group.sample.institution || 'Bank of America',
                            type: group.sample.accountType || 'checking',
                          });
                        } else {
                          const selected = accounts.find((a) => String(a.id) === val);
                          if (selected) {
                            onUpdateAccountMapping(group.name, {
                              id: selected.id,
                              name: selected.name,
                              institution: selected.institution,
                              type: selected.type,
                            });
                          }
                        }
                      }}
                    >
                      {!matchedAcc && (
                        <MenuItem value="__file_default__">
                          <em>Default (New): {group.sample.institution || 'Unknown'} - {group.name}</em>
                        </MenuItem>
                      )}
                      {accounts.map((acc) => (
                        <MenuItem key={acc.id} value={String(acc.id)}>
                          {acc.institution} &bull; {acc.name} ({acc.type}{acc.last4 ? ` &bull; ...${acc.last4}` : ''})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      ) : (
        /* Target Account Selector */
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                Map to Account:
              </Typography>
              <Chip
                size="small"
                label={matchedAccount ? `${matchedAccount.institution} • ${matchedAccount.name}` : `${currentAccountName} (New)`}
                color={matchedAccount ? 'primary' : 'default'}
                variant="outlined"
              />
            </Stack>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 280 } }}>
              <InputLabel id={`target-account-label-${preview.filename}`}>Choose Account</InputLabel>
              <Select
                labelId={`target-account-label-${preview.filename}`}
                label="Choose Account"
                value={selectValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__file_default__') {
                    const sample = preview.rows[0]?.parsed;
                    onUpdateAccount({
                      name: sample?.accountName || 'Unknown',
                      institution: sample?.institution || '',
                      type: sample?.accountType || 'checking',
                    });
                  } else {
                    const selected = accounts.find((a) => String(a.id) === val);
                    if (selected) {
                      onUpdateAccount({
                        id: selected.id,
                        name: selected.name,
                        institution: selected.institution,
                        type: selected.type,
                      });
                    }
                  }
                }}
              >
                {!matchedAccount && (
                  <MenuItem value="__file_default__">
                    <em>Default (New): {preview.rows[0]?.parsed.institution || 'Unknown'} - {currentAccountName}</em>
                  </MenuItem>
                )}
                {accounts.map((acc) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>
                    {acc.institution} &bull; {acc.name} ({acc.type}{acc.last4 ? ` &bull; ...${acc.last4}` : ''})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </Box>
      )}

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
      <Box sx={{ overflowX: 'auto', mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              {isMultiAccount && <TableCell>Account</TableCell>}
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {preview.rows.slice(0, 5).map((r, i) => (
              <TableRow key={i} sx={{ opacity: r.duplicate ? 0.6 : 1 }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <span>{r.parsed.date}</span>
                    {r.duplicate && (
                      <Chip size="small" label="Duplicate" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                    )}
                  </Stack>
                </TableCell>
                {isMultiAccount && (
                  <TableCell>
                    <Chip size="small" variant="outlined" label={r.parsed.accountName} />
                  </TableCell>
                )}
                <TableCell sx={{ maxWidth: { xs: 180, sm: 320 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.parsed.description}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {r.category}
                  {r.aiCategory && r.aiCategory !== r.category && (
                    <Chip 
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box component="span" sx={{ fontWeight: 900, fontSize: 10, textShadow: '0 0 0.5px currentColor' }}>AI</Box>
                          {r.aiCategory}
                        </Box>
                      }
                      size="small" 
                      color="secondary" 
                      onClick={() => onUpdateRow(i, r.aiCategory!)} 
                      sx={{ ml: 1, cursor: 'pointer' }}
                      title="Accept AI Suggestion"
                    />
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {usdCents.format(r.parsed.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {preview.rows.length > 5 && (
        <Typography variant="caption" color="text.secondary">
          + {preview.rows.length - 5} more rows
        </Typography>
      )}
    </Paper>
  );
}

function ColumnMapperCard({
  preview,
  accounts = [],
  onSave,
  onCancel,
}: {
  preview: ImportPreview;
  accounts?: Account[];
  onSave: (mapping: Omit<CsvMapping, 'headerHash' | 'headers'>) => Promise<void>;
  onCancel: () => void;
}) {
  const headers = preview.headers || [];

  // Parse first 3 data rows of CSV for visual preview
  const parsedRows = preview.rawText
    ? Papa.parse<string[]>(preview.rawText, { preview: 4, skipEmptyLines: true }).data.slice(1)
    : [];

  // Helper to guess initial column selection
  const guessColumn = (pattern: RegExp): string => {
    const match = headers.find((h) => pattern.test(h.toLowerCase()));
    return match || '';
  };

  // Pre-detect columns
  const initialDate = guessColumn(/date/i) || headers[0] || '';
  const initialDesc = guessColumn(/desc|payee|merchant|memo/i) || headers[1] || '';
  const initialAccountCol = guessColumn(/account.*name|account/i);

  const initialAmount = guessColumn(/amount|value|total/i);
  const initialDebit = guessColumn(/debit|withdrawal|charge/i);
  const initialCredit = guessColumn(/credit|deposit|payment/i);
  const initialBalance = guessColumn(/balance|bal/i);

  const initialMode = (initialDebit || initialCredit) && !initialAmount ? 'split' : 'single';

  // Form State
  const [name, setName] = useState(
    preview.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [institution, setInstitution] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'credit' | 'savings'>('checking');

  const [dateColumn, setDateColumn] = useState(initialDate);
  const [descriptionColumn, setDescriptionColumn] = useState(initialDesc);
  const [accountColumn, setAccountColumn] = useState(initialAccountCol || '');
  const [accountMappings, setAccountMappings] = useState<Record<string, CsvAccountTarget>>({});

  const [amountMode, setAmountMode] = useState<'single' | 'split'>(initialMode);
  const [amountColumn, setAmountColumn] = useState(initialAmount || headers[2] || '');
  const [debitColumn, setDebitColumn] = useState(initialDebit || '');
  const [creditColumn, setCreditColumn] = useState(initialCredit || '');
  const [balanceColumn, setBalanceColumn] = useState(initialBalance || '');

  const [error, setError] = useState<string | null>(null);

  // Detect unique accounts in CSV when accountColumn is set
  const detectedFileAccounts = useMemo(() => {
    if (!accountColumn || !preview.rawText) return [];
    try {
      const parsed = Papa.parse<Record<string, string>>(preview.rawText, {
        header: true,
        skipEmptyLines: true,
      });
      const counts: Record<string, number> = {};
      for (const r of parsed.data) {
        const rawVal = r[accountColumn]?.trim();
        if (rawVal) {
          counts[rawVal] = (counts[rawVal] || 0) + 1;
        }
      }
      return Object.entries(counts).map(([accName, count]) => ({ name: accName, count }));
    } catch {
      return [];
    }
  }, [accountColumn, preview.rawText]);

  // Auto-initialize accountMappings and default institution when detected accounts are found
  useEffect(() => {
    if (detectedFileAccounts.length === 0) return;
    setAccountMappings((prev) => {
      const updated = { ...prev };
      for (const item of detectedFileAccounts) {
        if (!updated[item.name]) {
          const best = findBestMatchingAccount(item.name, accounts);
          if (best) {
            updated[item.name] = {
              accountId: best.id,
              accountName: best.name,
              institution: best.institution,
              accountType: best.type as any,
            };
          } else {
            updated[item.name] = {
              accountName: item.name,
              institution: institution || 'Bank',
              accountType: 'checking',
            };
          }
        }
      }
      return updated;
    });

    if (!institution) {
      const firstMatched = detectedFileAccounts
        .map((a) => findBestMatchingAccount(a.name, accounts))
        .find(Boolean);
      if (firstMatched) {
        setInstitution(firstMatched.institution);
      } else if (detectedFileAccounts.some((a) => /bank of america|boa/i.test(a.name))) {
        setInstitution('Bank of America');
      }
    }
    if (!accountName) {
      setAccountName(detectedFileAccounts.length > 1 ? 'Multiple Accounts' : detectedFileAccounts[0]?.name || '');
    }
  }, [detectedFileAccounts, accounts, institution, accountName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Configuration Name is required');
      return;
    }
    const finalInst = institution.trim() || (detectedFileAccounts.length > 0 ? 'Bank' : '');
    const finalAccName = accountName.trim() || (detectedFileAccounts.length > 1 ? 'Multiple Accounts' : detectedFileAccounts[0]?.name || '');

    if (!finalInst) {
      setError('Institution Name is required');
      return;
    }
    if (!finalAccName) {
      setError('Account Name is required');
      return;
    }
    if (!dateColumn) {
      setError('Date Column is required');
      return;
    }
    if (!descriptionColumn) {
      setError('Description Column is required');
      return;
    }
    if (amountMode === 'single' && !amountColumn) {
      setError('Amount Column is required when using a single column');
      return;
    }
    if (amountMode === 'split' && !debitColumn && !creditColumn) {
      setError('At least one of Debit Column or Credit Column must be selected in split mode');
      return;
    }

    onSave({
      name: name.trim(),
      institution: finalInst,
      accountName: finalAccName,
      accountType,
      dateColumn,
      descriptionColumn,
      amountColumn: amountMode === 'single' ? amountColumn : undefined,
      debitColumn: amountMode === 'split' ? debitColumn : undefined,
      creditColumn: amountMode === 'split' ? creditColumn : undefined,
      balanceColumn: balanceColumn || undefined,
      accountColumn: accountColumn || undefined,
      accountMappings: accountColumn && Object.keys(accountMappings).length > 0 ? accountMappings : undefined,
    });
  };

  return (
    <Paper sx={{
      p: 3,
      borderLeft: '4px solid',
      borderLeftColor: 'primary.main',
      background: (theme) => theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(8px)'
    }}>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
        Configure Column Mapping: {preview.filename}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This CSV file layout is unrecognized. Map the columns to standard database fields to save the configuration for future imports.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* CSV Preview Table */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          CSV Data Preview (First 3 rows)
        </Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.default' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {headers.map((h, index) => (
                  <TableCell key={index} sx={{ fontWeight: 600, py: 1, borderBottom: '2px solid rgba(0,0,0,0.12)', whiteSpace: 'nowrap' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {parsedRows.map((row, rIdx) => (
                <TableRow key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <TableCell key={cIdx} sx={{ py: 0.75, whiteSpace: 'nowrap' }}>
                      {row[cIdx] || ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {parsedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={headers.length} align="center">
                    No preview data rows found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Column Mapping Configuration */}
          <Grid size={12}>
            <Divider sx={{ mb: 1 }}><Chip label="Column Mapping" size="small" /></Divider>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Date Column</InputLabel>
              <Select
                value={dateColumn}
                label="Date Column"
                onChange={(e) => setDateColumn(e.target.value)}
              >
                {headers.map((h, idx) => (
                  <MenuItem key={idx} value={h}>
                    {h}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" required>
              <InputLabel>Description Column</InputLabel>
              <Select
                value={descriptionColumn}
                label="Description Column"
                onChange={(e) => setDescriptionColumn(e.target.value)}
              >
                {headers.map((h, idx) => (
                  <MenuItem key={idx} value={h}>
                    {h}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Account Name Column (Optional)</InputLabel>
              <Select
                value={accountColumn}
                label="Account Name Column (Optional)"
                onChange={(e) => setAccountColumn(e.target.value)}
              >
                <MenuItem value="">
                  <em>None (Single Account File)</em>
                </MenuItem>
                {headers.map((h, idx) => (
                  <MenuItem key={idx} value={h}>
                    {h}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Balance Column (Optional)</InputLabel>
              <Select
                value={balanceColumn}
                label="Balance Column (Optional)"
                onChange={(e) => setBalanceColumn(e.target.value)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {headers.map((h, idx) => (
                  <MenuItem key={idx} value={h}>
                    {h}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={12}>
            <FormControl component="fieldset">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Amount Column Mode
              </Typography>
              <RadioGroup
                row
                value={amountMode}
                onChange={(e) => setAmountMode(e.target.value as 'single' | 'split')}
              >
                <FormControlLabel value="single" control={<Radio />} label="Single Amount Column" />
                <FormControlLabel value="split" control={<Radio />} label="Separate Debit & Credit Columns" />
              </RadioGroup>
            </FormControl>
          </Grid>

          {amountMode === 'single' ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Amount Column</InputLabel>
                <Select
                  value={amountColumn}
                  label="Amount Column"
                  onChange={(e) => setAmountColumn(e.target.value)}
                >
                  {headers.map((h, idx) => (
                    <MenuItem key={idx} value={h}>
                      {h}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          ) : (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Debit Column</InputLabel>
                  <Select
                    value={debitColumn}
                    label="Debit Column"
                    onChange={(e) => setDebitColumn(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {headers.map((h, idx) => (
                      <MenuItem key={idx} value={h}>
                        {h}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Credit Column</InputLabel>
                  <Select
                    value={creditColumn}
                    label="Credit Column"
                    onChange={(e) => setCreditColumn(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {headers.map((h, idx) => (
                      <MenuItem key={idx} value={h}>
                        {h}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}

          {/* Multi-Account Mapping Section */}
          {accountColumn && detectedFileAccounts.length > 0 && (
            <Grid size={12}>
              <Divider sx={{ my: 1 }}>
                <Chip label={`Detected Accounts (${detectedFileAccounts.length})`} size="small" color="primary" />
              </Divider>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Multiple accounts were detected in the "{accountColumn}" column. We automatically matched them with existing accounts in Strictly Spending. You can review or adjust them below:
              </Typography>
              <Stack spacing={1.5}>
                {detectedFileAccounts.map((item) => {
                  const currentMapping = accountMappings[item.name];
                  const selectVal = currentMapping?.accountId ? String(currentMapping.accountId) : '__new__';

                  return (
                    <Stack
                      key={item.name}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      justifyContent="space-between"
                      sx={{
                        p: 1.5,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ minWidth: 240 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.name}
                        </Typography>
                        <Chip size="small" label={`${item.count} transactions in file`} sx={{ mt: 0.5 }} />
                      </Box>
                      <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 340 } }}>
                        <InputLabel id={`mapping-target-${item.name}`}>Target Account</InputLabel>
                        <Select
                          labelId={`mapping-target-${item.name}`}
                          label="Target Account"
                          value={selectVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__new__') {
                              setAccountMappings((prev) => ({
                                ...prev,
                                [item.name]: {
                                  accountName: item.name,
                                  institution: institution || 'Bank of America',
                                  accountType: 'checking',
                                },
                              }));
                            } else {
                              const found = accounts.find((a) => String(a.id) === val);
                              if (found) {
                                setAccountMappings((prev) => ({
                                  ...prev,
                                  [item.name]: {
                                    accountId: found.id,
                                    accountName: found.name,
                                    institution: found.institution,
                                    accountType: found.type as any,
                                  },
                                }));
                              }
                            }
                          }}
                        >
                          <MenuItem value="__new__">
                            <em>-- Create New Account ({item.name}) --</em>
                          </MenuItem>
                          {accounts.map((acc) => (
                            <MenuItem key={acc.id} value={String(acc.id)}>
                              {acc.institution} &bull; {acc.name} ({acc.type}{acc.last4 ? ` &bull; ...${acc.last4}` : ''})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
                  );
                })}
              </Stack>
            </Grid>
          )}

          {/* Account Metadata Details */}
          <Grid size={12}>
            <Divider sx={{ mb: 1 }}>
              <Chip label={accountColumn && detectedFileAccounts.length > 0 ? "Default / Fallback Account Info" : "Account Info"} size="small" />
            </Divider>
          </Grid>

          {(!accountColumn || detectedFileAccounts.length === 0) && accounts.length > 0 && (
            <Grid size={12}>
              <FormControl fullWidth size="small">
                <InputLabel id="map-to-account-select-label">Map to Existing Account</InputLabel>
                <Select
                  labelId="map-to-account-select-label"
                  label="Map to Existing Account"
                  value={selectedAccountId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedAccountId(val);
                    if (val) {
                      const found = accounts.find((a) => String(a.id) === val);
                      if (found) {
                        setInstitution(found.institution);
                        setAccountName(found.name);
                        setAccountType(
                          found.type === 'credit' || found.type === 'savings'
                            ? found.type
                            : 'checking'
                        );
                        setName(`${found.institution} - ${found.name}`);
                      }
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>-- Enter New Account / Custom Details --</em>
                  </MenuItem>
                  {accounts.map((acc) => (
                    <MenuItem key={acc.id} value={String(acc.id)}>
                      {acc.institution} &bull; {acc.name} ({acc.type}{acc.last4 ? ` &bull; ...${acc.last4}` : ''})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              label="Mapping Config Name"
              placeholder="e.g. My Credit Union Checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              label="Institution / Bank"
              placeholder="e.g. Chase, Credit Union, etc."
              value={institution}
              onChange={(e) => {
                setInstitution(e.target.value);
                const current = accounts.find((a) => String(a.id) === selectedAccountId);
                if (current && current.institution !== e.target.value) {
                  setSelectedAccountId('');
                }
              }}
              fullWidth
              size="small"
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              label="Account Name"
              placeholder="e.g. Checking 1234"
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value);
                const current = accounts.find((a) => String(a.id) === selectedAccountId);
                if (current && current.name !== e.target.value) {
                  setSelectedAccountId('');
                }
              }}
              fullWidth
              size="small"
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Account Type</InputLabel>
              <Select
                value={accountType}
                label="Account Type"
                onChange={(e) => {
                  setAccountType(e.target.value as 'checking' | 'credit' | 'savings');
                  const current = accounts.find((a) => String(a.id) === selectedAccountId);
                  if (current && current.type !== e.target.value) {
                    setSelectedAccountId('');
                  }
                }}
              >
                <MenuItem value="checking">Checking</MenuItem>
                <MenuItem value="credit">Credit Card</MenuItem>
                <MenuItem value="savings">Savings</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={12}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1 }}>
              <Button type="submit" variant="contained" color="primary" sx={UNIFORM_TOOLBAR_BUTTON_SX}>
                Save Mapping and Preview
              </Button>
              <Button variant="outlined" color="inherit" onClick={onCancel} sx={UNIFORM_TOOLBAR_BUTTON_SX}>
                Cancel / Skip File
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
}
