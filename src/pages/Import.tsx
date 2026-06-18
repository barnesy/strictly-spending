import { useState, useCallback, useRef, useEffect } from 'react';
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
import type { CsvMapping } from '../types';

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
      listen<any>('tauri://drop', (event) => {
        const paths = Array.isArray(event.payload) ? event.payload : event.payload?.paths;
        if (paths && paths.length > 0) handleTauriFiles(paths);
      }).then(u => {
        if (active) {
          unlistenDrop = u;
        } else {
          u();
        }
      }).catch(console.error);

      listen<any>('tauri://drag-drop', (event) => {
        const paths = Array.isArray(event.payload) ? event.payload : event.payload?.paths;
        if (paths && paths.length > 0) handleTauriFiles(paths);
      }).then(u => {
        if (active) {
          unlistenDragDrop = u;
        } else {
          u();
        }
      }).catch(console.error);
    }
    
    return () => {
      active = false;
      if (unlistenDrop) unlistenDrop();
      if (unlistenDragDrop) unlistenDragDrop();
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

  const onCommit = async () => {
    setIsProcessing(true);
    try {
      let imported = 0;
      let dups = 0;
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
      }
      setCommittedSummary(
        `Imported ${imported} new transaction${imported === 1 ? '' : 's'}, skipped ${dups} duplicate${dups === 1 ? '' : 's'}.`
      );
      setNewUncategorizedCount(newUncategorized);
      setPreviews([]);
    } catch (e) {
      console.error("Failed to commit import previews:", e);
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
      
      await db.csvMappings.add(fullMapping);
      
      const p = await buildPreview(previews[index].filename, rawText, contentHash);
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
    <Stack spacing={3}>
      <Typography variant="h5">Import</Typography>



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
          borderColor: dragOver ? 'primary.main' : 'divider',
          bgcolor: dragOver ? 'rgba(25,118,210,0.04)' : 'background.paper',
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
          {previews.map((p, i) => {
            if (p.requiresMapping) {
              return (
                <ColumnMapperCard
                  key={i}
                  preview={p}
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
                onUpdateRow={(rIdx, cat) => handleUpdateRow(i, rIdx, cat)}
              />
            );
          })}
          <Box>
            <Button
              variant="contained"
              size="large"
              onClick={onCommit}
              disabled={
                isProcessing ||
                previews.some((p) => p.requiresMapping) ||
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

function PreviewCard({ preview, onUpdateRow }: { preview: ImportPreview, onUpdateRow: (idx: number, newCategory: string) => void }) {
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
            {preview.source === 'custom' && preview.rows.length > 0
              ? `${preview.rows[0].parsed.institution} (${preview.rows[0].parsed.accountName})`
              : SOURCE_LABELS[preview.source!] || preview.source}{' '}
            · {preview.totalCount} transactions ({preview.newCount} new,{' '}
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
              <TableCell>
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

function ColumnMapperCard({
  preview,
  onSave,
  onCancel,
}: {
  preview: ImportPreview;
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

  const initialAmount = guessColumn(/amount|value|total/i);
  const initialDebit = guessColumn(/debit|withdrawal|charge/i);
  const initialCredit = guessColumn(/credit|deposit|payment/i);
  const initialBalance = guessColumn(/balance|bal/i);

  const initialMode = (initialDebit || initialCredit) && !initialAmount ? 'split' : 'single';

  // Form State
  const [name, setName] = useState(
    preview.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
  );
  const [institution, setInstitution] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'credit' | 'savings'>('checking');

  const [dateColumn, setDateColumn] = useState(initialDate);
  const [descriptionColumn, setDescriptionColumn] = useState(initialDesc);
  const [amountMode, setAmountMode] = useState<'single' | 'split'>(initialMode);

  const [amountColumn, setAmountColumn] = useState(initialAmount || headers[2] || '');
  const [debitColumn, setDebitColumn] = useState(initialDebit || '');
  const [creditColumn, setCreditColumn] = useState(initialCredit || '');
  const [balanceColumn, setBalanceColumn] = useState(initialBalance || '');

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Configuration Name is required');
      return;
    }
    if (!institution.trim()) {
      setError('Institution Name is required');
      return;
    }
    if (!accountName.trim()) {
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
      institution: institution.trim(),
      accountName: accountName.trim(),
      accountType,
      dateColumn,
      descriptionColumn,
      amountColumn: amountMode === 'single' ? amountColumn : undefined,
      debitColumn: amountMode === 'split' ? debitColumn : undefined,
      creditColumn: amountMode === 'split' ? creditColumn : undefined,
      balanceColumn: balanceColumn || undefined,
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
          {/* Account Metadata Details */}
          <Grid size={12}>
            <Divider sx={{ mb: 2 }}><Chip label="Account Info" size="small" /></Divider>
          </Grid>

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
              onChange={(e) => setInstitution(e.target.value)}
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
              onChange={(e) => setAccountName(e.target.value)}
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
                onChange={(e) => setAccountType(e.target.value as any)}
              >
                <MenuItem value="checking">Checking</MenuItem>
                <MenuItem value="credit">Credit Card</MenuItem>
                <MenuItem value="savings">Savings</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Column Mapping Configuration */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}><Chip label="Column Mapping" size="small" /></Divider>
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

          <Grid size={12}>
            <FormControl component="fieldset">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Amount Column Mode
              </Typography>
              <RadioGroup
                row
                value={amountMode}
                onChange={(e) => setAmountMode(e.target.value as any)}
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
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Button type="submit" variant="contained" color="primary">
                Save Mapping and Preview
              </Button>
              <Button variant="outlined" color="inherit" onClick={onCancel}>
                Cancel / Skip File
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
}
