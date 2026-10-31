import { useMemo, useEffect } from 'react';
import {
  useCategories,
  useBudgets,
  useConsolidatedRecurringMerchants,
  useCategoryTrailingAverages,
  useHistoricalSpendByCategory,
  useHistoricalMonthlyIncome,
  useRecurrenceMap,
} from './queries';
import { useFilters } from '../stores/store';
import { useBudgetStore } from '../stores/budgetStore';
import { useForecastStore, computeTotalNetIncome } from '../stores/forecastStore';
import { loadForecastBaselineData } from '../domain/incomeStreams';
import {
  computeCategoryProjections,
  computeIncomeProjections,
  consolidateRecurringMerchants,
  projectMonthlyIncome,
  type CategoryProjection,
  type IncomeStreamProjection,
} from '../domain/forecastSpending';
import { monthKey as getMonthKey } from '../lib';
import type { Category, Budget, RecurrenceInfo } from '../types';

export interface CurrentMonthForecastSummary {
  dayOfMonth: number;
  daysInMonth: number;
  actualSpend: number;
  remainingSpend: number;
  paidRecurringSpend: number;
  unpaidRecurringSpend: number;
  projectedSpend: number;
  actualIncome: number;
  remainingIncome: number;
  projectedIncome: number;
  projectedNet: number;
  pctSpent: number;
  pctIncomeReceived: number;
}

export function useSpendingForecast(options?: {
  categories?: Category[];
  budgets?: Budget[];
  recurrenceMap?: Map<string, RecurrenceInfo>;
  recentAvgIncome?: number;
  accountId?: number | number[] | null;
  disabledCategories?: string[];
}) {
  const scopedAccountScope = useMemo(() => {
    if (options?.accountId == null) return undefined;
    if (Array.isArray(options.accountId)) {
      return options.accountId.length > 0 ? options.accountId : [-1];
    }
    return options.accountId;
  }, [options?.accountId]);

  const { data: fetchedCategories = [] } = useCategories();
  const { data: fetchedBudgets = [] } = useBudgets();
  const { data: rawConsolidatedMerchants = [] } = useConsolidatedRecurringMerchants(scopedAccountScope);
  const { data: trailingAverages = [] } = useCategoryTrailingAverages(scopedAccountScope);
  const { data: historicalSpendData = [] } = useHistoricalSpendByCategory(scopedAccountScope);
  const { data: historicalIncomeData = [] } = useHistoricalMonthlyIncome(scopedAccountScope);
  const demoMode = useFilters((s) => s.demoMode);
  const disabledCategories: string[] = useMemo(
    () => options?.disabledCategories ?? [],
    [options?.disabledCategories]
  );
  const enabledAccountIds = useMemo(() => {
    if (scopedAccountScope === undefined) return undefined;
    return Array.isArray(scopedAccountScope) ? scopedAccountScope : [scopedAccountScope];
  }, [scopedAccountScope]);
  const { data: recurrenceMapObj = {} } = useRecurrenceMap(demoMode, scopedAccountScope);
  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);

  const incomeStreams = useForecastStore((s) => s.incomeStreams);
  const forecastTaxRate = useForecastStore((s) => s.taxRate);
  const isBaselineLoaded = useForecastStore((s) => s.realBaseline.isLoaded);
  const setBaselineData = useForecastStore((s) => s.setBaselineData);

  useEffect(() => {
    if (!isBaselineLoaded) {
      loadForecastBaselineData()
        .then(({ baseline, destinations, incomeStreams: detectedStreams }) => {
          setBaselineData(baseline, destinations, detectedStreams);
        })
        .catch(() => {});
    }
  }, [isBaselineLoaded, setBaselineData]);

  const categories = options?.categories || fetchedCategories;
  const rawBudgets = options?.budgets || fetchedBudgets;

  // When isolating a subset of bank accounts, scope variable category budgets to those accounts' trailing averages
  // unless options.budgets was explicitly pre-scoped by the caller.
  const budgets = useMemo(() => {
    if (scopedAccountScope === undefined) return rawBudgets;
    const trailingMap = new Map<string, number>();
    for (const t of trailingAverages) {
      trailingMap.set(t.category, t.average);
    }
    const byCat = new Map<string, Budget>();
    for (const b of rawBudgets) {
      byCat.set(b.category, {
        ...b,
        monthlyAmount: Math.round((trailingMap.get(b.category) || 0) * 100) / 100,
        userSet: false,
      });
    }
    for (const c of categories) {
      if (c.type === 'spend' && c.defaultRecurrence !== 'recurring' && !byCat.has(c.name)) {
        byCat.set(c.name, {
          category: c.name,
          monthlyAmount: Math.round((trailingMap.get(c.name) || 0) * 100) / 100,
          userSet: false,
        });
      }
    }
    return Array.from(byCat.values());
  }, [rawBudgets, categories, scopedAccountScope, trailingAverages]);

  const derivedRecurrenceMap = useMemo(
    () => new Map<string, RecurrenceInfo>(Object.entries(recurrenceMapObj)),
    [recurrenceMapObj]
  );
  const recurrenceMap = options?.recurrenceMap || derivedRecurrenceMap;

  const consolidatedMerchants = useMemo(() => {
    const list = consolidateRecurringMerchants(rawConsolidatedMerchants, recurrenceMap);
    if (!enabledAccountIds) return list;
    const allowed = new Set(enabledAccountIds);
    return list.filter((m) => m.accountId !== undefined && allowed.has(m.accountId));
  }, [rawConsolidatedMerchants, recurrenceMap, enabledAccountIds]);

  const forecastRecurringIncome = useMemo(() => {
    const enabledSet = enabledAccountIds && enabledAccountIds.length > 0 ? new Set(enabledAccountIds) : null;
    const scopedSet =
      scopedAccountScope !== undefined
        ? new Set(Array.isArray(scopedAccountScope) ? scopedAccountScope : [scopedAccountScope])
        : null;
    const activeStreams = incomeStreams.filter(
      (s) =>
        s.enabled &&
        (scopedSet
          ? s.accountId !== undefined && scopedSet.has(s.accountId)
          : !enabledSet || s.accountId === undefined || enabledSet.has(s.accountId))
    );
    if (activeStreams.length === 0) return 0;
    return computeTotalNetIncome(activeStreams, forecastTaxRate);
  }, [incomeStreams, forecastTaxRate, enabledAccountIds, scopedAccountScope]);

  const { historicalMonthlySpend, historicalCategoryAnnualAvg } = useMemo(() => {
    const monthlySpend = new Map<string, Map<string, number>>();
    const categoryTotals = new Map<string, number>();
    const monthSet = new Set<string>();

    for (const d of historicalSpendData) {
      monthSet.add(d.month);
      let catMap = monthlySpend.get(d.month);
      if (!catMap) {
        catMap = new Map<string, number>();
        monthlySpend.set(d.month, catMap);
      }
      const val = Math.abs(d.total);
      catMap.set(d.key, val);
    }

    const recent12Months = Array.from(monthSet).sort().slice(-12);
    for (const m of recent12Months) {
      const catMap = monthlySpend.get(m);
      if (!catMap) continue;
      for (const [cat, val] of catMap.entries()) {
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + val);
      }
    }

    const monthCount = Math.max(1, recent12Months.length);
    const annualAvg = new Map<string, number>();
    for (const [cat, sum] of categoryTotals.entries()) {
      annualAvg.set(cat, Math.round(sum / monthCount));
    }

    return { historicalMonthlySpend: monthlySpend, historicalCategoryAnnualAvg: annualAvg };
  }, [historicalSpendData]);

  const { historicalMonthlyIncome, historicalAnnualAvgIncome } = useMemo(() => {
    const monthlyIncome = new Map<string, number>();

    for (const d of historicalIncomeData) {
      const val = Math.abs(d.total);
      if (val > 0) {
        monthlyIncome.set(d.month, val);
      }
    }

    const recent12IncomeMonths = Array.from(monthlyIncome.keys()).sort().slice(-12);
    const totalIncome = recent12IncomeMonths.reduce((sum, m) => sum + (monthlyIncome.get(m) || 0), 0);
    const annualAvg = recent12IncomeMonths.length > 0 ? Math.round(totalIncome / recent12IncomeMonths.length) : 0;
    return { historicalMonthlyIncome: monthlyIncome, historicalAnnualAvgIncome: annualAvg };
  }, [historicalIncomeData]);

  const currentCalMonth = useMemo(() => {
    const sysMonth = getMonthKey(new Date());
    let maxDataMonth = '';
    for (const m of historicalMonthlySpend.keys()) {
      if (m > maxDataMonth) maxDataMonth = m;
    }
    for (const m of historicalMonthlyIncome.keys()) {
      if (m > maxDataMonth) maxDataMonth = m;
    }
    return maxDataMonth > sysMonth ? maxDataMonth : sysMonth;
  }, [historicalMonthlySpend, historicalMonthlyIncome]);

  const incomeCategoryColor = useMemo(() => {
    const incCat = (categories || []).find((c) => c.type === 'income' || c.name === 'Income');
    return incCat?.color || '#2e7d32';
  }, [categories]);

  const currentMonthProjections = useMemo(() => {
    const actualSpendMap = historicalMonthlySpend.get(currentCalMonth) || new Map<string, number>();
    return computeCategoryProjections({
      categories,
      budgets,
      consolidatedMerchants,
      trailingAverages,
      disabledCategories,
      excludedBudgetCategories,
      excludedMerchants,
      targetMonthKey: currentCalMonth,
      historicalMonthlySpend,
      historicalCategoryAnnualAvg,
      actualSpendByCategory: actualSpendMap,
      recurrenceMap,
    });
  }, [
    categories,
    budgets,
    consolidatedMerchants,
    trailingAverages,
    disabledCategories,
    excludedBudgetCategories,
    excludedMerchants,
    currentCalMonth,
    historicalMonthlySpend,
    historicalCategoryAnnualAvg,
    recurrenceMap,
  ]);

  const currentMonthIncomeProjections = useMemo(() => {
    const actualIncome = Math.round(historicalMonthlyIncome.get(currentCalMonth) || 0);
    return computeIncomeProjections({
      incomeStreams,
      taxRate: forecastTaxRate,
      targetMonthKey: currentCalMonth,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome: options?.recentAvgIncome ?? historicalAnnualAvgIncome,
      actualIncomeToDate: actualIncome,
      enabledAccountIds,
      incomeCategoryColor,
    });
  }, [
    incomeStreams,
    forecastTaxRate,
    currentCalMonth,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    options?.recentAvgIncome,
    enabledAccountIds,
    incomeCategoryColor,
  ]);

  const currentMonthForecastSummary = useMemo<CurrentMonthForecastSummary>(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    let actualSpend = 0;
    let remainingSpend = 0;
    let paidRecurringSpend = 0;
    let unpaidRecurringSpend = 0;
    let projectedSpend = 0;

    for (const p of currentMonthProjections.values()) {
      actualSpend += p.actualToDate || 0;
      remainingSpend += p.remaining || 0;
      paidRecurringSpend += p.paidRecurring || 0;
      unpaidRecurringSpend += p.unpaidRecurring || 0;
      projectedSpend += p.total;
    }

    const actualIncome = Math.round(historicalMonthlyIncome.get(currentCalMonth) || 0);
    const streamProjectedIncome = currentMonthIncomeProjections.reduce((sum, p) => sum + p.total, 0);
    const baselineIncome = projectMonthlyIncome({
      monthKey: currentCalMonth,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome: options?.recentAvgIncome ?? historicalAnnualAvgIncome,
      recurringIncome: forecastRecurringIncome,
    }).amount;
    const projectedIncome = Math.max(actualIncome, streamProjectedIncome, baselineIncome);
    const remainingIncome = Math.max(0, projectedIncome - actualIncome);
    const projectedNet = projectedIncome - projectedSpend;
    const pctSpent = projectedSpend > 0 ? Math.min(100, Math.round((actualSpend / projectedSpend) * 100)) : 0;
    const pctIncomeReceived = projectedIncome > 0 ? Math.min(100, Math.round((actualIncome / projectedIncome) * 100)) : 0;

    return {
      dayOfMonth,
      daysInMonth,
      actualSpend,
      remainingSpend,
      paidRecurringSpend,
      unpaidRecurringSpend,
      projectedSpend,
      actualIncome,
      remainingIncome,
      projectedIncome,
      projectedNet,
      pctSpent,
      pctIncomeReceived,
    };
  }, [
    currentMonthProjections,
    currentMonthIncomeProjections,
    historicalMonthlyIncome,
    currentCalMonth,
    historicalAnnualAvgIncome,
    options?.recentAvgIncome,
    forecastRecurringIncome,
  ]);

  const getProjectionsForMonth = useMemo(() => {
    return (targetMonthKey: string): Map<string, CategoryProjection> => {
      if (targetMonthKey === currentCalMonth) {
        return currentMonthProjections;
      }
      return computeCategoryProjections({
        categories,
        budgets,
        consolidatedMerchants,
        trailingAverages,
        disabledCategories,
        excludedBudgetCategories,
        excludedMerchants,
        targetMonthKey,
        historicalMonthlySpend,
        historicalCategoryAnnualAvg,
        recurrenceMap,
      });
    };
  }, [
    currentCalMonth,
    currentMonthProjections,
    categories,
    budgets,
    consolidatedMerchants,
    trailingAverages,
    disabledCategories,
    excludedBudgetCategories,
    excludedMerchants,
    historicalMonthlySpend,
    historicalCategoryAnnualAvg,
    recurrenceMap,
  ]);

  const getIncomeProjectionsForMonth = useMemo(() => {
    return (targetMonthKey: string): IncomeStreamProjection[] => {
      if (targetMonthKey === currentCalMonth) {
        return currentMonthIncomeProjections;
      }
      return computeIncomeProjections({
        incomeStreams,
        taxRate: forecastTaxRate,
        targetMonthKey,
        historicalMonthlyIncome,
        historicalAnnualAvgIncome,
        recentAvgIncome: options?.recentAvgIncome ?? historicalAnnualAvgIncome,
        enabledAccountIds,
        incomeCategoryColor,
      });
    };
  }, [
    currentCalMonth,
    currentMonthIncomeProjections,
    incomeStreams,
    forecastTaxRate,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    options?.recentAvgIncome,
    enabledAccountIds,
    incomeCategoryColor,
  ]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const m of historicalMonthlySpend.keys()) set.add(m);
    for (const m of historicalMonthlyIncome.keys()) set.add(m);
    return Array.from(set).sort().reverse();
  }, [historicalMonthlySpend, historicalMonthlyIncome]);

  return {
    categories,
    budgets,
    consolidatedMerchants,
    trailingAverages,
    recurrenceMap,
    disabledCategories,
    excludedBudgetCategories,
    excludedMerchants,
    historicalSpendData,
    historicalIncomeData,
    historicalMonthlySpend,
    historicalCategoryAnnualAvg,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    availableMonths,
    incomeStreams,
    forecastTaxRate,
    forecastRecurringIncome,
    monthlyBaselineIncome: forecastRecurringIncome > 0 ? forecastRecurringIncome : historicalAnnualAvgIncome,
    currentCalMonth,
    currentMonthProjections,
    currentMonthIncomeProjections,
    currentMonthForecastSummary,
    getProjectionsForMonth,
    getIncomeProjectionsForMonth,
  };
}

