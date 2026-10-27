import { useState, useMemo } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableFooter,
  Alert,
  Button,
} from '@mui/material';
import DataTable from '../DataTable';
import BulkRecategorizeDialog from '../BulkRecategorizeDialog';
import { subtleScrollSx } from '../../styles';
import { usd } from '../../lib';
import { isRecurring, recurrenceLabel, type RecurrenceInfo } from '../../domain/recurrence';
import { useFilters } from '../../stores/store';
import type { TopMerchant } from '../../api';

export function TopMerchantsCard({
  topMerchantsData,
  recurrenceMap,
  isIncome = false,
}: {
  topMerchantsData: TopMerchant[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  isIncome?: boolean;
}) {
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null);

  const rows = topMerchantsData.map((m) => ({
    merchant: m.merchantKey,
    total: Math.abs(m.total),
    count: m.count,
    recurrence: recurrenceMap.get(m.merchantKey),
  }));

  const totalCount = useMemo(() => rows.reduce((sum, r) => sum + r.count, 0), [rows]);
  const totalAmount = useMemo(() => rows.reduce((sum, r) => sum + r.total, 0), [rows]);

  return (
    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5, flexShrink: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {isIncome ? 'Top income sources' : 'Top merchants'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {rows.length >= 100 ? 'Top 100 ' : `${rows.length} `} {isIncome ? (rows.length === 1 ? 'source' : 'sources') : (rows.length === 1 ? 'merchant' : 'merchants')}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {isIncome ? 'Click a row to recategorize incoming transactions' : 'Click a row to recategorize all of its transactions'}
      </Typography>
      <Box
        sx={{
          mt: 1,
          flex: 1,
          minHeight: 0,
          maxHeight: { xs: 480, md: 'none' },
          overflowY: 'auto',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 1,
          ...subtleScrollSx,
        }}
      >
        <DataTable component={Box} containerSx={{ border: 'none', borderRadius: 0 }} size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ transition: 'all 200ms ease' }}>{isIncome ? 'Income Source' : 'Merchant'}</TableCell>
              <TableCell align="right" sx={{ transition: 'all 200ms ease' }}>{isIncome ? 'Deposits' : 'Visits'}</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody
            key={isIncome ? 'income-rows' : 'merchants-rows'}
            sx={{
              animation: 'fadeIn 200ms ease-out',
              '@keyframes fadeIn': { from: { opacity: 0.5 }, to: { opacity: 1 } },
            }}
          >
            {rows.map((r) => (
              <TableRow
                key={r.merchant}
                hover
                onClick={() => setEditingMerchant(r.merchant)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell
                  sx={{
                    maxWidth: 240,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {r.recurrence && isRecurring(r.recurrence.kind) && (
                      <Box
                        component="span"
                        title={`${recurrenceLabel(r.recurrence.kind)} · ~$${r.recurrence.estMonthlyCost.toFixed(0)}/mo`}
                        sx={{ fontSize: 12, color: 'primary.main', lineHeight: 1 }}
                      >
                        &#x21bb;
                      </Box>
                    )}
                    <Typography variant="body2" color="text.secondary">{r.merchant}</Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.85 }}>
                    {r.recurrence && isRecurring(r.recurrence.kind) && (
                      <>
                        {' · '}
                        {recurrenceLabel(r.recurrence.kind)}
                      </>
                    )}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{r.count}</TableCell>
                <TableCell
                  align="right"
                  sx={{
                    color: isIncome ? 'success.main' : 'text.primary',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {isIncome ? `+${usd.format(r.total)}` : usd.format(r.total)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ color: 'text.secondary' }}>
                  {isIncome ? 'No income in range.' : 'No spend in range.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', zIndex: 2 }}>
              <TableRow
                sx={{
                  bgcolor: (theme) =>
                    theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                }}
              >
                <TableCell
                  sx={{
                    fontWeight: 700,
                    borderTop: '2px solid',
                    borderColor: 'divider',
                    py: 1,
                  }}
                >
                  Total
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    borderTop: '2px solid',
                    borderColor: 'divider',
                    py: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {totalCount.toLocaleString()}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontWeight: 700,
                    borderTop: '2px solid',
                    borderColor: 'divider',
                    py: 1,
                    color: isIncome ? 'success.main' : 'inherit',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {isIncome ? `+${usd.format(totalAmount)}` : usd.format(totalAmount)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </DataTable>
      </Box>

      {editingMerchant && (
        <BulkRecategorizeDialog
          merchantKey={editingMerchant}
          onClose={() => setEditingMerchant(null)}
        />
      )}
    </Paper>
  );
}

import { LANDING_ONLY_BUILD } from '../../env';

export function DemoModeBanner() {
  const demoMode = useFilters((s) => s.demoMode);
  const setDemoMode = useFilters((s) => s.setDemoMode);

  if (!demoMode || LANDING_ONLY_BUILD) return null;

  return (
    <Alert
      severity="warning"
      action={
        <Button
          size="small"
          variant="contained"
          color="warning"
          onClick={() => setDemoMode(false)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            px: { xs: 1.25, sm: 1.5 },
            mr: { xs: 0, sm: 0.5 },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            Exit Demo
          </Box>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Switch to Real Data
          </Box>
        </Button>
      }
      sx={{
        alignItems: 'center',
        py: { xs: 0.25, sm: 0.5 },
        '& .MuiAlert-message': { py: 0.5 },
        '& .MuiAlert-action': { pt: 0, alignItems: 'center' },
      }}
    >
      <strong>Demo Mode active.</strong>{' '}
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        Your real accounts and transactions are hidden.
      </Box>
    </Alert>
  );
}
