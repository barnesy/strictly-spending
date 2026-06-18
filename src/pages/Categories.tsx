import React, { useMemo, useDeferredValue } from 'react';
import {
  Stack,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Box,
  Chip,
  Select,
  MenuItem,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { refreshRecurrenceAll } from '../recurrence';
import PageLoader from '../components/PageLoader';

export default function Categories() {
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const deferredTransactions = useDeferredValue(transactions);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!categories || !deferredTransactions) return c;
    for (const t of deferredTransactions) {
      c[t.category] = (c[t.category] || 0) + 1;
    }
    return c;
  }, [categories, deferredTransactions]);

  const handleRecurrenceChange = async (categoryId: number, value: 'recurring' | 'onetime') => {
    await db.categories.update(categoryId, { defaultRecurrence: value });
    await refreshRecurrenceAll();
  };

  const isLoading = !categories || !transactions;

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={3}>
        <Typography variant="h5">Categories</Typography>
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Recurrence Default</TableCell>
                <TableCell align="right">Transactions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories?.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: c.color,
                        }}
                      />
                      <Typography>{c.name}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={c.type} />
                  </TableCell>
                  <TableCell>
                    {c.type === 'spend' || c.type === 'income' ? (
                      <Select
                        size="small"
                        value={c.defaultRecurrence || 'onetime'}
                        onChange={(e) => handleRecurrenceChange(c.id!, e.target.value as any)}
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value="onetime">One-Time / Variable</MenuItem>
                        <MenuItem value="recurring">Recurring</MenuItem>
                      </Select>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        N/A (Transfer)
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{counts[c.name] || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </PageLoader>
  );
}
