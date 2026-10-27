import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  useTheme,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  IconButton,
  Snackbar,
  FormControl,
  Select,
  MenuItem,
  Stack,
  Menu,
  Tooltip,
  Chip,
  LinearProgress,
  Drawer,
  Divider,
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout,
} from 'react-resizable-panels';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import SavingsIcon from '@mui/icons-material/Savings';
import SyncIcon from '@mui/icons-material/Sync';
import { api } from '../api';
import { loadForecastBaselineData } from '../domain/incomeStreams';
import * as echarts from '../utils/echarts';
import { usd, formatDisplayCurrency } from '../lib';
import {
  useScenarios,
  useAccounts,
  useBudgets,
  useCategories,
  useConsolidatedRecurringMerchants,
  useCategoryTrailingAverages,
  useRecurrenceMap,
} from '../hooks/queries';
import { useFilters } from '../stores/store';
import { useBudgetStore } from '../stores/budgetStore';
import { consolidateRecurringMerchants } from '../domain/forecastSpending';
import {
  getAccountSavingsTransferOut,
  getOperatingCashAccounts,
  getSingleAccountSavingsAllocation,
} from '../domain/accountCashflow';
import { useCreateScenario, useUpdateScenario, useDeleteScenario } from '../hooks/mutations';
import type { Scenario } from '../api/scenarios';
import type { Account, RecurrenceInfo } from '../types';
import {
  useForecastStore,
  computeTotalNetIncome,
  computeTotalGrossIncome,
  computeBaseCalendarNetIncome,
  computeBonusPaycheckWindfalls,
  computeTotalStreamInvested,
} from '../stores/forecastStore';
import { ForecastCharts } from '../components/ForecastCharts';
import type { ProjectionPoint } from '../components/ForecastCharts';
import FutureMonthBreakdownDialog from '../components/FutureMonthBreakdownDialog';
import {
  MoneyFlowGoalsPanel,
  AddDestinationDialog,
  AddIncomeStreamDialog,
  SaveScenarioDialog,
} from '../components/forecast/ForecastDialogs';
import { ForecastSettingsPanel } from '../components/forecast/ForecastSettingsPanel';
import {
  AccountFilterDropdown,
  useScopedCheckingAccounts,
  UNIFORM_TOOLBAR_BUTTON_SX,
} from '../components/AccountFilterDropdown';

export default function Forecast() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [selectedMonthBreakdown, setSelectedMonthBreakdown] = useState<string | null>(null);

  const [abbreviateNumbers, setAbbreviateNumbers] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('forecast:abbreviateNumbers') !== 'false';
  });

  const [chartHeight, setChartHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return 760;
    const saved = localStorage.getItem('forecast:chartHeight');
    return saved ? parseInt(saved, 10) : 760;
  });

  const [settingsVisible, setSettingsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 900) return false;
    return localStorage.getItem('forecast:settingsVisible') !== 'false';
  });
  const [destinationsVisible, setDestinationsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (window.innerWidth < 900) return false;
    return localStorage.getItem('forecast:destinationsVisible') !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('forecast:settingsVisible', String(settingsVisible));
  }, [settingsVisible]);
  useEffect(() => {
    localStorage.setItem('forecast:destinationsVisible', String(destinationsVisible));
  }, [destinationsVisible]);

  const {
    baseIncome,
    taxRate,
    recurringBudget,
    savingsBudget,
    investmentGrowthRate,
    startingBalance,
    variableBudget,
    extraLoanPayment,
    divertExtraToSavings,
    loanStrategy,
    months,
    goals,
    setGoals,
    destinations,
    updateDestination,
    addDestination,
    removeDestination,
    incomeStreams,
    addIncomeStream,
    windfalls,
    incomeGaps,
    useExactPaycheckCalendar,
    includeHomeEquity,
    homePropertyValue,
    homeAppreciationRate,
    isHomeValueOverridden,
    isIncomeOverridden,
    isRecurringOverridden,
    isVariableOverridden,
    isStartingBalanceOverridden,
    setBaselineData,
    resetToRealData,
  } = useForecastStore();

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [addDestDialogOpen, setAddDestDialogOpen] = useState(false);

  // Income Streams State
  const [addIncomeStreamDialogOpen, setAddIncomeStreamDialogOpen] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>([]);

  const { data: rawScenarios = [] } = useScenarios();
  const scenarios = rawScenarios || [];
  const createScenario = useCreateScenario();
  const updateScenario = useUpdateScenario();
  const deleteScenario = useDeleteScenario();

  const [selectedScenarioId, setSelectedScenarioId] = useState<number | ''>('');
  const [scenarioName, setScenarioName] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveMenuAnchorEl, setSaveMenuAnchorEl] = useState<null | HTMLElement>(null);
  const saveMenuOpen = Boolean(saveMenuAnchorEl);
  const [mobilePipelineExpanded, setMobilePipelineExpanded] = useState(false);

  const debtChartRef = useRef<HTMLDivElement>(null);
  const cashflowChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debtChartRef.current) {
      echarts.getInstanceByDom(debtChartRef.current)?.resize();
    }
  }, [chartHeight]);

  const { data: accountsData = [] } = useAccounts();
  const { data: budgetsData = [] } = useBudgets();
  const { data: categoriesData = [] } = useCategories();
  const demoMode = useFilters((s) => s.demoMode);
  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);

  const checkingAccounts = useMemo(
    () => getOperatingCashAccounts(accountsData || availableAccounts, incomeStreams),
    [accountsData, availableAccounts, incomeStreams]
  );

  const {
    selectedAccountIds,
    setSelectedAccountIds,
    isAllSelected,
    selectedAccounts,
    scopedAccountIdsParam,
    scopeLabel,
  } = useScopedCheckingAccounts(checkingAccounts);

  const isScoped = !isAllSelected;
  const { data: rawScopedMerchants = [] } = useConsolidatedRecurringMerchants(scopedAccountIdsParam);
  const { data: scopedTrailingAverages = [] } = useCategoryTrailingAverages(scopedAccountIdsParam);
  const { data: scopedRecurrenceMapObj = {} } = useRecurrenceMap(demoMode, scopedAccountIdsParam);

  const scopedRecurrenceMap = useMemo(
    () => new Map<string, RecurrenceInfo>(Object.entries(scopedRecurrenceMapObj)),
    [scopedRecurrenceMapObj]
  );
  const scopedConsolidatedMerchants = useMemo(
    () => consolidateRecurringMerchants(rawScopedMerchants, scopedRecurrenceMap),
    [rawScopedMerchants, scopedRecurrenceMap]
  );

  const recurringCategorySet = useMemo(
    () =>
      new Set(
        categoriesData
          .filter((c) => c.type === 'spend' && c.defaultRecurrence === 'recurring')
          .map((c) => c.name)
      ),
    [categoriesData]
  );

  // Scoped Recurring & Variable Spend for Selected Accounts
  const accountScopedRecurring = useMemo(() => {
    if (!isScoped) return recurringBudget;
    return Math.round(
      scopedConsolidatedMerchants
        .filter(
          (m) =>
            recurringCategorySet.has(m.category) &&
            !excludedBudgetCategories.has(m.category) &&
            !excludedMerchants.has(m.merchantKey)
        )
        .reduce((sum, m) => sum + m.monthlyAverage, 0)
    );
  }, [isScoped, recurringBudget, scopedConsolidatedMerchants, recurringCategorySet, excludedBudgetCategories, excludedMerchants]);

  const accountScopedVariable = useMemo(() => {
    if (!isScoped) return variableBudget;
    return Math.round(
      scopedTrailingAverages
        .filter(
          (t) =>
            !recurringCategorySet.has(t.category) &&
            !excludedBudgetCategories.has(t.category)
        )
        .reduce((sum, t) => sum + t.average, 0)
    );
  }, [isScoped, variableBudget, scopedTrailingAverages, recurringCategorySet, excludedBudgetCategories]);

  const scopedIncomeStreams = useMemo(() => {
    if (!isScoped) return incomeStreams;
    const allowedSet = new Set(selectedAccountIds);
    return incomeStreams.filter((s) => s.accountId !== undefined && allowedSet.has(s.accountId));
  }, [isScoped, selectedAccountIds, incomeStreams]);

  const scopedStartingBalance = isScoped
    ? Math.round(selectedAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0))
    : startingBalance;

  const { totalTransferOut: scopedSavingsOut } = useMemo(
    () => getAccountSavingsTransferOut(destinations, isScoped ? selectedAccounts : null),
    [destinations, isScoped, selectedAccounts]
  );

  // Ingest Real Accounts, Budgets, Categories, and Transactions
  const loadRealData = useCallback(async () => {
    try {
      const { baseline, destinations, incomeStreams, accounts } = await loadForecastBaselineData();
      setAvailableAccounts(accounts);
      setBaselineData(baseline, destinations, incomeStreams);
    } catch (err) {
      console.error('Failed to load initial forecast data from accounts:', err);
    }
  }, [setBaselineData]);

  // Initial load
  useEffect(() => {
    loadRealData();
  }, [loadRealData]);

  // React to background db-updates (e.g. SimpleFin / Plaid sync or CSV imports in Settings)
  useEffect(() => {
    const handleDbUpdate = () => {
      loadRealData();
    };
    window.addEventListener('db-update', handleDbUpdate);
    return () => window.removeEventListener('db-update', handleDbUpdate);
  }, [loadRealData]);

  // Ingest whenever React Query accounts cache updates
  useEffect(() => {
    if (accountsData && accountsData.length > 0) {
      loadRealData();
    }
  }, [accountsData, loadRealData]);

  // Recalculate Projection (debounced to prevent IPC flooding while dragging sliders)
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // Factor in that money from actuals is already taxed (take-home pay).
        // When useExactPaycheckCalendar is true, normal months use 2x biweekly / 4x weekly paychecks,
        // and 3-paycheck / 5-paycheck bonus months receive their extra paycheck as an automatic windfall.
        const effectiveProjectionBaseIncome = scopedIncomeStreams.length > 0
          ? (useExactPaycheckCalendar
              ? computeBaseCalendarNetIncome(scopedIncomeStreams, taxRate)
              : computeTotalNetIncome(scopedIncomeStreams, taxRate))
          : (isScoped ? 0 : baseIncome * (1 - taxRate / 100));

        const bonusPaycheckWindfalls =
          useExactPaycheckCalendar && scopedIncomeStreams.length > 0
            ? computeBonusPaycheckWindfalls(scopedIncomeStreams, taxRate, months, incomeGaps)
            : [];

        const combinedWindfalls = [
          ...windfalls.map((w) => ({ month_index: w.monthIndex, amount: w.amount })),
          ...bonusPaycheckWindfalls.map((bw) => ({ month_index: bw.month_index, amount: bw.amount })),
        ];

        const destinationParams = destinations.map((d) => {
          const alloc = isScoped
            ? getAccountSavingsTransferOut([{ ...d, enabled: true }], selectedAccounts).totalTransferOut
            : d.monthlyAllocation;
          return {
            id: d.id,
            name: d.name,
            starting_balance: d.currentBalance,
            monthly_allocation: alloc,
            annual_growth_rate: d.annualGrowthRate,
            enabled: d.enabled,
          };
        });

        const totalStartingInvestments = destinations
          .filter((d) => d.enabled)
          .reduce((sum, d) => sum + d.currentBalance, 0);

        const res = await api.calculateProjection({
          base_income: effectiveProjectionBaseIncome,
          recurring_budget: accountScopedRecurring,
          savings_budget: isScoped ? scopedSavingsOut : savingsBudget,
          starting_balance: scopedStartingBalance,
          starting_investment_balance: totalStartingInvestments,
          destinations: destinationParams,
          income_gaps: incomeGaps,
          windfalls: combinedWindfalls,
          variable_budget: accountScopedVariable,
          investment_growth_rate: investmentGrowthRate,
          global_extra_loan_payment: isScoped ? 0 : extraLoanPayment,
          divert_extra_to_savings: divertExtraToSavings,
          loan_strategy: loanStrategy,
          months: months,
          goals: isScoped
            ? []
            : goals.map((g) => ({
                name: g.name,
                target_amount: g.amount,
                monthly_contribution: g.monthlyContribution,
              })),
          include_home_equity: includeHomeEquity,
          home_property_value: homePropertyValue,
          home_appreciation_rate: homeAppreciationRate,
        });
        if (!cancelled) {
          setPoints(res);
        }
      } catch (err) {
        console.error('Failed to load projection:', err);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    baseIncome,
    scopedIncomeStreams,
    windfalls,
    incomeGaps,
    useExactPaycheckCalendar,
    taxRate,
    accountScopedRecurring,
    accountScopedVariable,
    scopedSavingsOut,
    scopedStartingBalance,
    isScoped,
    selectedAccounts,
    savingsBudget,
    investmentGrowthRate,
    extraLoanPayment,
    divertExtraToSavings,
    loanStrategy,
    months,
    goals,
    destinations,
    includeHomeEquity,
    homePropertyValue,
    homeAppreciationRate,
  ]);

  const toggleSettings = () => {
    setSettingsVisible((prev) => !prev);
    setTimeout(() => {
      if (debtChartRef.current) echarts.getInstanceByDom(debtChartRef.current)?.resize();
      if (cashflowChartRef.current) echarts.getInstanceByDom(cashflowChartRef.current)?.resize();
    }, 150);
  };

  const toggleDestinations = () => {
    setDestinationsVisible((prev) => !prev);
    setTimeout(() => {
      if (debtChartRef.current) echarts.getInstanceByDom(debtChartRef.current)?.resize();
      if (cashflowChartRef.current) echarts.getInstanceByDom(cashflowChartRef.current)?.resize();
    }, 150);
  };

  const saveScenarioToDb = (name: string, idToUpdate?: number) => {
    const data: Scenario = {
      name,
      startingBalance,
      baseIncome,
      taxRate,
      recurringBudget,
      variableBudget,
      savingsBudget,
      investmentGrowthRate,
      extraLoanPayment,
      divertExtraToSavings,
      loanStrategy,
      goals,
      destinations,
      incomeStreams,
      includeHomeEquity,
      homePropertyValue,
      homeAppreciationRate,
    };
    if (idToUpdate) {
      updateScenario.mutate(
        { ...data, id: idToUpdate },
        {
          onSuccess: () => setSnackbarMessage('Scenario updated'),
        }
      );
    } else {
      createScenario.mutate(data, {
        onSuccess: (id: number) => {
          setSelectedScenarioId(id);
          setSnackbarMessage('Scenario created');
        },
      });
    }
  };

  const handleQuickSave = () => {
    if (selectedScenarioId) {
      const s = scenarios.find((x) => x.id === selectedScenarioId);
      if (s) {
        saveScenarioToDb(s.name, selectedScenarioId as number);
        return;
      }
    }
    setScenarioName('');
    setSaveDialogOpen(true);
  };

  const safePoints = points || [];
  const lastPoint = safePoints[safePoints.length - 1];

  // Cashflow Waterfall Metrics
  // Factor in that actuals are already taxed take-home pay
  const effectiveNetIncome = scopedIncomeStreams.length > 0
    ? (useExactPaycheckCalendar
        ? computeBaseCalendarNetIncome(scopedIncomeStreams, taxRate)
        : computeTotalNetIncome(scopedIncomeStreams, taxRate))
    : (isScoped ? 0 : baseIncome * (1 - taxRate / 100));
  const totalGrossIncome = scopedIncomeStreams.length > 0
    ? computeTotalGrossIncome(scopedIncomeStreams)
    : (isScoped ? 0 : baseIncome);
  const taxesDeducted = Math.max(0, totalGrossIncome - effectiveNetIncome);

  const netIncome = effectiveNetIncome;
  const activeBudgetTotal = useMemo(() => {
    if (!budgetsData || budgetsData.length === 0) return 0;
    return budgetsData
      .filter((b) => !excludedBudgetCategories.has(b.category))
      .reduce((sum, b) => sum + (b.monthlyAmount || 0), 0);
  }, [budgetsData, excludedBudgetCategories]);

  // In the Monthly Money Flow pipeline, living and debt comes strictly from the monthly budget (or account-scoped bills + variable)
  const effectiveRecurringForDisplay = isScoped ? accountScopedRecurring : recurringBudget;
  const effectiveVariableForDisplay = isScoped ? accountScopedVariable : variableBudget;
  const totalLivingAndDebt = isScoped
    ? (accountScopedRecurring + accountScopedVariable)
    : (isRecurringOverridden || isVariableOverridden)
    ? (recurringBudget + variableBudget)
    : (activeBudgetTotal > 0 ? Math.round(activeBudgetTotal) : (recurringBudget + variableBudget));
  const availableToAllocate = netIncome - totalLivingAndDebt;
  const totalStreamInvested = computeTotalStreamInvested(scopedIncomeStreams);
  const totalDestinationFlow = isScoped
    ? scopedSavingsOut
    : destinations.filter((d) => d.enabled).reduce((sum, d) => sum + (d.monthlyAllocation || 0), 0);
  const totalGoalFlow = isScoped ? 0 : goals.reduce((sum, g) => sum + (g.monthlyContribution || 0), 0);
  const effectiveExtraLoan = isScoped ? 0 : extraLoanPayment;
  const monthlySafeRemainder = availableToAllocate - totalDestinationFlow - totalGoalFlow - effectiveExtraLoan;
  const maxSafeVariableSpend = netIncome - effectiveRecurringForDisplay - totalDestinationFlow - totalGoalFlow - effectiveExtraLoan;

  // Wealth building rate = (destinations + extra debt paydown + goals) / net take-home income
  const totalWealthFlow = totalDestinationFlow + effectiveExtraLoan + totalGoalFlow;
  const wealthRatePercent = netIncome > 0 ? Math.round((totalWealthFlow / netIncome) * 100) : 0;

  // Count overrides
  const overriddenCount =
    (isIncomeOverridden ? 1 : 0) +
    (isRecurringOverridden ? 1 : 0) +
    (isVariableOverridden ? 1 : 0) +
    (isStartingBalanceOverridden ? 1 : 0) +
    (isHomeValueOverridden ? 1 : 0) +
    (extraLoanPayment > 0 ? 1 : 0) +
    destinations.filter((d) => d.isOverridden).length;

  const panelIds = useMemo(
    () => [
      ...(settingsVisible ? ['settings'] : []),
      'charts',
      ...(destinationsVisible ? ['destinations'] : []),
    ],
    [settingsVisible, destinationsVisible]
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `forecast-layout-${panelIds.join('-')}`,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  });

  const minGroupWidth = (settingsVisible ? 340 : 0) + 400 + (destinationsVisible ? 360 : 0);

  const centerForecastContent = (
    <Box sx={{ height: { xs: 'auto', md: '100%' }, overflow: { xs: 'visible', md: 'auto' }, p: { xs: 0, sm: 1 } }}>
      {/* Top KPI Cards Row — 2x2 grid on phone, 4-column row on unfolded foldable (sm) & desktop */}
      <Grid container spacing={{ xs: 1.25, sm: 1.5, md: 2 }} sx={{ mb: { xs: 1.5, sm: 2.5 } }}>
        {/* 1. Safe Remainder */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper
            sx={{
              p: { xs: 1.25, sm: 1.75, md: 2.5 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight="700"
              sx={{ letterSpacing: { xs: 0.4, sm: 0.75, md: 1 }, fontSize: { xs: '0.62rem', sm: '0.68rem', md: '0.75rem' }, lineHeight: 1.2 }}
            >
              {isScoped ? 'ACCOUNT REMAINDER' : 'SAFE REMAINDER'}
            </Typography>
            <Tooltip title={`Exact: ${usd.format(monthlySafeRemainder)}/mo`} arrow placement="top">
              <Typography
                variant="h4"
                fontWeight="800"
                color={monthlySafeRemainder >= 0 ? 'success.main' : 'error.main'}
                sx={{
                  my: 0.5,
                  fontSize: { xs: '1.2rem', sm: '1.45rem', md: '2.05rem', xl: '2.3rem' },
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'default',
                }}
              >
                {formatDisplayCurrency(monthlySafeRemainder, abbreviateNumbers)}
                <Typography component="span" variant="body1" sx={{ ml: 0.25, fontWeight: 700, fontSize: { xs: '0.72rem', sm: '0.85rem', md: '1.1rem' } }}>
                  /mo
                </Typography>
              </Typography>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.72rem', md: '0.75rem' }, lineHeight: 1.3 }}>
              Safe Spend: <strong style={{ color: maxSafeVariableSpend >= 0 ? '#1976d2' : '#d32f2f' }}>{usd.format(maxSafeVariableSpend)}/mo</strong>
            </Typography>
          </Paper>
        </Grid>

        {/* 2. Projected Account Cash Balance (when isolated) or Projected Net Worth at Horizon */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper
            sx={{
              p: { xs: 1.25, sm: 1.75, md: 2.5 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight="700"
              sx={{ letterSpacing: { xs: 0.4, sm: 0.75, md: 1 }, fontSize: { xs: '0.62rem', sm: '0.68rem', md: '0.75rem' }, lineHeight: 1.2 }}
            >
              {isScoped
                ? `ACCOUNT CASH IN ${Math.round(months / 12)}Y`
                : `NET WORTH IN ${Math.round(months / 12)}Y`}
            </Typography>
            {(() => {
              if (isScoped) {
                const endingCash = lastPoint?.ending_balance ?? scopedStartingBalance;
                const cashDelta = endingCash - scopedStartingBalance;
                return (
                  <>
                    <Tooltip title={`Exact Ending Cash: ${usd.format(endingCash)} (Start: ${usd.format(scopedStartingBalance)})`} arrow placement="top">
                      <Typography
                        variant="h4"
                        fontWeight="800"
                        color={endingCash >= scopedStartingBalance ? 'primary.main' : 'error.main'}
                        sx={{
                          my: 0.5,
                          fontSize: { xs: '1.2rem', sm: '1.45rem', md: '2.05rem', xl: '2.3rem' },
                          lineHeight: 1.15,
                          letterSpacing: '-0.02em',
                          fontVariantNumeric: 'tabular-nums',
                          cursor: 'default',
                        }}
                      >
                        {formatDisplayCurrency(endingCash, abbreviateNumbers)}
                      </Typography>
                    </Tooltip>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.72rem', md: '0.75rem' }, lineHeight: 1.3 }}>
                      Now {usd.format(scopedStartingBalance)} · Δ {cashDelta >= 0 ? '+' : ''}{formatDisplayCurrency(cashDelta, abbreviateNumbers)}
                    </Typography>
                  </>
                );
              }
              const netWorthVal =
                lastPoint?.net_worth ??
                ((lastPoint?.ending_balance || 0) +
                  (lastPoint?.investment_balance || 0) +
                  (includeHomeEquity ? (lastPoint?.home_equity || 0) : 0) -
                  (includeHomeEquity
                    ? Math.max(0, (lastPoint?.total_debt || 0) - (lastPoint?.mortgage_debt || 0))
                    : (lastPoint?.total_debt || 0)));
              const liquidVal =
                lastPoint?.liquid_net_worth ??
                ((lastPoint?.ending_balance || 0) +
                  (lastPoint?.investment_balance || 0) -
                  (lastPoint?.total_debt || 0));
              return (
                <>
                  <Tooltip title={`Exact: ${usd.format(netWorthVal)}`} arrow placement="top">
                    <Typography
                      variant="h4"
                      fontWeight="800"
                      color="primary.main"
                      sx={{
                        my: 0.5,
                        fontSize: { xs: '1.2rem', sm: '1.45rem', md: '2.05rem', xl: '2.3rem' },
                        lineHeight: 1.15,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                        cursor: 'default',
                      }}
                    >
                      {formatDisplayCurrency(netWorthVal, abbreviateNumbers)}
                    </Typography>
                  </Tooltip>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: { sm: '0.72rem', md: '0.75rem' }, lineHeight: 1.3 }}>
                      {abbreviateNumbers ? `${usd.format(netWorthVal)} · ` : ''}
                      {includeHomeEquity && (lastPoint?.home_equity || 0) > 0
                        ? `Incl. ${formatDisplayCurrency(lastPoint?.home_equity || 0, abbreviateNumbers)} home equity`
                        : 'Cash + destinations minus debt'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.72rem', md: '0.75rem' } }} noWrap>
                      {includeHomeEquity && (lastPoint?.home_equity || 0) > 0
                        ? `Liquid: ${formatDisplayCurrency(liquidVal, abbreviateNumbers)}`
                        : 'Cash + destinations - debt'}
                    </Typography>
                  </Box>
                </>
              );
            })()}
          </Paper>
        </Grid>

        {/* 3. Wealth Building Rate */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper
            sx={{
              p: { xs: 1.25, sm: 1.75, md: 2.5 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight="700"
              sx={{ letterSpacing: { xs: 0.4, sm: 0.75, md: 1 }, fontSize: { xs: '0.62rem', sm: '0.68rem', md: '0.75rem' }, lineHeight: 1.2 }}
            >
              {isScoped ? 'SAVINGS MOVED OUT' : 'WEALTH FLOW'}
            </Typography>
            <Tooltip title={`Exact: ${usd.format(totalWealthFlow)}/mo`} arrow placement="top">
              <Typography
                variant="h4"
                fontWeight="800"
                color="secondary.main"
                sx={{
                  my: 0.5,
                  fontSize: { xs: '1.2rem', sm: '1.45rem', md: '2.05rem', xl: '2.3rem' },
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'default',
                }}
              >
                {formatDisplayCurrency(totalWealthFlow, abbreviateNumbers)}
                <Typography component="span" variant="body1" sx={{ ml: 0.25, fontWeight: 700, fontSize: { xs: '0.72rem', sm: '0.85rem', md: '1.1rem' } }}>
                  /mo
                </Typography>
              </Typography>
            </Tooltip>
            <Stack direction="row" spacing={1} alignItems="center">
              <LinearProgress
                variant="determinate"
                value={Math.min(100, wealthRatePercent * 2)}
                sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                color="secondary"
              />
              <Typography variant="caption" fontWeight="700">
                {wealthRatePercent}%
              </Typography>
            </Stack>
          </Paper>
        </Grid>

        {/* 4. Total Destination Wealth */}
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper
            sx={{
              p: { xs: 1.25, sm: 1.75, md: 2.5 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: 'background.paper',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight="700"
              sx={{ letterSpacing: { xs: 0.4, sm: 0.75, md: 1 }, fontSize: { xs: '0.62rem', sm: '0.68rem', md: '0.75rem' }, lineHeight: 1.2 }}
            >
              DESTINATION WEALTH
            </Typography>
            <Tooltip title={`Exact: ${usd.format(lastPoint?.investment_balance || 0)}`} arrow placement="top">
              <Typography
                variant="h4"
                fontWeight="800"
                sx={{
                  my: 0.5,
                  color: '#8b5cf6',
                  fontSize: { xs: '1.2rem', sm: '1.45rem', md: '2.05rem', xl: '2.3rem' },
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  cursor: 'default',
                }}
              >
                {formatDisplayCurrency(lastPoint?.investment_balance || 0, abbreviateNumbers)}
              </Typography>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.68rem', sm: '0.72rem', md: '0.75rem' }, lineHeight: 1.3 }}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                {abbreviateNumbers ? `${usd.format(lastPoint?.investment_balance || 0)} · ` : ''}
              </Box>
              Across {destinations.filter((d) => d.enabled).length} active accounts
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Monthly Cashflow Pipeline Banner — Compact collapsible bar on xs, full 5-column pipeline on sm+ */}
      <Paper
        sx={{
          p: { xs: 1.25, sm: 2.5 },
          mb: { xs: 1.5, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap={{ xs: 'nowrap', sm: 'wrap' }} sx={{ mb: { xs: mobilePipelineExpanded ? 1.25 : 0, sm: 1.5 }, gap: 0.75 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="subtitle2" fontWeight="700" color="text.secondary" noWrap sx={{ letterSpacing: 0.4, fontSize: { xs: '0.72rem', sm: '0.875rem' }, flexShrink: 0 }}>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                MONTHLY FLOW
              </Box>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                {isScoped ? `FLOW — ${scopeLabel.toUpperCase()}` : 'MONTHLY FLOW'}
              </Box>
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'inline', sm: 'none' }, fontWeight: 600, fontSize: '0.72rem' }}>
              +{formatDisplayCurrency(netIncome, true)} in · -{formatDisplayCurrency(totalLivingAndDebt, true).replace('-', '')} out
            </Typography>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Max Safe Variable: ${usd.format(maxSafeVariableSpend)}/mo`}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 700, height: 22, fontSize: '0.68rem' }}
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            {availableToAllocate > 0 && (
              <Typography variant="caption" color="text.secondary" fontWeight="600" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {Math.round(((totalDestinationFlow + totalGoalFlow + effectiveExtraLoan) / availableToAllocate) * 100)}% of available pool allocated
              </Typography>
            )}
            <Button
              size="small"
              variant="text"
              onClick={() => setMobilePipelineExpanded((p) => !p)}
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.75rem',
                minWidth: 0,
                px: 0.75,
                py: 0.25,
                whiteSpace: 'nowrap',
              }}
            >
              {mobilePipelineExpanded ? 'Hide ▴' : 'Details ▾'}
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ display: { xs: mobilePipelineExpanded ? 'block' : 'none', sm: 'block' } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
              gap: { xs: 1, sm: 1.5 },
            }}
          >
            <Box sx={{ p: { xs: 1.1, sm: 1.5 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 1.5, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Inflow (Net)</Typography>
              <Tooltip title={`Exact: ${usd.format(netIncome)}/mo across active checking streams`} arrow placement="top">
                <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: 'default', fontSize: { xs: '1rem', sm: '1.25rem' } }} color="success.main">
                  {formatDisplayCurrency(netIncome, abbreviateNumbers)}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                {scopedIncomeStreams.filter((s) => s.enabled).length} checking stream{scopedIncomeStreams.filter((s) => s.enabled).length === 1 ? '' : 's'}
              </Typography>
            </Box>

            <Box sx={{ p: { xs: 1.1, sm: 1.5 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 1.5, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Living &amp; Debt</Typography>
              <Tooltip
                title={`Exact Budget: -${usd.format(totalLivingAndDebt)}/mo (Fixed Bills: ${usd.format(effectiveRecurringForDisplay)} + Variable Living: ${usd.format(effectiveVariableForDisplay)})`}
                arrow
                placement="top"
              >
                <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: 'default', fontSize: { xs: '1rem', sm: '1.25rem' } }} color="error.main">
                  -{formatDisplayCurrency(totalLivingAndDebt, abbreviateNumbers).replace('-', '')}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' }, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatDisplayCurrency(effectiveRecurringForDisplay, abbreviateNumbers)} bills + {formatDisplayCurrency(effectiveVariableForDisplay, abbreviateNumbers)} living
              </Typography>
            </Box>

            <Box sx={{ p: { xs: 1.1, sm: 1.5 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 1.5, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Available Pool</Typography>
              <Tooltip title={`Exact: ${usd.format(availableToAllocate)}/mo (${usd.format(netIncome)} Inflow - ${usd.format(totalLivingAndDebt)} Budget)`} arrow placement="top">
                <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: 'default', fontSize: { xs: '1rem', sm: '1.25rem' } }} color="primary.main">
                  {formatDisplayCurrency(availableToAllocate, abbreviateNumbers)}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Inflow minus budget</Typography>
            </Box>

            <Box sx={{ p: { xs: 1.1, sm: 1.5 }, bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderRadius: 1.5, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Money Flow &amp; Goals</Typography>
              <Tooltip
                title={`Exact: -${usd.format(totalDestinationFlow + totalGoalFlow + effectiveExtraLoan)}/mo (Accounts: ${usd.format(totalDestinationFlow)}${totalGoalFlow > 0 ? ` · Goals: ${usd.format(totalGoalFlow)}` : ''}${effectiveExtraLoan > 0 ? ` · Extra Loan: ${usd.format(effectiveExtraLoan)}` : ''})`}
                arrow
                placement="top"
              >
                <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#8b5cf6', cursor: 'default', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  -{formatDisplayCurrency(totalDestinationFlow + totalGoalFlow + effectiveExtraLoan, abbreviateNumbers).replace('-', '')}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>
                {totalGoalFlow > 0 || effectiveExtraLoan > 0
                  ? `Accts ${formatDisplayCurrency(totalDestinationFlow, abbreviateNumbers)}${totalGoalFlow > 0 ? ` · Goals ${formatDisplayCurrency(totalGoalFlow, abbreviateNumbers)}` : ''}${effectiveExtraLoan > 0 ? ` · Debt ${formatDisplayCurrency(effectiveExtraLoan, abbreviateNumbers)}` : ''}`
                  : destinations.filter((d) => d.enabled && (d.monthlyAllocation || 0) > 0).length === 1
                    ? destinations.filter((d) => d.enabled && (d.monthlyAllocation || 0) > 0)[0].name
                    : `${destinations.filter((d) => d.enabled && (d.monthlyAllocation || 0) > 0).length} active accounts`}
              </Typography>
            </Box>

            <Box
              sx={{
                gridColumn: { xs: '1 / -1', md: 'auto' },
                p: { xs: 1.1, sm: 1.5 },
                bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                borderRadius: 1.5,
                minWidth: 0,
                display: 'flex',
                flexDirection: { xs: 'row', md: 'column' },
                justifyContent: 'space-between',
                alignItems: { xs: 'center', md: 'flex-start' },
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}>Safe Remainder</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, fontSize: '0.68rem' }}>
                  {monthlySafeRemainder >= 0 ? 'Stays in checking buffer' : 'Over-allocated'}
                </Typography>
              </Box>
              <Tooltip title={`Exact: ${usd.format(monthlySafeRemainder)}/mo (${usd.format(availableToAllocate)} Available - ${usd.format(totalDestinationFlow + totalGoalFlow + effectiveExtraLoan)} Allocated)`} arrow placement="top">
                <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', cursor: 'default', fontSize: { xs: '1.1rem', sm: '1.25rem' } }} color={monthlySafeRemainder >= 0 ? 'success.main' : 'error.main'}>
                  {formatDisplayCurrency(monthlySafeRemainder, abbreviateNumbers)}
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>
                {monthlySafeRemainder >= 0 ? 'Stays in checking buffer' : 'Over-allocated'}
              </Typography>
            </Box>
          </Box>

          {/* Live Active Allocations Strip from Money Flow & Goals */}
          {(destinations.some((d) => d.enabled && (d.monthlyAllocation || 0) > 0) ||
            goals.some((g) => (g.monthlyContribution || 0) > 0) ||
            effectiveExtraLoan > 0) && (
            <Stack
              direction="row"
              spacing={0.75}
              flexWrap="wrap"
              useFlexGap
              alignItems="center"
              sx={{ mt: 1.5, pt: 1.25, borderTop: '1px solid', borderColor: 'divider' }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight="600" sx={{ mr: 0.25 }}>
                Account Flow:
              </Typography>
              {destinations
                .filter((d) => d.enabled && (d.monthlyAllocation || 0) > 0)
                .map((d) => {
                  const parts: string[] = [];
                  for (const acc of isScoped ? selectedAccounts : checkingAccounts) {
                    const amt = getSingleAccountSavingsAllocation(d, acc);
                    if (amt > 0) {
                      const last4 = acc.last4 || acc.name?.match(/\b(\d{4})\b/)?.[1];
                      const shortLabel = /bank\s*of\s*america|\bboa\b|bofa/i.test(acc.name || '')
                        ? `BoA${last4 ? ` ${last4}` : ''}`
                        : /truist/i.test(acc.name || '')
                        ? `Truist${last4 ? ` ${last4}` : ''}`
                        : acc.name;
                      parts.push(`${usd.format(amt)} ${shortLabel}`);
                    }
                  }
                  const splitSuffix = parts.length > 0 ? ` (${parts.join(' + ')})` : '';
                  return (
                    <Chip
                      key={d.id}
                      size="small"
                      variant="outlined"
                      color={d.isRothIra ? 'secondary' : d.accountType === 'savings' ? 'success' : 'primary'}
                      label={`↗ ${d.name}: ${usd.format(d.monthlyAllocation)}/mo${splitSuffix}`}
                      sx={{ fontWeight: 600, fontSize: '0.68rem', height: 22, maxWidth: '100%' }}
                    />
                  );
                })}
              {!isScoped &&
                goals
                  .filter((g) => (g.monthlyContribution || 0) > 0)
                  .map((g) => (
                    <Chip
                      key={g.id}
                      size="small"
                      variant="outlined"
                      color="warning"
                      label={`🎯 ${g.name}: ${usd.format(g.monthlyContribution)}/mo`}
                      sx={{ fontWeight: 600, fontSize: '0.68rem', height: 22 }}
                    />
                  ))}
              {effectiveExtraLoan > 0 && (
                <Chip
                  size="small"
                  variant="outlined"
                  color="error"
                  label={`⚡ Extra Debt Payoff: ${usd.format(effectiveExtraLoan)}/mo`}
                  sx={{ fontWeight: 600, fontSize: '0.68rem', height: 22 }}
                />
              )}
              <Chip
                size="small"
                color={monthlySafeRemainder >= 0 ? 'success' : 'error'}
                variant="filled"
                label={`Safe Remainder: ${usd.format(monthlySafeRemainder)}/mo`}
                sx={{ fontWeight: 700, fontSize: '0.68rem', height: 22, ml: { sm: 'auto' } }}
              />
            </Stack>
          )}
        </Box>
      </Paper>

      {/* Chart 1: Net Worth & Destination Growth */}
      <Paper
        sx={{
          p: { xs: 1.25, sm: 3 },
          mb: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          boxShadow: 'none',
          height: { xs: 380, sm: 480, md: chartHeight },
          position: 'relative',
          transition: 'height 0.2s ease',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 14,
            right: 20,
            zIndex: 5,
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Chart Height:
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={chartHeight}
            exclusive
            onChange={(_, val) => {
              if (val) {
                setChartHeight(val);
                localStorage.setItem('forecast:chartHeight', String(val));
              }
            }}
            sx={{ height: 26 }}
          >
            <ToggleButton value={620} sx={{ textTransform: 'none', px: 1, py: 0, fontSize: '0.72rem' }}>
              Standard
            </ToggleButton>
            <ToggleButton value={760} sx={{ textTransform: 'none', px: 1, py: 0, fontSize: '0.72rem', fontWeight: 700 }}>
              Tall (Default)
            </ToggleButton>
            <ToggleButton value={920} sx={{ textTransform: 'none', px: 1, py: 0, fontSize: '0.72rem' }}>
              Expanded
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box ref={debtChartRef} sx={{ width: '100%', height: '100%' }} />
      </Paper>

      {/* Chart 2: Monthly Cashflow */}
      <Paper
        sx={{
          p: { xs: 1.25, sm: 3 },
          mb: { xs: 2, sm: 3 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: (theme) => `${theme.shape.borderRadius}px`,
          boxShadow: 'none',
          height: { xs: 350, sm: 440, md: 540 },
        }}
      >
        <Box ref={cashflowChartRef} sx={{ width: '100%', height: '100%' }} />
      </Paper>

      <ForecastCharts
        points={points}
        goals={goals}
        debtChartRef={debtChartRef}
        cashflowChartRef={cashflowChartRef}
        onMonthClick={setSelectedMonthBreakdown}
      />
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: { xs: 'visible', md: 'hidden' } }}>
      {/* Top Toolbar */}
      <Stack
        direction="row"
        spacing={{ xs: 0.75, md: 2 }}
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2, flexShrink: 0, width: '100%' }}
      >
        {/* Left Side: Settings toggle, Account selector & Real Data Status */}
        <Stack direction="row" spacing={{ xs: 0.75, sm: 1 }} alignItems="center" flexWrap="nowrap" sx={{ minWidth: 0, flex: { xs: 1, md: 'initial' }, overflow: 'hidden' }}>
          <ToggleButtonGroup size="small" sx={{ height: { xs: 42, sm: 36 }, flexShrink: 0 }}>
            <ToggleButton
              value="settings"
              selected={settingsVisible}
              onClick={toggleSettings}
              sx={{
                gap: 0.5,
                textTransform: 'none',
                px: { xs: 0.9, sm: 1.25 },
                fontWeight: 600,
                fontSize: { xs: '0.78rem', sm: '0.8125rem' },
                height: { xs: 42, sm: 36 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
              title="Toggle Simulator Settings Panel"
            >
              <SettingsIcon sx={{ fontSize: 16 }} />
              Settings
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Bank Account Dropdown Selector with Checkboxes */}
          <AccountFilterDropdown
            checkingAccounts={checkingAccounts}
            selectedAccountIds={selectedAccountIds}
            isAllSelected={isAllSelected}
            onChangeSelectedIds={setSelectedAccountIds}
          />

          {/* Desktop-only Real Data Grounding Badge, Reset & Sync */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ display: { xs: 'none', md: 'flex' } }}
          >
            {overriddenCount > 0 ? (
              <Chip
                icon={<EditIcon fontSize="small" />}
                label={`${overriddenCount} Overridden`}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            ) : (
              <Chip
                icon={<CheckCircleOutlineIcon fontSize="small" />}
                label="Real Data Synced"
                size="small"
                color="success"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            )}

            {overriddenCount > 0 && (
              <Tooltip title="Reset all overridden settings back to actual account balances and detected spending data">
                <Button
                  size="small"
                  variant="outlined"
                  onClick={resetToRealData}
                  sx={UNIFORM_TOOLBAR_BUTTON_SX}
                >
                  <RestartAltIcon sx={{ fontSize: 16 }} />
                  Reset
                </Button>
              </Tooltip>
            )}

            <Tooltip title="Synchronize forecast with newly imported accounts and transactions">
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  loadRealData();
                  setSnackbarMessage('Synchronized forecast with latest accounts and transactions.');
                }}
                sx={UNIFORM_TOOLBAR_BUTTON_SX}
              >
                <SyncIcon sx={{ fontSize: 16 }} />
                Sync
              </Button>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Center: Scenario Selector (Desktop only) */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          sx={{ display: { xs: 'none', md: 'flex' }, flexGrow: 1 }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              height: 36,
              px: 1.25,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              bgcolor: 'background.paper',
            }}
          >
            <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
              <Select
                variant="standard"
                disableUnderline
                value={selectedScenarioId}
                displayEmpty
                onChange={(e) => {
                  const id = e.target.value as number;
                  const s = scenarios.find((x) => x.id === id);
                  if (s) {
                    setSelectedScenarioId(s.id || '');
                    setScenarioName(s.name);
                    useForecastStore.getState().loadScenario(s);
                  } else {
                    setSelectedScenarioId('');
                  }
                }}
                renderValue={(selected) => {
                  if (!selected) {
                    return (
                      <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary', fontWeight: 600, fontSize: '0.8125rem' }}>
                        Unsaved Scenario
                      </Typography>
                    );
                  }
                  return (
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                      {scenarios.find((s) => s.id === selected)?.name}
                    </Typography>
                  );
                }}
              >
                <MenuItem value="">
                  <em>Unsaved Scenario</em>
                </MenuItem>
                {scenarios.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title={selectedScenarioId ? 'Update Scenario' : 'Save Scenario'}>
              <IconButton size="small" onClick={handleQuickSave} color="primary" sx={{ p: 0.5 }}>
                <SaveIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="More Options">
              <IconButton size="small" onClick={(e) => setSaveMenuAnchorEl(e.currentTarget)} sx={{ p: 0.5 }}>
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>

        {/* Right Side: Money Flow Toggle + Mobile Overflow Menu / Desktop Number Format */}
        <Stack direction="row" spacing={{ xs: 0.5, sm: 1 }} alignItems="center" flexShrink={0}>
          <ToggleButtonGroup
            size="small"
            value={abbreviateNumbers ? 'compact' : 'exact'}
            exclusive
            onChange={(_, val) => {
              if (val) {
                const isCompact = val === 'compact';
                setAbbreviateNumbers(isCompact);
                localStorage.setItem('forecast:abbreviateNumbers', String(isCompact));
              }
            }}
            sx={{
              display: { xs: 'none', md: 'inline-flex' },
              height: 36,
              '& .MuiToggleButtonGroup-grouped': {
                borderColor: 'divider',
              },
            }}
          >
            <ToggleButton
              value="compact"
              sx={{
                textTransform: 'none',
                px: 1.25,
                height: 36,
                fontWeight: 600,
                fontSize: '0.8125rem',
                borderColor: 'divider',
                borderTopLeftRadius: (theme) => `${theme.shape.borderRadius}px`,
                borderBottomLeftRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
              title="Compact abbreviated figures (e.g. $1.12M)"
            >
              $1.2M
            </ToggleButton>
            <ToggleButton
              value="exact"
              sx={{
                textTransform: 'none',
                px: 1.25,
                height: 36,
                fontWeight: 600,
                fontSize: '0.8125rem',
                borderColor: 'divider',
                borderTopRightRadius: (theme) => `${theme.shape.borderRadius}px`,
                borderBottomRightRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
              title="Full exact figures (e.g. $1,123,020)"
            >
              Exact
            </ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup size="small" sx={{ height: { xs: 42, sm: 36 } }}>
            <ToggleButton
              value="destinations"
              selected={destinationsVisible}
              onClick={toggleDestinations}
              sx={{
                gap: 0.5,
                textTransform: 'none',
                px: { xs: 0.9, sm: 1.25 },
                fontWeight: 600,
                fontSize: { xs: '0.78rem', sm: '0.8125rem' },
                height: { xs: 42, sm: 36 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: (theme) => `${theme.shape.borderRadius}px`,
              }}
              title="Toggle Destination Accounts & Money Flow Panel"
            >
              <SavingsIcon sx={{ fontSize: 16 }} />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                Money{' '}
              </Box>
              Flow ({destinations.filter((d) => d.enabled).length})
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Mobile Consolidated Actions Button (Scenarios, Sync, Reset, Number Format) */}
          <Button
            size="small"
            variant="outlined"
            onClick={(e) => setSaveMenuAnchorEl(e.currentTarget)}
            sx={{
              ...UNIFORM_TOOLBAR_BUTTON_SX,
              display: { xs: 'inline-flex', md: 'none' },
              minWidth: 34,
              px: 0.5,
            }}
            aria-label="Forecast options"
          >
            <MoreVertIcon sx={{ fontSize: 18 }} />
          </Button>
        </Stack>

        {/* Shared Scenario & Mobile Actions Menu */}
        <Menu
          anchorEl={saveMenuAnchorEl}
          open={saveMenuOpen}
          onClose={() => setSaveMenuAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { minWidth: 220 } }}
        >
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: 0.4 }}
            >
              DATA &amp; DISPLAY
            </Typography>
            <MenuItem
              onClick={() => {
                setSaveMenuAnchorEl(null);
                loadRealData();
                setSnackbarMessage('Synchronized forecast with latest accounts and transactions.');
              }}
              sx={{ fontSize: '0.8125rem' }}
            >
              <SyncIcon sx={{ fontSize: 16, mr: 1 }} />
              Sync Real Data
            </MenuItem>
            {overriddenCount > 0 && (
              <MenuItem
                onClick={() => {
                  setSaveMenuAnchorEl(null);
                  resetToRealData();
                }}
                sx={{ fontSize: '0.8125rem', color: 'warning.main', fontWeight: 600 }}
              >
                <RestartAltIcon sx={{ fontSize: 16, mr: 1 }} />
                Reset Overrides ({overriddenCount})
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                const next = !abbreviateNumbers;
                setAbbreviateNumbers(next);
                localStorage.setItem('forecast:abbreviateNumbers', String(next));
                setSaveMenuAnchorEl(null);
              }}
              sx={{ fontSize: '0.8125rem' }}
            >
              Format: {abbreviateNumbers ? 'Switch to Exact ($1,234,567)' : 'Switch to Compact ($1.2M)'}
            </MenuItem>
            <Divider />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700, letterSpacing: 0.4 }}
            >
              SCENARIOS
            </Typography>
            <MenuItem
              onClick={() => {
                setSaveMenuAnchorEl(null);
                handleQuickSave();
              }}
              sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'primary.main' }}
            >
              <SaveIcon sx={{ fontSize: 16, mr: 1 }} />
              {selectedScenarioId ? 'Update Current Scenario' : 'Quick Save Scenario'}
            </MenuItem>
            {scenarios.map((s) => (
              <MenuItem
                key={s.id}
                selected={selectedScenarioId === s.id}
                onClick={() => {
                  setSelectedScenarioId(s.id || '');
                  setScenarioName(s.name);
                  useForecastStore.getState().loadScenario(s);
                  setSaveMenuAnchorEl(null);
                }}
                sx={{ fontSize: '0.8125rem' }}
              >
                Load: {s.name}
              </MenuItem>
            ))}
            <Divider />
          </Box>
          <MenuItem
            onClick={() => {
              setSaveMenuAnchorEl(null);
              setScenarioName(selectedScenarioId ? `${scenarios.find((s) => s.id === selectedScenarioId)?.name} (Copy)` : '');
              setSaveDialogOpen(true);
            }}
            sx={{ fontSize: '0.8125rem' }}
          >
            Save As New...
          </MenuItem>
          <MenuItem
            disabled={!selectedScenarioId}
            onClick={() => {
              setSaveMenuAnchorEl(null);
              if (selectedScenarioId) {
                deleteScenario.mutate(selectedScenarioId as number, {
                  onSuccess: () => {
                    setSelectedScenarioId('');
                    setScenarioName('');
                    setSnackbarMessage('Scenario deleted');
                  },
                });
              }
            }}
            sx={{ color: 'error.main', fontSize: '0.8125rem' }}
          >
            Delete Scenario
          </MenuItem>
        </Menu>
      </Stack>

      {/* Mobile / Foldable Slide-Over Drawers for Inputs & Money Flow */}
      {isMobile && (
        <>
          <Drawer
            anchor="left"
            open={settingsVisible}
            onClose={() => setSettingsVisible(false)}
            PaperProps={{ sx: { width: { xs: '100%', sm: 380 } } }}
            sx={{ zIndex: (t) => t.zIndex.drawer + 2 }}
          >
            <ForecastSettingsPanel
              effectiveNetIncome={effectiveNetIncome}
              taxesDeducted={taxesDeducted}
              lastPointHomeEquity={lastPoint?.home_equity || 0}
              monthLabels={safePoints.map((p) => p.month_label)}
              onToggleSettings={() => setSettingsVisible(false)}
              onOpenAddIncomeStreamDialog={() => setAddIncomeStreamDialogOpen(true)}
            />
          </Drawer>
          <Drawer
            anchor="right"
            open={destinationsVisible}
            onClose={() => setDestinationsVisible(false)}
            PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}
            sx={{ zIndex: (t) => t.zIndex.drawer + 2 }}
          >
            <MoneyFlowGoalsPanel
              destinations={destinations}
              goals={goals}
              incomeStreams={incomeStreams}
              availableAccounts={availableAccounts}
              totalStreamInvested={totalStreamInvested}
              netIncome={netIncome}
              totalLivingAndDebt={totalLivingAndDebt}
              availableToAllocate={availableToAllocate}
              totalDestinationFlow={totalDestinationFlow}
              totalGoalFlow={totalGoalFlow}
              monthlySafeRemainder={monthlySafeRemainder}
              onToggleDestinations={() => setDestinationsVisible(false)}
              onOpenAddDestDialog={() => setAddDestDialogOpen(true)}
              updateDestination={updateDestination}
              setDestinations={useForecastStore.getState().setDestinations}
              addDestination={addDestination}
              removeDestination={removeDestination}
              setGoals={setGoals}
            />
          </Drawer>
        </>
      )}

      {isMobile ? (
        centerForecastContent
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative', overflowX: 'auto' }}>
          <PanelGroup
            key={`forecast-${panelIds.join('-')}`}
            orientation="horizontal"
            defaultLayout={defaultLayout}
            style={{ height: '100%', minWidth: minGroupWidth }}
            onLayoutChanged={(sizes) => {
              onLayoutChanged(sizes);
              if (debtChartRef.current) echarts.getInstanceByDom(debtChartRef.current)?.resize();
              if (cashflowChartRef.current) echarts.getInstanceByDom(cashflowChartRef.current)?.resize();
            }}
          >
            {/* LEFT PANEL: Simulator Settings & Grounded Baseline Overrides */}
            {settingsVisible && (
              <Panel id="settings" defaultSize={26} minSize={20} style={{ minWidth: 340 }}>
                <ForecastSettingsPanel
                  effectiveNetIncome={effectiveNetIncome}
                  taxesDeducted={taxesDeducted}
                  lastPointHomeEquity={lastPoint?.home_equity || 0}
                  monthLabels={safePoints.map((p) => p.month_label)}
                  onToggleSettings={toggleSettings}
                  onOpenAddIncomeStreamDialog={() => setAddIncomeStreamDialogOpen(true)}
                />
              </Panel>
            )}

            {settingsVisible && (
              <PanelResizeHandle
                style={{ width: 16, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Box sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: 'divider' }} />
              </PanelResizeHandle>
            )}

            {/* CENTER PANEL: KPIs, Charts, Visual Waterfall */}
            <Panel id="charts" defaultSize={48} minSize={25}>
              {centerForecastContent}
            </Panel>

            {destinationsVisible && (
              <PanelResizeHandle
                style={{ width: 16, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Box sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: 'divider' }} />
              </PanelResizeHandle>
            )}

            {/* RIGHT PANEL: Destination Accounts & Money Flow Manager */}
            {destinationsVisible && (
              <Panel id="destinations" defaultSize={26} minSize={22} style={{ minWidth: 360 }}>
                <MoneyFlowGoalsPanel
                  destinations={destinations}
                  goals={goals}
                  incomeStreams={incomeStreams}
                  availableAccounts={availableAccounts}
                  totalStreamInvested={totalStreamInvested}
                  netIncome={netIncome}
                  totalLivingAndDebt={totalLivingAndDebt}
                  availableToAllocate={availableToAllocate}
                  totalDestinationFlow={totalDestinationFlow}
                  totalGoalFlow={totalGoalFlow}
                  monthlySafeRemainder={monthlySafeRemainder}
                  onToggleDestinations={toggleDestinations}
                  onOpenAddDestDialog={() => setAddDestDialogOpen(true)}
                  updateDestination={updateDestination}
                  setDestinations={useForecastStore.getState().setDestinations}
                  addDestination={addDestination}
                  removeDestination={removeDestination}
                  setGoals={setGoals}
                />
              </Panel>
            )}
          </PanelGroup>
        </Box>
      )}

      {/* Add Destination Account Dialog */}
      <AddDestinationDialog
        open={addDestDialogOpen}
        onClose={() => setAddDestDialogOpen(false)}
        onAddDestination={addDestination}
      />

      {/* Add Income Stream Dialog */}
      <AddIncomeStreamDialog
        open={addIncomeStreamDialogOpen}
        onClose={() => setAddIncomeStreamDialogOpen(false)}
        availableAccounts={availableAccounts}
        onAddIncomeStream={addIncomeStream}
      />

      {/* Save Scenario Dialog */}
      <SaveScenarioDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        scenarioName={scenarioName}
        setScenarioName={setScenarioName}
        onSaveScenario={(name) => saveScenarioToDb(name)}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
      />

      {selectedMonthBreakdown && (
        <FutureMonthBreakdownDialog
          monthKey={selectedMonthBreakdown}
          onClose={() => setSelectedMonthBreakdown(null)}
        />
      )}
    </Box>
  );
}
