import { useMemo, useState } from 'react';
import {
  Paper,
  Typography,
  Stack,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { db } from '../db';
import { usd } from '../lib';
import {
  isRecurring,
  recurrenceLabel,
  type RecurrenceInfo,
} from '../recurrence';
import type { Category, Transaction } from '../types';
import BulkRecategorizeDialog from './BulkRecategorizeDialog';

interface Props {
  allTxns: Transaction[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  categories: Category[];
}

interface Row {
  merchantKey: string;
  category: string;
  info: RecurrenceInfo;
  exampleDesc: string;
}

export default function RecurringBurnCard({
  allTxns,
  recurrenceMap,
  categories,
}: Props) {
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const exampleByKey = new Map<string, { desc: string; category: string }>();
    for (const t of allTxns) {
      if (!exampleByKey.has(t.merchantKey)) {
        exampleByKey.set(t.merchantKey, {
          desc: t.description,
          category: t.category,
        });
      }
    }
    const r: Row[] = [];
    for (const [merchantKey, info] of recurrenceMap) {
      if (!isRecurring(info.kind)) continue;
      const example = exampleByKey.get(merchantKey);
      if (!example) continue;
      r.push({
        merchantKey,
        category: example.category,
        info,
        exampleDesc: example.desc,
      });
    }
    return r.sort((a, b) => b.info.estMonthlyCost - a.info.estMonthlyCost);
  }, [allTxns, recurrenceMap]);

  const totalMonthly = rows.reduce((s, r) => s + r.info.estMonthlyCost, 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  const onMarkOneTime = async (merchantKey: string) => {
    await db.merchantOverrides.put({
      merchantKey,
      recurrence: 'none',
    });
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Monthly recurring burn
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Auto-detected from spacing of charges. Click a row to view all
            charges & recategorize. Click ⊖ to mark a merchant one-time.
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="overline" color="text.secondary">
            Total
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {usd.format(totalMonthly)}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
              /mo
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ≈ {usd.format(totalMonthly * 12)} / year locked in
          </Typography>
        </Box>
      </Stack>

      {rows.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          No recurring charges detected yet — need at least 3 evenly-spaced
          charges from a merchant.
        </Box>
      ) : (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>Merchant</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Cadence</TableCell>
              <TableCell align="right">$/mo</TableCell>
              <TableCell align="right">Last</TableCell>
              <TableCell width={40}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.merchantKey}
                hover
                onClick={() => setEditingMerchant(r.merchantKey)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell
                  sx={{
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={r.exampleDesc}
                >
                  <Typography variant="body2">{r.merchantKey}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={r.category}
                    size="small"
                    sx={{
                      bgcolor: categoryColor(r.category) + '22',
                      color: categoryColor(r.category),
                      fontWeight: 500,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2">
                      {recurrenceLabel(r.info.kind)}
                    </Typography>
                    {r.info.source === 'override' && (
                      <Typography variant="caption" color="text.secondary">
                        (manual)
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {usd.format(r.info.estMonthlyCost)}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" color="text.secondary">
                    {r.info.lastDate}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title="Mark as one-time (won't show in recurring burn)">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkOneTime(r.merchantKey);
                      }}
                    >
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editingMerchant && (
        <BulkRecategorizeDialog
          merchantKey={editingMerchant}
          onClose={() => setEditingMerchant(null)}
        />
      )}
    </Paper>
  );
}
