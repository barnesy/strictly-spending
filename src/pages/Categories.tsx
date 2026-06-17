import { useState, useEffect } from 'react';
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
import { db } from '../db';
import { refreshRecurrenceAll } from '../recurrence';

export default function Categories() {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    db.categories.orderBy('sortOrder').toArray().then(res => {
      if (active) setCategories(res);
    });
    return () => {
      active = false;
    };
  }, []);

  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!categories) return;
    let active = true;
    async function fetchCounts() {
      const entries = await Promise.all(
        categories.map(async (c) => {
          const count = await db.transactions.where('category').equals(c.name).count();
          return [c.name, count];
        })
      );
      const uncategorizedCount = await db.transactions.where('category').equals('Uncategorized').count();
      entries.push(['Uncategorized', uncategorizedCount]);
      if (active) {
        setCounts(Object.fromEntries(entries));
      }
    }
    fetchCounts();
    return () => {
      active = false;
    };
  }, [categories]);

  const handleRecurrenceChange = async (categoryId: number, value: 'recurring' | 'onetime') => {
    await db.categories.update(categoryId, { defaultRecurrence: value });
    setCategories(prev =>
      prev.map(c => (c.id === categoryId ? { ...c, defaultRecurrence: value } : c))
    );
    await refreshRecurrenceAll();
  };

  return (
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
  );
}
