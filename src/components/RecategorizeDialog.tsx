import { useState } from 'react';
import { useCategories } from '../hooks/queries';
import { queryClient } from '../queryClient';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack,
  Box,
  Alert,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { api } from '../api';
import type { Transaction } from '../types';
import { recategorizeAll, deriveRulePattern, matchPattern } from '../domain/categorize';
import { normalizeForMatch } from '../lib';
import { refreshRecurrenceAll } from '../domain/recurrence';

interface Props {
  txn: Transaction;
  onClose: () => void;
}

export default function RecategorizeDialog({ txn, onClose }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data: categories } = useCategories();
  const [category, setCategory] = useState(txn.category);
  const [recurrenceOverride, setRecurrenceOverride] = useState<'recurring' | 'onetime' | 'default'>(
    txn.recurrenceOverride || 'default'
  );
  const [scope, setScope] = useState<'one' | 'rule'>('rule');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivePattern = (desc: string, mkey?: string) => {
    return deriveRulePattern(mkey || desc) || deriveRulePattern(desc) || desc.trim().split(/\s+/).slice(0, 2).join(' ');
  };

  const [pattern, setPattern] = useState(() => derivePattern(txn.description, txn.merchantKey));
  const [prevTxnId, setPrevTxnId] = useState(txn.id);

  if (txn.id !== prevTxnId) {
    setPrevTxnId(txn.id);
    setCategory(txn.category);
    setRecurrenceOverride(txn.recurrenceOverride || 'default');
    setPattern(derivePattern(txn.description, txn.merchantKey));
    setError(null);
  }

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const ro = recurrenceOverride === 'default' ? null : recurrenceOverride;
      if (scope === 'one') {
        await api.updateTransaction(txn.id!, {
          ...txn,
          category,
          userOverridden: true,
          recurrenceOverride: ro,
        });
      } else {
        const trimmedPattern = pattern.trim();
        const normNew = normalizeForMatch(trimmedPattern);

        // Remove any existing rules that would shadow this new rule on this transaction or pattern
        const existingRules = await api.getRules();
        for (const r of existingRules) {
          if (!r.id) continue;
          const normOld = normalizeForMatch(r.pattern);
          const isSameNormDiffRaw = normOld === normNew && r.pattern !== trimmedPattern;
          const oldContainsNew = normNew.length > 0 && matchPattern(normOld, normNew) && r.priority >= 1000;
          const matchesThisTxn =
            matchPattern(txn.description, r.pattern) ||
            (txn.merchantKey ? matchPattern(txn.merchantKey, r.pattern) : false);
          const shadowsOnThisTxn =
            matchesThisTxn &&
            r.category !== category &&
            (r.priority > 1000 || (r.priority === 1000 && normOld.length >= normNew.length));

          if (isSameNormDiffRaw || oldContainsNew || shadowsOnThisTxn) {
            await api.deleteRule(r.id);
          }
        }

        // Create/update the high-priority rule
        await api.addRule({
          pattern: trimmedPattern,
          category,
          priority: 1000,
          createdAt: new Date().toISOString(),
        } as any);

        // Recategorize all matching transactions across the DB first
        await recategorizeAll({ forceUserRules: true });

        // Explicitly update this transaction afterwards so it is guaranteed to reflect the chosen category & override
        await api.updateTransaction(txn.id!, {
          ...txn,
          category,
          userOverridden: true,
          recurrenceOverride: ro,
        });
      }
      await refreshRecurrenceAll();
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('db-update'));
      onClose();
    } catch (e: unknown) {
      console.error('Failed to recategorize transaction:', e);
      setError((e as Error)?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={isMobile}>
      <DialogTitle>Recategorize</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Transaction
            </Typography>
            <Typography>{txn.description}</Typography>
            <Typography variant="caption" color="text.secondary">
              {txn.date} · Currently:{' '}
              <strong>{txn.category}</strong>
            </Typography>
          </Box>

          <TextField
            select
            label="New category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            fullWidth
          >
            {categories?.map((c) => (
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
          </TextField>

          <TextField
            select
            label="Recurrence Override"
            value={recurrenceOverride}
            onChange={(e) => setRecurrenceOverride(e.target.value as any)}
            fullWidth
            helperText="Force this transaction's recurrence, overriding Category or Merchant defaults"
          >
            <MenuItem value="default">Default (Category / Merchant default)</MenuItem>
            <MenuItem value="recurring">Force Recurring</MenuItem>
            <MenuItem value="onetime">Force One-Time / Variable</MenuItem>
          </TextField>

          <RadioGroup
            value={scope}
            onChange={(e) => setScope(e.target.value as 'one' | 'rule')}
          >
            <FormControlLabel
              value="rule"
              control={<Radio />}
              label="Create a rule for all transactions matching a pattern"
            />
            <FormControlLabel
              value="one"
              control={<Radio />}
              label="Just this one transaction"
            />
          </RadioGroup>

          {scope === 'rule' && (
            <>
              <TextField
                label="Match pattern (case-insensitive substring of description)"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                fullWidth
                helperText='Example: "NETFLIX" matches "NETFLIX.COM" and "Netflix Premium"'
              />
              {pattern.trim().length < 3 && (
                <Alert severity="warning">
                  Patterns shorter than 3 characters can match too broadly.
                </Alert>
              )}
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={saving || (scope === 'rule' && pattern.trim().length === 0)}
        >
          {saving ? 'Saving…' : scope === 'rule' ? 'Save rule & recategorize' : 'Save override'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
