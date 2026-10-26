import type { ReactNode } from 'react';
import {
  Typography,
  Box,
  Stack,
  Paper,
  Chip,
  Button,
  Tooltip,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DataTable from '../DataTable';
import Sparkline, { type SparklinePoint } from '../Sparkline';
import { subtleScrollSx } from '../../styles';
import { usd, monthLabel } from '../../lib';
import {
  getMerchantBillStatus,
  type CategoryProjection,
  type IncomeStreamProjection,
} from '../../domain/forecastSpending';
import type { RecurrenceInfo } from '../../types';
import type { ConsolidatedMerchant } from '../../api';
import type { IncomeStream } from '../../stores/forecastStore';

export function BreakdownSummaryCards({
  monthKey,
  isCurrentMonth,
  breakdownTab,
  setBreakdownTab,
  totalActualToDate,
  totalSpend,
  currentDayOfMonth,
  daysInCurrentMonth,
  totalRemaining,
  actualIncomeToDate,
  projectedIncome,
  remainingIncome,
  sortedProjectionsCount,
  comparisonMonth,
  totalComparisonIncome,
  totalComparisonSpend,
  totalRecurring,
  totalVariable,
  incomeStreams,
  incomeProjectionBasis,
  incomeStreamProjectionsCount,
  priorYearMonth,
  projectedNet,
  onManageStreams,
}: {
  monthKey: string;
  isCurrentMonth: boolean;
  breakdownTab: 'spend' | 'income';
  setBreakdownTab: (tab: 'spend' | 'income') => void;
  totalActualToDate: number;
  totalSpend: number;
  currentDayOfMonth: number;
  daysInCurrentMonth: number;
  totalRemaining: number;
  actualIncomeToDate?: number;
  projectedIncome: number;
  remainingIncome: number;
  sortedProjectionsCount: number;
  comparisonMonth: string;
  totalComparisonIncome: number;
  totalComparisonSpend: number;
  totalRecurring: number;
  totalVariable: number;
  incomeStreams: IncomeStream[];
  incomeProjectionBasis: string;
  incomeStreamProjectionsCount: number;
  priorYearMonth: string | null;
  projectedNet: number;
  onManageStreams: () => void;
}) {
  const valueTypographySx = {
    fontWeight: 700,
    mt: 0.25,
    fontSize: { xs: '1.15rem', sm: '1.5rem' },
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <Box
      sx={{
        display: { xs: 'grid', md: 'flex' },
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
        gap: { xs: 1.25, sm: 1.5 },
        mb: { xs: 2, md: 2.5 },
        flexShrink: 0,
      }}
    >
      {isCurrentMonth && breakdownTab === 'spend' && (
        <>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: 'background.default',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block' }}>
              Spent to Date
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'text.primary' }}>
              {usd.format(totalActualToDate)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalSpend > 0 ? `${Math.round((totalActualToDate / totalSpend) * 100)}% of projected month` : `${Math.round((currentDayOfMonth / daysInCurrentMonth) * 100)}% of month elapsed`}
            </Typography>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', display: 'block' }}>
              Projected Remaining Spend
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'primary.main' }}>
              +{usd.format(totalRemaining)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Expected rest of {monthLabel(monthKey)}
            </Typography>
          </Paper>
        </>
      )}

      {isCurrentMonth && breakdownTab === 'income' && (
        <>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: 'background.default',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block' }}>
              Received to Date
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'success.main' }}>
              +{usd.format(actualIncomeToDate || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {projectedIncome > 0
                ? `${Math.round(((actualIncomeToDate || 0) / projectedIncome) * 100)}% of projected month`
                : `${Math.round((currentDayOfMonth / daysInCurrentMonth) * 100)}% of month elapsed`}
            </Typography>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: (theme) => alpha(theme.palette.success.main, 0.05),
              borderColor: (theme) => alpha(theme.palette.success.main, 0.3),
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main', display: 'block' }}>
              Projected Remaining Income
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'success.main' }}>
              +{usd.format(remainingIncome)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Expected rest of {monthLabel(monthKey)}
            </Typography>
          </Paper>
        </>
      )}

      <Paper
        variant="outlined"
        onClick={() => setBreakdownTab('spend')}
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          flex: 1,
          cursor: 'pointer',
          bgcolor: breakdownTab === 'spend' ? (theme) => alpha(theme.palette.primary.main, 0.05) : 'background.default',
          borderColor: breakdownTab === 'spend' ? 'primary.main' : 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          transition: 'all 150ms ease',
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: breakdownTab === 'spend' ? 'primary.main' : 'text.secondary', display: 'block' }}>
          {isCurrentMonth ? 'Projected Month-End Spend' : 'Projected Spend'}
        </Typography>
        <Typography variant="h5" sx={{ ...valueTypographySx, color: 'text.primary' }}>
          {usd.format(totalSpend)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Across {sortedProjectionsCount} active categories
        </Typography>
      </Paper>

      {comparisonMonth !== 'none' && (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.25, sm: 1.5 },
            flex: 1,
            bgcolor: (theme) => alpha(theme.palette.info.main, 0.05),
            borderColor: (theme) => alpha(theme.palette.info.main, 0.25),
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'info.main', display: 'block' }}>
            {breakdownTab === 'income'
              ? `Comparison Income (${monthLabel(comparisonMonth)})`
              : `Comparison Spend (${monthLabel(comparisonMonth)})`}
          </Typography>
          <Typography variant="h5" sx={{ ...valueTypographySx, color: 'text.primary' }}>
            {breakdownTab === 'income'
              ? `+${usd.format(totalComparisonIncome)}`
              : usd.format(totalComparisonSpend)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {breakdownTab === 'income' ? (
              totalComparisonIncome > 0 ? (
                projectedIncome >= totalComparisonIncome ? (
                  <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>
                    +{usd.format(projectedIncome - totalComparisonIncome)} (+{Math.round(((projectedIncome - totalComparisonIncome) / totalComparisonIncome) * 100)}%) vs {monthLabel(comparisonMonth)}
                  </Box>
                ) : (
                  <Box component="span" sx={{ color: 'warning.main', fontWeight: 600 }}>
                    -{usd.format(totalComparisonIncome - projectedIncome)} (-{Math.round(((totalComparisonIncome - projectedIncome) / totalComparisonIncome) * 100)}%) vs {monthLabel(comparisonMonth)}
                  </Box>
                )
              ) : 'No income data'
            ) : totalComparisonSpend > 0 ? (
              totalSpend >= totalComparisonSpend ? (
                <Box component="span" sx={{ color: 'warning.main', fontWeight: 600 }}>
                  +{usd.format(totalSpend - totalComparisonSpend)} (+{Math.round(((totalSpend - totalComparisonSpend) / totalComparisonSpend) * 100)}%) vs {monthLabel(comparisonMonth)}
                </Box>
              ) : (
                <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>
                  -{usd.format(totalComparisonSpend - totalSpend)} (-{Math.round(((totalComparisonSpend - totalSpend) / totalComparisonSpend) * 100)}%) vs {monthLabel(comparisonMonth)}
                </Box>
              )
            ) : 'No spend data'}
          </Typography>
        </Paper>
      )}

      {!isCurrentMonth && breakdownTab === 'spend' && (
        <>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: 'background.default',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', display: 'block' }}>
              Recurring Fixed
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'primary.main' }}>
              {usd.format(totalRecurring)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {totalSpend > 0 ? Math.round((totalRecurring / totalSpend) * 100) : 0}% of projected total
            </Typography>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: { xs: 1.25, sm: 1.5 },
              flex: 1,
              bgcolor: 'background.default',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block' }}>
              Variable & Budgeted
            </Typography>
            <Typography variant="h5" sx={{ ...valueTypographySx, color: 'text.primary' }}>
              {usd.format(totalVariable)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Flexible / discretionary
            </Typography>
          </Paper>
        </>
      )}

      <Paper
        variant="outlined"
        onClick={() => setBreakdownTab('income')}
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          flex: 1,
          cursor: 'pointer',
          bgcolor: breakdownTab === 'income' ? (theme) => alpha(theme.palette.success.main, 0.06) : 'background.default',
          borderColor: breakdownTab === 'income' ? 'success.main' : 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          transition: 'all 150ms ease',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.main', display: 'block' }}>
            Projected Income
          </Typography>
          {incomeStreams.length > 0 && (
            <Tooltip
              arrow
              title={
                <Box sx={{ p: 0.5, minWidth: 220 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Income Streams ({incomeStreams.filter((s) => s.enabled).length} active, {incomeStreams.filter((s) => !s.enabled).length} excluded)
                  </Typography>
                  {incomeStreams.map((s) => (
                    <Stack key={s.id} direction="row" justifyContent="space-between" spacing={1} sx={{ fontSize: '0.75rem', mb: 0.25 }}>
                      <Box component="span" sx={{ color: s.enabled ? 'inherit' : 'text.disabled', textDecoration: s.enabled ? 'none' : 'line-through' }}>
                        {s.name} {s.isFormerEmployer ? '(Former)' : ''}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 600, color: s.enabled ? 'success.light' : 'text.disabled' }}>
                        {s.enabled ? usd.format(s.monthlyAmount) : 'Excluded'}
                      </Box>
                    </Stack>
                  ))}
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'info.light', fontStyle: 'italic' }}>
                    Click to manage under Forecast → Income Streams
                  </Typography>
                </Box>
              }
            >
              <Button
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageStreams();
                }}
                sx={{
                  minWidth: 0,
                  p: 0,
                  fontSize: '0.68rem',
                  textTransform: 'none',
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline', bgcolor: 'transparent' },
                }}
              >
                Streams →
              </Button>
            </Tooltip>
          )}
        </Stack>
        <Typography variant="h5" sx={{ ...valueTypographySx, color: 'success.main' }}>
          {usd.format(projectedIncome)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {isCurrentMonth && (actualIncomeToDate || 0) > 0
            ? `${usd.format(actualIncomeToDate || 0)} received · +${usd.format(remainingIncome)} est.`
            : incomeProjectionBasis === 'recurring_stream'
            ? `${incomeStreamProjectionsCount} active income ${incomeStreamProjectionsCount === 1 ? 'stream' : 'streams'}`
            : incomeProjectionBasis === 'last_year_month'
            ? `Matched to ${priorYearMonth ? monthLabel(priorYearMonth) : 'Last Year'}`
            : incomeProjectionBasis === 'last_year_avg'
            ? '12-mo historical avg'
            : 'Recent monthly avg'}
        </Typography>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.25, sm: 1.5 },
          flex: 1,
          gridColumn: { xs: '1 / -1', md: 'auto' },
          bgcolor: 'background.default',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: projectedNet >= 0 ? 'success.main' : 'error.main', display: 'block' }}>
          Projected Net
        </Typography>
        <Typography variant="h5" sx={{ ...valueTypographySx, color: projectedNet >= 0 ? 'success.main' : 'error.main' }}>
          {projectedNet >= 0 ? '+' : ''}{usd.format(projectedNet)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {projectedIncome > 0
            ? `${Math.round((projectedNet / projectedIncome) * 100)}% savings rate`
            : 'Estimated balance'}
        </Typography>
      </Paper>
    </Box>
  );
}

export function IncomeBreakdownTable({
  incomeStreamProjections,
  comparisonMonth,
  isCurrentMonth,
  priorYearMonth,
  projectedIncome,
  totalComparisonIncome,
  incomeSparklinePoints,
}: {
  incomeStreamProjections: IncomeStreamProjection[];
  comparisonMonth: string;
  isCurrentMonth: boolean;
  priorYearMonth: string | null;
  projectedIncome: number;
  totalComparisonIncome: number;
  incomeSparklinePoints: SparklinePoint[];
}) {
  return (
    <DataTable
      component={Box}
      size="small"
      stickyHeader
      containerSx={{
        flex: { xs: '0 0 auto', md: 1 },
        height: { xs: 'auto', md: '100%' },
        minHeight: 0,
        overflowX: 'auto',
        overflowY: { xs: 'visible', md: 'auto' },
        border: 'none',
        borderRadius: 0,
        ...subtleScrollSx,
      }}
    >
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 600, minWidth: 180 }}>Income Source</TableCell>
          <TableCell sx={{ fontWeight: 600, minWidth: 165 }}>Cadence & Basis</TableCell>
          <TableCell sx={{ fontWeight: 600, minWidth: 210 }}>Paycheck Schedule & Account</TableCell>
          {comparisonMonth !== 'none' && (
            <TableCell align="right" sx={{ fontWeight: 600, minWidth: 120, color: 'info.main' }}>
              {monthLabel(comparisonMonth)} Actual
            </TableCell>
          )}
          {isCurrentMonth ? (
            <>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 115 }}>Received to Date</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 115, color: 'success.main' }}>Est. Remaining</TableCell>
            </>
          ) : (
            <>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 110 }}>Per Paycheck</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 110 }}>Expected Count</TableCell>
            </>
          )}
          <TableCell align="right" sx={{ fontWeight: 600, minWidth: 125 }}>
            {isCurrentMonth ? 'Projected Finish' : 'Total Projected'}
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {incomeStreamProjections.map((s) => {
          const freqLabel =
            s.basis === 'last_year_month'
              ? priorYearMonth
                ? `Last Year (${monthLabel(priorYearMonth)})`
                : 'Same Month Last Year'
              : s.basis === 'last_year_avg'
              ? '12-Mo Historical Avg'
              : s.basis === 'actual_exceeded'
              ? 'Current Month Deposits'
              : s.frequency === 'biweekly'
              ? 'Bi-Weekly Payroll'
              : s.frequency === 'semimonthly'
              ? 'Semi-Monthly Payroll'
              : s.frequency === 'weekly'
              ? 'Weekly Deposits'
              : 'Monthly Income';

          const receivedVal = s.receivedToDate || 0;
          const remVal = s.remaining || 0;
          const pctRec = s.total > 0 ? Math.min(100, Math.round((receivedVal / s.total) * 100)) : 0;

          const streamShare = projectedIncome > 0 ? s.total / projectedIncome : 1;
          const compStreamEst = Math.round(totalComparisonIncome * streamShare);

          return (
            <TableRow key={s.id} hover>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color || '#2e7d32' }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.accountName}
                    </Typography>
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Chip
                    label={freqLabel}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 20, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                  />
                  {incomeSparklinePoints.length > 0 && (
                    <Sparkline
                      data={incomeSparklinePoints}
                      color="#2e7d32"
                      width={50}
                      height={18}
                      title="Historical Monthly Income"
                      average={s.total}
                    />
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  <AccountBalanceIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    ~{usd.format(s.paycheckAmount)}/paycheck
                  </Typography>
                  {isCurrentMonth ? (
                    <Chip
                      size="small"
                      label={
                        remVal === 0
                          ? '✓ Received'
                          : s.nextExpectedDay
                          ? `⏳ Next ~Day ${s.nextExpectedDay}`
                          : '⏳ Upcoming'
                      }
                      color={remVal === 0 ? 'success' : 'warning'}
                      variant="outlined"
                      sx={{
                        height: 18,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                  ) : s.upcomingDays.length > 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      (Est. Day {s.upcomingDays.join(', ')})
                    </Typography>
                  ) : null}
                </Stack>
              </TableCell>
              {comparisonMonth !== 'none' && (
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: compStreamEst > 0 ? 'text.secondary' : 'text.disabled' }}>
                  {compStreamEst > 0 ? `+${usd.format(compStreamEst)}` : '—'}
                </TableCell>
              )}
              {isCurrentMonth ? (
                <>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: receivedVal > 0 ? 'success.main' : 'text.disabled', fontWeight: receivedVal > 0 ? 600 : 400 }}>
                    {receivedVal > 0 ? `+${usd.format(receivedVal)}` : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: remVal > 0 ? 'success.main' : 'text.disabled', fontWeight: remVal > 0 ? 600 : 400 }}>
                    {remVal > 0 ? `+${usd.format(remVal)}` : '—'}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                    {usd.format(s.paycheckAmount)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                    {s.expectedCount || 1}x
                  </TableCell>
                </>
              )}
              <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                {isCurrentMonth ? (
                  <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 85 }}>
                    <span>+{usd.format(s.total)}</span>
                    <Box sx={{ width: '100%', height: 4, bgcolor: 'action.hover', borderRadius: 2, mt: 0.4, overflow: 'hidden' }}>
                      <Box sx={{ width: `${pctRec}%`, height: '100%', bgcolor: 'success.main', borderRadius: 2 }} />
                    </Box>
                  </Box>
                ) : (
                  `+${usd.format(s.total)}`
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {incomeStreamProjections.length === 0 && (
          <TableRow>
            <TableCell colSpan={comparisonMonth !== 'none' ? 7 : 6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              No active income streams or historical income found for this view.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </DataTable>
  );
}

export function SpendBreakdownTable({
  sortedProjections,
  comparisonMonth,
  isCurrentMonth,
  priorYearMonth,
  monthKey,
  categoryColor,
  categorySparklineData,
  priorYearMerchantsByCategory,
  comparisonMerchantsByCategory,
  comparisonSpendByCategory,
  recurringMerchantsByCategory,
  recurrenceMap,
}: {
  sortedProjections: CategoryProjection[];
  comparisonMonth: string;
  isCurrentMonth: boolean;
  priorYearMonth: string | null;
  monthKey: string;
  categoryColor: (catName: string) => string;
  categorySparklineData: Map<string, SparklinePoint[]>;
  priorYearMerchantsByCategory: Map<string, Array<{ merchant: string; amount: number; count: number }>>;
  comparisonMerchantsByCategory: Map<string, Array<{ merchant: string; amount: number; count: number }>>;
  comparisonSpendByCategory: Map<string, number>;
  recurringMerchantsByCategory: Map<string, ConsolidatedMerchant[]>;
  recurrenceMap: Map<string, RecurrenceInfo>;
}) {
  return (
    <DataTable
      component={Box}
      size="small"
      stickyHeader
      containerSx={{
        flex: { xs: '0 0 auto', md: 1 },
        height: { xs: 'auto', md: '100%' },
        minHeight: 0,
        overflowX: 'auto',
        overflowY: { xs: 'visible', md: 'auto' },
        border: 'none',
        borderRadius: 0,
        ...subtleScrollSx,
      }}
    >
      <TableHead>
        <TableRow>
          <TableCell sx={{ fontWeight: 600, minWidth: 140 }}>Category</TableCell>
          <TableCell sx={{ fontWeight: 600, minWidth: 165 }}>Projection Basis</TableCell>
          <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>Associated Merchant</TableCell>
          {comparisonMonth !== 'none' && (
            <TableCell align="right" sx={{ fontWeight: 600, minWidth: 120, color: 'info.main' }}>
              {monthLabel(comparisonMonth)} Actual
            </TableCell>
          )}
          {isCurrentMonth ? (
            <>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 105 }}>Spent to Date</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 110, color: 'primary.main' }}>Est. Remaining</TableCell>
            </>
          ) : (
            <>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 95 }}>Recurring</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, minWidth: 95 }}>Variable</TableCell>
            </>
          )}
          <TableCell align="right" sx={{ fontWeight: 600, minWidth: 120 }}>
            {isCurrentMonth ? 'Projected Finish' : 'Total Projected'}
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sortedProjections.map((p) => {
          const color = categoryColor(p.category);
          let basisLabel = 'Trailing 3-Mo Avg';
          let basisColor: 'default' | 'primary' | 'secondary' | 'info' = 'default';
          if (p.basis === 'budget') {
            basisLabel = 'Active Budget';
            basisColor = 'primary';
          } else if (p.basis === 'last_year') {
            basisLabel = priorYearMonth ? `Last Year (${monthLabel(priorYearMonth)})` : 'Last Year';
            basisColor = 'info';
          } else if (p.basis === 'last_year_avg') {
            basisLabel = 'Prior Year Avg';
            basisColor = 'info';
          } else if (p.basis === 'recurring') {
            basisLabel = 'Recurring Bills';
            basisColor = 'secondary';
          } else if (p.basis === 'recurring + trailing') {
            basisLabel = 'Bills + Variable Avg';
            basisColor = 'secondary';
          } else if (p.basis === 'actual_exceeded') {
            basisLabel = 'Actual Spend';
            basisColor = 'default';
          }

          const sparklinePoints = categorySparklineData.get(p.category) || [];
          const hasSparkline = sparklinePoints.length > 0 && sparklinePoints.some((pt) => pt.amount > 0);

          const pyMerchants = priorYearMerchantsByCategory.get(p.category) || [];
          const compMerchants = comparisonMerchantsByCategory.get(p.category) || [];
          const compActual = comparisonSpendByCategory.get(p.category) || 0;
          const recMerchants = recurringMerchantsByCategory.get(p.category) || [];

          let associatedMerchantContent: ReactNode = null;

          if (p.basis === 'last_year') {
            if (pyMerchants.length > 0) {
              const summary =
                pyMerchants.length === 1
                  ? `${pyMerchants[0].merchant} (${usd.format(pyMerchants[0].amount)})`
                  : pyMerchants.length === 2
                  ? `${pyMerchants[0].merchant} (${usd.format(pyMerchants[0].amount)}), ${pyMerchants[1].merchant} (${usd.format(pyMerchants[1].amount)})`
                  : `${pyMerchants[0].merchant} (${usd.format(pyMerchants[0].amount)}) + ${pyMerchants.length - 1} more`;

              associatedMerchantContent = (
                <Tooltip
                  arrow
                  placement="top-start"
                  title={
                    <Box sx={{ p: 0.5, minWidth: 220, maxWidth: 360 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                        {priorYearMonth ? `${monthLabel(priorYearMonth)} Actuals (${p.category})` : `Prior Year Actuals (${p.category})`}
                      </Typography>
                      <Stack spacing={0.5}>
                        {pyMerchants.map((m) => (
                          <Stack key={m.merchant} direction="row" justifyContent="space-between" spacing={2}>
                            <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 500 }}>
                              {m.merchant} {m.count > 1 ? `(${m.count} txns)` : ''}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              {usd.format(m.amount)}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  }
                >
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ maxWidth: 260, cursor: 'help' }}>
                    <StorefrontIcon sx={{ fontSize: 15, color: 'info.main', flexShrink: 0 }} />
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        color: 'text.primary',
                      }}
                    >
                      {summary}
                    </Typography>
                  </Stack>
                </Tooltip>
              );
            } else {
              associatedMerchantContent = (
                <Typography variant="caption" color="text.secondary">
                  Seasonal estimate ({priorYearMonth ? monthLabel(priorYearMonth) : 'Last Year'})
                </Typography>
              );
            }
          } else if (p.basis === 'recurring' || p.basis === 'recurring + trailing') {
            if (recMerchants.length > 0) {
              const summary =
                recMerchants.length === 1
                  ? `${recMerchants[0].merchantKey} (${usd.format(recMerchants[0].monthlyAverage)}/mo)`
                  : recMerchants.length === 2
                  ? `${recMerchants[0].merchantKey}, ${recMerchants[1].merchantKey}`
                  : `${recMerchants[0].merchantKey} + ${recMerchants.length - 1} more`;

              const billStatuses = isCurrentMonth
                ? recMerchants.map((m) => ({
                    merchant: m,
                    status: getMerchantBillStatus(m.merchantKey, monthKey, recurrenceMap),
                  }))
                : null;
              const unpaidCount = billStatuses ? billStatuses.filter((b) => !b.status.isPaidThisMonth).length : 0;

              associatedMerchantContent = (
                <Stack spacing={0.5}>
                  <Tooltip
                    arrow
                    placement="top-start"
                    title={
                      <Box sx={{ p: 0.5, minWidth: 260, maxWidth: 420 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                          Recurring Commitments ({p.category})
                        </Typography>
                        <Stack spacing={0.5}>
                          {recMerchants.map((m) => {
                            const status = isCurrentMonth
                              ? getMerchantBillStatus(m.merchantKey, monthKey, recurrenceMap)
                              : null;
                            return (
                              <Stack key={m.merchantKey} direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                                <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 500 }}>
                                  {m.merchantKey}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  {status && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        color: status.isPaidThisMonth ? 'success.light' : 'warning.light',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {status.isPaidThisMonth
                                        ? `✓ Paid${status.lastPaidShortLabel ? ` ${status.lastPaidShortLabel}` : ''}`
                                        : `⏳ ${status.countdownText || 'Upcoming'}${status.lastPaidShortLabel ? ` · Last paid ${status.lastPaidShortLabel}` : ''}`}
                                    </Typography>
                                  )}
                                  <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {usd.format(m.monthlyAverage)}/mo
                                  </Typography>
                                </Stack>
                              </Stack>
                            );
                          })}
                        </Stack>
                      </Box>
                    }
                  >
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ maxWidth: 280, cursor: 'help' }}>
                      <Box component="span" sx={{ fontSize: 13, color: 'secondary.main', lineHeight: 1, flexShrink: 0 }}>
                        &#x21bb;
                      </Box>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          fontWeight: 500,
                          fontSize: '0.8rem',
                          color: 'text.secondary',
                        }}
                      >
                        {summary}
                      </Typography>
                      {isCurrentMonth && (
                        <Chip
                          size="small"
                          label={unpaidCount > 0 ? `⏳ ${unpaidCount} due` : '✓ Paid'}
                          color={unpaidCount > 0 ? 'warning' : 'success'}
                          variant="outlined"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            flexShrink: 0,
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      )}
                    </Stack>
                  </Tooltip>
                  {p.basis === 'recurring + trailing' && p.variable > 0 && hasSparkline && (
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Sparkline
                        data={sparklinePoints}
                        color={color}
                        width={48}
                        height={16}
                        title={`${p.category} Variable Spend Trend`}
                        average={p.variable}
                      />
                      <Typography variant="caption" sx={{ fontSize: '0.72rem', color: 'text.secondary', fontWeight: 500 }}>
                        + variable avg: {usd.format(p.variable)}/mo
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              );
            } else {
              associatedMerchantContent = (
                <Typography variant="caption" color="text.secondary">
                  Recurring bills
                </Typography>
              );
            }
          } else if (p.basis === 'budget') {
            associatedMerchantContent = (
              <Stack direction="row" spacing={0.75} alignItems="center">
                {hasSparkline && (
                  <Sparkline
                    data={sparklinePoints}
                    color={color}
                    width={48}
                    height={16}
                    title={`${p.category} Recent Trend (Budgeted)`}
                  />
                )}
                <Typography variant="caption" color="text.secondary">
                  Active budget limit
                </Typography>
              </Stack>
            );
          } else if (p.basis === 'trailing') {
            associatedMerchantContent = (
              <Stack direction="row" spacing={0.75} alignItems="center">
                {hasSparkline && (
                  <Sparkline
                    data={sparklinePoints}
                    color={color}
                    width={54}
                    height={18}
                    title={`${p.category} Trailing Spend`}
                    average={p.total}
                  />
                )}
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.78rem' }}>
                  Recent 3-mo avg: {usd.format(p.total)}/mo
                </Typography>
              </Stack>
            );
          } else if (p.basis === 'last_year_avg') {
            associatedMerchantContent = (
              <Stack direction="row" spacing={0.75} alignItems="center">
                {hasSparkline && (
                  <Sparkline
                    data={sparklinePoints}
                    color={color}
                    width={54}
                    height={18}
                    title={`${p.category} Historical Trend`}
                    average={p.total}
                  />
                )}
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.78rem' }}>
                  12-mo avg: {usd.format(p.total)}/mo
                </Typography>
              </Stack>
            );
          } else if (p.basis === 'actual_exceeded') {
            associatedMerchantContent = (
              <Typography variant="caption" color="text.secondary">
                Actual transactions this month
              </Typography>
            );
          }

          const actualVal = p.actualToDate || 0;
          const remVal = p.remaining || 0;
          const pctSpent = p.total > 0 ? Math.min(100, Math.round((actualVal / p.total) * 100)) : 0;

          return (
            <TableRow key={p.category} hover>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {p.category}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Chip
                    label={basisLabel}
                    size="small"
                    color={basisColor}
                    variant="outlined"
                    sx={{ fontSize: '0.7rem', height: 20, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
                  />
                  {(p.basis === 'trailing' || p.basis === 'recurring + trailing' || p.basis === 'last_year_avg') && hasSparkline && (
                    <Sparkline
                      data={sparklinePoints}
                      color={color}
                      width={50}
                      height={18}
                      title={`${p.category} Trailing Spend`}
                      average={p.basis === 'recurring + trailing' ? p.variable : p.total}
                    />
                  )}
                </Stack>
              </TableCell>
              <TableCell sx={{ maxWidth: 260 }}>
                {associatedMerchantContent}
              </TableCell>
              {comparisonMonth !== 'none' && (
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: compActual > 0 ? 'text.secondary' : 'text.disabled' }}>
                  {compActual > 0 ? (
                    compMerchants.length > 0 ? (
                      <Tooltip
                        arrow
                        placement="top-end"
                        title={
                          <Box sx={{ p: 0.5, minWidth: 200, maxWidth: 320 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
                              {monthLabel(comparisonMonth)} Spend ({p.category})
                            </Typography>
                            <Stack spacing={0.5}>
                              {compMerchants.map((m) => (
                                <Stack key={m.merchant} direction="row" justifyContent="space-between" spacing={2}>
                                  <Typography variant="caption">{m.merchant} {m.count > 1 ? `(${m.count})` : ''}</Typography>
                                  <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{usd.format(m.amount)}</Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </Box>
                        }
                      >
                        <span style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
                          {usd.format(compActual)}
                        </span>
                      </Tooltip>
                    ) : (
                      usd.format(compActual)
                    )
                  ) : (
                    '—'
                  )}
                </TableCell>
              )}
              {isCurrentMonth ? (
                <>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: actualVal > 0 ? 'text.primary' : 'text.disabled' }}>
                    {actualVal > 0 ? usd.format(actualVal) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: remVal > 0 ? 'primary.main' : 'text.disabled', fontWeight: remVal > 0 ? 600 : 400 }}>
                    {remVal > 0 ? `+${usd.format(remVal)}` : '—'}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: p.recurring > 0 ? 'primary.main' : 'text.disabled' }}>
                    {p.recurring > 0 ? usd.format(p.recurring) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.variable > 0 ? usd.format(p.variable) : '—'}
                  </TableCell>
                </>
              )}
              <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {isCurrentMonth ? (
                  <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 80 }}>
                    <span>{usd.format(p.total)}</span>
                    <Box sx={{ width: '100%', height: 4, bgcolor: 'action.hover', borderRadius: 2, mt: 0.4, overflow: 'hidden' }}>
                      <Box sx={{ width: `${pctSpent}%`, height: '100%', bgcolor: color, borderRadius: 2 }} />
                    </Box>
                  </Box>
                ) : (
                  usd.format(p.total)
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTable>
  );
}
