import { useMemo, useEffect, useState, useRef } from 'react';
import { Box } from '@mui/material';
import * as echarts from 'echarts';
import { monthKey, monthLabel, usd } from '../lib';
import { ACCOUNT_COLORS } from '../theme';
import type { Account, Category, Transaction } from '../types';
import type { GroupBy } from '../store';
import type { RecurrenceInfo } from '../recurrence';
import { isRecurring } from '../recurrence';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useFilters } from '../store';
import { useBudgetStore } from '../budgetStore';
import { buildForecast } from '../forecast';

/** Track a parent element's height via ResizeObserver */
function useElementHeight(minHeight = 240) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(minHeight);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const initialHeight = Math.max(minHeight, Math.floor(el.clientHeight));
    setHeight(initialHeight);
    
    let timerId: any = null;
    let rAFId: number | null = null;
    
    const measure = () => {
      if (timerId !== null) clearTimeout(timerId);
      timerId = setTimeout(() => {
        timerId = null;
        if (rAFId !== null) cancelAnimationFrame(rAFId);
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
      if (timerId !== null) clearTimeout(timerId);
      if (rAFId !== null) cancelAnimationFrame(rAFId);
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
      id: s.label,
    }));

    const incomeSeries = {
      id: 'income',
      type: 'line' as const,
      label: 'Income',
      color: '#2e7d32',
      data: incomePerMonth,
    };

    if (!showRunway || totalBudget <= 0 || startingCash <= 0 || monthList.length === 0) {
      return {
        finalLabels: labels,
        finalSeries: spendOnly ? spendSeries : [...spendSeries, incomeSeries],
      };
    }

    const lastMonthStr = monthList[monthList.length - 1];

    const currentMonthSpend = transactions
      .filter((t) => t.amount < 0 && monthKey(t.date) === lastMonthStr)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const remainingCurrentMonthBudget = Math.max(0, totalBudget - currentMonthSpend);
    const currentMonthRunway = Math.min(startingCash, remainingCurrentMonthBudget);

    const extendedLabels = [...labels];
    const projectMonths: string[] = [];
    const projectionData: number[] = [];
    const historicalNulls = monthList.slice(0, -1).map(() => null);

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
  }, [showRunway, spendOnly, totalBudget, startingCash, labels, series, incomePerMonth, monthList, transactions]);

  const [containerRef, chartHeight] = useElementHeight(240);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  // Initialize and dispose Echarts instance strictly to prevent memory leaks
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current, undefined, { renderer: 'canvas' });
    chartInstanceRef.current = chart;

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  // Update Echarts option when data or container size changes
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    
    // Explicit resize when chartHeight changes since we observe height manually
    chart.resize();

    const option: echarts.EChartsOption = {
      grid: { left: 70, right: 20, top: 40, bottom: 60 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          
          const spendItems = params.filter(p => p.seriesId !== 'income' && p.seriesId !== 'runway');
          const incomeItem = params.find(p => p.seriesId === 'income');
          const runwayItem = params.find(p => p.seriesId === 'runway');
          
          const sorted = spendItems
            .map(s => ({
              seriesName: s.seriesName,
              color: s.color,
              value: (s.value as number) || 0
            }))
            .filter(s => s.value > 0)
            .sort((a, b) => b.value - a.value);

          const totalSpend = sorted.reduce((sum, s) => sum + s.value, 0);
          const incomeValue = incomeItem ? (incomeItem.value as number) || 0 : 0;
          const runwayValue = runwayItem ? (runwayItem.value as number) || 0 : 0;
          const remaining = incomeValue - totalSpend;

          let html = `<div style="min-width: 220px; max-width: 300px; padding: 4px;">`;
          html += `<div style="font-weight: 600; margin-bottom: 8px; font-family: inherit;">${params[0].axisValueLabel}</div>`;
          
          if (sorted.length === 0 && incomeValue === 0 && runwayValue === 0) {
            html += `<div style="color: #666; font-size: 12px; font-family: inherit;">No activity</div></div>`;
            return html;
          }

          html += `<table style="width: 100%; border-collapse: collapse; font-family: inherit;"><tbody>`;
          
          sorted.forEach(s => {
            html += `
              <tr>
                <td style="width: 12px; padding-right: 8px; vertical-align: middle;">
                  <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${s.color};"></div>
                </td>
                <td style="padding: 2px 8px 2px 0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;">
                  ${s.seriesName}
                </td>
                <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px;">
                  ${usd.format(s.value)}
                </td>
              </tr>
            `;
          });

          if (spendOnly) {
            if (sorted.length > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              html += `
                <tr>
                  <td></td>
                  <td style="padding: 2px 0; font-size: 13px; font-weight: 600;">Total Spend</td>
                  <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 700;">
                    ${usd.format(totalSpend)}
                  </td>
                </tr>
              `;
            }
          } else {
            if (totalSpend > 0 || incomeValue > 0) {
              html += `<tr><td colspan="3" style="padding: 4px 0;"><hr style="margin: 0; border: 0; border-top: 1px solid rgba(0,0,0,0.1);"/></td></tr>`;
              if (totalSpend > 0) {
                html += `
                  <tr>
                    <td></td>
                    <td style="padding: 2px 0; font-size: 13px; color: #666;">Total Spend</td>
                    <td style="padding: 2px 0; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; color: #666;">
                      -${usd.format(totalSpend)}
                    </td>
                  </tr>
                `;
              }
              if (incomeValue > 0) {
                html += `
                  <tr>
                    <td style="width: 12px; padding-right: 8px; vertical-align: middle;">
                      <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${incomeItem?.color || '#2e7d32'};"></div>
                    </td>
                    <td style="padding: 2px 0; font-size: 13px; color: #2e7d32;">Income</td>
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
                  <td style="padding: 2px 0; font-size: 13px; font-weight: 600;">Remaining</td>
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

          html += `</tbody></table></div>`;
          return html;
        }
      },
      xAxis: {
        type: 'category',
        data: finalLabels,
        axisTick: { alignWithLabel: true }
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => usd.format(v) }
      },
      series: finalSeries.map((s, i) => {
        const base: any = {
          id: s.id,
          name: s.label,
          type: s.type,
          data: s.data,
          stack: s.stack,
          itemStyle: { color: s.color },
          // Apply rounding to bars to match MUI aesthetics
          ...(s.type === 'bar' ? { itemStyle: { color: s.color, borderRadius: [4, 4, 0, 0] } } : {})
        };
        
        // Add markLine to the first series for the budget
        if (showBudgetLine && i === 0) {
           base.markLine = {
               data: [{ yAxis: totalBudget, name: 'Monthly Budget' }],
               label: { 
                   show: true, 
                   position: 'middle', 
                   formatter: `Monthly Budget (${usd.format(totalBudget)})`,
                   backgroundColor: '#ffffff',
                   color: '#000000',
                   borderColor: '#000000',
                   borderWidth: 1,
                   borderRadius: 10,
                   padding: [4, 10],
                   fontWeight: 600,
               },
               lineStyle: { color: '#000000', type: 'solid', width: 1 },
               symbol: 'none',
           };
        }
        return base;
      }),
      animation: false // Disabled for max performance with large data sets
    };

    chart.setOption(option, true); // true to merge properly
    
    // Setup click listener
    chart.off('click'); // clear old listener
    chart.on('click', (params) => {
      if (onMonthClick && monthList.length > 1) {
         const idx = params.dataIndex;
         if (idx != null && idx >= 0 && idx < monthList.length) {
           onMonthClick(monthList[idx]);
         }
      }
    });
    
  }, [finalSeries, finalLabels, showBudgetLine, totalBudget, spendOnly, onMonthClick, monthList, chartHeight]);

  if (series.length === 0 || labels.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
        No spend in range.
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', minHeight: 240 }}>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          cursor: (onMonthClick && monthList.length > 1) ? 'pointer' : 'default' 
        }} 
      />
    </Box>
  );
}
