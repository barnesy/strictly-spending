import { useMemo, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccounts,
  useCategories,
  useMerchantOverrides,
  useBudgets,
  useCategoryTrailingAverages,
  useConsolidatedRecurringMerchants,
  useLastMonthActualSpend,
  useTransactionCount,
} from '../hooks/queries';
import { useSpendingForecast } from '../hooks/useSpendingForecast';
import {
  consolidateRecurringMerchants,
  formatCleanMerchantName,
  getMerchantBillStatus,
  type CategoryProjection,
} from '../domain/forecastSpending';
import {
  getAccountSavingsTransferOut,
  getOperatingCashAccounts,
  buildUpdatedDestinationsForAccountTransfer,
  computeScopedAccountIncome,
} from '../domain/accountCashflow';
import { useForecastStore } from '../stores/forecastStore';
import { usePutBudget, useBulkPutBudgets, useClearBudgets } from '../hooks/mutations';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Button,
  Chip,
  Switch,
  Tooltip,
  Alert,
  Collapse,
  IconButton,
  TextField,
  InputAdornment,
  LinearProgress,
  Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SavingsIcon from '@mui/icons-material/Savings';

import { usd, usdCents, monthLabel } from '../lib';
import { type ConsolidatedMerchant } from '../domain/budgets';
import { useBudgetStore } from '../stores/budgetStore';
import PageLoader from '../components/PageLoader';
import { FinancialInsightsCard } from '../components/FinancialInsightsCard';
import {
  AccountFilterDropdown,
  useScopedCheckingAccounts,
  UNIFORM_TOOLBAR_BUTTON_SX,
} from '../components/AccountFilterDropdown';
import { Link as RouterLink } from 'react-router-dom';
import { seedDemoData } from '../demoData';
import { useFilters } from '../stores/store';
import { queryClient } from '../queryClient';
import type { Budget as BudgetType, Category, RecurrenceInfo } from '../types';
import { useDeferredRender } from '../hooks/useDeferredRender';

export default function Budget() {
  const { data: accounts = [] } = useAccounts();
  const incomeStreams = useForecastStore((s) => s.incomeStreams);
  const checkingAccounts = useMemo(
    () => getOperatingCashAccounts(accounts, incomeStreams),
    [accounts, incomeStreams]
  );

  const {
    selectedAccountIds,
    setSelectedAccountIds,
    isAllSelected,
    selectedAccounts,
    selectedAccount,
    scopedAccountIdsParam,
    scopeLabel,
  } = useScopedCheckingAccounts(checkingAccounts);

  const { data: categories = [], isLoading: isCatLoading } = useCategories();
  const { data: overrides = [], isLoading: isOverridesLoading } = useMerchantOverrides();
  const { data: budgets = [], isLoading: isBudgetsLoading } = useBudgets();
  const { data: trailingAverages = [], isLoading: isTrailingLoading } = useCategoryTrailingAverages(scopedAccountIdsParam);
  const { data: rawConsolidatedMerchants = [], isLoading: isConsolidatedLoading } = useConsolidatedRecurringMerchants(scopedAccountIdsParam);
  const { data: lastMonth = 0, isLoading: isLastMonthLoading } = useLastMonthActualSpend(scopedAccountIdsParam);
  const { data: dbTxnCount = 0, isLoading: isCountLoading } = useTransactionCount();

  const {
    recurrenceMap,
    currentCalMonth,
    currentMonthProjections,
    currentMonthIncomeProjections,
    currentMonthForecastSummary,
    monthlyBaselineIncome,
  } = useSpendingForecast({
    categories,
    budgets,
    accountId: scopedAccountIdsParam ?? null,
  });

  const destinations = useForecastStore((s) => s.destinations);
  const setDestinations = useForecastStore((s) => s.setDestinations);
  const forecastTaxRate = useForecastStore((s) => s.taxRate);
  const useExactPaycheckCalendar = useForecastStore((s) => s.useExactPaycheckCalendar);

  const consolidatedMerchants = useMemo(
    () => consolidateRecurringMerchants(rawConsolidatedMerchants, recurrenceMap),
    [rawConsolidatedMerchants, recurrenceMap]
  );

  const isDataLoading = isCatLoading || isOverridesLoading || isBudgetsLoading || isTrailingLoading || isConsolidatedLoading || isLastMonthLoading || isCountLoading;

  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);
  const toggleMerchant = useBudgetStore((s) => s.toggleMerchant);
  const toggleBudgetCategory = useBudgetStore((s) => s.toggleBudgetCategory);
  const reset = useBudgetStore((s) => s.reset);

  const spendCategories = useMemo(
    () => (categories || []).filter((c) => c.type === 'spend'),
    [categories]
  );

  const trailingAvgByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of trailingAverages) {
      map.set(item.category, item.average);
    }
    return map;
  }, [trailingAverages]);

  const bulkPutBudgets = useBulkPutBudgets();

  // Auto-seed budgets for any spend category with no budget row yet (only when viewing all accounts).
  useEffect(() => {
    if (!budgets || !categories || isDataLoading || !isAllSelected) return;
    const existing = new Set(budgets.map((b) => b.category));
    const toAdd: BudgetType[] = [];
    for (const cat of spendCategories) {
      if (existing.has(cat.name)) continue;
      const avg = trailingAvgByCategory.get(cat.name) || 0;
      toAdd.push({
        category: cat.name,
        monthlyAmount: Math.round(avg * 100) / 100,
        userSet: false,
      });
    }
    if (toAdd.length > 0) {
      bulkPutBudgets.mutate(toAdd);
    }
  }, [budgets, categories, spendCategories, trailingAvgByCategory, isDataLoading, bulkPutBudgets, isAllSelected]);

  const isLoading = isDataLoading || !categories || !overrides || !budgets;
  const recurringCategoryNames = useMemo(() => new Set(
    spendCategories.filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
  ), [spendCategories]);


  const merchantsByCategory = useMemo(() => {
    const map = new Map<string, ConsolidatedMerchant[]>();
    for (const m of consolidatedMerchants) {
      const arr = map.get(m.category) || [];
      arr.push(m);
      map.set(m.category, arr);
    }
    return map;
  }, [consolidatedMerchants]);

  const recurringCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const [cat, arr] of merchantsByCategory) {
      const total = arr.filter((m) => !excludedMerchants.has(m.merchantKey)).reduce((s, m) => s + m.monthlyAverage, 0);
      map.set(cat, total);
    }
    return map;
  }, [merchantsByCategory, excludedMerchants]);

  // When a subset of bank accounts is selected, scope variable budgets to those accounts' trailing 3-month actuals
  const effectiveBudgets = useMemo(() => {
    if (isAllSelected) return budgets || [];
    return (budgets || []).map((b) => ({
      ...b,
      monthlyAmount: Math.round((trailingAvgByCategory.get(b.category) || 0) * 100) / 100,
    }));
  }, [budgets, isAllSelected, trailingAvgByCategory]);

  const shouldRender = useDeferredRender();

  if (isLoading || !shouldRender) {
    return <PageLoader isLoading={true}><Box /></PageLoader>;
  }

  if (dbTxnCount === 0) {
    return (
      <PageLoader isLoading={isLoading}>
        <Stack spacing={2.5} alignItems="flex-start">
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Budget</Typography>
          <Alert severity="info" sx={{ width: '100%' }}>
            No transactions yet. Import a CSV from your bank or explore the app immediately with sample household data.
          </Alert>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button component={RouterLink} to="/import" variant="contained" sx={UNIFORM_TOOLBAR_BUTTON_SX}>
              Import CSVs
            </Button>
            <Button
              variant="outlined"
              onClick={async () => {
                await seedDemoData();
                useFilters.getState().setDemoMode(true);
                await queryClient.invalidateQueries();
                window.dispatchEvent(new Event('db-update'));
              }}
              sx={UNIFORM_TOOLBAR_BUTTON_SX}
            >
              Explore Sample Household Data
            </Button>
          </Stack>
        </Stack>
      </PageLoader>
    );
  }

  const recurringBudgets = effectiveBudgets.filter((b) => recurringCategoryNames.has(b.category));
  const oneTimeBudgets = effectiveBudgets.filter((b) => !recurringCategoryNames.has(b.category));

  const recurringProjected = Array.from(recurringCategoryNames)
    .filter((cat) => !excludedBudgetCategories.has(cat))
    .reduce((s, cat) => s + (recurringCategoryTotals.get(cat) || 0), 0);
  const budgetProjected = oneTimeBudgets
    .filter((b) => !excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const projected = recurringProjected + budgetProjected;

  // Actuals totals (this month to date & 3-month trailing actuals) for Recurring and Variable
  const actualRecurringCategoryThisMonth = Array.from(recurringCategoryNames)
    .filter((cat) => !excludedBudgetCategories.has(cat))
    .reduce((s, cat) => s + (currentMonthProjections.get(cat)?.actualToDate ?? 0), 0);
  const actualRecurringThisMonth = Math.max(
    actualRecurringCategoryThisMonth,
    currentMonthForecastSummary.paidRecurringSpend
  );
  const trailingRecurringAvg = Array.from(recurringCategoryNames)
    .filter((cat) => !excludedBudgetCategories.has(cat))
    .reduce((s, cat) => s + (trailingAvgByCategory.get(cat) || 0), 0);

  const actualVariableCategoryThisMonth = oneTimeBudgets
    .filter((b) => !excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + (currentMonthProjections.get(b.category)?.actualToDate ?? 0), 0);
  const trailingVariableAvg = oneTimeBudgets
    .filter((b) => !excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + (trailingAvgByCategory.get(b.category) || 0), 0);

  const recurringExcludedSavings = consolidatedMerchants
    .filter((m) => excludedMerchants.has(m.merchantKey) && !excludedBudgetCategories.has(m.category))
    .reduce((s, m) => s + m.monthlyAverage, 0);
  const budgetExcludedSavings = oneTimeBudgets
    .filter((b) => excludedBudgetCategories.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);
  const savings = recurringExcludedSavings + budgetExcludedSavings;

  const totalExclusions = excludedBudgetCategories.size + excludedMerchants.size;

  // Per-account income & savings transfer out calculations
  const scopedIncomeInfo = computeScopedAccountIncome(
    incomeStreams,
    forecastTaxRate,
    scopedAccountIdsParam ?? null,
    useExactPaycheckCalendar
  );
  const expectedMonthlyIncome = Math.max(
    scopedIncomeInfo.effectiveMonthlyInflow || 0,
    monthlyBaselineIncome || 0,
    currentMonthForecastSummary.projectedIncome || 0
  );
  const baseCalendarMonthlyIncome =
    scopedIncomeInfo.baseCalendarNetMonthly > 0
      ? scopedIncomeInfo.baseCalendarNetMonthly
      : expectedMonthlyIncome;

  const { totalTransferOut: savingsTransferOut } = getAccountSavingsTransferOut(
    destinations,
    isAllSelected ? null : selectedAccounts
  );

  const actualVariableThisMonth =
    actualVariableCategoryThisMonth > 0
      ? actualVariableCategoryThisMonth
      : Math.max(
          0,
          currentMonthForecastSummary.actualSpend - currentMonthForecastSummary.paidRecurringSpend
        );

  // Monthly Cash Remainder (Δ Bank Balance) = Inflow - Fixed Bills - Savings Out - Variable Spend
  const monthlyAccountCashRemainder = baseCalendarMonthlyIncome - recurringProjected - savingsTransferOut - budgetProjected;
  const thisMonthAccountCashRemainder = expectedMonthlyIncome - currentMonthForecastSummary.projectedSpend - savingsTransferOut;
  const actualCashRemainderThisMonth =
    baseCalendarMonthlyIncome - actualRecurringThisMonth - savingsTransferOut - actualVariableThisMonth;
  const trailingActualCashRemainder =
    baseCalendarMonthlyIncome -
    (trailingRecurringAvg > 0 ? trailingRecurringAvg : recurringProjected) -
    savingsTransferOut -
    trailingVariableAvg;

  const currentAccountBalance = isAllSelected
    ? checkingAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0)
    : selectedAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);
  const projectedEndOfMonthBalance = currentAccountBalance + thisMonthAccountCashRemainder;
  const projected6MoBalance = currentAccountBalance + thisMonthAccountCashRemainder + monthlyAccountCashRemainder * 5;

  const nextPayday = currentMonthIncomeProjections
    .map((p) => p.nextExpectedDay)
    .filter((d): d is number => typeof d === 'number')
    .sort((a, b) => a - b)[0];

  const recurringPctOfIncome =
    expectedMonthlyIncome > 0 ? Math.min(100, (recurringProjected / expectedMonthlyIncome) * 100) : 0;
  const variablePctOfIncome =
    expectedMonthlyIncome > 0
      ? Math.min(Math.max(0, 100 - recurringPctOfIncome), (budgetProjected / expectedMonthlyIncome) * 100)
      : 0;
  const savingsTransferPctOfIncome =
    expectedMonthlyIncome > 0 && savingsTransferOut > 0
      ? Math.min(
          Math.max(0, 100 - recurringPctOfIncome - variablePctOfIncome),
          (savingsTransferOut / expectedMonthlyIncome) * 100
        )
      : 0;
  const surplusPctOfIncome = Math.max(
    0,
    100 - recurringPctOfIncome - variablePctOfIncome - savingsTransferPctOfIncome
  );

  return (
    <PageLoader isLoading={isLoading}>
      <Stack spacing={{ xs: 2, sm: 3 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          spacing={1.25}
        >
          <Typography variant="h5" sx={{ display: { xs: 'none', md: 'block' }, fontSize: '1.5rem', fontWeight: 700 }}>
            Budget &amp; Monthly Pace
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {totalExclusions > 0 && (
              <Button
                onClick={reset}
                size="small"
                variant="outlined"
                startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                Reset toggles
              </Button>
            )}

            <AccountFilterDropdown
              checkingAccounts={checkingAccounts}
              selectedAccountIds={selectedAccountIds}
              isAllSelected={isAllSelected}
              onChangeSelectedIds={setSelectedAccountIds}
            />
          </Stack>
        </Stack>

        {/* Single-Account Cashflow & Safe-to-Spend Predictor Card */}
        <Paper
          sx={{
            p: { xs: 1.75, sm: 2.5 },
            border: '1px solid',
            borderColor: actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main',
            bgcolor: (t) =>
              alpha(
                actualCashRemainderThisMonth >= 0 ? t.palette.success.main : t.palette.error.main,
                t.palette.mode === 'dark' ? 0.06 : 0.03
              ),
          }}
        >
          <Stack spacing={{ xs: 1.5, sm: 2 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
              spacing={1}
            >
              <Box sx={{ width: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', sm: 'flex-start' }} flexWrap="wrap" useFlexGap>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1rem' } }}>
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                      {!isAllSelected ? `🏦 ${scopeLabel}` : '🏦 Monthly Cashflow'}
                    </Box>
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                      {!isAllSelected
                        ? `🏦 ${scopeLabel} — Actual Cashflow & Spend vs. Plan`
                        : '🏦 All Checking Accounts — Actual Cashflow & Spend vs. Plan'}
                    </Box>
                  </Typography>
                  <Chip
                    size="small"
                    icon={
                      actualCashRemainderThisMonth >= 0 ? (
                        <TrendingUpIcon fontSize="small" />
                      ) : (
                        <TrendingDownIcon fontSize="small" />
                      )
                    }
                    label={
                      actualCashRemainderThisMonth >= 0
                        ? `Actual +${usd.format(actualCashRemainderThisMonth)}`
                        : `Actual ${usd.format(actualCashRemainderThisMonth)}`
                    }
                    color={actualCashRemainderThisMonth >= 0 ? 'success' : 'error'}
                    sx={{ fontWeight: 700, height: 24 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.25 }}>
                  {!isAllSelected
                    ? `Isolates paychecks (${scopedIncomeInfo.scopedStreams.map((s) => `${s.name} · ${s.frequency === 'semimonthly' ? 'Semi-Monthly 15th & EOM' : s.frequency === 'biweekly' ? 'Bi-Weekly' : s.frequency}`).join(', ') || 'No active stream'}), actual recurring bills, actual variable spend, and savings moved out of ${selectedAccount ? 'this bank account' : 'these selected accounts'}.`
                    : 'Use the Accounts dropdown above to toggle specific bank accounts on/off and compare actual spend and cash remainder against your plan.'}
                </Typography>
              </Box>

              {selectedAccount && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <SavingsIcon fontSize="small" color="secondary" />
                  <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Savings Moved Out:
                  </Typography>
                  <BudgetAmountInput
                    category={`savings-out-${selectedAccount.id}`}
                    initialAmount={savingsTransferOut}
                    onSave={async (newAmt) => {
                      const updated = buildUpdatedDestinationsForAccountTransfer(
                        destinations,
                        selectedAccount,
                        newAmt
                      );
                      setDestinations(updated);
                    }}
                  />
                </Stack>
              )}
            </Stack>

            {/* 5-Column Cashflow Equation Grid (Actuals Featured Prominently, Forecast/Plan Secondary) */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
                gap: { xs: 1, sm: 1.25 },
              }}
            >
              {/* 1. Inflow */}
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  Account Inflow
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                  +{usd.format(baseCalendarMonthlyIncome)}
                  <Typography component="span" variant="caption" color="text.secondary">/mo</Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  Received: <strong>{usd.format(currentMonthForecastSummary.actualIncome)}</strong>
                  {expectedMonthlyIncome > baseCalendarMonthlyIncome ? ` · Proj +${usd.format(expectedMonthlyIncome)}` : ''}
                </Typography>
              </Box>

              {/* 2. Recurring & Savings (Actual Featured) */}
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  Recurring &amp; Savings (Actual)
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                  -{usd.format(actualRecurringThisMonth + savingsTransferOut)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  Bills: <strong>{usd.format(actualRecurringThisMonth)}</strong>
                  {savingsTransferOut > 0 ? ` + Save ${usd.format(savingsTransferOut)}` : ''}
                  {' · '}Plan: -{usd.format(recurringProjected + savingsTransferOut)}/mo
                </Typography>
              </Box>

              {/* 3. Variable Spend (Actual Featured) */}
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                  border: '1.5px solid',
                  borderColor: 'primary.main',
                  minWidth: 0,
                }}
              >
                <Typography variant="caption" color="primary.main" sx={{ fontWeight: 700, display: 'block', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  Variable Spend (Actual)
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
                  {usd.format(actualVariableThisMonth)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  3m avg: <strong>{usd.format(trailingVariableAvg)}</strong> · Plan: {usd.format(budgetProjected)}/mo
                </Typography>
              </Box>

              {/* 4. Cash Remainder (Actual Featured) */}
              <Box
                sx={{
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                  border: '1.5px solid',
                  borderColor: actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main',
                  minWidth: 0,
                }}
              >
                <Typography
                  variant="caption"
                  color={actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontWeight: 700, display: 'block', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
                >
                  Cash Remainder (Actual)
                </Typography>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: { xs: '1.05rem', sm: '1.25rem' },
                  }}
                >
                  {actualCashRemainderThisMonth >= 0 ? '+' : ''}
                  {usd.format(actualCashRemainderThisMonth)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  3m avg: <strong>{trailingActualCashRemainder >= 0 ? '+' : ''}{usd.format(trailingActualCashRemainder)}</strong>
                  {' · '}Plan: {monthlyAccountCashRemainder >= 0 ? '+' : ''}{usd.format(monthlyAccountCashRemainder)}/mo
                </Typography>
              </Box>

              {/* 5. Account Balance Trajectory */}
              <Box
                sx={{
                  gridColumn: { xs: '1 / -1', sm: 'span 2', md: 'auto' },
                  p: { xs: 1, sm: 1.25 },
                  borderRadius: 1.5,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: { xs: 'row', md: 'column' },
                  justifyContent: 'space-between',
                  alignItems: { xs: 'center', md: 'flex-start' },
                  gap: 0.5,
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                    Current Cash Balance
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.92rem', sm: '1rem' } }}>
                    {usd.format(currentAccountBalance)}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.68rem', textAlign: { xs: 'right', md: 'left' } }}>
                  Proj EOM: {usd.format(projectedEndOfMonthBalance)} · 6m: {usd.format(projected6MoBalance)}
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 1.75, sm: 3 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 1.5, md: 4 }}
            alignItems={{ xs: 'stretch', md: 'baseline' }}
            flexWrap="wrap"
            useFlexGap
          >
            <Box>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, fontSize: { xs: '0.68rem', sm: '0.75rem' }, fontWeight: 700 }}>
                  {monthLabel(currentCalMonth)} Actual Spend
                </Typography>
                <Chip
                  size="small"
                  label={`Day ${currentMonthForecastSummary.dayOfMonth}/${currentMonthForecastSummary.daysInMonth}`}
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                />
              </Stack>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: { xs: '1.65rem', sm: '2.5rem', md: '3rem' },
                  lineHeight: 1.15,
                  my: 0.25,
                }}
              >
                {usd.format(actualRecurringThisMonth + actualVariableThisMonth)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
                Recurring <strong>{usd.format(actualRecurringThisMonth)}</strong> + Variable{' '}
                <strong>{usd.format(actualVariableThisMonth)}</strong> · Last mo: <strong>{usd.format(lastMonth)}</strong> · Target Budget: {usd.format(projected)}/mo
              </Typography>
            </Box>

            <Box
              sx={{
                display: { xs: 'grid', md: 'contents' },
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1.5,
                pt: { xs: 1.25, md: 0 },
                borderTop: { xs: '1px solid', md: 'none' },
                borderColor: 'divider',
              }}
            >
              {expectedMonthlyIncome > 0 && (
                <Box sx={{ minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.3, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                      Income Received
                    </Typography>
                    {nextPayday && currentMonthForecastSummary.remainingIncome > 0 && (
                      <Chip
                        size="small"
                        label={`⏳ ~Day ${nextPayday}`}
                        color="success"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      color: 'success.main',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: { xs: '1.25rem', sm: '1.85rem', md: '2.125rem' },
                      lineHeight: 1.2,
                      my: 0.25,
                    }}
                  >
                    +{usd.format(currentMonthForecastSummary.actualIncome)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                    Expected: +{usd.format(expectedMonthlyIncome)}/mo
                    {currentMonthForecastSummary.remainingIncome > 0 && (
                      <>
                        {' · '}Left: +{usd.format(currentMonthForecastSummary.remainingIncome)}
                      </>
                    )}
                  </Typography>
                </Box>
              )}

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                  3-Mo Avg Actual
                </Typography>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'text.primary',
                    fontSize: { xs: '1.25rem', sm: '1.85rem', md: '2.125rem' },
                    lineHeight: 1.2,
                    my: 0.25,
                  }}
                >
                  {usd.format((trailingRecurringAvg > 0 ? trailingRecurringAvg : recurringProjected) + trailingVariableAvg)}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
                    /mo
                  </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                  Target: {usd.format(projected)}/mo · Proj EOM: {usd.format(currentMonthForecastSummary.projectedSpend)}
                  {currentMonthForecastSummary.unpaidRecurringSpend > 0 && (
                    <Box component="span" sx={{ color: 'warning.main', fontWeight: 600, display: 'block', mt: 0.2 }}>
                      ⏳ {usd.format(currentMonthForecastSummary.unpaidRecurringSpend)} bills due
                    </Box>
                  )}
                </Typography>
              </Box>

              {expectedMonthlyIncome > 0 && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Actual Cash Remainder
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main',
                      fontSize: { xs: '1.25rem', sm: '1.85rem', md: '2.125rem' },
                      lineHeight: 1.2,
                      my: 0.25,
                    }}
                  >
                    {actualCashRemainderThisMonth >= 0 ? '+' : ''}
                    {usd.format(actualCashRemainderThisMonth)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                    3m avg:{' '}
                    <strong>
                      {trailingActualCashRemainder >= 0 ? '+' : ''}
                      {usd.format(trailingActualCashRemainder)}
                    </strong>
                    {' · '}Plan: {monthlyAccountCashRemainder >= 0 ? '+' : ''}
                    {usd.format(monthlyAccountCashRemainder)}/mo
                  </Typography>
                </Box>
              )}

              {savings > 0 && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="success.main" sx={{ display: 'block', lineHeight: 1.3, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                    Cuts save
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      color: 'success.main',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: { xs: '1.25rem', sm: '1.85rem', md: '2.125rem' },
                      lineHeight: 1.2,
                      my: 0.25,
                    }}
                  >
                    {usd.format(savings)}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                      sx={{ ml: 0.25 }}
                    >
                      /mo
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                    ≈ {usd.format(savings * 12)} / year
                  </Typography>
                </Box>
              )}
            </Box>

            <Box sx={{ ml: { md: 'auto' }, textAlign: { xs: 'left', md: 'right' }, pt: { xs: 0.5, md: 0 } }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="div"
              >
                {recurringBudgets.length} recurring categor{recurringBudgets.length === 1 ? 'y' : 'ies'}
                {' · '}{oneTimeBudgets.length} variable categor{oneTimeBudgets.length === 1 ? 'y' : 'ies'}
                {totalExclusions > 0 ? ` · ${totalExclusions} excluded` : ''}
              </Typography>
            </Box>
          </Stack>

          {expectedMonthlyIncome > 0 && (
            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                spacing={0.75}
                sx={{ mb: 1 }}
                flexWrap="wrap"
                useFlexGap
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  ACTUALS VS. PLAN ({usd.format(baseCalendarMonthlyIncome)}/mo Inflow)
                </Typography>
                <Stack direction="row" spacing={{ xs: 1.25, sm: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary">
                      Recurring: <strong>{usd.format(actualRecurringThisMonth)}</strong> (Plan {usd.format(recurringProjected)})
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary">
                      Variable: <strong>{usd.format(actualVariableThisMonth)}</strong> (Plan {usd.format(budgetProjected)})
                    </Typography>
                  </Stack>
                  {savingsTransferOut > 0 && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#9c27b0', flexShrink: 0 }} />
                      <Typography variant="caption" color="text.secondary">
                        Savings Out: <strong>{usd.format(savingsTransferOut)}</strong>
                      </Typography>
                    </Stack>
                  )}
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: actualCashRemainderThisMonth >= 0 ? 'success.main' : 'error.main',
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Cash Remainder:{' '}
                      <strong style={{ color: actualCashRemainderThisMonth >= 0 ? '#2e7d32' : '#d32f2f' }}>
                        {actualCashRemainderThisMonth >= 0 ? '+' : ''}
                        {usd.format(actualCashRemainderThisMonth)}
                      </strong>
                      {' '}(Plan {monthlyAccountCashRemainder >= 0 ? '+' : ''}{usd.format(monthlyAccountCashRemainder)})
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
              <Box
                sx={{
                  display: 'flex',
                  height: 8,
                  width: '100%',
                  borderRadius: 4,
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                }}
              >
                <Tooltip title={`Recurring Actual: ${usd.format(actualRecurringThisMonth)} (Plan: ${usd.format(recurringProjected)})`}>
                  <Box sx={{ width: `${recurringPctOfIncome}%`, bgcolor: 'primary.main', transition: 'width 0.25s ease' }} />
                </Tooltip>
                <Tooltip title={`Variable Actual: ${usd.format(actualVariableThisMonth)} (3m avg: ${usd.format(trailingVariableAvg)} · Plan: ${usd.format(budgetProjected)})`}>
                  <Box sx={{ width: `${variablePctOfIncome}%`, bgcolor: 'warning.main', transition: 'width 0.25s ease' }} />
                </Tooltip>
                {savingsTransferPctOfIncome > 0 && (
                  <Tooltip title={`Savings Transfers Out: ${usd.format(savingsTransferOut)} (${Math.round(savingsTransferPctOfIncome)}%)`}>
                    <Box sx={{ width: `${savingsTransferPctOfIncome}%`, bgcolor: '#9c27b0', transition: 'width 0.25s ease' }} />
                  </Tooltip>
                )}
                <Tooltip
                  title={`Actual Cash Remainder: ${actualCashRemainderThisMonth >= 0 ? '+' : ''}${usd.format(actualCashRemainderThisMonth)} (3m avg: ${trailingActualCashRemainder >= 0 ? '+' : ''}${usd.format(trailingActualCashRemainder)} · Plan: ${monthlyAccountCashRemainder >= 0 ? '+' : ''}${usd.format(monthlyAccountCashRemainder)})`}
                >
                  <Box
                    sx={{
                      width: `${surplusPctOfIncome}%`,
                      bgcolor: 'success.main',
                      opacity: 0.75,
                      transition: 'width 0.25s ease',
                    }}
                  />
                </Tooltip>
              </Box>
            </Box>
          )}
        </Paper>

        <FinancialInsightsCard />

        <RecurringBudgetCard
          categories={spendCategories}
          recurringCategoryNames={recurringCategoryNames}
          merchantsByCategory={merchantsByCategory}
          categoryTotals={recurringCategoryTotals}
          trailingAvgByCategory={trailingAvgByCategory}
          currentMonthProjections={currentMonthProjections}
          actualRecurringTotal={actualRecurringThisMonth}
          excludedCategories={excludedBudgetCategories}
          excludedMerchants={excludedMerchants}
          currentCalMonth={currentCalMonth}
          recurrenceMap={recurrenceMap}
          onToggleCategory={toggleBudgetCategory}
          onToggleMerchant={toggleMerchant}
        />
        <BudgetCard
          title="Variable Spend / One-Time"
          subtitle="Set what you want to spend per category next month. Initial values auto-seeded from your trailing 3-month actuals."
          emptyMessage="No one-time spend in the last 90 days."
          budgets={oneTimeBudgets}
          categories={spendCategories}
          trailingAvgByCategory={trailingAvgByCategory}
          currentMonthProjections={currentMonthProjections}
          excluded={excludedBudgetCategories}
          onToggle={toggleBudgetCategory}
        />
      </Stack>
    </PageLoader>
  );
}

// ----- Budget amount editor with local state (new) -----

function BudgetAmountInput({
  initialAmount,
  disabled,
  onSave,
}: {
  category: string;
  initialAmount: number;
  disabled?: boolean;
  onSave: (amount: number) => Promise<void>;
}) {
  const [value, setValue] = useState(() => initialAmount.toFixed(2));

  useEffect(() => {
    setValue(initialAmount.toFixed(2));
  }, [initialAmount]);

  const handleSave = async (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const amount = Number(cleaned) || 0;
    setValue(amount.toFixed(2));
    if (Math.abs(amount - initialAmount) > 0.001) {
      await onSave(amount);
    }
  };

  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => handleSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleSave(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      sx={{ width: { xs: 150, sm: 165 } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">$</InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">/mo</InputAdornment>
          ),
          inputMode: 'decimal',
        },
      }}
      disabled={disabled}
    />
  );
}

// ----- Budget card (new) -----

function BudgetCard({
  title,
  subtitle,
  emptyMessage,
  budgets,
  categories,
  trailingAvgByCategory,
  currentMonthProjections,
  excluded,
  onToggle,
}: {
  title: string;
  subtitle: string;
  emptyMessage: string;
  budgets: BudgetType[];
  categories: Category[];
  trailingAvgByCategory: Map<string, number>;
  currentMonthProjections: Map<string, CategoryProjection>;
  excluded: Set<string>;
  onToggle: (category: string) => void;
}) {
  const queryClient = useQueryClient();
  const putBudget = usePutBudget();
  const clearBudgets = useClearBudgets();
  const bulkPutBudgets = useBulkPutBudgets();

  const subtotal = budgets
    .filter((b) => !excluded.has(b.category))
    .reduce((s, b) => s + b.monthlyAmount, 0);

  const actualThisMonthSubtotal = budgets
    .filter((b) => !excluded.has(b.category))
    .reduce((s, b) => s + (currentMonthProjections.get(b.category)?.actualToDate ?? 0), 0);

  const trailingAvgSubtotal = budgets
    .filter((b) => !excluded.has(b.category))
    .reduce((s, b) => s + (trailingAvgByCategory.get(b.category) || 0), 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  const sorted = useMemo(
    () => budgets.slice().sort((a, b) => b.monthlyAmount - a.monthlyAmount),
    [budgets]
  );

  const handleSaveBudget = async (category: string, amount: number) => {
    // 1. Optimistic update
    queryClient.setQueryData<BudgetType[]>(['budgets'], (old = []) => {
      const idx = old.findIndex((b) => b.category === category);
      if (idx >= 0) {
        const next = [...old];
        next[idx] = { ...next[idx], monthlyAmount: amount, userSet: true };
        return next;
      }
      return [...old, { category, monthlyAmount: amount, userSet: true }];
    });
    // 2. Persist to DB & invalidate
    await putBudget.mutateAsync({ category, monthlyAmount: amount, userSet: true });
  };

  const onResetRow = async (category: string) => {
    const avg = trailingAvgByCategory.get(category) || 0;
    const amount = Math.round(avg * 100) / 100;
    queryClient.setQueryData<BudgetType[]>(['budgets'], (old = []) => {
      if (!old) return [];
      return old.map((b) => (b.category === category ? { ...b, monthlyAmount: amount, userSet: false } : b));
    });
    await putBudget.mutateAsync({
      category,
      monthlyAmount: amount,
      userSet: false,
    });
  };

  const onResetAll = async () => {
    if (!confirm('Reset all budgets to your trailing 3-month actuals?')) return;
    const next: BudgetType[] = budgets.map((b) => ({
      category: b.category,
      monthlyAmount:
        Math.round((trailingAvgByCategory.get(b.category) || 0) * 100) / 100,
      userSet: false,
    }));
    await clearBudgets.mutateAsync();
    if (next.length > 0) {
      await bulkPutBudgets.mutateAsync(next);
    }
  };

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'baseline' }}
        spacing={{ xs: 1.25, sm: 2 }}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {subtitle}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2.5 }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
          sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}
        >
          <Box sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            <Button size="small" onClick={onResetAll} startIcon={<RestartAltIcon />} sx={{ textTransform: 'none', px: { xs: 0.5, sm: 1 } }}>
              Reset all to actuals
            </Button>
          </Box>
          <Stack
            direction="row"
            spacing={{ xs: 1, sm: 2.5 }}
            alignItems="baseline"
            justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              pt: { xs: 0.75, sm: 0 },
              borderTop: { xs: '1px solid', sm: 'none' },
              borderColor: 'divider',
            }}
          >
            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="overline" color="primary.main" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' }, fontWeight: 700 }}>
                This Mo Actual
              </Typography>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: { xs: '0.95rem', sm: '1.25rem' },
                  color: actualThisMonthSubtotal > subtotal && subtotal > 0 ? 'error.main' : 'primary.main',
                }}
              >
                {usd.format(actualThisMonthSubtotal)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'center', sm: 'right' } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' } }}>
                3-Mo Avg Actual
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.95rem', sm: '1.25rem' }, color: 'text.primary' }}>
                {usd.format(trailingAvgSubtotal)}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  /mo
                </Typography>
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' } }}>
                Target Budget
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.95rem', sm: '1.25rem' }, color: 'text.secondary' }}>
                {usd.format(subtotal)}
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 0.25, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
                >
                  /mo
                </Typography>
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Stack>

      {sorted.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          {emptyMessage}
        </Box>
      ) : (
        <Stack spacing={0} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          {sorted.map((b) => {
            const isExcluded = excluded.has(b.category);
            const avg = trailingAvgByCategory.get(b.category) || 0;
            const diff = b.monthlyAmount - avg;
            const diffPct = avg > 0 ? Math.abs(diff / avg) * 100 : 0;
            const color = categoryColor(b.category);
            const proj = currentMonthProjections.get(b.category);
            const actualThisMonth = proj?.actualToDate ?? 0;
            const projectedFinish = actualThisMonth + (proj?.remaining ?? 0);
            const isOverBudget = b.monthlyAmount > 0 && projectedFinish > b.monthlyAmount * 1.05;
            const progressPct = b.monthlyAmount > 0 ? Math.min(100, (actualThisMonth / b.monthlyAmount) * 100) : 0;

            return (
              <Box
                key={b.category}
                sx={{
                  py: { xs: 1.5, md: 1 },
                  px: { xs: 0.5, sm: 1 },
                  opacity: isExcluded ? 0.45 : 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={{ xs: 1.25, md: 2 }}
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  {/* Category Name + Mobile Right Controls */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1}
                    sx={{ width: { xs: '100%', md: 220 }, flexShrink: 0 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          textDecoration: isExcluded ? 'line-through' : 'none',
                          wordBreak: 'break-word',
                        }}
                      >
                        {b.category}
                      </Typography>
                      {b.userSet && (
                        <Typography
                          variant="caption"
                          color="primary.main"
                          sx={{ fontWeight: 600, flexShrink: 0 }}
                        >
                          edited
                        </Typography>
                      )}
                    </Stack>

                    {/* Mobile-only Reset + Switch in top row */}
                    <Stack
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                      sx={{ display: { xs: 'flex', md: 'none' }, flexShrink: 0 }}
                    >
                      {b.userSet && (
                        <Tooltip title="Reset to trailing avg">
                          <IconButton
                            size="small"
                            onClick={() => onResetRow(b.category)}
                          >
                            <RestartAltIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Switch
                        size="small"
                        checked={!isExcluded}
                        onChange={() => onToggle(b.category)}
                      />
                    </Stack>
                  </Stack>

                  {/* Budget Input + Mobile This-Month Summary */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    spacing={1.5}
                    sx={{ width: { xs: '100%', md: 175 }, flexShrink: 0 }}
                  >
                    <BudgetAmountInput
                      category={b.category}
                      initialAmount={b.monthlyAmount}
                      disabled={isExcluded}
                      onSave={(amount) => handleSaveBudget(b.category, amount)}
                    />

                    {/* Mobile-only This month + Projected finish beside the input */}
                    <Stack
                      direction="column"
                      alignItems="flex-end"
                      spacing={0.25}
                      sx={{ display: { xs: 'flex', md: 'none' } }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: actualThisMonth > b.monthlyAmount && b.monthlyAmount > 0 ? 'error.main' : 'primary.main',
                        }}
                      >
                        Actual: {usd.format(actualThisMonth)}
                      </Typography>
                      {projectedFinish > actualThisMonth + 0.5 && (
                        <Chip
                          size="small"
                          label={`Proj. ${usd.format(projectedFinish)}`}
                          color={isOverBudget ? 'warning' : 'default'}
                          variant={isOverBudget ? 'filled' : 'outlined'}
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                        />
                      )}
                    </Stack>
                  </Stack>

                  {/* Progress Bar & 3-Month Average */}
                  <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <Typography variant="caption" color="text.secondary">
                        3-mo avg: <strong style={{ color: 'inherit' }}>{usdCents.format(avg)}</strong>
                        {b.userSet && avg > 0 && (
                          <Box
                            component="span"
                            sx={{
                              ml: 0.75,
                              fontWeight: 600,
                              color: diff < 0 ? 'success.main' : 'warning.main',
                            }}
                          >
                            {diff < 0 ? '↓' : '↑'} {usdCents.format(Math.abs(diff))} ({diffPct.toFixed(0)}%)
                          </Box>
                        )}
                      </Typography>
                      {/* Desktop-only This month + Projected finish */}
                      <Stack
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ display: { xs: 'none', md: 'flex' } }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: actualThisMonth > b.monthlyAmount && b.monthlyAmount > 0 ? 'error.main' : 'primary.main',
                          }}
                        >
                          Actual: {usd.format(actualThisMonth)}
                        </Typography>
                        {projectedFinish > actualThisMonth + 0.5 && (
                          <Tooltip title={`Projected finish based on current spend + remaining variable/recurring (${usd.format(proj?.remaining || 0)} left)`}>
                            <Chip
                              size="small"
                              label={`Proj. ${usd.format(projectedFinish)}`}
                              color={isOverBudget ? 'warning' : 'default'}
                              variant={isOverBudget ? 'filled' : 'outlined'}
                              sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>
                    {b.monthlyAmount > 0 && !isExcluded && (
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        color={actualThisMonth > b.monthlyAmount ? 'error' : isOverBudget ? 'warning' : 'primary'}
                        sx={{ height: { xs: 6, md: 4 }, borderRadius: 3 }}
                      />
                    )}
                  </Stack>

                  {/* Desktop-only Reset + Switch */}
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="flex-end"
                    sx={{ display: { xs: 'none', md: 'flex' }, width: 96, flexShrink: 0 }}
                  >
                    <Box sx={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                      {b.userSet && (
                        <Tooltip title="Reset to trailing avg">
                          <IconButton
                            size="small"
                            onClick={() => onResetRow(b.category)}
                          >
                            <RestartAltIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    <Switch
                      size="small"
                      checked={!isExcluded}
                      onChange={() => onToggle(b.category)}
                    />
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}


// ----- Recurring Budget Card -----
function RecurringBudgetCard({
  categories,
  recurringCategoryNames,
  merchantsByCategory,
  categoryTotals,
  trailingAvgByCategory,
  currentMonthProjections,
  actualRecurringTotal,
  excludedCategories,
  excludedMerchants,
  currentCalMonth,
  recurrenceMap,
  onToggleCategory,
  onToggleMerchant,
}: {
  categories: Category[];
  recurringCategoryNames: Set<string>;
  merchantsByCategory: Map<string, ConsolidatedMerchant[]>;
  categoryTotals: Map<string, number>;
  trailingAvgByCategory: Map<string, number>;
  currentMonthProjections: Map<string, CategoryProjection>;
  actualRecurringTotal: number;
  excludedCategories: Set<string>;
  excludedMerchants: Set<string>;
  currentCalMonth: string;
  recurrenceMap: Map<string, RecurrenceInfo>;
  onToggleCategory: (category: string) => void;
  onToggleMerchant: (merchantKey: string) => void;
}) {
  const sortedCategories = useMemo(
    () =>
      Array.from(recurringCategoryNames).sort((a, b) => {
        return (categoryTotals.get(b) || 0) - (categoryTotals.get(a) || 0);
      }),
    [recurringCategoryNames, categoryTotals]
  );

  // Start with all recurring category drawers closed by default
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpand = (category: string) => {
    const next = new Set(expanded);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setExpanded(next);
  };

  const allExpanded = sortedCategories.length > 0 && sortedCategories.every((c) => expanded.has(c));

  const subtotal = sortedCategories
    .filter((cat) => !excludedCategories.has(cat))
    .reduce((s, cat) => s + (categoryTotals.get(cat) || 0), 0);

  const trailingRecurringSubtotal = sortedCategories
    .filter((cat) => !excludedCategories.has(cat))
    .reduce((s, cat) => s + (trailingAvgByCategory.get(cat) || 0), 0);

  const categoryColor = (name: string) =>
    categories.find((c) => c.name === name)?.color || '#bdbdbd';

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'baseline' }}
        spacing={{ xs: 1.25, sm: 2 }}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Recurring Categories &amp; Bill Countdown
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Consolidated recurring charges showing when each bill was last paid and a live countdown until its next expected charge.
          </Typography>
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2.5 }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
          sx={{ flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}
        >
          {sortedCategories.length > 0 && (
            <Box sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
              <Button
                size="small"
                onClick={() =>
                  setExpanded(allExpanded ? new Set() : new Set(sortedCategories))
                }
                sx={{ textTransform: 'none', px: { xs: 0.5, sm: 1 } }}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Button>
            </Box>
          )}
          <Stack
            direction="row"
            spacing={{ xs: 1, sm: 2.5 }}
            alignItems="baseline"
            justifyContent={{ xs: 'space-between', sm: 'flex-end' }}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              pt: { xs: 0.75, sm: 0 },
              borderTop: { xs: '1px solid', sm: 'none' },
              borderColor: 'divider',
            }}
          >
            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="overline" color="primary.main" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' }, fontWeight: 700 }}>
                This Mo Actual
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.95rem', sm: '1.25rem' }, color: 'primary.main' }}>
                {usd.format(actualRecurringTotal)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'center', sm: 'right' } }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' } }}>
                3-Mo Avg Actual
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.95rem', sm: '1.25rem' }, color: 'text.primary' }}>
                {usd.format(trailingRecurringSubtotal > 0 ? trailingRecurringSubtotal : subtotal)}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                  /mo
                </Typography>
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, fontSize: { xs: '0.58rem', sm: '0.68rem' } }}>
                Target Recurring
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: { xs: '0.95rem', sm: '1.25rem' }, color: 'text.secondary' }}>
                {usd.format(subtotal)}
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 0.25, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
                >
                  /mo
                </Typography>
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Stack>

      {sortedCategories.length === 0 ? (
        <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
          No recurring categories found.
        </Box>
      ) : (
        <Stack spacing={1}>
          {sortedCategories.map((cat) => {
            const isExcluded = excludedCategories.has(cat);
            const total = categoryTotals.get(cat) || 0;
            const rawMerchants = merchantsByCategory.get(cat) || [];
            const isExpanded = expanded.has(cat);
            const color = categoryColor(cat);
            const catActualThisMonth = currentMonthProjections.get(cat)?.actualToDate ?? 0;

            // Enrich with bill status and sort so unpaid upcoming bills (soonest due first) appear at the top
            const enrichedMerchants = rawMerchants
              .map((m) => ({
                item: m,
                billStatus: getMerchantBillStatus(m.merchantKey, currentCalMonth, recurrenceMap),
              }))
              .sort((a, b) => {
                if (a.billStatus.isPaidThisMonth !== b.billStatus.isPaidThisMonth) {
                  return a.billStatus.isPaidThisMonth ? 1 : -1;
                }
                if (!a.billStatus.isPaidThisMonth && !b.billStatus.isPaidThisMonth) {
                  const dueA = a.billStatus.daysUntilDue ?? 999;
                  const dueB = b.billStatus.daysUntilDue ?? 999;
                  if (dueA !== dueB) return dueA - dueB;
                }
                return b.item.monthlyAverage - a.item.monthlyAverage;
              });

            // Compute paid vs upcoming counts & soonest upcoming bill for active merchants in this category
            let paidCount = 0;
            let paidTotal = 0;
            let upcomingCount = 0;
            let upcomingTotal = 0;
            let nextDueBill: { merchantKey: string; countdownText: string | null; lastPaidShortLabel: string | null } | null = null;
            let minDaysUntilDue = Infinity;

            for (const { item: m, billStatus: status } of enrichedMerchants) {
              if (excludedMerchants.has(m.merchantKey)) continue;
              if (status.isPaidThisMonth) {
                paidCount++;
                paidTotal += m.monthlyAverage;
              } else if (status.isExpectedThisMonth) {
                upcomingCount++;
                upcomingTotal += m.monthlyAverage;
                const d = status.daysUntilDue ?? 999;
                if (d < minDaysUntilDue) {
                  minDaysUntilDue = d;
                  nextDueBill = {
                    merchantKey: m.merchantKey,
                    countdownText: status.countdownText,
                    lastPaidShortLabel: status.lastPaidShortLabel,
                  };
                }
              }
            }

            const displayCatActual = Math.max(catActualThisMonth, paidTotal);

            return (
              <Box
                key={cat}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: isExcluded ? 'action.hover' : 'background.paper',
                  overflow: 'hidden',
                }}
              >
                <Box
                  onClick={() => toggleExpand(cat)}
                  sx={{
                    p: { xs: 1.25, sm: 1.5 },
                    cursor: enrichedMerchants.length > 0 ? 'pointer' : 'default',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {/* Top Line: Expand Icon + Color Dot + Category Name + Subtotal + Switch */}
                  <Stack direction="row" spacing={{ xs: 0.75, sm: 1.25 }} alignItems="center">
                    <IconButton
                      size="small"
                      sx={{ p: 0.5, flexShrink: 0 }}
                      disabled={enrichedMerchants.length === 0}
                    >
                      {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </IconButton>

                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: color,
                        flexShrink: 0,
                      }}
                    />

                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        textDecoration: isExcluded ? 'line-through' : 'none',
                        opacity: isExcluded ? 0.5 : 1,
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cat}
                    </Typography>

                    {/* Desktop inline badges */}
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {enrichedMerchants.length} merchant{enrichedMerchants.length === 1 ? '' : 's'} · Plan: {usd.format(total)}/mo
                      </Typography>
                      {!isExcluded && upcomingCount > 0 && (
                        <>
                          <Chip
                            size="small"
                            label={`⏳ ${upcomingCount} due (${usd.format(upcomingTotal)})`}
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                          />
                          {nextDueBill?.countdownText && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: { md: 'none', lg: 'inline' }, fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              Next: {nextDueBill.countdownText}
                              {nextDueBill.lastPaidShortLabel ? ` (last paid ${nextDueBill.lastPaidShortLabel})` : ''}
                            </Typography>
                          )}
                        </>
                      )}
                      {!isExcluded && upcomingCount === 0 && paidCount > 0 && (
                        <Chip
                          size="small"
                          label={`✓ All ${paidCount} paid`}
                          color="success"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                        />
                      )}
                    </Stack>

                    <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: 'primary.main',
                          fontVariantNumeric: 'tabular-nums',
                          textDecoration: isExcluded ? 'line-through' : 'none',
                          opacity: isExcluded ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {usd.format(displayCatActual)}
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' }, fontWeight: 500 }}
                        >
                          / {usd.format(total)}/mo
                        </Typography>
                      </Typography>

                      <Switch
                        size="small"
                        checked={!isExcluded}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleCategory(cat);
                        }}
                      />
                    </Stack>
                  </Stack>

                  {/* Mobile Sub-Row: Merchant count + Plan + Reconciliation chip */}
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                    sx={{
                      display: { xs: 'flex', md: 'none' },
                      pl: 4.5,
                      mt: 0.5,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {enrichedMerchants.length} merchant{enrichedMerchants.length === 1 ? '' : 's'} · Plan: {usd.format(total)}/mo
                    </Typography>
                    {!isExcluded && upcomingCount > 0 && (
                      <Chip
                        size="small"
                        label={`⏳ ${upcomingCount} due (${usd.format(upcomingTotal)})`}
                        color="warning"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                      />
                    )}
                    {!isExcluded && upcomingCount === 0 && paidCount > 0 && (
                      <Chip
                        size="small"
                        label={`✓ All ${paidCount} paid`}
                        color="success"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                      />
                    )}
                  </Stack>
                </Box>

                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Stack
                    divider={<Divider sx={{ opacity: 0.6 }} />}
                    sx={{
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      bgcolor: (theme) => alpha(theme.palette.background.default, 0.35),
                    }}
                  >
                    {enrichedMerchants.map(({ item, billStatus }) => {
                      const mExcluded = excludedMerchants.has(item.merchantKey);
                      const isDueSoon =
                        !billStatus.isPaidThisMonth &&
                        billStatus.daysUntilDue !== null &&
                        billStatus.daysUntilDue <= 3;

                      const hasReconciliationBadge =
                        !mExcluded && (billStatus.isPaidThisMonth || billStatus.isExpectedThisMonth);

                      return (
                        <Box
                          key={item.merchantKey}
                          sx={{
                            pl: { xs: 2, sm: 5 },
                            pr: { xs: 1.25, sm: 2 },
                            py: 1.15,
                            opacity: mExcluded ? 0.45 : 1,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          {/* Row 1: Merchant Name + Monthly Avg + Toggle Switch */}
                          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                            <Tooltip title={item.merchantKey} arrow placement="top">
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 600,
                                  textDecoration: mExcluded ? 'line-through' : 'none',
                                  wordBreak: 'break-word',
                                  lineHeight: 1.3,
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                {formatCleanMerchantName(item.merchantKey)}
                              </Typography>
                            </Tooltip>

                            {/* Desktop inline reconciliation badges */}
                            {hasReconciliationBadge && (
                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                sx={{ display: { xs: 'none', sm: 'flex' }, mr: 1 }}
                              >
                                {billStatus.isPaidThisMonth && (
                                  <Tooltip
                                    title={
                                      billStatus.lastDate
                                        ? `Paid this month on ${billStatus.lastDate}`
                                        : 'Paid this month'
                                    }
                                    arrow
                                  >
                                    <Chip
                                      size="small"
                                      label={
                                        billStatus.lastPaidShortLabel
                                          ? `✓ Paid ${billStatus.lastPaidShortLabel}`
                                          : '✓ Paid'
                                      }
                                      color="success"
                                      variant="outlined"
                                      sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                                    />
                                  </Tooltip>
                                )}

                                {!billStatus.isPaidThisMonth && billStatus.isExpectedThisMonth && (
                                  <>
                                    <Tooltip
                                      title={
                                        billStatus.expectedDate && billStatus.lastDate
                                          ? `Expected around ${billStatus.expectedDate} based on last payment on ${billStatus.lastDate}`
                                          : 'Expected this month based on recurring history'
                                      }
                                      arrow
                                    >
                                      <Chip
                                        size="small"
                                        label={
                                          billStatus.countdownText
                                            ? `⏳ ${billStatus.countdownText}${billStatus.expectedShortLabel ? ` (~${billStatus.expectedShortLabel})` : ''}`
                                            : billStatus.expectedDayOfMonth
                                              ? `⏳ Due ~Day ${billStatus.expectedDayOfMonth}`
                                              : '⏳ Upcoming'
                                        }
                                        color={isDueSoon ? 'error' : 'warning'}
                                        variant={isDueSoon ? 'filled' : 'outlined'}
                                        sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                      />
                                    </Tooltip>

                                    {billStatus.lastPaidShortLabel && (
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                          fontWeight: 600,
                                          fontVariantNumeric: 'tabular-nums',
                                          bgcolor: 'action.hover',
                                          px: 0.75,
                                          py: 0.15,
                                          borderRadius: 1,
                                          fontSize: '0.68rem',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        Last paid: <strong>{billStatus.lastPaidShortLabel}</strong>
                                        {billStatus.daysSinceLastPaid !== null && billStatus.daysSinceLastPaid > 0
                                          ? ` (${billStatus.daysSinceLastPaid}d ago)`
                                          : ''}
                                      </Typography>
                                    )}
                                  </>
                                )}
                              </Stack>
                            )}

                            <Stack direction="row" spacing={{ xs: 0.5, sm: 1.5 }} alignItems="center" sx={{ flexShrink: 0 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: 600,
                                  textDecoration: mExcluded ? 'line-through' : 'none',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {usd.format(item.monthlyAverage)}
                              </Typography>
                              <Switch
                                size="small"
                                checked={!mExcluded}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => onToggleMerchant(item.merchantKey)}
                              />
                            </Stack>
                          </Stack>

                          {/* Row 2 (Mobile): Full-width Reconciliation Badges */}
                          {hasReconciliationBadge && (
                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              flexWrap="wrap"
                              useFlexGap
                              sx={{ display: { xs: 'flex', sm: 'none' }, mt: 0.6 }}
                            >
                              {billStatus.isPaidThisMonth && (
                                <Chip
                                  size="small"
                                  label={
                                    billStatus.lastPaidShortLabel
                                      ? `✓ Paid ${billStatus.lastPaidShortLabel}`
                                      : '✓ Paid'
                                  }
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                                />
                              )}

                              {!billStatus.isPaidThisMonth && billStatus.isExpectedThisMonth && (
                                <>
                                  <Chip
                                    size="small"
                                    label={
                                      billStatus.countdownText
                                        ? `⏳ ${billStatus.countdownText}${billStatus.expectedShortLabel ? ` (~${billStatus.expectedShortLabel})` : ''}`
                                        : billStatus.expectedDayOfMonth
                                          ? `⏳ Due ~Day ${billStatus.expectedDayOfMonth}`
                                          : '⏳ Upcoming'
                                    }
                                    color={isDueSoon ? 'error' : 'warning'}
                                    variant={isDueSoon ? 'filled' : 'outlined'}
                                    sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                                  />

                                  {billStatus.lastPaidShortLabel && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{
                                        fontWeight: 600,
                                        fontVariantNumeric: 'tabular-nums',
                                        bgcolor: 'action.hover',
                                        px: 0.75,
                                        py: 0.15,
                                        borderRadius: 1,
                                        fontSize: '0.68rem',
                                      }}
                                    >
                                      Last paid: <strong>{billStatus.lastPaidShortLabel}</strong>
                                      {billStatus.daysSinceLastPaid !== null && billStatus.daysSinceLastPaid > 0
                                        ? ` (${billStatus.daysSinceLastPaid}d ago)`
                                        : ''}
                                    </Typography>
                                  )}
                                </>
                              )}
                            </Stack>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
