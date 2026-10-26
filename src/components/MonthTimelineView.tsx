import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import * as echarts from '../utils/echarts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { usd, formatCompactUsd, monthKey as getMonthKey } from '../lib';
import { useFilters } from '../stores/store';
import { buildDashboardFilters, useConsolidatedRecurringMerchants } from '../hooks/queries';
import {
  consolidateRecurringMerchants,
  reconcileMonthTimeline,
  type TimelineExpectedBill,
  type TimelineExpectedIncome,
} from '../domain/forecastSpending';
import { useForecastStore } from '../stores/forecastStore';
import { useShallow } from 'zustand/react/shallow';
import type { Transaction, Account, Category } from '../types';
import { type RecurrenceInfo } from '../domain/recurrence';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface MonthTimelineViewProps {
  currentMonth: string; // "YYYY-MM"
  availableMonths: string[];
  accounts: Account[];
  categories: Category[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  onEditTransaction?: (txn: Transaction) => void;
}

export default function MonthTimelineView({
  currentMonth,
  availableMonths,
  categories,
  recurrenceMap,
  onEditTransaction,
}: MonthTimelineViewProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTabletOrBelow = useMediaQuery(theme.breakpoints.down('md'));
  const filters = useFilters(useShallow(buildDashboardFilters));
  const { data: rawConsolidatedMerchants = [] } = useConsolidatedRecurringMerchants();
  const consolidatedMerchants = useMemo(
    () => consolidateRecurringMerchants(rawConsolidatedMerchants, recurrenceMap),
    [rawConsolidatedMerchants, recurrenceMap]
  );
  const incomeStreams = useForecastStore((s) => s.incomeStreams);
  const forecastTaxRate = useForecastStore((s) => s.taxRate);

  const [yearStr, monthNumStr] = currentMonth.split('-');
  const currentYear = Number(yearStr);
  const monthNum = Number(monthNumStr);
  const monthIndex = monthNum - 1;
  const monthName = MONTH_NAMES[monthIndex] || 'Month';
  const daysInMonth = new Date(currentYear, monthNum, 0).getDate();

  const currentCalMonth = useMemo(() => getMonthKey(new Date()), []);
  const isCurrentCalMonth = currentMonth === currentCalMonth;
  const isActiveOrCurrentMonth =
    isCurrentCalMonth || (availableMonths.length > 0 && currentMonth >= availableMonths[0]);
  const todayDay = useMemo(() => (isCurrentCalMonth ? new Date().getDate() : null), [isCurrentCalMonth]);

  // Chart Mode: Daily Bars vs Cumulative Line
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('dashboard:timelineChartMode') === 'cumulative') {
      return 'cumulative';
    }
    return 'daily';
  });
  const [selectedDay, setSelectedDay] = useState<number>(() => todayDay || 1);
  const [mobileListTab, setMobileListTab] = useState<'upcoming' | 'day'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('dashboard:timelineMobileTab') === 'day') {
      return 'day';
    }
    return 'upcoming';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard:timelineChartMode', chartMode);
    }
  }, [chartMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard:timelineMobileTab', mobileListTab);
    }
  }, [mobileListTab]);

  useEffect(() => {
    setSelectedDay(todayDay || 1);
  }, [currentMonth, todayDay]);

  // Driven by the global Filter Panel (Expenses / Income / All)
  const showSpend = filters.transactionType !== 'income';
  const showIncome = filters.transactionType === 'income' || filters.transactionType === 'all';
  const showExpectedRecurring = filters.recurrenceFilter !== 'onetime';

  // Set of transfer categories so we exclude internal account transfers while keeping both spend and income
  const transferCategoryNames = useMemo(() => {
    return new Set(
      categories.filter((c) => c.type === 'transfer').map((c) => c.name.toLowerCase())
    );
  }, [categories]);

  // Fetch current month's transactions (including both spend and income for full reconciliation)
  const { data: rawMonthTransactions = [] } = useQuery({
    queryKey: ['month_timeline_txns_all', currentMonth, filters],
    queryFn: async () => {
      const startDate = `${currentMonth}-01`;
      const endDate = `${currentMonth}-${String(daysInMonth).padStart(2, '0')}`;
      return api.getTransactionsPaginated(
        {
          ...filters,
          spendOnly: false,
          transactionType: 'all',
          startDate,
          endDate,
        },
        3000,
        0
      );
    },
    staleTime: 30_000,
  });

  const currentMonthTransactions = useMemo(() => {
    return rawMonthTransactions.filter((t) => {
      if (transferCategoryNames.has((t.category || '').toLowerCase())) return false;
      if (filters.transactionType === 'income') return t.amount > 0;
      if (filters.transactionType === 'spend') return t.amount < 0;
      return true;
    });
  }, [rawMonthTransactions, transferCategoryNames, filters.transactionType]);

  const getCategoryColor = (catName: string) => {
    const cat = categories.find((c) => c.name === catName);
    return cat?.color || '#64748b';
  };

  // Educated-guess reconciliation of forecasted recurring bills & income streams vs actual transactions
  const reconciliation = useMemo(
    () =>
      reconcileMonthTimeline({
        monthKey: currentMonth,
        daysInMonth,
        transactions: rawMonthTransactions.filter(
          (t) => !transferCategoryNames.has((t.category || '').toLowerCase())
        ),
        consolidatedMerchants,
        recurrenceMap,
        incomeStreams,
        taxRate: forecastTaxRate,
        disabledCategories: filters.disabledCategories || [],
        enabledAccountIds: filters.enabledAccountIds || [],
        isCurrentMonth: isActiveOrCurrentMonth,
        todayDay,
      }),
    [
      currentMonth,
      daysInMonth,
      rawMonthTransactions,
      transferCategoryNames,
      consolidatedMerchants,
      recurrenceMap,
      incomeStreams,
      forecastTaxRate,
      filters.disabledCategories,
      filters.enabledAccountIds,
      isActiveOrCurrentMonth,
      todayDay,
    ]
  );

  const {
    upcomingBillsByDay,
    upcomingIncomeByDay,
    allExpectedBillsByDay,
    allExpectedIncomeByDay,
    reconciledByTxnId,
  } = reconciliation;

  // Group transactions of the current month by day of month (1 to daysInMonth)
  const currentMonthDays = useMemo(() => {
    const days: Array<{
      day: number;
      dateStr: string;
      weekday: string;
      transactions: Transaction[];
      reconciledBillTxns: Transaction[];
      variableSpendTxns: Transaction[];
      incomeTxns: Transaction[];
      reconciledBillSpendTotal: number;
      variableSpendTotal: number;
      upcomingBills: TimelineExpectedBill[];
      upcomingSpendTotal: number;
      upcomingIncome: TimelineExpectedIncome[];
      upcomingIncomeTotal: number;
      allExpectedBills: TimelineExpectedBill[];
      allExpectedSpendTotal: number;
      allExpectedIncome: TimelineExpectedIncome[];
      allExpectedIncomeTotal: number;
      spendTotal: number;
      incomeTotal: number;
      chargeCount: number;
      cumulativeSpend: number;
      projectedCumulativeSpend: number;
      cumulativeIncome: number;
      projectedCumulativeIncome: number;
    }> = [];

    let cumSpend = 0;
    let projCumSpend = 0;
    let cumIncome = 0;
    let projCumIncome = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDateStr = `${currentYear}-${monthNumStr}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(currentYear, monthIndex, d);
      const weekday = WEEKDAY_NAMES[dateObj.getDay()];

      const dayTxns = currentMonthTransactions.filter((t) => t.date === dayDateStr);
      const upcomingBills = showExpectedRecurring ? upcomingBillsByDay.get(d) || [] : [];
      const upcomingSpendTotal = upcomingBills.reduce((s, b) => s + b.amount, 0);
      const upcomingIncome = showExpectedRecurring ? upcomingIncomeByDay.get(d) || [] : [];
      const upcomingIncomeTotal = upcomingIncome.reduce((s, inc) => s + inc.amount, 0);

      const dayAllExpectedBills = showExpectedRecurring ? allExpectedBillsByDay.get(d) || [] : [];
      const allExpectedSpendTotal = dayAllExpectedBills.reduce((s, b) => s + b.amount, 0);
      const dayAllExpectedIncome = showExpectedRecurring ? allExpectedIncomeByDay.get(d) || [] : [];
      const allExpectedIncomeTotal = dayAllExpectedIncome.reduce((s, inc) => s + inc.amount, 0);

      const reconciledBillTxns: Transaction[] = [];
      const variableSpendTxns: Transaction[] = [];
      const incomeTxns: Transaction[] = [];

      let reconciledBillSpend = 0;
      let variableSpend = 0;
      let dayIncome = 0;

      for (const t of dayTxns) {
        if (t.amount < 0) {
          const absAmt = Math.abs(t.amount);
          const match = t.id !== undefined ? reconciledByTxnId.get(t.id) : undefined;
          if (match && match.kind === 'bill') {
            reconciledBillTxns.push(t);
            reconciledBillSpend += absAmt;
          } else {
            variableSpendTxns.push(t);
            variableSpend += absAmt;
          }
        } else if (t.amount > 0) {
          incomeTxns.push(t);
          dayIncome += t.amount;
        }
      }

      const daySpend = reconciledBillSpend + variableSpend;
      cumSpend += daySpend;
      projCumSpend += daySpend + upcomingSpendTotal;
      cumIncome += dayIncome;
      projCumIncome += dayIncome + upcomingIncomeTotal;

      days.push({
        day: d,
        dateStr: dayDateStr,
        weekday,
        transactions: dayTxns,
        reconciledBillTxns,
        variableSpendTxns,
        incomeTxns,
        reconciledBillSpendTotal: Math.round(reconciledBillSpend * 100) / 100,
        variableSpendTotal: Math.round(variableSpend * 100) / 100,
        upcomingBills,
        upcomingSpendTotal: Math.round(upcomingSpendTotal * 100) / 100,
        upcomingIncome,
        upcomingIncomeTotal: Math.round(upcomingIncomeTotal * 100) / 100,
        allExpectedBills: dayAllExpectedBills,
        allExpectedSpendTotal: Math.round(allExpectedSpendTotal * 100) / 100,
        allExpectedIncome: dayAllExpectedIncome,
        allExpectedIncomeTotal: Math.round(allExpectedIncomeTotal * 100) / 100,
        spendTotal: Math.round(daySpend * 100) / 100,
        incomeTotal: Math.round(dayIncome * 100) / 100,
        chargeCount: dayTxns.filter((t) => t.amount < 0).length,
        cumulativeSpend: Math.round(cumSpend * 100) / 100,
        projectedCumulativeSpend: Math.round(projCumSpend * 100) / 100,
        cumulativeIncome: Math.round(cumIncome * 100) / 100,
        projectedCumulativeIncome: Math.round(projCumIncome * 100) / 100,
      });
    }

    return days;
  }, [
    currentYear,
    monthNumStr,
    monthIndex,
    daysInMonth,
    currentMonthTransactions,
    upcomingBillsByDay,
    upcomingIncomeByDay,
    allExpectedBillsByDay,
    allExpectedIncomeByDay,
    reconciledByTxnId,
    showExpectedRecurring,
  ]);

  const totalUpcomingBillsSpend = useMemo(
    () => currentMonthDays.reduce((s, d) => s + d.upcomingSpendTotal, 0),
    [currentMonthDays]
  );

  const totalUpcomingIncome = useMemo(
    () => currentMonthDays.reduce((s, d) => s + d.upcomingIncomeTotal, 0),
    [currentMonthDays]
  );

  // Summary KPIs for current month (computed from full non-transfer month transactions)
  const totalMonthSpend = useMemo(
    () =>
      rawMonthTransactions
        .filter((t) => !transferCategoryNames.has((t.category || '').toLowerCase()) && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [rawMonthTransactions, transferCategoryNames]
  );

  const totalMonthIncome = useMemo(
    () =>
      rawMonthTransactions
        .filter((t) => !transferCategoryNames.has((t.category || '').toLowerCase()) && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0),
    [rawMonthTransactions, transferCategoryNames]
  );

  const totalChargesCount = useMemo(
    () =>
      rawMonthTransactions.filter(
        (t) => !transferCategoryNames.has((t.category || '').toLowerCase()) && t.amount < 0
      ).length,
    [rawMonthTransactions, transferCategoryNames]
  );

  const remainingBillsCount = Math.max(
    0,
    reconciliation.totalExpectedBillsCount - reconciliation.reconciledBillsCount
  );
  const remainingIncomeCount = Math.max(
    0,
    reconciliation.totalExpectedPaydaysCount - reconciliation.reconciledPaydaysCount
  );

  // All expected bills across the month for the mobile reconciliation list
  const allMonthExpectedBills = useMemo(() => {
    const list: Array<TimelineExpectedBill & { day: number; weekday: string }> = [];
    for (const d of currentMonthDays) {
      for (const b of d.allExpectedBills) {
        list.push({ ...b, day: d.day, weekday: d.weekday });
      }
    }
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'upcoming' ? -1 : 1;
      return a.day - b.day;
    });
  }, [currentMonthDays]);

  // All expected income across the month for the mobile reconciliation list
  const allMonthExpectedIncome = useMemo(() => {
    const list: Array<TimelineExpectedIncome & { day: number; weekday: string }> = [];
    for (const d of currentMonthDays) {
      for (const inc of d.allExpectedIncome) {
        list.push({ ...inc, day: d.day, weekday: d.weekday });
      }
    }
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'upcoming' ? -1 : 1;
      return a.day - b.day;
    });
  }, [currentMonthDays]);

  const selectedDayEntry = useMemo(
    () => currentMonthDays[Math.min(daysInMonth, Math.max(1, selectedDay)) - 1] || currentMonthDays[0],
    [currentMonthDays, daysInMonth, selectedDay]
  );

  // Chart ref & setup
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);

    const xDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const xLabels = xDays.map((d) => `${monthNum}/${d}`);

    const isIncomeOnly = filters.transactionType === 'income';
    const seriesList: any[] = [];

    const todayMarkLine = isCurrentCalMonth && todayDay
      ? {
          symbol: ['none', 'none'],
          silent: true,
          lineStyle: {
            color: '#f59e0b',
            width: 1.5,
            type: 'dashed',
          },
          label: {
            formatter: 'Today',
            position: 'insideEndTop',
            color: '#f59e0b',
            fontSize: isMobile ? 10 : 11,
            fontWeight: 700,
          },
          data: [{ xAxis: `${monthNum}/${todayDay}` }],
        }
      : undefined;

    const barMaxW = isMobile ? 14 : 26;

    const expectedBillsBarLabel = {
      show: !isMobile,
      position: 'top' as const,
      distance: 4,
      hideOverlap: true,
      color: '#f59e0b',
      fontSize: 10,
      fontWeight: 600,
      formatter: (p: any) => {
        const val = Number(p.value || 0);
        if (!val) return '';
        const bills = currentMonthDays[p.dataIndex]?.upcomingBills || [];
        if (bills.length === 1) {
          const shortName = bills[0].displayName.slice(0, 10);
          return `${shortName}\n-${formatCompactUsd(val)}`;
        }
        return `${bills.length} bills\n-${formatCompactUsd(val)}`;
      },
    };

    if (chartMode === 'daily') {
      // Stack by Category (Actual + Expected Bills stacked per day)
      const showExpectedBillsInCat =
        showSpend && showExpectedRecurring && (totalUpcomingBillsSpend > 0 || isActiveOrCurrentMonth);

      if (showSpend) {
        const activeCategories = Array.from(
          new Set([
            ...currentMonthTransactions.filter((t) => t.amount < 0).map((t) => t.category),
            ...currentMonthDays.flatMap((d) => d.upcomingBills.map((b) => b.category)),
          ])
        ).filter(Boolean);

        activeCategories.forEach((catName, idx) => {
          seriesList.push({
            name: catName,
            type: 'bar',
            stack: 'category_spend',
            barMaxWidth: barMaxW,
            markLine: idx === 0 ? todayMarkLine : undefined,
            data: currentMonthDays.map((d) => {
              const actualCat = d.transactions
                .filter((t) => t.amount < 0 && t.category === catName)
                .reduce((s, t) => s + Math.abs(t.amount), 0);
              const val = Math.round(actualCat * 100) / 100;
              return val > 0 ? val : null;
            }),
            itemStyle: {
              color: getCategoryColor(catName),
              borderRadius: [4, 4, 0, 0],
            },
          });
        });

        if (showExpectedBillsInCat) {
          seriesList.push({
            name: 'Expected Bills',
            type: 'bar',
            stack: 'category_spend',
            barMaxWidth: barMaxW,
            markLine: activeCategories.length === 0 ? todayMarkLine : undefined,
            label: expectedBillsBarLabel,
            data: currentMonthDays.map((d) =>
              d.upcomingSpendTotal > 0 ? d.upcomingSpendTotal : null
            ),
            itemStyle: {
              color: 'rgba(245, 158, 11, 0.45)',
              borderColor: '#f59e0b',
              borderWidth: 1.5,
              borderType: 'dashed',
              borderRadius: [4, 4, 0, 0],
              decal: {
                symbol: 'rect',
                dashArrayX: [1, 0],
                dashArrayY: [2, 2],
                rotation: -Math.PI / 4,
                color: 'rgba(255, 255, 255, 0.25)',
              },
            },
          });
        }
      }

      if (showIncome) {
        seriesList.push({
          name: 'Earned Income',
          type: 'bar',
          stack: 'income',
          barMaxWidth: barMaxW,
          markLine: !showSpend ? todayMarkLine : undefined,
          data: currentMonthDays.map((d) => (d.incomeTotal > 0 ? d.incomeTotal : null)),
          itemStyle: {
            color: '#10b981',
            borderRadius: [4, 4, 0, 0],
          },
        });

        if (showExpectedRecurring && (totalUpcomingIncome > 0 || isActiveOrCurrentMonth)) {
          seriesList.push({
            name: 'Expected Paydays',
            type: 'bar',
            stack: 'income',
            barMaxWidth: barMaxW,
            data: currentMonthDays.map((d) =>
              d.upcomingIncomeTotal > 0 ? d.upcomingIncomeTotal : null
            ),
            itemStyle: {
              color: 'rgba(16, 185, 129, 0.35)',
              borderColor: '#10b981',
              borderWidth: 1.5,
              borderType: 'dashed',
              borderRadius: [4, 4, 0, 0],
            },
          });
        }
      }
    } else {
      // Cumulative Burn-Up Mode
      const actualCumLabel = isIncomeOnly ? 'Actual Earned (Cum.)' : 'Actual Spend (Cum.)';
      const projectedCumLabel = isIncomeOnly ? 'Projected Income (+ Expected)' : 'Projected Spend (+ Expected Bills)';

      seriesList.push({
        name: actualCumLabel,
        type: 'line',
        smooth: 0.3,
        smoothMonotone: 'x',
        showSymbol: false,
        markLine: todayMarkLine,
        lineStyle: { width: 3.5, color: isIncomeOnly ? '#10b981' : '#0ea5e9', cap: 'round', join: 'round' },
        itemStyle: { color: isIncomeOnly ? '#10b981' : '#0ea5e9' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: isIncomeOnly ? 'rgba(16, 185, 129, 0.22)' : 'rgba(14, 165, 233, 0.22)' },
            { offset: 1, color: 'rgba(14, 165, 233, 0.02)' },
          ]),
        },
        data: currentMonthDays.map((d) =>
          isCurrentCalMonth && todayDay && d.day > todayDay
            ? null
            : isIncomeOnly
            ? d.cumulativeIncome
            : d.cumulativeSpend
        ),
      });

      if (showExpectedRecurring) {
        seriesList.push({
          name: projectedCumLabel,
          type: 'line',
          smooth: 0.3,
          smoothMonotone: 'x',
          showSymbol: false,
          lineStyle: { width: 3, type: 'dashed', color: '#f59e0b', cap: 'round', join: 'round' },
          itemStyle: { color: '#f59e0b' },
          data: currentMonthDays.map((d) =>
            isIncomeOnly ? d.projectedCumulativeIncome : d.projectedCumulativeSpend
          ),
        });
      }
    }

    const option: any = {
      textStyle: {
        fontFamily: theme.typography.fontFamily,
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        transitionDuration: 0,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
        borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)',
        borderWidth: 1,
        textStyle: {
          color: theme.palette.text.primary,
          fontFamily: theme.typography.fontFamily,
        },
        extraCssText: `max-width: ${isMobile ? '84vw' : '400px'}; white-space: normal; border-radius: ${theme.shape.borderRadius}px; box-shadow: 0 12px 28px rgba(0,0,0,0.28); padding: ${isMobile ? '8px 10px' : '12px'};`,
        axisPointer: { type: chartMode === 'daily' ? 'shadow' : 'line' },
        formatter: (params: any[]) => {
          if (!params || params.length === 0) return '';
          const dayIdx = params[0].dataIndex + 1;
          const dayEntry = currentMonthDays[dayIdx - 1];
          if (!dayEntry) return '';

          const isToday = isCurrentCalMonth && todayDay === dayIdx;
          const borderMuted = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
          const subText = isDark ? '#94a3b8' : '#64748b';
          const totalExpectedCountOnDay =
            dayEntry.allExpectedBills.length + dayEntry.allExpectedIncome.length;

          let out = `<div style="width: ${isMobile ? '255px' : '360px'}; max-width: 100%; font-family: inherit;">`;

          // 1. Header & Day Summary Totals
          out += `<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid ${borderMuted};">`;
          out += `<div style="font-weight: 600; font-size: ${isMobile ? '12px' : '13px'};">Day ${dayIdx} · ${dayEntry.weekday}, ${monthName.slice(0, 3)} ${dayIdx}${isToday ? ' <span style="color:#f59e0b;">(Today)</span>' : ''}</div>`;
          out += `<div style="font-size: 10.5px; color: ${subText}; font-weight: 500;">${dayEntry.transactions.length} actual · ${totalExpectedCountOnDay} expected</div>`;
          out += `</div>`;

          // Summary Pills Row (Actual vs Expected Totals on this day)
          out += `<div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px;">`;
          if (dayEntry.spendTotal > 0) {
            out += `<div style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.12); color: #ef4444; font-weight: 600;">Actual: -${usd.format(dayEntry.spendTotal)}</div>`;
          }
          if (dayEntry.allExpectedSpendTotal > 0) {
            const allFilled = dayEntry.upcomingSpendTotal === 0;
            out += `<div style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 600;">Expected: -${usd.format(dayEntry.allExpectedSpendTotal)}${allFilled ? ' ✓' : ''}</div>`;
          }
          if (dayEntry.incomeTotal > 0) {
            out += `<div style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.14); color: #10b981; font-weight: 600;">Income: +${usd.format(dayEntry.incomeTotal)}</div>`;
          }
          if (dayEntry.allExpectedIncomeTotal > 0) {
            const allFilled = dayEntry.upcomingIncomeTotal === 0;
            out += `<div style="font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px dashed #10b981; font-weight: 600;">Est. Payday: +${usd.format(dayEntry.allExpectedIncomeTotal)}${allFilled ? ' ✓' : ''}</div>`;
          }
          if (
            dayEntry.spendTotal === 0 &&
            dayEntry.allExpectedSpendTotal === 0 &&
            dayEntry.incomeTotal === 0 &&
            dayEntry.allExpectedIncomeTotal === 0
          ) {
            out += `<div style="font-size: 11px; color: ${subText};">No actual or expected activity on this day.</div>`;
          }
          out += `</div>`;

          // 2. Expected Charges & Paydays on this Day (Both Upcoming and Reconciled/Filled)
          if (dayEntry.allExpectedBills.length > 0 || dayEntry.allExpectedIncome.length > 0) {
            out += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(245, 158, 11, 0.45);">`;
            out += `<div style="font-size: 10.5px; font-weight: 600; color: #f59e0b; margin-bottom: 4px;">Expected Charges (${totalExpectedCountOnDay})</div>`;

            dayEntry.allExpectedIncome.forEach((inc) => {
              const isFilled = inc.status === 'filled';
              out += `<div style="margin-bottom: 3px; padding: 3px 6px; border-radius: 5px; background: ${isFilled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)'}; display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10.5px; color: #10b981;">`;
              out += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">${isFilled ? '✓ ' : '⏳ '}${escapeHtml(inc.streamName)}</span>`;
              out += `<span style="font-weight: 600; flex-shrink: 0;">+${usd.format(inc.amount)}</span>`;
              out += `</div>`;
            });

            dayEntry.allExpectedBills.forEach((b) => {
              const isFilled = b.status === 'filled';
              const statusColor = isFilled ? '#818cf8' : '#f59e0b';
              const bg = isFilled
                ? isDark
                  ? 'rgba(99, 102, 241, 0.14)'
                  : 'rgba(99, 102, 241, 0.08)'
                : isDark
                ? 'rgba(245, 158, 11, 0.14)'
                : 'rgba(245, 158, 11, 0.08)';
              const subStatus = isFilled
                ? `Paid -${usd.format(b.actualAmount ?? b.amount)}${b.actualDay && b.actualDay !== b.expectedDay ? ` on ${monthNum}/${b.actualDay}` : ''}`
                : b.isDelayed
                ? `Pending from ${monthNum}/${b.expectedDay}`
                : `Due ${monthNum}/${b.expectedDay}`;

              out += `<div style="margin-bottom: 3px; padding: 4px 6px; border-radius: 5px; background: ${bg};">`;
              out += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10.5px;">`;
              out += `<span style="font-weight: 600; color: ${statusColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${isFilled ? '✓ ' : '⏳ '}${escapeHtml(b.displayName)}</span>`;
              out += `<span style="font-weight: 600; color: ${statusColor}; flex-shrink: 0;">-${usd.format(b.amount)}</span>`;
              out += `</div>`;
              out += `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: ${subText}; margin-top: 1px;">`;
              out += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(b.category)}</span>`;
              out += `<span style="font-weight: 500; flex-shrink: 0;">${subStatus}</span>`;
              out += `</div>`;
              out += `</div>`;
            });
            out += `</div>`;
          }

          // 3. Actual Transactions on this Day
          if (dayEntry.transactions.length > 0) {
            const topTxns = dayEntry.transactions.slice(0, isMobile ? 5 : 8);
            const extraCount = dayEntry.transactions.length - topTxns.length;
            out += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed ${borderMuted};">`;
            out += `<div style="font-size: 10.5px; font-weight: 600; color: #0ea5e9; margin-bottom: 4px;">Actual Transactions (${dayEntry.transactions.length})</div>`;
            topTxns.forEach((t) => {
              const catColor = getCategoryColor(t.category);
              const amtStr = `${t.amount < 0 ? '-' : '+'}${usd.format(Math.abs(t.amount))}`;
              const amtColor = t.amount < 0 ? (isDark ? '#f87171' : '#dc2626') : '#10b981';
              const isReconciled = t.id !== undefined && reconciledByTxnId.has(t.id);
              out += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 10.5px; line-height: 1.55;">`;
              out += `<div style="display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1;">`;
              out += `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${catColor}; flex-shrink: 0;"></span>`;
              out += `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.description)}</span>`;
              if (!isMobile || isReconciled) {
                out += `<span style="font-size: 9.5px; color: ${isReconciled ? '#818cf8' : subText}; flex-shrink: 0;">(${isReconciled ? '✓ Bill' : escapeHtml(t.category)})</span>`;
              }
              if (t.isPending) {
                out += `<span style="font-size: 9.5px; color: #f59e0b; font-weight: 700; flex-shrink: 0;">⏳ Pending</span>`;
              }
              out += `</div>`;
              out += `<span style="font-weight: 600; color: ${amtColor}; flex-shrink: 0;">${amtStr}</span>`;
              out += `</div>`;
            });
            if (extraCount > 0) {
              out += `<div style="font-size: 10px; color: ${subText}; margin-top: 2px;">+${extraCount} more transaction${extraCount === 1 ? '' : 's'}…</div>`;
            }
            out += `</div>`;
          }

          // Cumulative pace summary when in cumulative mode
          if (chartMode === 'cumulative') {
            out += `<div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid ${borderMuted}; display: flex; justify-content: space-between; font-size: 10.5px;">`;
            out += `<span style="color: ${subText};">MTD Spend: <b>${usd.format(dayEntry.cumulativeSpend)}</b></span>`;
            out += `<span style="color: #f59e0b;">Proj: <b>${usd.format(dayEntry.projectedCumulativeSpend)}</b></span>`;
            out += `</div>`;
          }

          out += `</div>`;
          return out;
        },
      },
      legend: {
        show: false,
      },
      grid: { left: isMobile ? '1%' : '2.5%', right: '1.5%', top: 20, bottom: 22, containLabel: true },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: isMobile ? 10 : 11,
          fontFamily: theme.typography.fontFamily,
          interval: isMobile ? 3 : isTabletOrBelow ? 1 : 0,
        },
        axisLine: { lineStyle: { color: theme.palette.divider } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: theme.palette.text.secondary,
          fontSize: isMobile ? 10 : 11,
          fontFamily: theme.typography.fontFamily,
          formatter: (v: number) => formatCompactUsd(v),
        },
        splitLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' } },
      },
      series: seriesList,
    };

    chart.setOption(option, true);

    chart.on('click', (params: any) => {
      if (params && typeof params.dataIndex === 'number') {
        setSelectedDay(params.dataIndex + 1);
        setMobileListTab('day');
      }
    });

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [
    daysInMonth,
    currentYear,
    monthNum,
    monthIndex,
    monthName,
    currentMonthDays,
    currentMonthTransactions,
    chartMode,
    showSpend,
    showIncome,
    showExpectedRecurring,
    theme,
    isDark,
    isMobile,
    isTabletOrBelow,
    isCurrentCalMonth,
    isActiveOrCurrentMonth,
    todayDay,
    totalUpcomingBillsSpend,
    totalUpcomingIncome,
    filters.transactionType,
    reconciledByTxnId,
    categories,
  ]);

  const compactToggleGroupSx = {
    height: 30,
    '& .MuiToggleButton-root': {
      height: 30,
      px: 1.2,
      fontSize: '0.75rem',
      fontWeight: 500,
      textTransform: 'none',
      whiteSpace: 'nowrap',
      '&.Mui-selected': {
        fontWeight: 600,
      },
    },
  };

  const projectedSpendTotal = totalMonthSpend + totalUpcomingBillsSpend;
  const spendActualPct =
    projectedSpendTotal > 0 ? Math.min(100, (totalMonthSpend / projectedSpendTotal) * 100) : 0;
  const spendExpectedPct =
    projectedSpendTotal > 0
      ? Math.min(Math.max(0, 100 - spendActualPct), (totalUpcomingBillsSpend / projectedSpendTotal) * 100)
      : 0;

  const projectedIncomeTotal = totalMonthIncome + totalUpcomingIncome;
  const incomeActualPct =
    projectedIncomeTotal > 0 ? Math.min(100, (totalMonthIncome / projectedIncomeTotal) * 100) : 0;
  const incomeExpectedPct =
    projectedIncomeTotal > 0
      ? Math.min(Math.max(0, 100 - incomeActualPct), (totalUpcomingIncome / projectedIncomeTotal) * 100)
      : 0;

  return (
    <Box
      sx={{
        height: { xs: 'auto', md: '100%' },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        overflow: { xs: 'visible', md: 'hidden' },
      }}
    >
      {/* 1. Header Row */}
      <Stack
        direction="row"
        spacing={1}
        justifyContent="space-between"
        alignItems="center"
        sx={{ flexShrink: 0 }}
      >
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
            {monthName} {currentYear}
          </Typography>
          {isCurrentCalMonth && todayDay && (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Day {todayDay}/{daysInMonth}
            </Typography>
          )}
        </Stack>

        <ToggleButtonGroup
          size="small"
          value={chartMode}
          exclusive
          onChange={(_, val) => val && setChartMode(val)}
          sx={compactToggleGroupSx}
        >
          <ToggleButton value="daily">Bars</ToggleButton>
          <ToggleButton value="cumulative">Cumulative</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* 2. Prominent Spend & Income Reconciliation Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: showSpend && showIncome ? '1fr 1fr' : '1fr' },
          gap: { xs: 1.25, sm: 1.5 },
          flexShrink: 0,
        }}
      >
        {/* Spending Reconciliation Card */}
        {showSpend && (
          <Box
            sx={{
              p: { xs: 1.5, sm: 1.75 },
              borderRadius: (t) => `${t.shape.borderRadius}px`,
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)'),
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={0.5}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
              >
                Spending Reconciliation
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                <strong>{reconciliation.reconciledBillsCount}/{reconciliation.totalExpectedBillsCount}</strong> bills paid ·{' '}
                <strong>{remainingBillsCount}</strong> left
              </Typography>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr auto 1fr',
                alignItems: 'center',
                gap: { xs: 0.5, sm: 1.5 },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Actual ({totalChargesCount})
                </Typography>
                <Typography
                  variant="h5"
                  color="error.main"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  {usd.format(totalMonthSpend)}
                </Typography>
              </Box>

              <Typography variant="body1" color="text.disabled" sx={{ fontWeight: 700, userSelect: 'none', px: 0.25 }}>
                +
              </Typography>

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Expected ({remainingBillsCount})
                </Typography>
                <Typography
                  variant="h5"
                  color="warning.main"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  +{usd.format(totalUpcomingBillsSpend)}
                </Typography>
              </Box>

              <Typography variant="body1" color="text.disabled" sx={{ fontWeight: 700, userSelect: 'none', px: 0.25 }}>
                =
              </Typography>

              <Box sx={{ textAlign: 'right', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Projected
                </Typography>
                <Typography
                  variant="h5"
                  color="text.primary"
                  sx={{
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  {usd.format(projectedSpendTotal)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                height: 5,
                width: '100%',
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ width: `${spendActualPct}%`, bgcolor: 'error.main', transition: 'width 0.25s ease' }} />
              <Box
                sx={{
                  width: `${spendExpectedPct}%`,
                  bgcolor: 'warning.main',
                  opacity: 0.75,
                  transition: 'width 0.25s ease',
                }}
              />
            </Box>
          </Box>
        )}

        {/* Income Reconciliation Card */}
        {showIncome && (
          <Box
            sx={{
              p: { xs: 1.5, sm: 1.75 },
              borderRadius: (t) => `${t.shape.borderRadius}px`,
              bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)'),
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={0.5}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.1, fontSize: { xs: '0.68rem', sm: '0.75rem' } }}
              >
                Income Reconciliation
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.7rem', sm: '0.75rem' } }}>
                <strong>{reconciliation.reconciledPaydaysCount}/{reconciliation.totalExpectedPaydaysCount}</strong> paydays received ·{' '}
                <strong>{remainingIncomeCount}</strong> left
              </Typography>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr auto 1fr',
                alignItems: 'center',
                gap: { xs: 0.5, sm: 1.5 },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Earned So Far
                </Typography>
                <Typography
                  variant="h5"
                  color="success.main"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  +{usd.format(totalMonthIncome)}
                </Typography>
              </Box>

              <Typography variant="body1" color="text.disabled" sx={{ fontWeight: 700, userSelect: 'none', px: 0.25 }}>
                +
              </Typography>

              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Expected ({remainingIncomeCount})
                </Typography>
                <Typography
                  variant="h5"
                  color="success.main"
                  sx={{
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    opacity: 0.8,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  +{usd.format(totalUpcomingIncome)}
                </Typography>
              </Box>

              <Typography variant="body1" color="text.disabled" sx={{ fontWeight: 700, userSelect: 'none', px: 0.25 }}>
                =
              </Typography>

              <Box sx={{ textAlign: 'right', minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: { xs: '0.68rem', sm: '0.75rem' } }} display="block" noWrap>
                  Projected
                </Typography>
                <Typography
                  variant="h5"
                  color="success.main"
                  sx={{
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.2,
                    mt: 0.25,
                    fontSize: { xs: '1rem', sm: '1.35rem', md: '1.5rem' },
                  }}
                >
                  +{usd.format(projectedIncomeTotal)}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                height: 5,
                width: '100%',
                borderRadius: 3,
                overflow: 'hidden',
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ width: `${incomeActualPct}%`, bgcolor: 'success.main', transition: 'width 0.25s ease' }} />
              <Box
                sx={{
                  width: `${incomeExpectedPct}%`,
                  bgcolor: 'success.main',
                  opacity: 0.4,
                  transition: 'width 0.25s ease',
                }}
              />
            </Box>
          </Box>
        )}
      </Box>

      {/* 3. Timeline Graph */}
      <Box
        ref={chartRef}
        sx={{
          width: '100%',
          flex: { xs: 'none', md: 1 },
          height: { xs: 280, sm: 340, md: 'auto' },
          minHeight: { xs: 280, md: 360 },
          pt: 0.5,
        }}
      />

      {/* 4. Mobile Bill / Income Reconciliation & Day Inspector (Visible on Mobile / Tablet) */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          flexDirection: 'column',
          gap: 1.25,
          mt: 0.5,
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
          <ToggleButtonGroup
            size="small"
            value={mobileListTab}
            exclusive
            onChange={(_, v) => v && setMobileListTab(v)}
            sx={compactToggleGroupSx}
          >
            <ToggleButton value="upcoming">
              {showSpend && !showIncome
                ? `Bills (${reconciliation.reconciledBillsCount}/${reconciliation.totalExpectedBillsCount})`
                : !showSpend && showIncome
                ? `Paydays (${reconciliation.reconciledPaydaysCount}/${reconciliation.totalExpectedPaydaysCount})`
                : `Schedule (${reconciliation.reconciledBillsCount + reconciliation.reconciledPaydaysCount}/${reconciliation.totalExpectedBillsCount + reconciliation.totalExpectedPaydaysCount})`}
            </ToggleButton>
            <ToggleButton value="day">
              Day {selectedDayEntry?.day || 1} ({monthName.slice(0, 3)} {selectedDayEntry?.day || 1})
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            Tap chart bar to inspect day
          </Typography>
        </Stack>

        {mobileListTab === 'upcoming' ? (
          <Stack spacing={0.75}>
            {showSpend &&
              allMonthExpectedBills.map((b, idx) => {
                const isFilled = b.status === 'filled';
                return (
                  <Box
                    key={`bill-${b.merchantKey}-${b.day}-${idx}`}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: isFilled ? 'divider' : 'rgba(245, 158, 11, 0.35)',
                      bgcolor: isFilled
                        ? 'background.paper'
                        : isDark
                        ? 'rgba(245, 158, 11, 0.06)'
                        : 'rgba(245, 158, 11, 0.04)',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                            {b.displayName}
                          </Typography>
                          <Chip
                            size="small"
                            label={isFilled ? `✓ Paid ${monthNum}/${b.actualDay || b.expectedDay}` : `⏳ Due ${monthNum}/${b.expectedDay}`}
                            color={isFilled ? 'success' : 'warning'}
                            variant="outlined"
                            sx={{ height: 19, fontSize: '0.66rem', fontWeight: 700 }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {b.category}
                          {isFilled && b.actualAmount !== undefined ? ` · Actual: -${usd.format(b.actualAmount)}` : ''}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: isFilled ? 'text.secondary' : 'warning.main',
                          flexShrink: 0,
                        }}
                      >
                        -{usd.format(b.amount)}
                      </Typography>
                    </Stack>
                  </Box>
                );
              })}

            {showIncome &&
              allMonthExpectedIncome.map((inc, idx) => {
                const isFilled = inc.status === 'filled';
                return (
                  <Box
                    key={`inc-${inc.streamId}-${inc.day}-${idx}`}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: isFilled ? 'divider' : 'rgba(16, 185, 129, 0.35)',
                      bgcolor: isFilled
                        ? 'background.paper'
                        : isDark
                        ? 'rgba(16, 185, 129, 0.06)'
                        : 'rgba(16, 185, 129, 0.04)',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                            {inc.streamName}
                          </Typography>
                          <Chip
                            size="small"
                            label={isFilled ? `✓ Received ${monthNum}/${inc.actualDay || inc.expectedDay}` : `⏳ Expected ${monthNum}/${inc.expectedDay}`}
                            color="success"
                            variant="outlined"
                            sx={{ height: 19, fontSize: '0.66rem', fontWeight: 700 }}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          Income
                          {isFilled && inc.actualAmount !== undefined ? ` · Actual: +${usd.format(inc.actualAmount)}` : ''}
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: isFilled ? 'text.secondary' : 'success.main',
                          flexShrink: 0,
                        }}
                      >
                        +{usd.format(inc.amount)}
                      </Typography>
                    </Stack>
                  </Box>
                );
              })}

            {(!showSpend || allMonthExpectedBills.length === 0) &&
              (!showIncome || allMonthExpectedIncome.length === 0) && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  No recurring items scheduled for this filter in {monthName}.
                </Typography>
              )}
          </Stack>
        ) : (
          selectedDayEntry && (
            <Stack spacing={1} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {selectedDayEntry.weekday}, {monthName.slice(0, 3)} {selectedDayEntry.day}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {selectedDayEntry.transactions.length} actual ·{' '}
                  {(showSpend ? selectedDayEntry.allExpectedBills.length : 0) +
                    (showIncome ? selectedDayEntry.allExpectedIncome.length : 0)}{' '}
                  expected
                </Typography>
              </Stack>

              {showSpend &&
                selectedDayEntry.allExpectedBills.map((b, i) => (
                  <Stack key={`exp-bill-${i}`} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Chip
                        size="small"
                        label={b.status === 'filled' ? '✓ Paid' : '⏳ Expected'}
                        color={b.status === 'filled' ? 'success' : 'warning'}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {b.displayName}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.main', fontVariantNumeric: 'tabular-nums' }}>
                      -{usd.format(b.amount)}
                    </Typography>
                  </Stack>
                ))}

              {showIncome &&
                selectedDayEntry.allExpectedIncome.map((inc, i) => (
                  <Stack key={`exp-inc-${i}`} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                      <Chip
                        size="small"
                        label={inc.status === 'filled' ? '✓ Received' : '⏳ Expected'}
                        color="success"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {inc.streamName}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
                      +{usd.format(inc.amount)}
                    </Typography>
                  </Stack>
                ))}

              {((showSpend && selectedDayEntry.allExpectedBills.length > 0) ||
                (showIncome && selectedDayEntry.allExpectedIncome.length > 0)) &&
                selectedDayEntry.transactions.length > 0 && <Divider />}

              {selectedDayEntry.transactions.map((t) => (
                <Stack
                  key={t.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                  onClick={() => onEditTransaction && onEditTransaction(t)}
                  sx={{ cursor: onEditTransaction ? 'pointer' : 'default', py: 0.25 }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {t.description}
                      </Typography>
                      {t.isPending && (
                        <Chip
                          size="small"
                          label="⏳ Pending"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 17, fontSize: '0.62rem', fontWeight: 700, flexShrink: 0 }}
                        />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {t.category}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: t.amount > 0 ? 'success.main' : 'text.primary',
                      flexShrink: 0,
                    }}
                  >
                    {t.amount > 0 ? `+${usd.format(t.amount)}` : `-${usd.format(Math.abs(t.amount))}`}
                  </Typography>
                </Stack>
              ))}

              {(!showSpend || selectedDayEntry.allExpectedBills.length === 0) &&
                (!showIncome || selectedDayEntry.allExpectedIncome.length === 0) &&
                selectedDayEntry.transactions.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>
                    No activity on {monthName.slice(0, 3)} {selectedDayEntry.day}.
                  </Typography>
                )}
            </Stack>
          )
        )}
      </Box>
    </Box>
  );
}
