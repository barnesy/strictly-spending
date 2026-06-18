import { useMemo, useEffect, useState, useRef } from 'react';
import { Box } from '@mui/material';
import {
  ResponsiveChartContainer,
  BarPlot,
  LinePlot,
  MarkPlot,
  ChartsXAxis,
  ChartsYAxis,
  ChartsTooltip,
  useYScale,
  useDrawingArea,
} from '@mui/x-charts';
import { monthKey, monthLabel, usd } from '../lib';
import { ACCOUNT_COLORS } from '../theme';
import type { Account, Category, Transaction } from '../types';
import type { GroupBy } from '../store';
import type { RecurrenceInfo } from '../recurrence';
import { isRecurring } from '../recurrence';
import CustomAxisTooltipContent from './ChartTooltip';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useFilters } from '../store';
import { useBudgetStore } from '../budgetStore';
import { buildForecast } from '../forecast';

/** Track a parent element's height via ResizeObserver so the chart fills
 *  its container exactly (instead of being capped at a fixed vh fraction). */
function useElementHeight(minHeight = 240) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(minHeight);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Run an immediate synchronous measurement on mount to prevent the 240px layout jump
    const initialHeight = Math.max(minHeight, Math.floor(el.clientHeight));
    setHeight(initialHeight);
    
    let timerId: any = null;
    let rAFId: number | null = null;
    
    const measure = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      // Debounce by 60ms to prevent heavy redrawing on every drag frame
      timerId = setTimeout(() => {
        timerId = null;
        if (rAFId !== null) {
          cancelAnimationFrame(rAFId);
        }
        rAFId = requestAnimationFrame(() => {
          rAFId = null;
          if (el) {
            const next = Math.max(minHeight, Math.floor(el.clientHeight));
            setHeight((prev) => (Math.abs(prev - next) < 4 ? prev : next));
          }
        });
      }, 60);
    };
    
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      if (rAFId !== null) {
        cancelAnimationFrame(rAFId);
      }
    };
  }, [minHeight]);
  return [ref, height] as const;
}

interface Props {
  monthList: string[];
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  groupBy: GroupBy;
  recurrenceMap: Map<string, RecurrenceInfo>;
  onMonthClick?: (monthKey: string) => void;
  allTxns: Transaction[];
}

function CustomBudgetLine({ totalBudget }: { totalBudget: number }) {
  const yScale = useYScale();
  const { left, width } = useDrawingArea();

  const y = yScale(totalBudget);
  if (y == null || isNaN(y)) return null;

  const labelText = `Monthly Budget (${usd.format(totalBudget)})`;
  const rectWidth = 175;
  const rectHeight = 20;
  const rectX = left + width / 2 - rectWidth / 2;
  const rectY = y - rectHeight / 2;

  return (
    <g className="custom-budget-line">
      {/* Thinner solid black lines connecting to the chip */}
      <line
        x1={left}
        y1={y}
        x2={rectX}
        y2={y}
        stroke="#000000"
        strokeWidth={1}
      />
      <line
        x1={rectX + rectWidth}
        y1={y}
        x2={left + width}
        y2={y}
        stroke="#000000"
        strokeWidth={1}
      />
      
      {/* Pill-shaped chip container */}
      <rect
        x={rectX}
        y={rectY}
        width={rectWidth}
        height={rectHeight}
        rx={10}
        ry={10}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={1}
      />
      
      {/* Centered label text */}
      <text
        x={left + width / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#000000"
        fontSize={10}
        fontWeight={600}
        style={{ userSelect: 'none' }}
      >
        {labelText}
      </text>
    </g>
  );
}

export default function SpendChart({
  monthList,
  transactions,
  accounts,
  categories,
  groupBy,
  recurrenceMap,
  onMonthClick,
  allTxns,
}: Props) {
  const disabledCategories = useFilters((s) => s.disabledCategories);
  const enabledAccountIds = useFilters((s) => s.enabledAccountIds);
  const showRunway = useFilters((s) => s.showRunway);
  const spendOnly = useFilters((s) => s.spendOnly);
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const excludedBudgetCategories = useBudgetStore((s) => s.excludedBudgetCategories);
  const excludedMerchants = useBudgetStore((s) => s.excludedMerchants);

  const forecast = useMemo(
    () => buildForecast(allTxns || [], recurrenceMap, categories || []),
    [allTxns, recurrenceMap, categories]
  );

  const recurringProjected = useMemo(() => {
    if (!forecast) return 0;
    const disabledSet = new Set(disabledCategories);
    return forecast
      .filter(
        (f) =>
          f.kind === 'recurring' &&
          !excludedMerchants.has(f.merchantKey) &&
          !disabledSet.has(f.category)
      )
      .reduce((sum, f) => sum + f.monthlyEstimate, 0);
  }, [forecast, excludedMerchants, disabledCategories]);

  const totalBudget = useMemo(() => {
    const activeBudgets = budgets
      ? budgets
          .filter((b) => !disabledCategories.includes(b.category) && !excludedBudgetCategories.has(b.category))
          .reduce((sum, b) => sum + b.monthlyAmount, 0)
      : 0;
    return activeBudgets + recurringProjected;
  }, [budgets, disabledCategories, excludedBudgetCategories, recurringProjected]);

  const showBudgetLine = monthList.length > 1 && totalBudget > 0;

  const { series, labels } = useMemo(() => {
    const labels = monthList.map(monthLabel);

    if (groupBy === 'none') {
      const totals = monthList.map((m) =>
        transactions
          .filter((t) => t.amount < 0 && monthKey(t.date) === m)
          .reduce((s, t) => s + Math.abs(t.amount), 0)
      );
      return {
        labels,
        series: [
          {
            data: totals,
            label: 'Total spend',
            color: '#1976d2',
            stack: 'spend',
          },
        ],
      };
    }

    if (groupBy === 'category') {
      const presentCats = new Set<string>();
      for (const t of transactions) {
        if (t.amount < 0) presentCats.add(t.category);
      }
      const orderedCats = categories
        .filter((c) => presentCats.has(c.name))
        .map((c) => c.name);
      const series = orderedCats.map((catName) => {
        const cat = categories.find((c) => c.name === catName);
        return {
          label: catName,
          color: cat?.color || '#bdbdbd',
          stack: 'spend',
          data: monthList.map((m) =>
            transactions
              .filter(
                (t) =>
                  t.amount < 0 &&
                  t.category === catName &&
                  monthKey(t.date) === m
              )
              .reduce((s, t) => s + Math.abs(t.amount), 0)
          ),
        };
      });
      return { labels, series };
    }

    if (groupBy === 'recurring') {
      const recurringPerMonth: number[] = [];
      const oneTimePerMonth: number[] = [];
      for (const m of monthList) {
        let recurring = 0;
        let oneTime = 0;
        for (const t of transactions) {
          if (t.amount >= 0) continue;
          if (monthKey(t.date) !== m) continue;
          const info = recurrenceMap.get(t.merchantKey);
          if (info && isRecurring(info.kind)) recurring += Math.abs(t.amount);
          else oneTime += Math.abs(t.amount);
        }
        recurringPerMonth.push(recurring);
        oneTimePerMonth.push(oneTime);
      }
      return {
        labels,
        series: [
          {
            label: 'Recurring',
            color: '#1976d2',
            stack: 'spend',
            data: recurringPerMonth,
          },
          {
            label: 'One-time',
            color: '#b0bec5',
            stack: 'spend',
            data: oneTimePerMonth,
          },
        ],
      };
    }

    // account
    const presentAccounts = new Set<number>();
    for (const t of transactions) {
      if (t.amount < 0) presentAccounts.add(t.accountId);
    }
    const orderedAccounts = accounts.filter((a) => presentAccounts.has(a.id!));
    const series = orderedAccounts.map((a, i) => ({
      label: a.name,
      color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
      stack: 'spend',
      data: monthList.map((m) =>
        transactions
          .filter(
            (t) =>
              t.amount < 0 &&
              t.accountId === a.id &&
              monthKey(t.date) === m
          )
          .reduce((s, t) => s + Math.abs(t.amount), 0)
      ),
    }));
    return { labels, series };
  }, [monthList, transactions, accounts, categories, groupBy, recurrenceMap]);

  const incomePerMonth = useMemo(() => {
    if (!allTxns || !categories) return monthList.map(() => 0);
    const enabledSet = new Set(enabledAccountIds);
    const disabledSet = new Set(disabledCategories);
    const incomeCategories = new Set(
      categories.filter((c) => c.type === 'income').map((c) => c.name)
    );

    const counts: Record<string, number> = {};
    for (const m of monthList) {
      counts[m] = 0;
    }

    for (const t of allTxns) {
      if (!enabledSet.has(t.accountId)) continue;
      if (disabledSet.has(t.category)) continue;
      if (t.amount <= 0) continue;
      if (!incomeCategories.has(t.category)) continue;
      const m = monthKey(t.date);
      if (counts[m] !== undefined) {
        counts[m] += t.amount;
      }
    }

    return monthList.map((m) => counts[m]);
  }, [allTxns, categories, enabledAccountIds, disabledCategories, monthList]);

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
      valueFormatter: (v: number | null) =>
        v == null ? '' : usd.format(v),
    }));

    const incomeSeries = {
      id: 'income',
      type: 'line' as const,
      label: 'Income',
      color: '#2e7d32', // green
      data: incomePerMonth,
      valueFormatter: (v: number | null) =>
        v == null ? '' : usd.format(v),
    };

    if (!showRunway || totalBudget <= 0 || startingCash <= 0 || monthList.length === 0) {
      return {
        finalLabels: labels,
        finalSeries: spendOnly ? spendSeries : [...spendSeries, incomeSeries],
      };
    }

    const lastMonthStr = monthList[monthList.length - 1];

    // Calculate current month's total spend from transaction data
    const currentMonthSpend = transactions
      .filter((t) => t.amount < 0 && monthKey(t.date) === lastMonthStr)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const remainingCurrentMonthBudget = Math.max(0, totalBudget - currentMonthSpend);
    const currentMonthRunway = Math.min(startingCash, remainingCurrentMonthBudget);

    const extendedLabels = [...labels];
    const projectMonths: string[] = [];
    const projectionData: number[] = [];
    const historicalNulls = monthList.slice(0, -1).map(() => null);

    let [year, month] = lastMonthStr.split('-').map(Number); // 1-based month
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

      // The bar height is how much of this month's budget is funded by the remaining cash, capped at totalBudget
      const fundedAmount = Math.min(currentCash, totalBudget);
      projectionData.push(fundedAmount);

      currentCash -= totalBudget;
    }

    // Pad existing spend series with nulls for projected months
    const paddedSpendSeries = spendSeries.map((s) => ({
      ...s,
      data: [...s.data, ...projectMonths.map(() => null)],
    }));

    // Pad income series with nulls
    const paddedIncomeSeries = {
      ...incomeSeries,
      data: [...incomeSeries.data, ...projectMonths.map(() => null)],
    };

    // Create Runway series
    const runwaySeries = {
      id: 'runway',
      type: 'bar' as const,
      label: 'Projected Cash',
      color: '#90caf9', // soft blue
      stack: 'spend',
      valueFormatter: (v: number | null) =>
        v == null ? '' : usd.format(v),
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
  }, [showRunway, spendOnly, totalBudget, startingCash, labels, series, incomePerMonth, monthList]);

  const [containerRef, chartHeight] = useElementHeight(240);

  if (series.length === 0 || labels.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
        No spend in range.
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', minHeight: 240 }}>
      <ResponsiveChartContainer
        height={chartHeight}
        xAxis={[{ data: finalLabels, scaleType: 'band' }]}
        yAxis={[{ valueFormatter: (v: number) => usd.format(v) }]}
        series={finalSeries}
        margin={{ left: 70, right: 20, top: 20, bottom: 60 }}
        sx={
          onMonthClick && monthList.length > 1
            ? { '& .MuiBarElement-root': { cursor: 'pointer' } }
            : undefined
        }
      >
        <BarPlot
          borderRadius={4}
          onItemClick={
            onMonthClick && monthList.length > 1
              ? (_, data) => {
                  const idx = data?.dataIndex;
                  if (idx != null && idx >= 0 && idx < monthList.length) {
                    onMonthClick(monthList[idx]);
                  }
                }
              : undefined
          }
        />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis />
        <ChartsYAxis />
        <ChartsTooltip trigger="axis" slots={{ axisContent: CustomAxisTooltipContent }} />
        {showBudgetLine && <CustomBudgetLine totalBudget={totalBudget} />}

      </ResponsiveChartContainer>
    </Box>
  );
}
