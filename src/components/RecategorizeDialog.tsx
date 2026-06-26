import { useState, useEffect } from 'react';
import { useCategories } from '../hooks/queries';
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
} from '@mui/material';
import { api } from '../api';
import type { Transaction } from '../types';
import { recategorizeAll } from '../categorize';
import { refreshRecurrenceAll } from '../recurrence';

interface Props {
  txn: Transaction;
  onClose: () => void;
}

export default function RecategorizeDialog({ txn, onClose }: Props) {
  const { data: categories } = useCategories();
  const [category, setCategory] = useState(txn.category);
  const [recurrenceOverride, setRecurrenceOverride] = useState<'recurring' | 'onetime' | 'default'>(
    txn.recurrenceOverride || 'default'
  );
  const [scope, setScope] = useState<'one' | 'rule'>('rule');
  const [pattern, setPattern] = useState('');

  useEffect(() => {
    // Suggest a sensible default rule pattern from the description's leading words
    const cleaned = txn.description
      .replace(/^[A-Z]{1,3}\s*\*+/, '')
      .replace(/[^A-Za-z0-9\s*]/g, ' ')
      .trim();
    const firstWords = cleaned.split(/\s+/).slice(0, 2).join(' ');
    setPattern(firstWords);
  }, [txn]);

  const onSave = async () => {
    const ro = recurrenceOverride === 'default' ? null : recurrenceOverride;
    if (scope === 'one') {
      await api.updateTransaction(txn.id!, {
        ...txn,
        category,
        userOverridden: true,
        recurrenceOverride: ro,
      });
    } else {
      // Create a high-priority rule
      await api.addRule({
        pattern: pattern.trim(),
        category,
        priority: 1000,
        createdAt: new Date().toISOString(),
      } as any);
      // Update recurrence override on this transaction specifically
      await api.updateTransaction(txn.id!, {
        ...txn,
        recurrenceOverride: ro,
      });
      await recategorizeAll();
    }
    await refreshRecurrenceAll();
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={onSave}
          variant="contained"
          disabled={scope === 'rule' && pattern.trim().length === 0}
        >
          {scope === 'rule' ? 'Save rule & recategorize' : 'Save override'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
