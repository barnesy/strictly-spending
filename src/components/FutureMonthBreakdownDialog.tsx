import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Stack,
  Paper,
  Chip,
  IconButton,
  Button,
  FormControl,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { SparklinePoint } from './Sparkline';
import { monthLabel } from '../lib';
import {
  getPriorYearMonth,
  computeCategoryProjections,
  computeIncomeProjections,
  projectMonthlyIncome,
} from '../domain/forecastSpending';
import { useSpendingForecast } from '../hooks/useSpendingForecast';
import { useFilters } from '../stores/store';
import type { Category, Budget, RecurrenceInfo } from '../types';
import type { ConsolidatedMerchant, CategoryTrailingAvg } from '../api';
import {
  BreakdownSummaryCards,
  IncomeBreakdownTable,
  SpendBreakdownTable,
} from './forecast/BreakdownTables';

export interface FutureMonthBreakdownDialogProps {
  monthKey: string;
  initialComparisonMonth?: string | null;
  categories?: Category[];
  budgets?: Budget[];
  consolidatedMerchants?: ConsolidatedMerchant[];
  trailingAverages?: CategoryTrailingAvg[];
  recurrenceMap?: Map<string, RecurrenceInfo>;
  disabledCategories?: string[];
  excludedBudgetCategories?: Set<string>;
  excludedMerchants?: Set<string>;
  historicalMonthlySpend?: Map<string, Map<string, number>>;
  historicalCategoryAnnualAvg?: Map<string, number>;
  historicalMonthlyIncome?: Map<string, number>;
  historicalAnnualAvgIncome?: number;
  recentAvgIncome?: number;
  recurringIncome?: number;
  onClose: () => void;
}

export default function FutureMonthBreakdownDialog({
  monthKey,
  initialComparisonMonth,
  categories: propCategories,
  budgets: propBudgets,
  consolidatedMerchants: propConsolidatedMerchants,
  trailingAverages: propTrailingAverages,
  recurrenceMap: propRecurrenceMap,
  disabledCategories: propDisabledCategories,
  excludedBudgetCategories: propExcludedBudgetCategories,
  excludedMerchants: propExcludedMerchants,
  historicalMonthlySpend: propHistoricalMonthlySpend,
  historicalCategoryAnnualAvg: propHistoricalCategoryAnnualAvg,
  historicalMonthlyIncome: propHistoricalMonthlyIncome,
  historicalAnnualAvgIncome: propHistoricalAnnualAvgIncome,
  recentAvgIncome: propRecentAvgIncome,
  recurringIncome: propRecurringIncome,
  onClose,
}: FutureMonthBreakdownDialogProps) {
  const navigate = useNavigate();
  const globalTransactionType = useFilters((s) => s.transactionType);
  const enabledAccountIds = useFilters((s) => s.enabledAccountIds);
  const [breakdownTab, setBreakdownTab] = useState<'spend' | 'income'>(() =>
    globalTransactionType === 'income' ? 'income' : 'spend'
  );
  const priorYearMonth = getPriorYearMonth(monthKey);
  const [comparisonMonth, setComparisonMonth] = useState<string>(
    initialComparisonMonth !== undefined ? (initialComparisonMonth || 'none') : (priorYearMonth || 'none')
  );

  const sharedForecast = useSpendingForecast();

  const categories = propCategories || sharedForecast.categories;
  const budgets = propBudgets || sharedForecast.budgets;
  const consolidatedMerchants = propConsolidatedMerchants || sharedForecast.consolidatedMerchants;
  const trailingAverages = propTrailingAverages || sharedForecast.trailingAverages;
  const recurrenceMap = propRecurrenceMap || sharedForecast.recurrenceMap;
  const disabledCategories = propDisabledCategories || sharedForecast.disabledCategories;
  const excludedBudgetCategories = propExcludedBudgetCategories || sharedForecast.excludedBudgetCategories;
  const excludedMerchants = propExcludedMerchants || sharedForecast.excludedMerchants;
  const historicalMonthlySpend = propHistoricalMonthlySpend || sharedForecast.historicalMonthlySpend;
  const historicalCategoryAnnualAvg = propHistoricalCategoryAnnualAvg || sharedForecast.historicalCategoryAnnualAvg;
  const historicalMonthlyIncome = propHistoricalMonthlyIncome || sharedForecast.historicalMonthlyIncome;
  const historicalAnnualAvgIncome = propHistoricalAnnualAvgIncome ?? sharedForecast.historicalAnnualAvgIncome;
  const recurringIncome = propRecurringIncome ?? sharedForecast.forecastRecurringIncome;
  const recentAvgIncome = propRecentAvgIncome ?? historicalAnnualAvgIncome;
  const incomeStreams = sharedForecast.incomeStreams;
  const forecastTaxRate = sharedForecast.forecastTaxRate;

  const availableMonths = useMemo(() => {
    const set = new Set<string>(sharedForecast.availableMonths);
    if (historicalMonthlySpend) {
      for (const m of historicalMonthlySpend.keys()) set.add(m);
    }
    if (historicalMonthlyIncome) {
      for (const m of historicalMonthlyIncome.keys()) set.add(m);
    }
    if (priorYearMonth) {
      set.add(priorYearMonth);
    }
    return Array.from(set).sort().reverse();
  }, [sharedForecast.availableMonths, historicalMonthlySpend, historicalMonthlyIncome, priorYearMonth]);

  const { data: comparisonAllTransactions } = useQuery({
    queryKey: ['comparison_month_all_transactions', comparisonMonth],
    queryFn: async () => {
      if (!comparisonMonth || comparisonMonth === 'none') return [];
      const [yearStr, monthStr] = comparisonMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${comparisonMonth}-01`;
      const endDate = `${comparisonMonth}-${String(lastDay).padStart(2, '0')}`;
      return api.getTransactions(startDate, endDate);
    },
    enabled: Boolean(comparisonMonth && comparisonMonth !== 'none'),
    staleTime: 60_000,
  });

  const comparisonTransactions = useMemo(
    () => (comparisonAllTransactions || []).filter((t) => t.amount < 0),
    [comparisonAllTransactions]
  );

  const comparisonIncomeTransactions = useMemo(() => {
    const transferCats = new Set(
      (categories || []).filter((c) => c.type === 'transfer').map((c) => c.name.toLowerCase())
    );
    return (comparisonAllTransactions || []).filter(
      (t) => t.amount > 0 && !transferCats.has((t.category || '').toLowerCase())
    );
  }, [comparisonAllTransactions, categories]);

  const totalComparisonSpend = useMemo(() => {
    return comparisonTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }, [comparisonTransactions]);

  const totalComparisonIncome = useMemo(() => {
    return comparisonIncomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }, [comparisonIncomeTransactions]);

  const comparisonMerchantsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ merchant: string; amount: number; count: number }>>();
    if (!comparisonTransactions || comparisonTransactions.length === 0) return map;

    const catMerchantMap = new Map<string, Map<string, { amount: number; count: number }>>();

    for (const t of comparisonTransactions) {
      if (!t.category) continue;
      let mGroup = catMerchantMap.get(t.category);
      if (!mGroup) {
        mGroup = new Map<string, { amount: number; count: number }>();
        catMerchantMap.set(t.category, mGroup);
      }
      const mKey = t.merchantKey || t.description || 'Unknown Merchant';
      const existing = mGroup.get(mKey) || { amount: 0, count: 0 };
      existing.amount += Math.abs(t.amount);
      existing.count += 1;
      mGroup.set(mKey, existing);
    }

    for (const [cat, mGroup] of catMerchantMap.entries()) {
      const list: Array<{ merchant: string; amount: number; count: number }> = [];
      for (const [merchant, stats] of mGroup.entries()) {
        list.push({
          merchant,
          amount: stats.amount,
          count: stats.count,
        });
      }
      list.sort((a, b) => b.amount - a.amount);
      map.set(cat, list);
    }

    return map;
  }, [comparisonTransactions]);

  const comparisonSpendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (!comparisonTransactions) return map;
    for (const t of comparisonTransactions) {
      if (!t.category) continue;
      map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
    }
    return map;
  }, [comparisonTransactions]);

  const { data: priorYearTransactions } = useQuery({
    queryKey: ['prior_year_transactions', priorYearMonth],
    queryFn: async () => {
      if (!priorYearMonth) return [];
      const [yearStr, monthStr] = priorYearMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${priorYearMonth}-01`;
      const endDate = `${priorYearMonth}-${String(lastDay).padStart(2, '0')}`;
      const txns = await api.getTransactions(startDate, endDate);
      return txns.filter((t) => t.amount < 0);
    },
    enabled: Boolean(priorYearMonth),
    staleTime: 60_000,
  });

  const priorYearMerchantsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ merchant: string; amount: number; count: number }>>();
    if (!priorYearTransactions || priorYearTransactions.length === 0) return map;

    const catMerchantMap = new Map<string, Map<string, { amount: number; count: number }>>();

    for (const t of priorYearTransactions) {
      if (!t.category) continue;
      let mGroup = catMerchantMap.get(t.category);
      if (!mGroup) {
        mGroup = new Map<string, { amount: number; count: number }>();
        catMerchantMap.set(t.category, mGroup);
      }
      const mKey = t.merchantKey || t.description || 'Unknown Merchant';
      const existing = mGroup.get(mKey) || { amount: 0, count: 0 };
      existing.amount += Math.abs(t.amount);
      existing.count += 1;
      mGroup.set(mKey, existing);
    }

    for (const [cat, mGroup] of catMerchantMap.entries()) {
      const list: Array<{ merchant: string; amount: number; count: number }> = [];
      for (const [merchant, stats] of mGroup.entries()) {
        list.push({
          merchant,
          amount: stats.amount,
          count: stats.count,
        });
      }
      list.sort((a, b) => b.amount - a.amount);
      map.set(cat, list);
    }

    return map;
  }, [priorYearTransactions]);

  const recurringMerchantsByCategory = useMemo(() => {
    const map = new Map<string, ConsolidatedMerchant[]>();
    for (const m of consolidatedMerchants) {
      const list = map.get(m.category) || [];
      list.push(m);
      map.set(m.category, list);
    }
    return map;
  }, [consolidatedMerchants]);

  const currentCalMonth = sharedForecast.currentCalMonth;
  const isCurrentMonth = monthKey === currentCalMonth;
  const now = new Date();
  const currentDayOfMonth = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const monthProjections = useMemo(() => {
    const actualSpendByCategory = isCurrentMonth
      ? (historicalMonthlySpend?.get(monthKey) || new Map<string, number>())
      : undefined;
    return computeCategoryProjections({
      categories,
      budgets,
      consolidatedMerchants,
      trailingAverages,
      disabledCategories,
      excludedBudgetCategories,
      excludedMerchants,
      targetMonthKey: monthKey,
      historicalMonthlySpend,
      historicalCategoryAnnualAvg,
      actualSpendByCategory,
      recurrenceMap,
    });
  }, [categories, budgets, consolidatedMerchants, trailingAverages, disabledCategories, excludedBudgetCategories, excludedMerchants, monthKey, isCurrentMonth, historicalMonthlySpend, historicalCategoryAnnualAvg, recurrenceMap]);

  const sortedProjections = useMemo(() => {
    return Array.from(monthProjections.values()).sort((a, b) => b.total - a.total);
  }, [monthProjections]);

  const priorMonths = useMemo(() => {
    if (!historicalMonthlySpend) return [];
    const allMonths = Array.from(historicalMonthlySpend.keys())
      .filter((m) => m < monthKey)
      .sort();
    return allMonths.slice(-6);
  }, [historicalMonthlySpend, monthKey]);

  const categorySparklineData = useMemo(() => {
    const map = new Map<string, SparklinePoint[]>();
    if (!historicalMonthlySpend || priorMonths.length === 0) return map;

    for (const p of sortedProjections) {
      const points: SparklinePoint[] = priorMonths.map((m) => {
        const catMap = historicalMonthlySpend.get(m);
        const amount = catMap ? (catMap.get(p.category) || 0) : 0;
        return {
          month: m,
          label: monthLabel(m),
          amount,
        };
      });
      map.set(p.category, points);
    }
    return map;
  }, [sortedProjections, priorMonths, historicalMonthlySpend]);

  const incomeSparklinePoints = useMemo<SparklinePoint[]>(() => {
    if (!historicalMonthlyIncome) return [];
    const allIncMonths = Array.from(historicalMonthlyIncome.keys())
      .filter((m) => m < monthKey)
      .sort()
      .slice(-6);
    return allIncMonths.map((m) => ({
      month: m,
      label: monthLabel(m),
      amount: historicalMonthlyIncome.get(m) || 0,
    }));
  }, [historicalMonthlyIncome, monthKey]);

  const totalSpend = useMemo(() => sortedProjections.reduce((sum, p) => sum + p.total, 0), [sortedProjections]);
  const totalActualToDate = useMemo(() => sortedProjections.reduce((sum, p) => sum + (p.actualToDate || 0), 0), [sortedProjections]);
  const totalRemaining = useMemo(() => sortedProjections.reduce((sum, p) => sum + (p.remaining || 0), 0), [sortedProjections]);
  const totalRecurring = useMemo(() => sortedProjections.reduce((sum, p) => sum + p.recurring, 0), [sortedProjections]);
  const totalVariable = totalSpend - totalRecurring;

  const actualIncomeToDate = isCurrentMonth ? Math.round(historicalMonthlyIncome?.get(monthKey) || 0) : undefined;

  const incomeStreamProjections = useMemo(() => {
    const incCat = (categories || []).find((c) => c.type === 'income' || c.name === 'Income');
    return computeIncomeProjections({
      incomeStreams,
      taxRate: forecastTaxRate,
      targetMonthKey: monthKey,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome,
      actualIncomeToDate,
      enabledAccountIds,
      incomeCategoryColor: incCat?.color || '#2e7d32',
    });
  }, [
    categories,
    incomeStreams,
    forecastTaxRate,
    monthKey,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    recentAvgIncome,
    actualIncomeToDate,
    enabledAccountIds,
  ]);

  const incomeProjection = useMemo(() => {
    return projectMonthlyIncome({
      monthKey,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome,
      recurringIncome,
    });
  }, [monthKey, historicalMonthlyIncome, historicalAnnualAvgIncome, recentAvgIncome, recurringIncome]);

  const streamProjectedTotal = useMemo(
    () => incomeStreamProjections.reduce((sum, p) => sum + p.total, 0),
    [incomeStreamProjections]
  );

  const projectedIncome = isCurrentMonth
    ? Math.max(actualIncomeToDate || 0, streamProjectedTotal, incomeProjection.amount)
    : Math.max(streamProjectedTotal, incomeProjection.amount);
  const remainingIncome = isCurrentMonth ? Math.max(0, projectedIncome - (actualIncomeToDate || 0)) : 0;
  const projectedNet = projectedIncome - totalSpend;

  const categoryColor = (catName: string) => categories.find((c) => c.name === catName)?.color || '#9e9e9e';

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          height: { xs: '90dvh', md: '85vh' },
          maxHeight: { xs: '90dvh', md: '85vh' },
          m: { xs: 1.5, sm: 2 },
          width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 32px)' },
          display: 'flex',
          flexDirection: 'column',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 2.5 }, flexShrink: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              <TrendingUpIcon color={breakdownTab === 'income' ? 'success' : 'primary'} />
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.01em', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                {isCurrentMonth ? `Current Month Forecast: ${monthLabel(monthKey)}` : `Forecast Breakdown: ${monthLabel(monthKey)}`}
              </Typography>
              <Chip
                label={isCurrentMonth ? `In Progress · Day ${currentDayOfMonth} of ${daysInCurrentMonth}` : 'Projected'}
                size="small"
                color={breakdownTab === 'income' ? 'success' : 'primary'}
                variant="outlined"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  height: 22,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                }}
              />
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: { xs: 0, sm: 1 }, my: { xs: 0.25, sm: 0 } }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  Compare:
                </Typography>
                <FormControl size="small">
                  <Select
                    id="dialog-comparison-month-select"
                    value={comparisonMonth}
                    onChange={(e) => setComparisonMonth(e.target.value)}
                    size="small"
                    sx={{
                      height: 26,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                      bgcolor: comparisonMonth !== 'none' ? (theme) => alpha(theme.palette.info.main, 0.1) : 'action.hover',
                      color: comparisonMonth !== 'none' ? 'info.main' : 'text.secondary',
                      '& .MuiSelect-select': {
                        py: 0.25,
                        px: 1,
                        pr: '24px !important',
                      },
                    }}
                  >
                    <MenuItem value="none" sx={{ fontSize: '0.8rem' }}>
                      <em>None (No Comparison)</em>
                    </MenuItem>
                    {priorYearMonth && (
                      <MenuItem value={priorYearMonth} sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'info.main' }}>
                        {monthLabel(priorYearMonth)} (Same Month Last Year)
                      </MenuItem>
                    )}
                    {availableMonths
                      .filter((m) => m !== monthKey && m !== priorYearMonth)
                      .map((m) => (
                        <MenuItem key={m} value={m} sx={{ fontSize: '0.8rem' }}>
                          {monthLabel(m)}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: { xs: '0.78rem', sm: '0.875rem' } }}>
              {isCurrentMonth
                ? `Combines actual spend & income so far in ${monthLabel(monthKey)} with projected remaining bills, paychecks, budgets, and ${comparisonMonth !== 'none' ? `actuals from ${monthLabel(comparisonMonth)}` : 'historical trends'}.`
                : `Spending & income projection informed by active budgets, recurring commitments, payroll streams, and ${comparisonMonth !== 'none' ? `actuals from ${monthLabel(comparisonMonth)}` : 'historical trends'}.`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close dialog">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          p: { xs: 2, sm: 3 },
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflowY: { xs: 'auto', md: 'hidden' },
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Metric Summary Cards */}
        <BreakdownSummaryCards
          monthKey={monthKey}
          isCurrentMonth={isCurrentMonth}
          breakdownTab={breakdownTab}
          setBreakdownTab={setBreakdownTab}
          totalActualToDate={totalActualToDate}
          totalSpend={totalSpend}
          currentDayOfMonth={currentDayOfMonth}
          daysInCurrentMonth={daysInCurrentMonth}
          totalRemaining={totalRemaining}
          actualIncomeToDate={actualIncomeToDate}
          projectedIncome={projectedIncome}
          remainingIncome={remainingIncome}
          sortedProjectionsCount={sortedProjections.length}
          comparisonMonth={comparisonMonth}
          totalComparisonIncome={totalComparisonIncome}
          totalComparisonSpend={totalComparisonSpend}
          totalRecurring={totalRecurring}
          totalVariable={totalVariable}
          incomeStreams={incomeStreams}
          incomeProjectionBasis={incomeProjection.basis}
          incomeStreamProjectionsCount={incomeStreamProjections.length}
          priorYearMonth={priorYearMonth}
          projectedNet={projectedNet}
          onManageStreams={() => {
            onClose();
            navigate('/forecast');
          }}
        />

        {/* Breakdown Mode Toggle & Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25, flexShrink: 0, flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <ToggleButtonGroup
              value={breakdownTab}
              exclusive
              onChange={(_, v) => v && setBreakdownTab(v)}
              size="small"
              fullWidth
              sx={{
                width: { xs: '100%', sm: 'auto' },
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  height: 32,
                  px: 1.5,
                  flex: { xs: 1, sm: 'initial' },
                },
              }}
            >
              <ToggleButton value="spend">
                Spending Breakdown ({sortedProjections.length})
              </ToggleButton>
              <ToggleButton value="income" sx={{ color: breakdownTab === 'income' ? 'success.main' : undefined }}>
                Income Breakdown ({incomeStreamProjections.length})
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {breakdownTab === 'income'
              ? `${incomeStreamProjections.length} projected income ${incomeStreamProjections.length === 1 ? 'source' : 'sources'}`
              : `${sortedProjections.length} spending categories`}
          </Typography>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            flex: { xs: '0 0 auto', md: 1 },
            minHeight: { xs: 'auto', md: 0 },
            display: 'flex',
            flexDirection: 'column',
            overflow: { xs: 'visible', md: 'hidden' },
            borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          }}
        >
          {breakdownTab === 'income' ? (
            <IncomeBreakdownTable
              incomeStreamProjections={incomeStreamProjections}
              comparisonMonth={comparisonMonth}
              isCurrentMonth={isCurrentMonth}
              priorYearMonth={priorYearMonth}
              projectedIncome={projectedIncome}
              totalComparisonIncome={totalComparisonIncome}
              incomeSparklinePoints={incomeSparklinePoints}
            />
          ) : (
            <SpendBreakdownTable
              sortedProjections={sortedProjections}
              comparisonMonth={comparisonMonth}
              isCurrentMonth={isCurrentMonth}
              priorYearMonth={priorYearMonth}
              monthKey={monthKey}
              categoryColor={categoryColor}
              categorySparklineData={categorySparklineData}
              priorYearMerchantsByCategory={priorYearMerchantsByCategory}
              comparisonMerchantsByCategory={comparisonMerchantsByCategory}
              comparisonSpendByCategory={comparisonSpendByCategory}
              recurringMerchantsByCategory={recurringMerchantsByCategory}
              recurrenceMap={recurrenceMap}
            />
          )}
        </Paper>
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, flexShrink: 0, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={{ xs: 1, sm: 1.5 }} flexWrap="wrap">
          <Button
            variant="text"
            size="small"
            onClick={() => {
              onClose();
              navigate('/budget');
            }}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: { xs: '0.78rem', sm: '0.85rem' }, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
          >
            Manage Budgets →
          </Button>
          <Button
            variant="text"
            size="small"
            color="success"
            onClick={() => {
              onClose();
              navigate('/forecast');
            }}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: { xs: '0.78rem', sm: '0.85rem' }, borderRadius: (theme) => `${theme.shape.borderRadius}px` }}
          >
            Manage Income Streams →
          </Button>
        </Stack>
        <Button
          variant="contained"
          size="small"
          onClick={onClose}
          sx={{ textTransform: 'none', px: 2.5, height: 36, fontWeight: 600, borderRadius: (theme) => `${theme.shape.borderRadius}px`, ml: 'auto' }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

