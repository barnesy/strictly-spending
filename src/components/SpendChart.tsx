import { useMemo, useEffect, useRef } from 'react';
import { Box, Typography, useTheme, useMediaQuery } from '@mui/material';
import * as echarts from '../utils/echarts';
import { monthLabel, usd } from '../lib';
import { ACCOUNT_COLORS } from '../theme';
import type { Account, Category } from '../types';
import type { SpendChartGroup, DashboardAggregates } from '../api';
import type { GroupBy } from '../stores/store';
import type { RecurrenceInfo } from '../domain/recurrence';
import { useFilters } from '../stores/store';
import { useSpendingForecast } from '../hooks/useSpendingForecast';
import { generateFutureMonths, projectMonthlyIncome, type CategoryProjection, type IncomeStreamProjection } from '../domain/forecastSpending';

function makeFutureBarItem(value: number, color: string) {
  return {
    value,
    itemStyle: {
      color,
      opacity: 0.65,
    },
  };
}

function makeCurrentRemainingSeries(
  label: string,
  color: string,
  remVal: number,
  fullMonthList: string[],
  currentCalMonth: string
) {
  return {
    id: `${label}__rem`,
    label,
    color,
    stack: 'spend',
    data: fullMonthList.map((m) =>
      m === currentCalMonth
        ? {
            value: remVal,
            itemStyle: {
              color,
              opacity: 0.42,
              borderColor: color,
              borderWidth: 1,
              borderType: 'dashed',
            },
          }
        : 0
    ),
  };
}

/** SpendChart component with categorical forecasting and fluid ResizeObserver integration */
interface Props {
  monthList: string[];
  spendChartData: SpendChartGroup[];
  incomeChartData: SpendChartGroup[];
  dashboardAggregates: DashboardAggregates;
  accounts: Account[];
  categories: Category[];
  groupBy: GroupBy;
  recurrenceMap: Map<string, RecurrenceInfo>;
  isSingleMonth?: boolean;
  onMonthClick?: (monthKey: string) => void;
  onFutureMonthClick?: (monthKey: string) => void;
}

export default function SpendChart({
  monthList,
  spendChartData,
  incomeChartData,
  accounts,
  categories,
  groupBy,
  recurrenceMap,
  isSingleMonth = false,
  onMonthClick,
  onFutureMonthClick,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const enabledAccountIds = useFilters((s) => s.enabledAccountIds);
  const showRunway = useFilters((s) => s.showRunway);
  const spendOnly = useFilters((s) => s.spendOnly);
  const transactionType = useFilters((s) => s.transactionType);
  const forecastHorizon = useFilters((s) => s.forecastHorizon);

  // Average positive monthly income from current window as additional fallback
  const avgHistoricalIncome = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const d of incomeChartData) {
      const val = Math.abs(d.total);
      if (val > 0) {
        sum += val;
        count++;
      }
    }
    return count > 0 ? Math.round(sum / count) : 0;
  }, [incomeChartData]);

  const {
    budgets,
    consolidatedMerchants,
    disabledCategories,
    excludedBudgetCategories,
    excludedMerchants,
    historicalMonthlyIncome,
    historicalAnnualAvgIncome,
    forecastRecurringIncome,
    currentCalMonth,
    currentMonthProjections,
    currentMonthIncomeProjections,
    getProjectionsForMonth,
    getIncomeProjectionsForMonth,
  } = useSpendingForecast({ categories, recurrenceMap, recentAvgIncome: avgHistoricalIncome });

  const isCurrentMonthInList = useMemo(() => monthList.includes(currentCalMonth), [monthList, currentCalMonth]);
  const isCurrentMonthForecasted = forecastHorizon > 0 && isCurrentMonthInList;

  // 1. Generate future timeline months when forecast is active
  const futureMonths = useMemo(() => {
    if (forecastHorizon <= 0 || monthList.length === 0) return [];
    if (forecastHorizon < 1) {
      return isCurrentMonthInList ? [] : [currentCalMonth];
    }
    return generateFutureMonths(monthList[monthList.length - 1], Math.floor(forecastHorizon));
  }, [monthList, forecastHorizon, isCurrentMonthInList, currentCalMonth]);

  const fullMonthList = useMemo(() => [...monthList, ...futureMonths], [monthList, futureMonths]);
  const futureMonthSet = useMemo(() => new Set(futureMonths), [futureMonths]);

  // 2. Compute month-specific projections (spend & income)
  const categoryProjectionsByMonth = useMemo(() => {
    const map = new Map<string, Map<string, CategoryProjection>>();
    map.set(currentCalMonth, currentMonthProjections);
    for (const m of futureMonths) {
      map.set(m, getProjectionsForMonth(m));
    }
    return map;
  }, [currentCalMonth, currentMonthProjections, futureMonths, getProjectionsForMonth]);

  const incomeProjectionsByMonth = useMemo(() => {
    const map = new Map<string, IncomeStreamProjection[]>();
    map.set(currentCalMonth, currentMonthIncomeProjections);
    for (const m of futureMonths) {
      map.set(m, getIncomeProjectionsForMonth(m));
    }
    return map;
  }, [currentCalMonth, currentMonthIncomeProjections, futureMonths, getIncomeProjectionsForMonth]);

  // Baseline category projections (first future month or current month baseline)
  const categoryProjections = useMemo(() => {
    const target = futureMonths[0] || currentCalMonth;
    return getProjectionsForMonth(target);
  }, [futureMonths, currentCalMonth, getProjectionsForMonth]);

  const totalProjectedMonthlySpend = useMemo(() => {
    return Array.from(categoryProjections.values()).reduce((sum, p) => sum + p.total, 0);
  }, [categoryProjections]);

  const currentMonthRemainingTotal = useMemo(() => {
    return Array.from(currentMonthProjections.values()).reduce((sum, p) => sum + (p.remaining || 0), 0);
  }, [currentMonthProjections]);

  const currentMonthProjectedIncomeTotal = useMemo(() => {
    const fromStreams = currentMonthIncomeProjections.reduce((sum, p) => sum + p.total, 0);
    if (fromStreams > 0) return fromStreams;
    return projectMonthlyIncome({
      monthKey: currentCalMonth,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome: avgHistoricalIncome,
      recurringIncome: forecastRecurringIncome,
    }).amount;
  }, [currentMonthIncomeProjections, currentCalMonth, historicalMonthlyIncome, historicalAnnualAvgIncome, avgHistoricalIncome, forecastRecurringIncome]);

  const baselineProjectedMonthlyIncome = useMemo(() => {
    const target = futureMonths[0] || currentCalMonth;
    const streams = incomeProjectionsByMonth.get(target) || currentMonthIncomeProjections;
    const fromStreams = streams.reduce((sum, p) => sum + p.total, 0);
    if (fromStreams > 0) return fromStreams;
    return projectMonthlyIncome({
      monthKey: target,
      historicalMonthlyIncome,
      historicalAnnualAvgIncome,
      recentAvgIncome: avgHistoricalIncome,
      recurringIncome: forecastRecurringIncome,
    }).amount;
  }, [futureMonths, currentCalMonth, incomeProjectionsByMonth, currentMonthIncomeProjections, historicalMonthlyIncome, historicalAnnualAvgIncome, avgHistoricalIncome, forecastRecurringIncome]);

  const recurringProjected = useMemo(() => {
    const disabledSet = new Set(disabledCategories);
    return consolidatedMerchants
      .filter((m) => !disabledSet.has(m.category) && !excludedBudgetCategories.has(m.category) && !excludedMerchants.has(m.merchantKey))
      .reduce((sum, m) => sum + m.monthlyAverage, 0);
  }, [consolidatedMerchants, disabledCategories, excludedBudgetCategories, excludedMerchants]);

  const totalBudget = useMemo(() => {
    const recurringCategoryNames = new Set(
      (categories || []).filter((c) => c.defaultRecurrence === 'recurring').map((c) => c.name)
    );
    const activeBudgets = budgets
      ? budgets
          .filter((b) => !disabledCategories.includes(b.category) && !excludedBudgetCategories.has(b.category) && !recurringCategoryNames.has(b.category))
          .reduce((sum, b) => sum + b.monthlyAmount, 0)
      : 0;
    return activeBudgets + recurringProjected;
  }, [budgets, disabledCategories, excludedBudgetCategories, recurringProjected, categories]);

  const showBudgetLine = monthList.length > 1 && totalBudget > 0 && transactionType !== 'income';
  const showIncomeBaselineLine = monthList.length > 1 && baselineProjectedMonthlyIncome > 0 && transactionType === 'income';

  const { series, labels } = useMemo(() => {
    const labels = fullMonthList.map(monthLabel);
    const totalsMap = new Map<string, Map<string, number>>();
    const presentKeys = new Set<string>();

    for (const d of spendChartData) {
      presentKeys.add(d.key);
      let mTotals = totalsMap.get(d.key);
      if (!mTotals) {
        mTotals = new Map<string, number>();
        totalsMap.set(d.key, mTotals);
      }
      mTotals.set(d.month, Math.abs(d.total));
    }

    const getProjectedIncomeForMonth = (m: string) => {
      const mStreams = incomeProjectionsByMonth.get(m);
      const streamSum = mStreams ? mStreams.reduce((sum, p) => sum + p.total, 0) : 0;
      if (streamSum > 0) return streamSum;
      return projectMonthlyIncome({
        monthKey: m,
        historicalMonthlyIncome,
        historicalAnnualAvgIncome,
        recentAvgIncome: avgHistoricalIncome,
        recurringIncome: forecastRecurringIncome,
      }).amount;
    };

    if (groupBy === 'none') {
      const baseColor = transactionType === 'income' ? '#2e7d32' : '#1976d2';
      const baseLabel = transactionType === 'income' ? 'Total income' : 'Total spend';
      const allTotals = fullMonthList.map((m) => {
        if (futureMonthSet.has(m)) {
          const mProjections = categoryProjectionsByMonth.get(m);
          const monthSpendTotal = mProjections
            ? Array.from(mProjections.values()).reduce((sum, p) => sum + p.total, 0)
            : totalProjectedMonthlySpend;
          const monthIncomeProj = getProjectedIncomeForMonth(m);
          const val = transactionType === 'income' ? monthIncomeProj : monthSpendTotal;
          return makeFutureBarItem(val, baseColor);
        }
        return totalsMap.get('all')?.get(m) || 0;
      });

      const resultSeries: any[] = [
        {
          id: baseLabel,
          data: allTotals,
          label: baseLabel,
          color: baseColor,
          stack: 'spend',
        },
      ];

      if (isCurrentMonthForecasted) {
        const actualCur = totalsMap.get('all')?.get(currentCalMonth) || 0;
        const remVal = transactionType === 'income'
          ? Math.max(0, currentMonthProjectedIncomeTotal - actualCur)
          : currentMonthRemainingTotal;

        if (remVal > 0) {
          resultSeries.push(makeCurrentRemainingSeries(baseLabel, baseColor, remVal, fullMonthList, currentCalMonth));
        }
      }

      return { labels, series: resultSeries };
    }

    if (groupBy === 'category') {
      if (transactionType === 'income') {
        const historicalPresentCats = categories.filter((c) => presentKeys.has(c.name)).map((c) => c.name);
        const defaultIncomeCat =
          categories.find((c) => c.type === 'income' || c.name === 'Income')?.name || 'Income';
        const orderedIncomeCats =
          historicalPresentCats.length > 0
            ? historicalPresentCats
            : Array.from(presentKeys).length > 0
            ? Array.from(presentKeys)
            : [defaultIncomeCat];

        const historicalCatTotals = new Map<string, number>();
        let totalHistoricalCatIncome = 0;
        for (const catName of orderedIncomeCats) {
          let sum = 0;
          const mTotals = totalsMap.get(catName);
          if (mTotals) {
            for (const m of monthList) {
              sum += mTotals.get(m) || 0;
            }
          }
          historicalCatTotals.set(catName, sum);
          totalHistoricalCatIncome += sum;
        }

        const baseSeries = orderedIncomeCats.map((catName) => {
          const cat = categories.find((c) => c.name === catName);
          const catColor = cat?.color || '#2e7d32';
          const mTotals = totalsMap.get(catName);
          const catShare =
            totalHistoricalCatIncome > 0
              ? (historicalCatTotals.get(catName) || 0) / totalHistoricalCatIncome
              : catName === defaultIncomeCat
              ? 1
              : 1 / Math.max(1, orderedIncomeCats.length);

          return {
            id: catName,
            label: catName,
            color: catColor,
            stack: 'spend',
            data: fullMonthList.map((m) => {
              if (futureMonthSet.has(m)) {
                const monthIncomeProj = getProjectedIncomeForMonth(m);
                return makeFutureBarItem(Math.round(monthIncomeProj * catShare), catColor);
              }
              return mTotals ? (mTotals.get(m) || 0) : 0;
            }),
          };
        });

        const remSeries: any[] = [];
        if (isCurrentMonthForecasted) {
          for (const catName of orderedIncomeCats) {
            const cat = categories.find((c) => c.name === catName);
            const catColor = cat?.color || '#2e7d32';
            const catShare =
              totalHistoricalCatIncome > 0
                ? (historicalCatTotals.get(catName) || 0) / totalHistoricalCatIncome
                : catName === defaultIncomeCat
                ? 1
                : 1 / Math.max(1, orderedIncomeCats.length);
            const actualCur = totalsMap.get(catName)?.get(currentCalMonth) || 0;
            const projCurCat = Math.round(currentMonthProjectedIncomeTotal * catShare);
            const remVal = Math.max(0, projCurCat - actualCur);
            if (remVal > 0) {
              remSeries.push(makeCurrentRemainingSeries(catName, catColor, remVal, fullMonthList, currentCalMonth));
            }
          }
        }

        return { labels, series: [...baseSeries, ...remSeries] };
      }

      const historicalPresentCats = categories.filter((c) => presentKeys.has(c.name)).map((c) => c.name);
      const projectedCats = Array.from(categoryProjections.keys());
      const currentProjectedCats = isCurrentMonthForecasted ? Array.from(currentMonthProjections.keys()) : [];
      const orderedCats = Array.from(new Set([...historicalPresentCats, ...projectedCats, ...currentProjectedCats]));

      const baseSeries = orderedCats.map((catName) => {
        const cat = categories.find((c) => c.name === catName);
        const catColor = cat?.color || '#bdbdbd';
        const mTotals = totalsMap.get(catName);

        return {
          id: catName,
          label: catName,
          color: catColor,
          stack: 'spend',
          data: fullMonthList.map((m) => {
            if (futureMonthSet.has(m)) {
              const mProj = categoryProjectionsByMonth.get(m)?.get(catName);
              const val = mProj ? mProj.total : (categoryProjections.get(catName)?.total || 0);
              return makeFutureBarItem(val, catColor);
            }
            return mTotals ? (mTotals.get(m) || 0) : 0;
          }),
        };
      });

      const remSeries: any[] = [];
      if (isCurrentMonthForecasted) {
        for (const catName of orderedCats) {
          const cat = categories.find((c) => c.name === catName);
          const catColor = cat?.color || '#bdbdbd';
          const actualCur = totalsMap.get(catName)?.get(currentCalMonth) || 0;
          const projCurTotal = currentMonthProjections.get(catName)?.total || 0;
          const remVal = Math.max(0, projCurTotal - actualCur);
          if (remVal > 0) {
            remSeries.push(makeCurrentRemainingSeries(catName, catColor, remVal, fullMonthList, currentCalMonth));
          }
        }
      }

      return { labels, series: [...baseSeries, ...remSeries] };
    }

    if (groupBy === 'recurring') {
      const recurringData = fullMonthList.map((m) => {
        if (futureMonthSet.has(m)) {
          if (transactionType === 'income') {
            return makeFutureBarItem(getProjectedIncomeForMonth(m), '#2e7d32');
          }
          const mProjections = categoryProjectionsByMonth.get(m);
          const projRec = mProjections
            ? Array.from(mProjections.values()).reduce((sum, p) => sum + p.recurring, 0)
            : Array.from(categoryProjections.values()).reduce((sum, p) => sum + p.recurring, 0);
          return makeFutureBarItem(projRec, '#1976d2');
        }
        return totalsMap.get('recurring')?.get(m) || 0;
      });

      const onetimeData = fullMonthList.map((m) => {
        if (futureMonthSet.has(m)) {
          if (transactionType === 'income') {
            return makeFutureBarItem(0, '#b0bec5');
          }
          const mProjections = categoryProjectionsByMonth.get(m);
          const projVar = mProjections
            ? Array.from(mProjections.values()).reduce((sum, p) => sum + p.variable, 0)
            : Array.from(categoryProjections.values()).reduce((sum, p) => sum + p.variable, 0);
          return makeFutureBarItem(projVar, '#b0bec5');
        }
        let sum = 0;
        for (const k of presentKeys) {
          if (k !== 'recurring') {
            sum += totalsMap.get(k)?.get(m) || 0;
          }
        }
        return sum;
      });

      const resultSeries: any[] = [
        {
          id: 'Recurring',
          label: 'Recurring',
          color: transactionType === 'income' ? '#2e7d32' : '#1976d2',
          stack: 'spend',
          data: recurringData,
        },
        {
          id: 'One-time / Variable',
          label: 'One-time / Variable',
          color: '#b0bec5',
          stack: 'spend',
          data: onetimeData,
        },
      ];

      if (isCurrentMonthForecasted) {
        if (transactionType === 'income') {
          const actualCur = Array.from(presentKeys).reduce(
            (sum, k) => sum + (totalsMap.get(k)?.get(currentCalMonth) || 0),
            0
          );
          const remInc = Math.max(0, currentMonthProjectedIncomeTotal - actualCur);
          if (remInc > 0) {
            resultSeries.push(makeCurrentRemainingSeries('Recurring', '#2e7d32', remInc, fullMonthList, currentCalMonth));
          }
        } else {
          const actualRec = totalsMap.get('recurring')?.get(currentCalMonth) || 0;
          const projRec = Array.from(currentMonthProjections.values()).reduce((sum, p) => sum + p.recurring, 0);
          const remRec = Math.max(0, projRec - actualRec);
          const remVar = Math.max(0, currentMonthRemainingTotal - remRec);

          if (remRec > 0) {
            resultSeries.push(makeCurrentRemainingSeries('Recurring', '#1976d2', remRec, fullMonthList, currentCalMonth));
          }
          if (remVar > 0) {
            resultSeries.push(makeCurrentRemainingSeries('One-time / Variable', '#b0bec5', remVar, fullMonthList, currentCalMonth));
          }
        }
      }

      return { labels, series: resultSeries };
    }

    if (groupBy === 'account') {
      const streamAccountIds = new Set(
        currentMonthIncomeProjections
          .filter((p) => p.accountId !== undefined)
          .map((p) => String(p.accountId))
      );
      const orderedAccounts = accounts.filter(
        (a) =>
          presentKeys.has(String(a.id)) ||
          (transactionType === 'income' && streamAccountIds.has(String(a.id)))
      );
      const historicalAccountTotals = new Map<string, number>();
      let totalHistoricalAccountAmount = 0;
      for (const a of orderedAccounts) {
        let sum = 0;
        const mTotals = totalsMap.get(String(a.id));
        if (mTotals) {
          for (const m of monthList) {
            sum += mTotals.get(m) || 0;
          }
        }
        historicalAccountTotals.set(String(a.id), sum);
        totalHistoricalAccountAmount += sum;
      }

      const getProjectedAccountIncome = (acctId: number | undefined, m: string, acctShare: number) => {
        const mStreams = incomeProjectionsByMonth.get(m) || [];
        const matchedStreams = mStreams.filter((p) => p.accountId !== undefined && p.accountId === acctId);
        const anyAccountSpecific = mStreams.some((p) => p.accountId !== undefined);
        if (anyAccountSpecific) {
          const directSum = matchedStreams.reduce((sum, p) => sum + p.total, 0);
          const unattributedSum = mStreams
            .filter((p) => p.accountId === undefined)
            .reduce((sum, p) => sum + p.total, 0);
          return Math.round(directSum + unattributedSum * acctShare);
        }
        return Math.round(getProjectedIncomeForMonth(m) * acctShare);
      };

      const baseSeries = orderedAccounts.map((a, i) => {
        const mTotals = totalsMap.get(String(a.id));
        const acctColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
        const acctShare = totalHistoricalAccountAmount > 0
          ? (historicalAccountTotals.get(String(a.id)) || 0) / totalHistoricalAccountAmount
          : (1 / Math.max(1, orderedAccounts.length));

        return {
          id: a.name,
          label: a.name,
          color: acctColor,
          stack: 'spend',
          data: fullMonthList.map((m) => {
            if (futureMonthSet.has(m)) {
              if (transactionType === 'income') {
                return makeFutureBarItem(getProjectedAccountIncome(a.id, m, acctShare), acctColor);
              }
              const mProjections = categoryProjectionsByMonth.get(m);
              const mTotalSpend = mProjections
                ? Array.from(mProjections.values()).reduce((sum, p) => sum + p.total, 0)
                : totalProjectedMonthlySpend;
              return makeFutureBarItem(Math.round(mTotalSpend * acctShare), acctColor);
            }
            return mTotals ? (mTotals.get(m) || 0) : 0;
          }),
        };
      });

      const remSeries: any[] = [];
      if (isCurrentMonthForecasted) {
        if (transactionType === 'income') {
          orderedAccounts.forEach((a, i) => {
            const acctColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
            const acctShare = totalHistoricalAccountAmount > 0
              ? (historicalAccountTotals.get(String(a.id)) || 0) / totalHistoricalAccountAmount
              : (1 / Math.max(1, orderedAccounts.length));
            const actualCur = totalsMap.get(String(a.id))?.get(currentCalMonth) || 0;
            const projAcctCur = getProjectedAccountIncome(a.id, currentCalMonth, acctShare);
            const remAcct = Math.max(0, projAcctCur - actualCur);
            if (remAcct > 0) {
              remSeries.push(makeCurrentRemainingSeries(a.name, acctColor, remAcct, fullMonthList, currentCalMonth));
            }
          });
        } else if (currentMonthRemainingTotal > 0) {
          orderedAccounts.forEach((a, i) => {
            const acctColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
            const acctShare = totalHistoricalAccountAmount > 0
              ? (historicalAccountTotals.get(String(a.id)) || 0) / totalHistoricalAccountAmount
              : (1 / Math.max(1, orderedAccounts.length));
            const remAcct = Math.round(currentMonthRemainingTotal * acctShare);
            if (remAcct > 0) {
              remSeries.push(makeCurrentRemainingSeries(a.name, acctColor, remAcct, fullMonthList, currentCalMonth));
            }
          });
        }
      }

      return { labels, series: [...baseSeries, ...remSeries] };
    }

    // Default for merchant or others
    const orderedKeys = Array.from(presentKeys).slice(0, 50);
    const series = orderedKeys.map((k, i) => {
      const mTotals = totalsMap.get(k);
      const label = k || 'Unknown';
      return {
        id: label,
        label,
        color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
        stack: 'spend',
        data: fullMonthList.map((m) => mTotals ? (mTotals.get(m) || 0) : 0),
      };
    });
    return { labels, series };

  }, [fullMonthList, futureMonthSet, spendChartData, accounts, categories, groupBy, categoryProjections, categoryProjectionsByMonth, currentMonthProjections, currentMonthIncomeProjections, incomeProjectionsByMonth, currentMonthRemainingTotal, currentMonthProjectedIncomeTotal, isCurrentMonthForecasted, currentCalMonth, totalProjectedMonthlySpend, transactionType, monthList, historicalMonthlyIncome, historicalAnnualAvgIncome, avgHistoricalIncome, forecastRecurringIncome]);

  const actualIncomeByMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of incomeChartData) {
      counts.set(d.month, Math.abs(d.total));
    }
    return counts;
  }, [incomeChartData]);

  const incomePerMonth = useMemo(() => {
    return fullMonthList.map((m) => {
      if (futureMonthSet.has(m)) {
        const mStreams = incomeProjectionsByMonth.get(m);
        const streamSum = mStreams ? mStreams.reduce((sum, p) => sum + p.total, 0) : 0;
        if (streamSum > 0) return streamSum;
        return projectMonthlyIncome({
          monthKey: m,
          historicalMonthlyIncome,
          historicalAnnualAvgIncome,
          recentAvgIncome: avgHistoricalIncome,
          recurringIncome: forecastRecurringIncome,
        }).amount;
      }
      const actualInc = actualIncomeByMonth.get(m) || 0;
      if (m === currentCalMonth && isCurrentMonthForecasted) {
        return Math.max(actualInc, currentMonthProjectedIncomeTotal);
      }
      return actualInc;
    });
  }, [actualIncomeByMonth, fullMonthList, futureMonthSet, currentCalMonth, isCurrentMonthForecasted, incomeProjectionsByMonth, currentMonthProjectedIncomeTotal, historicalMonthlyIncome, historicalAnnualAvgIncome, avgHistoricalIncome, forecastRecurringIncome]);

  const startingCash = useMemo(() => {
    if (!accounts) return 0;
    const enabledSet = new Set(enabledAccountIds);
    const cashBalance = accounts
      .filter((a) => enabledSet.has(a.id!) && (a.type === 'checking' || a.type === 'savings'))
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    const creditDebt = accounts
      .filter((a) => enabledSet.has(a.id!) && a.type === 'credit')
      .reduce((sum, a) => sum + (a.currentBalance || 0), 0);
    return Math.max(0, cashBalance + creditDebt);
  }, [accounts, enabledAccountIds]);

  const { finalLabels, finalSeries } = useMemo(() => {
    const spendSeries = series.map((s) => ({
      ...s,
      type: 'bar' as const,
      id: (s as any).id || s.label,
    }));

    const incomeSeries = {
      id: 'income',
      type: 'line' as const,
      label: 'Income',
      color: '#2e7d32',
      data: incomePerMonth,
    };

    if (transactionType === 'income') {
      return {
        finalLabels: labels,
        finalSeries: spendSeries,
      };
    }

    if (!showRunway || totalBudget <= 0 || startingCash <= 0 || monthList.length === 0) {
      return {
        finalLabels: labels,
        finalSeries: spendOnly ? spendSeries : [...spendSeries, incomeSeries],
      };
    }

    // Runway handling when showRunway is explicitly toggled on
    const lastMonthStr = fullMonthList[fullMonthList.length - 1];

    const currentMonthSpend = spendChartData.reduce((sum, d) => {
      if (d.month === lastMonthStr) {
        return sum + Math.abs(d.total);
      }
      return sum;
    }, 0);

    const remainingCurrentMonthBudget = Math.max(0, totalBudget - currentMonthSpend);
    const currentMonthRunway = Math.min(startingCash, remainingCurrentMonthBudget);

    const extendedLabels = [...labels];
    const projectMonths: string[] = [];
    const projectionData: number[] = [];
    const historicalNulls = fullMonthList.slice(0, -1).map(() => null);

    let [year, month] = lastMonthStr.split('-').map(Number);
    let currentCash = startingCash - currentMonthRunway;

    while (currentCash > 0 && projectMonths.length < 24) {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
      const mStr = `${year}-${String(month).padStart(2, '0')}`;
      projectMonths.push(mStr);
      extendedLabels.push(monthLabel(mStr));

      const fundedAmount = Math.min(currentCash, totalBudget);
      projectionData.push(fundedAmount);

      currentCash -= totalBudget;
    }

    const paddedSpendSeries = spendSeries.map((s) => ({
      ...s,
      data: [...s.data, ...projectMonths.map(() => null)],
    }));

    const paddedIncomeSeries = {
      ...incomeSeries,
      data: [...incomeSeries.data, ...projectMonths.map(() => null)],
    };

    const runwaySeries = {
      id: 'runway',
      type: 'bar' as const,
      label: 'Projected Cash',
      color: '#90caf9',
      stack: 'spend',
      data: [...historicalNulls, currentMonthRunway, ...projectionData],
    };

    const finalSeriesList: any[] = [...paddedSpendSeries];
    if (!spendOnly) {
      finalSeriesList.push(paddedIncomeSeries);
    }
    finalSeriesList.push(runwaySeries);

    return {
      finalLabels: extendedLabels,
      finalSeries: finalSeriesList,
    };
  }, [showRunway, spendOnly, transactionType, totalBudget, startingCash, labels, series, incomePerMonth, monthList, fullMonthList, spendChartData]);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const onMonthClickRef = useRef(onMonthClick);
  const onFutureMonthClickRef = useRef(onFutureMonthClick);
  const isSingleMonthRef = useRef(isSingleMonth);
  const fullMonthListRef = useRef(fullMonthList);
  const futureMonthSetRef = useRef(futureMonthSet);

  useEffect(() => {
    onMonthClickRef.current = onMonthClick;
    onFutureMonthClickRef.current = onFutureMonthClick;
    isSingleMonthRef.current = isSingleMonth;
    fullMonthListRef.current = fullMonthList;
    futureMonthSetRef.current = futureMonthSet;
  });

  // Initialize and dispose Echarts instance strictly to prevent memory leaks
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartInstanceRef.current = chart;

    // Single stable click handler routing to either drilldown (historical) or future breakdown (forecast)
    chart.on('click', (params) => {
      const idx = params.dataIndex;
      if (idx != null && idx >= 0 && idx < fullMonthListRef.current.length) {
        const clickedMonth = fullMonthListRef.current[idx];
        const clickedRemSegment = String(params.seriesId || '').endsWith('__rem');
        if (futureMonthSetRef.current.has(clickedMonth) || clickedRemSegment) {
          if (onFutureMonthClickRef.current) {
            onFutureMonthClickRef.current(clickedMonth);
          }
        } else if (isSingleMonthRef.current) {
          if (onFutureMonthClickRef.current) {
            onFutureMonthClickRef.current(clickedMonth);
          }
        } else if (onMonthClickRef.current && fullMonthListRef.current.length > 1) {
          onMonthClickRef.current(clickedMonth);
        }
      }
    });

    // ResizeObserver on the chart container element handles all panel and window resizes smoothly via rAF
    let rAfId: number | null = null;
    const triggerResize = () => {
      if (rAfId !== null) cancelAnimationFrame(rAfId);
      rAfId = requestAnimationFrame(() => {
        rAfId = null;
        if (chart && !chart.isDisposed()) {
          chart.resize();
        }
      });
    };

    const ro = new ResizeObserver(triggerResize);
    ro.observe(el);

    const handleResize = triggerResize;
    window.addEventListener('resize', handleResize);

    return () => {
      if (rAfId !== null) {
        cancelAnimationFrame(rAfId);
      }
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  // Update Echarts option when series/data or mobile orientation changes
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || chart.isDisposed()) return;

    const markLineData: any[] = [];

    if (showBudgetLine) {
      markLineData.push({
        [isMobile ? 'xAxis' : 'yAxis']: totalBudget,
        name: 'Recurring + Budget',
        label: { 
          show: true, 
          position: 'middle', 
          formatter: `Recurring + Budget (${usd.format(totalBudget)})`,
          backgroundColor: '#ffffff',
          color: '#000000',
          borderColor: '#000000',
          borderWidth: 1,
          borderRadius: 10,
          padding: [4, 10],
          fontWeight: 600,
        },
        lineStyle: { color: '#000000', type: 'solid', width: 1 },
      });
    } else if (showIncomeBaselineLine) {
      markLineData.push({
        [isMobile ? 'xAxis' : 'yAxis']: baselineProjectedMonthlyIncome,
        name: 'Expected Monthly Income',
        label: {
          show: true,
          position: 'middle',
          formatter: `Expected Income (${usd.format(baselineProjectedMonthlyIncome)}/mo)`,
          backgroundColor: '#e8f5e9',
          color: '#2e7d32',
          borderColor: '#2e7d32',
          borderWidth: 1,
          borderRadius: 10,
          padding: [4, 10],
          fontWeight: 600,
        },
        lineStyle: { color: '#2e7d32', type: 'dashed', width: 1.5 },
      });
    }

    const currentMonthIdx = fullMonthList.indexOf(currentCalMonth);
    const forecastColor = transactionType === 'income' ? '#2e7d32' : '#1565c0';
    const forecastBg = transactionType === 'income' ? '#e8f5e9' : '#e3f2fd';

    if (futureMonths.length > 0 && monthList.length > 0) {
      markLineData.push({
        [isMobile ? 'yAxis' : 'xAxis']: labels[monthList.length],
        name: `Forecast (+${futureMonths.length}M)`,
        label: {
          show: true,
          position: isMobile ? 'insideEndTop' : 'insideTopLeft',
          formatter: `📍 ${transactionType === 'income' ? 'Income ' : ''}Forecast (+${futureMonths.length}M)`,
          backgroundColor: forecastBg,
          color: forecastColor,
          borderColor: forecastColor,
          borderWidth: 1,
          borderRadius: 6,
          padding: [4, 8],
          fontWeight: 700,
          fontSize: 11,
        },
        lineStyle: { color: forecastColor, type: 'dashed', width: 2 },
      });
    } else if (isCurrentMonthForecasted && currentMonthIdx >= 0 && monthList.length > 1) {
      markLineData.push({
        [isMobile ? 'yAxis' : 'xAxis']: labels[currentMonthIdx],
        name: 'Current Month Forecast',
        label: {
          show: true,
          position: isMobile ? 'insideEndTop' : 'insideTopRight',
          formatter: `📍 ${labels[currentMonthIdx]} Forecast`,
          backgroundColor: forecastBg,
          color: forecastColor,
          borderColor: forecastColor,
          borderWidth: 1,
          borderRadius: 6,
          padding: [4, 8],
          fontWeight: 700,
          fontSize: 11,
        },
        lineStyle: { color: forecastColor, type: 'dashed', width: 1.5 },
      });
    }

    const option: echarts.EChartsOption = {
      grid: {
        left: 20,
        right: 20,
        top: 40,
        bottom: 24,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        confine: true, // Crucial: Keeps tooltip inside chart bounds, eliminating overflow scrollbar flicker
        axisPointer: { type: 'shadow' },
        textStyle: {
          fontFamily: theme.typography.fontFamily,
          fontSize: 13,
          color: theme.palette.text.primary,
        },
        extraCssText: `box-shadow: 0 4px 20px rgba(0,0,0,0.15); border-radius: ${theme.shape.borderRadius}px; border: 1px solid ${theme.palette.divider}; font-family: ${theme.typography.fontFamily};`,
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          
          const spendItems = params.filter(p => p.seriesId !== 'income' && p.seriesId !== 'runway' && p.seriesId !== 'budget_and_forecast_guidelines');
          const incomeItem = params.find(p => p.seriesId === 'income');
          const runwayItem = params.find(p => p.seriesId === 'runway');
          
          // Merge base actual series and remaining-forecast (__rem) series by seriesName
          const mergedByName = new Map<string, { seriesName: string; color: string; actual: number; remaining: number; value: number }>();
          for (const s of spendItems) {
            const rawVal = s.value;
            const val = typeof rawVal === 'object' && rawVal !== null ? Number(rawVal.value || 0) : Number(rawVal || 0);
            if (val <= 0) continue;
            const isRem = String(s.seriesId || '').endsWith('__rem');
            const existing = mergedByName.get(s.seriesName) || {
              seriesName: s.seriesName,
              color: s.color,
              actual: 0,
              remaining: 0,
              value: 0,
            };
            if (isRem) {
              existing.remaining += val;
            } else {
              existing.actual += val;
            }
            existing.value = existing.actual + existing.remaining;
            mergedByName.set(s.seriesName, existing);
          }

          const sorted = Array.from(mergedByName.values())
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);

          const totalActualBar = sorted.reduce((sum, s) => sum + s.actual, 0);
          const totalRemainingBar = sorted.reduce((sum, s) => sum + s.remaining, 0);
          const totalBar = totalActualBar + totalRemainingBar;

          const hoveredIdx = params[0]?.dataIndex;
          const hoveredMonth = fullMonthList[hoveredIdx];
          const isForecastMonth = futureMonthSet.has(hoveredMonth);
          const isHoveredCurrentForecast = hoveredMonth === currentCalMonth && isCurrentMonthForecasted;

          const rawIncome = incomeItem?.value;
          const lineIncomeValue = typeof rawIncome === 'object' && rawIncome !== null ? Number(rawIncome.value || 0) : Number(rawIncome || 0);
          const fallbackHoveredIncome = hoveredIdx != null && hoveredIdx >= 0 ? (incomePerMonth[hoveredIdx] || 0) : 0;
          const incomeValue = lineIncomeValue > 0 ? lineIncomeValue : fallbackHoveredIncome;

          const rawRunway = runwayItem?.value;
          const runwayValue = typeof rawRunway === 'object' && rawRunway !== null ? Number(rawRunway.value || 0) : Number(rawRunway || 0);

          const remaining = incomeValue - totalBar;
          const mIncomeStreams = (isForecastMonth || isHoveredCurrentForecast)
            ? (incomeProjectionsByMonth.get(hoveredMonth) || [])
            : [];

          let html = `<div style="min-width: 260px; max-width: 360px; padding: 4px; font-family: inherit;">`;

          if (isForecastMonth) {
            const badgeBg = transactionType === 'income' ? 'rgba(46, 125, 50, 0.12)' : 'rgba(25, 118, 210, 0.1)';
            const badgeColor = transactionType === 'income' ? '#2e7d32' : '#1565c0';
            const subtitle = transactionType === 'income'
              ? 'Projected from recurring payroll streams & historical income'
              : "Projected from budgets, bills & last year's trends";
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-family: inherit;">
                <span style="font-weight: 700; font-size: 13px;">${params[0].axisValueLabel}</span>
                <span style="font-size: 11px; font-weight: 600; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 4px;">Forecasted</span>
              </div>
              <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${subtitle}</div>
            `;
          } else if (isHoveredCurrentForecast) {
            const badgeBg = transactionType === 'income' ? 'rgba(46, 125, 50, 0.12)' : 'rgba(25, 118, 210, 0.12)';
            const badgeColor = transactionType === 'income' ? '#2e7d32' : '#1565c0';
            const subtitle = transactionType === 'income'
              ? 'Actual income received to date + projected remaining'
              : 'Actual spend to date + projected remaining';
            html += `
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-family: inherit;">
                <span style="font-weight: 700; font-size: 13px;">${params[0].axisValueLabel}</span>
                <span style="font-size: 11px; font-weight: 600; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 4px;">Current Mo Forecast</span>
              </div>
              <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${subtitle}</div>
            `;
          } else {
            html += `<div style="font-weight: 600; margin-bottom: 8px; font-family: inherit;">${params[0].axisValueLabel}</div>`;
          }
          
          if (sorted.length === 0 && incomeValue === 0 && runwayValue === 0) {
            html += `<div style="color: #666; font-size: 12px; font-family: inherit;">No activity</div></div>`;
            return html;
          }

          html += `<table style="width: 100%; border-collapse: collapse; font-family: inherit;"><tbody>`;
          
          sorted.forEach(s => {
            const mProjections = (isForecastMonth || isHoveredCurrentForecast) ? categoryProjectionsByMonth.get(hoveredMonth) : undefined;
            const proj = mProjections ? mProjections.get(s.seriesName) : categoryProjections.get(s.seriesName);
            let basisLabel = '';
            if (transactionType === 'income' && (isForecastMonth || isHoveredCurrentForecast)) {
              const primaryStream = mIncomeStreams[0];
              if (primaryStream?.basis === 'recurring_stream') basisLabel = 'Payroll / Stream';
              else if (primaryStream?.basis === 'last_year_month') basisLabel = 'Last Year';
              else if (primaryStream?.basis === 'last_year_avg') basisLabel = '12-Mo Avg';
              else basisLabel = 'Projected';
            } else if ((isForecastMonth || isHoveredCurrentForecast) && proj) {
              if (proj.basis === 'budget') basisLabel = 'Budget';
              else if (proj.basis === 'last_year') basisLabel = 'Last Year';
              else if (proj.basis === 'last_year_avg') basisLabel = 'Prior Year Avg';
              else if (proj.basis === 'recurring') basisLabel = 'Bill';
              else if (proj.basis === 'recurring + trailing') basisLabel = 'Bill + Avg';
              else if (proj.basis === 'actual_exceeded') basisLabel = 'Actual';
              else basisLabel = 'Trend';
            }

            let rightValueHtml = usd.format(s.value);
            if (isHoveredCurrentForecast && s.remaining > 0 && s.actual > 0) {
              rightValueHtml = `<span style="font-size: 10.5px; color: #777; font-weight: 400; margin-right: 4px;">${usd.format(s.actual)} + ${usd.format(s.remaining)}</span><span style="font-weight: 600;">${usd.format(s.value)}</span>`;
            } else if (isHoveredCurrentForecast && s.remaining > 0 && s.actual === 0) {
              const estColor = transactionType === 'income' ? '#2e7d32' : '#1565c0';
              rightValueHtml = `<span style="font-size: 10px; color: ${estColor}; font-weight: 500; margin-right: 4px;">est.</span><span style="font-weight: 600;">${usd.format(s.value)}</span>`;
            }

            html += `
              <tr>
                <td style="width: 12px; padding-right: 8px; vertical-align: middle;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${s.color}; ${isForecastMonth ? 'opacity: 0.65;' : ''}"></div>
                </td>
                <td style="padding: 2px 8px 2px 0; max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;">
                  ${s.seriesName} ${basisLabel ? `<span style="font-size: 10px; color: #777; font-weight: 400;">(${basisLabel})</span>` : ''}
                </td>
                <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; white-space: nowrap;">
                  ${rightValueHtml}
                </td>
              </tr>
            `;
          });

          if (transactionType === 'income') {
            if ((isForecastMonth || isHoveredCurrentForecast) && mIncomeStreams.length > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px dashed rgba(0,0,0,0.12);"/></td></tr>`;
              html += `<tr><td colspan="3" style="padding: 1px 0 3px 0; font-size: 10.5px; font-weight: 700; color: #666; text-transform: uppercase;">Expected Income Sources</td></tr>`;
              mIncomeStreams.forEach((stream) => {
                const freqBadge =
                  stream.frequency === 'biweekly'
                    ? 'Bi-weekly'
                    : stream.frequency === 'semimonthly'
                    ? 'Semi-mo'
                    : stream.frequency === 'weekly'
                    ? 'Weekly'
                    : 'Monthly';
                const statusBadge = isHoveredCurrentForecast
                  ? (stream.remaining || 0) === 0
                    ? '<span style="color: #2e7d32; font-size: 10px; font-weight: 600;">✓ Received</span>'
                    : stream.nextExpectedDay
                    ? `<span style="color: #ed6c02; font-size: 10px; font-weight: 600;">⏳ ~Day ${stream.nextExpectedDay}</span>`
                    : '<span style="color: #ed6c02; font-size: 10px; font-weight: 600;">⏳ Upcoming</span>'
                  : `<span style="color: #777; font-size: 10px;">${freqBadge}</span>`;

                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 1.5px 8px 1.5px 0; font-size: 12px; color: #444; max-width: 175px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${stream.name} ${statusBadge}
                    </td>
                    <td style="padding: 1.5px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: #2e7d32;">
                      +${usd.format(stream.total)}
                    </td>
                  </tr>
                `;
              });
            }

            if (sorted.length > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              if (isHoveredCurrentForecast) {
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #666;">Received to Date</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #666;">
                      +${usd.format(totalActualBar)}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #2e7d32;">Projected Remaining</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #2e7d32;">
                      +${usd.format(totalRemainingBar)}
                    </td>
                  </tr>
                `;
              }
              html += `
                <tr>
                  <td></td>
                  <td style="padding: 2px 0; font-size: 13px; font-weight: 600; color: #2e7d32;">${isHoveredCurrentForecast ? 'Projected Month-End Income' : `Total ${isForecastMonth ? 'Projected ' : ''}Income`}</td>
                  <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700; color: #2e7d32;">
                    +${usd.format(totalBar)}
                  </td>
                </tr>
              `;
            }
          } else if (spendOnly) {
            if (sorted.length > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              if (isHoveredCurrentForecast) {
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #666;">Spent to Date</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #666;">
                      ${usd.format(totalActualBar)}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #1565c0;">Projected Remaining</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #1565c0;">
                      +${usd.format(totalRemainingBar)}
                    </td>
                  </tr>
                `;
              }
              html += `
                <tr>
                  <td></td>
                  <td style="padding: 2px 0; font-size: 13px; font-weight: 600;">${isHoveredCurrentForecast ? 'Projected Month-End' : `Total ${isForecastMonth ? 'Forecasted' : 'Spend'}`}</td>
                  <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700;">
                    ${usd.format(totalBar)}
                  </td>
                </tr>
              `;
              if ((isForecastMonth || isHoveredCurrentForecast) && incomeValue > 0) {
                const actualCurInc = actualIncomeByMonth.get(hoveredMonth) || 0;
                const incLabel = isHoveredCurrentForecast && actualCurInc > 0 && actualCurInc < incomeValue
                  ? `Projected Income (${usd.format(actualCurInc)} rec'd)`
                  : 'Projected Income';
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #2e7d32;">${incLabel}</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: #2e7d32;">
                      +${usd.format(incomeValue)}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; font-weight: 600;">Projected Net</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; color: ${remaining >= 0 ? '#2e7d32' : '#d32f2f'};">
                      ${remaining >= 0 ? '+' : ''}${usd.format(remaining)}
                    </td>
                  </tr>
                `;
              }
            }
          } else {
            if (totalBar > 0 || incomeValue > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              if (isHoveredCurrentForecast && totalBar > 0) {
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #666;">Spent to Date</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #666;">
                      -${usd.format(totalActualBar)}
                    </td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 12px; color: #1565c0;">Projected Remaining</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; color: #1565c0;">
                      -${usd.format(totalRemainingBar)}
                    </td>
                  </tr>
                `;
              }
              if (totalBar > 0) {
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 13px; color: #666; font-weight: ${isHoveredCurrentForecast ? 600 : 400};">${isHoveredCurrentForecast ? 'Projected Month-End' : `Total ${isForecastMonth ? 'Forecasted' : 'Spend'}`}</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; color: #666; font-weight: ${isHoveredCurrentForecast ? 600 : 400};">
                      -${usd.format(totalBar)}
                    </td>
                  </tr>
                `;
              }
              if (incomeValue > 0) {
                const actualCurInc = actualIncomeByMonth.get(hoveredMonth) || 0;
                const incLabel = isForecastMonth
                  ? 'Est. Income'
                  : isHoveredCurrentForecast
                  ? `Est. Income ${actualCurInc > 0 && actualCurInc < incomeValue ? `(${usd.format(actualCurInc)} to date)` : ''}`
                  : 'Income';
                html += `
                  <tr>
                    <td style="width: 12px; padding-right: 8px; vertical-align: middle;">
                      <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${incomeItem?.color || '#2e7d32'};"></div>
                    </td>
                    <td style="padding: 2px 0; font-size: 13px; color: #2e7d32;">${incLabel}</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; color: #2e7d32;">
                      +${usd.format(incomeValue)}
                    </td>
                  </tr>
                `;
              }
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              html += `
                <tr>
                  <td></td>
                  <td style="padding: 2px 0; font-size: 13px; font-weight: 600;">Net ${isForecastMonth || isHoveredCurrentForecast ? 'Forecast' : 'Remaining'}</td>
                  <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700; color: ${remaining >= 0 ? '#2e7d32' : '#d32f2f'};">
                    ${remaining >= 0 ? '+' : ''}${usd.format(remaining)}
                  </td>
                </tr>
              `;
            }
          }

          if (runwayValue > 0) {
            if (sorted.length > 0 || incomeValue > 0) {
               html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
            }
            html += `
              <tr>
                <td style="width: 12px; padding-right: 8px; vertical-align: middle;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${runwayItem?.color || '#90caf9'};"></div>
                </td>
                <td style="padding: 2px 0; font-size: 13px; font-weight: 600; color: #1976d2;">Projected Cash</td>
                <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700; color: #1976d2;">
                  ${usd.format(runwayValue)}
                </td>
              </tr>
            `;
          }

          if (isForecastMonth || isHoveredCurrentForecast || isSingleMonth) {
            const clickTipBg = transactionType === 'income' ? '#e8f5e9' : '#e3f2fd';
            const clickTipColor = transactionType === 'income' ? '#2e7d32' : '#1565c0';
            html += `
              <tr>
                <td colspan="3" style="padding-top: 8px;">
                  <div style="font-size: 10px; color: ${clickTipColor}; text-align: center; font-weight: 600; background: ${clickTipBg}; padding: 4px; border-radius: 4px;">
                    👆 Click ${isHoveredCurrentForecast && !isSingleMonth ? 'forecasted bar cap' : 'bar'} for itemized breakdown & comparison
                  </div>
                </td>
              </tr>
            `;
          }

          html += `</tbody></table></div>`;
          return html;
        }
      },
      xAxis: isMobile ? {
        type: 'value',
        splitNumber: 4,
        axisLabel: {
          formatter: (v: number) => {
            if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
            if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}k`;
            return usd.format(v);
          },
        },
      } : {
        type: 'category',
        data: finalLabels,
        axisTick: { alignWithLabel: true }
      },
      yAxis: isMobile ? {
        type: 'category',
        data: finalLabels,
        axisTick: { alignWithLabel: true },
        inverse: true // Flip so the earliest month is at the top on mobile
      } : {
        type: 'value',
        axisLabel: { formatter: (v: number) => usd.format(v) }
      },
      series: [
        ...finalSeries.map((s) => ({
          id: s.id,
          name: s.label,
          type: s.type,
          data: s.data,
          stack: s.stack,
          itemStyle: { color: s.color },
          markLine: { symbol: 'none', data: [] },
          ...(s.type === 'bar' ? { itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] } } : {})
        })),
        {
          id: 'budget_and_forecast_guidelines',
          name: 'Guidelines',
          type: 'line',
          data: [],
          markLine: {
            symbol: 'none',
            data: markLineData,
          },
          tooltip: { show: false },
          silent: true,
        },
      ],
      animation: true,
      animationDuration: 300,
      animationEasing: 'cubicOut',
      animationDurationUpdate: 350,
      animationEasingUpdate: 'cubicInOut',
    };

    chart.setOption(option, true);
  }, [finalSeries, finalLabels, showBudgetLine, showIncomeBaselineLine, totalBudget, baselineProjectedMonthlyIncome, spendOnly, isMobile, fullMonthList, futureMonthSet, futureMonths.length, monthList.length, categoryProjections, categoryProjectionsByMonth, incomeProjectionsByMonth, incomePerMonth, currentCalMonth, isCurrentMonthForecasted, actualIncomeByMonth, transactionType, theme.typography.fontFamily, labels]);

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 260, position: 'relative' }}>
      {(series.length === 0 || labels.length === 0) && (
        <Box sx={{ 
          position: 'absolute', 
          top: 0, left: 0, right: 0, bottom: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 10,
          bgcolor: 'background.paper',
          transition: 'opacity 200ms ease',
        }}>
          <Typography color="text.secondary">
            {transactionType === 'income' ? 'No income in range.' : 'No spend in range.'}
          </Typography>
        </Box>
      )}
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: 260,
          cursor: ((onMonthClick && monthList.length > 1) || (isSingleMonth && onFutureMonthClick)) ? 'pointer' : 'default',
          opacity: (series.length === 0 || labels.length === 0) ? 0 : 1,
          pointerEvents: (series.length === 0 || labels.length === 0) ? 'none' : 'auto'
        }} 
      />
    </Box>
  );
}
