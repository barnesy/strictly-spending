import { api } from '../api';
import { useState, useMemo } from 'react';
import { useCategories, useMerchantOverrides, useTransactions } from '../hooks/queries';
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
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import type { RecurrenceKind } from '../types';
import { usdCents } from '../lib';
import { recategorizeAll } from '../categorize';
import {
  detectRecurrence,
  isRecurring,
  recurrenceLabel,
  refreshRecurrenceAll,
} from '../recurrence';

interface Props {
  merchantKey: string;
  onClose: () => void;
}

const CREATE_NEW = '__create_new__';
const AUTO = '__auto__';

type RecurrenceChoice = RecurrenceKind | typeof AUTO;

export default function BulkRecategorizeDialog({ merchantKey, onClose }: Props) {
  const { data: categories = [] } = useCategories();
  const { data: overrides = [] } = useMerchantOverrides();
  const { data: matchingTxns = [] } = useTransactions({ merchantKey });
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
  const [rulePattern, setRulePattern] = useState(merchantKey);
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

        // Apply override to all matching transactions
        const finalCat = categoryName;
        await (async () => {
          const toUpdateTxns = matchingTxns.map(t => ({
            ...t,
            category: finalCat,
            userOverridden: true,
          }));
          await api.bulkUpdateTransactions(toUpdateTxns);
        })();
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
        // Re-run categorization for any other non-overridden transactions the
        // new rule might match.
        await recategorizeAll();
      }

      // Re-evaluate recurrence status database-wide since overrides changed
      await refreshRecurrenceAll();

      onClose();
    } catch (e) {
      setError((e).returning().message);
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
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
                  label={`now: ${c}`}
                  color="default"
                />
              ))}
            </Stack>
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
                <TableBody>
                  {sortedTxns.map((t) => (
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
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={t.description}
                      >
                        <Typography variant="caption">{t.description}</Typography>
                      </TableCell>
                      <TableCell
                        sx={{ borderBottom: 'none', py: 0.5, whiteSpace: 'nowrap' }}
                        align="right"
                      >
                        <Typography variant="caption">
                          {usdCents.format(t.amount)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
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
