import { useMemo, useEffect, useState, useRef } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { Box } from '@mui/material';
import { monthKey, monthLabel, usd } from '../lib';
import { ACCOUNT_COLORS } from '../theme';
import type { Account, Category, Transaction } from '../types';
import type { GroupBy } from '../store';
import type { RecurrenceInfo } from '../recurrence';
import { isRecurring } from '../recurrence';
import CustomAxisTooltipContent from './ChartTooltip';

/** Track a parent element's height via ResizeObserver so the chart fills
 *  its container exactly (instead of being capped at a fixed vh fraction). */
function useElementHeight(minHeight = 240) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(minHeight);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = Math.max(minHeight, Math.floor(el.clientHeight));
      setHeight((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
}

export default function SpendChart({
  monthList,
  transactions,
  accounts,
  categories,
  groupBy,
  recurrenceMap,
  onMonthClick,
}: Props) {
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
      <BarChart
        height={chartHeight}
        xAxis={[{ data: labels, scaleType: 'band' }]}
        yAxis={[{ valueFormatter: (v: number) => usd.format(v) }]}
        series={series.map((s) => ({
          ...s,
          valueFormatter: (v: number | null) =>
            v == null ? '' : usd.format(v),
        }))}
        margin={{ left: 70, right: 20, top: 20, bottom: 60 }}
        slots={{ axisContent: CustomAxisTooltipContent }}
        slotProps={{ legend: { hidden: true } }}
        onAxisClick={
          onMonthClick && monthList.length > 1
            ? (_, data) => {
                const idx = data?.dataIndex;
                if (idx != null && idx >= 0 && idx < monthList.length) {
                  onMonthClick(monthList[idx]);
                }
              }
            : undefined
        }
        sx={
          onMonthClick && monthList.length > 1
            ? { '& .MuiBarElement-root': { cursor: 'pointer' } }
            : undefined
        }
      />
    </Box>
  );
}
