import { api } from '../api';
import { useState, useMemo } from 'react';
import { useCategories, useMerchantOverrides, useMerchantTransactions, useAccounts } from '../hooks/queries';
import { queryClient } from '../queryClient';
import { useFilters } from '../stores/store';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  MenuItem,
  Stack,
  Box,
  Alert,
  Checkbox,
  FormControlLabel,
  Chip,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import type { RecurrenceKind } from '../types';
import { usdCents } from '../lib';
import { recategorizeAll, deriveRulePattern } from '../domain/categorize';
import {
  detectRecurrence,
  isRecurring,
  recurrenceLabel,
  refreshRecurrenceAll,
} from '../domain/recurrence';

interface Props {
  merchantKey: string;
  onClose: () => void;
}

const CREATE_NEW = '__create_new__';
const AUTO = '__auto__';

type RecurrenceChoice = RecurrenceKind | typeof AUTO;

export default function BulkRecategorizeDialog({ merchantKey, onClose }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data: categories = [] } = useCategories();
  const { data: overrides = [] } = useMerchantOverrides();
  const { data: accounts = [] } = useAccounts();
  const demoMode = useFilters((s) => s.demoMode);
  const { data: allMerchantTxns = [] } = useMerchantTransactions(merchantKey);

  const accountMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of accounts) {
      if (a.id != null) {
        map.set(a.id, a.name);
      }
    }
    return map;
  }, [accounts]);
  const matchingTxns = useMemo(
    () =>
      allMerchantTxns.filter(
        (t) =>
          t.merchantKey === merchantKey &&
          (demoMode ? t.source === 'demo' : t.source !== 'demo')
      ),
    [allMerchantTxns, merchantKey, demoMode]
  );
  const existingOverride = useMemo(
    () => overrides?.find((o) => o.merchantKey === merchantKey),
    [overrides, merchantKey]
  );
  const autoInfo = useMemo(() => {
    if (!matchingTxns) return null;
    return detectRecurrence(matchingTxns);
  }, [matchingTxns]);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#7e57c2');
  const [saveRule, setSaveRule] = useState(true);
  const [rulePattern, setRulePattern] = useState(() => deriveRulePattern(merchantKey) || merchantKey);
  // null = user hasn't picked, fall back to the persisted override (or AUTO).
  const [recurrencePick, setRecurrencePick] =
    useState<RecurrenceChoice | null>(null);
  const recurrenceChoice: RecurrenceChoice =
    recurrencePick ?? (existingOverride?.recurrence ?? AUTO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!matchingTxns) return null;
    const total = matchingTxns
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const currentCats = new Set(matchingTxns.map((t) => t.category));
    return {
      count: matchingTxns.length,
      total,
      currentCats: [...currentCats],
    };
  }, [matchingTxns]);

  const sortedTxns = useMemo(
    () =>
      matchingTxns
        ? matchingTxns.slice().sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [matchingTxns]
  );

  if (!categories || !matchingTxns || !summary) {
    return null;
  }

  const persistedRecurrence: RecurrenceChoice = existingOverride
    ? existingOverride.recurrence
    : AUTO;
  const recurrenceChanged = recurrenceChoice !== persistedRecurrence;
  const categoryChosen = !!selectedCategory;
  const canApply = categoryChosen || recurrenceChanged;

  const onApply = async () => {
    setSaving(true);
    setError(null);
    try {
      let categoryName: string | null = null;

      if (categoryChosen) {
        categoryName = selectedCategory;

        // Create new category inline if requested
        if (selectedCategory === CREATE_NEW) {
          const name = newCategoryName.trim();
          if (!name) {
            setError('New category name is required');
            setSaving(false);
            return;
          }
          const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
          if (existing) {
            categoryName = existing.name;
          } else {
            const maxSort = Math.max(...categories.map((c) => c.sortOrder), 0);
            await api.addCategory({
              name,
              color: newCategoryColor,
              type: 'spend',
              sortOrder: maxSort + 1,
            } as any);
            categoryName = name;
          }
        }

        const finalCat = categoryName;
        const toUpdateTxns = matchingTxns
          .filter((t) => t.merchantKey === merchantKey)
          .map((t) => ({
            ...t,
            category: finalCat,
            userOverridden: true,
          }));
        if (toUpdateTxns.length > 0) {
          await api.bulkUpdateTransactions(toUpdateTxns);
        }
      }

      // Persist recurrence override choice. "Auto" deletes any existing
      // override; a specific kind upserts one.
      if (recurrenceChanged) {
        if (recurrenceChoice === AUTO) {
          if (existingOverride) {
            await api.deleteMerchantOverride(merchantKey);
          }
        } else {
          await api.putMerchantOverride({
            merchantKey,
            recurrence: recurrenceChoice,
          });
        }
      }

      // Optionally save a rule so future imports use this category
      if (categoryChosen && categoryName && saveRule && rulePattern.trim()) {
        await api.addRule({
          pattern: rulePattern.trim(),
          category: categoryName,
          priority: 1000,
          createdAt: new Date().toISOString(),
        } as any);
        // Re-run categorization (and recurrence refresh) for any other transactions the new rule matches.
        await recategorizeAll();
      } else {
        // Re-evaluate recurrence status database-wide since overrides or categories changed
        await refreshRecurrenceAll();
      }

      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));

      onClose();
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('UNIQUE constraint failed')) {
        setError('A rule with this pattern already exists.');
      } else {
        setError(msg);
      }
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>Recategorize merchant</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Merchant key
            </Typography>
            <Typography sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
              {merchantKey}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Chip
                size="small"
                label={`${summary.count} transactions`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={usdCents.format(summary.total)}
                variant="outlined"
              />
              {summary.currentCats.map((c) => (
                <Chip
                  key={c}
                  size="small"
                  label={summary.currentCats.length > 1 ? `current: ${c}` : c}
                  color={summary.currentCats.length > 1 ? 'warning' : 'default'}
                  variant={summary.currentCats.length > 1 ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
            {summary.currentCats.length > 1 && (
              <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
                This merchant currently has charges under multiple categories ({summary.currentCats.join(', ')}). Recategorizing here will unify all transactions under your selected category.
              </Alert>
            )}
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">
              Transactions ({matchingTxns.length})
            </Typography>
            <Box
              sx={{
                maxHeight: 280,
                overflowY: 'auto',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 1,
                mt: 0.5,
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 0.5, width: 95, whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.75rem', bgcolor: 'background.paper' }}>
                      Date
                    </TableCell>
                    <TableCell sx={{ py: 0.5, fontWeight: 600, fontSize: '0.75rem', bgcolor: 'background.paper' }}>
                      Description
                    </TableCell>
                    <TableCell sx={{ py: 0.5, fontWeight: 600, fontSize: '0.75rem', bgcolor: 'background.paper' }}>
                      Account
                    </TableCell>
                    <TableCell sx={{ py: 0.5, width: 100, whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.75rem', bgcolor: 'background.paper' }} align="right">
                      Amount
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedTxns.map((t) => {
                    const accName = accountMap.get(t.accountId) || '–';
                    return (
                      <TableRow key={t.id} hover>
                        <TableCell
                          sx={{ borderBottom: 'none', py: 0.5, whiteSpace: 'nowrap' }}
                        >
                          <Typography variant="caption">{t.date}</Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            borderBottom: 'none',
                            py: 0.5,
                            maxWidth: { xs: 140, sm: 200, md: 260 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={t.description}
                        >
                          <Typography variant="caption">{t.description}</Typography>
                        </TableCell>
                        <TableCell
                          sx={{
                            borderBottom: 'none',
                            py: 0.5,
                            maxWidth: { xs: 140, sm: 220, md: 280 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={accName}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {accName}
                          </Typography>
                        </TableCell>
                        <TableCell
                          sx={{ borderBottom: 'none', py: 0.5, whiteSpace: 'nowrap' }}
                          align="right"
                        >
                          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {usdCents.format(t.amount)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Box>

          <Divider />

          <TextField
            select
            label="Recurrence"
            value={recurrenceChoice}
            onChange={(e) =>
              setRecurrencePick(e.target.value as RecurrenceChoice)
            }
            fullWidth
            helperText={
              autoInfo
                ? `Auto-detected: ${recurrenceLabel(autoInfo.kind)}` +
                  (isRecurring(autoInfo.kind)
                    ? ` · mean ${autoInfo.meanIntervalDays.toFixed(0)} day gap · ~${usdCents.format(autoInfo.estMonthlyCost)}/mo`
                    : '')
                : ' '
            }
          >
            <MenuItem value={AUTO}>
              <em>Auto-detect</em>
              {autoInfo && (
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  ({recurrenceLabel(autoInfo.kind)})
                </Typography>
              )}
            </MenuItem>
            <MenuItem value="none">One-time</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="biweekly">Biweekly</MenuItem>
            <MenuItem value="monthly">Monthly</MenuItem>
            <MenuItem value="annual">Annual</MenuItem>
          </TextField>

          <TextField
            select
            label="Move all to category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            fullWidth
          >
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.name}>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: c.color,
                    mr: 1,
                    verticalAlign: 'middle',
                  }}
                />
                {c.name}
              </MenuItem>
            ))}
            <MenuItem value={CREATE_NEW}>
              <AddIcon fontSize="small" sx={{ mr: 1 }} />
              Create new category…
            </MenuItem>
          </TextField>

          {selectedCategory === CREATE_NEW && (
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                autoFocus
              />
              <input
                type="color"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                style={{
                  width: 40,
                  height: 40,
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 4,
                  background: 'none',
                  cursor: 'pointer',
                }}
                title="Pick a color"
              />
            </Stack>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={saveRule}
                onChange={(e) => setSaveRule(e.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                Also save as rule (catches future imports)
              </Typography>
            }
          />
          {saveRule && (
            <TextField
              label="Rule pattern (matches description or merchant key)"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              size="small"
              fullWidth
              helperText="Substring match, case-insensitive. Edit to make it more or less specific."
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={onApply}
          variant="contained"
          disabled={saving || !canApply}
        >
          Apply to {summary.count} transactions
        </Button>
      </DialogActions>
    </Dialog>
  );
}
