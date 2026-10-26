import { useEffect } from 'react';
import { useTheme, useMediaQuery } from '@mui/material';
import * as echarts from '../utils/echarts';
import { usd } from '../lib';
import type { Goal } from '../api/scenarios';

export interface LoanBalanceProjection {
  id: number;
  name: string;
  balance: number;
}

export interface DestinationBalanceProjection {
  name: string;
  balance: number;
}

export interface ProjectionPoint {
  month_index: number;
  month_label: string;
  starting_balance: number;
  income: number;
  recurring_spend: number;
  variable_spend: number;
  savings_spend: number;
  loan_payments: number;
  total_debt: number;
  loans: LoanBalanceProjection[];
  goal_contributions: number;
  achieved_goals: string[];
  remainder: number;
  cumulative_remainder: number;
  ending_balance: number;
  investment_balance: number;
  destination_balances?: DestinationBalanceProjection[];
  home_equity?: number;
  property_value?: number;
  mortgage_debt?: number;
  net_worth?: number;
  liquid_net_worth?: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function labelToMonthKey(label: string): string {
  const parts = label.trim().split(' ');
  if (parts.length === 2) {
    const mIdx = MONTH_NAMES.indexOf(parts[0]);
    if (mIdx !== -1) {
      const year = parts[1];
      const monthStr = String(mIdx + 1).padStart(2, '0');
      return `${year}-${monthStr}`;
    }
  }
  return label;
}

interface ForecastChartsProps {
  points: ProjectionPoint[];
  goals: Goal[];
  debtChartRef: React.RefObject<HTMLDivElement>;
  cashflowChartRef: React.RefObject<HTMLDivElement>;
  onMonthClick?: (monthKey: string) => void;
}

export function ForecastCharts({ points, goals, debtChartRef, cashflowChartRef, onMonthClick }: ForecastChartsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (!debtChartRef.current || !cashflowChartRef.current || points.length === 0) return;
    
    const debtChart = echarts.init(debtChartRef.current);
    const cashflowChart = echarts.init(cashflowChartRef.current);
    
    // Prepare Debt Series
    const loanNames = Array.from(new Set(points.flatMap(p => (p.loans || []).map(l => l.name))));
    const debtSeries: any[] = loanNames.map(name => ({
        name,
        type: 'line',
        stack: 'Total',
        areaStyle: { opacity: 0.6 },
        smooth: 0.35,
        smoothMonotone: 'x',
        showSymbol: false,
        lineStyle: { width: isMobile ? 2.5 : 3, cap: 'round', join: 'round' },
        data: points.map(p => {
            const l = (p.loans || []).find(l => l.name === name);
            return l ? l.balance : 0;
        })
    }));

    debtSeries.push({
        name: 'Operating Cash',
        type: 'line',
        stack: undefined,
        areaStyle: undefined,
        smooth: 0.35,
        smoothMonotone: 'x',
        showSymbol: false,
        lineStyle: { width: isMobile ? 3.5 : 4.5, color: theme.palette.success.main, cap: 'round', join: 'round' },
        itemStyle: { color: theme.palette.success.main },
        data: points.map(p => p.ending_balance)
    });

    // Destination accounts (e.g. Fidelity Roth IRA, Truist Savings, Robinhood)
    const destinationNames = Array.from(new Set(points.flatMap(p => (p.destination_balances || []).map(d => d.name))));
    const destPalette = [
      '#8b5cf6', // Violet / Purple (Roth IRA)
      '#0ea5e9', // Sky Blue
      '#10b981', // Emerald (High Yield Savings)
      '#f59e0b', // Amber / Gold
      '#ec4899', // Pink
      '#14b8a6', // Teal
    ];

    if (destinationNames.length > 0) {
      destinationNames.forEach((name, idx) => {
        const color = destPalette[idx % destPalette.length];
        debtSeries.push({
          name,
          type: 'line',
          stack: undefined,
          areaStyle: undefined,
          smooth: 0.35,
          smoothMonotone: 'x',
          showSymbol: false,
          lineStyle: { width: isMobile ? 3.5 : 4.5, color, cap: 'round', join: 'round' },
          itemStyle: { color },
          data: points.map(p => {
            const d = (p.destination_balances || []).find(x => x.name === name);
            return d ? d.balance : 0;
          })
        });
      });
    } else {
      debtSeries.push({
        name: 'Investment Portfolio',
        type: 'line',
        stack: undefined,
        areaStyle: undefined,
        smooth: 0.35,
        smoothMonotone: 'x',
        showSymbol: false,
        lineStyle: { width: isMobile ? 3.5 : 4.5, color: theme.palette.secondary.main, cap: 'round', join: 'round' },
        itemStyle: { color: theme.palette.secondary.main },
        data: points.map(p => p.investment_balance)
      });
    }

    const hasHomeEquity = points.some(p => (p.home_equity || 0) > 0);
    if (hasHomeEquity) {
      debtSeries.push({
        name: 'Home Equity',
        type: 'line',
        stack: undefined,
        areaStyle: undefined,
        smooth: 0.35,
        smoothMonotone: 'x',
        showSymbol: false,
        lineStyle: { width: isMobile ? 3.5 : 4.5, color: '#10b981', cap: 'round', join: 'round' },
        itemStyle: { color: '#10b981' },
        data: points.map(p => Math.round(p.home_equity || 0))
      });
    }

    // Total Net Worth trajectory
    debtSeries.push({
      name: 'Total Net Worth',
      type: 'line',
      stack: undefined,
      areaStyle: undefined,
      smooth: 0.35,
      smoothMonotone: 'x',
      showSymbol: false,
      lineStyle: { width: isMobile ? 4 : 5.5, type: 'dashed', color: theme.palette.mode === 'dark' ? '#93c5fd' : '#2563eb', cap: 'round', join: 'round' },
      itemStyle: { color: theme.palette.mode === 'dark' ? '#93c5fd' : '#2563eb' },
      data: points.map(p => {
        if (p.net_worth !== undefined) return Math.round(p.net_worth);
        const cash = p.ending_balance || 0;
        const invested = p.investment_balance || 0;
        const homeEq = p.home_equity || 0;
        const nonMortgageDebt = Math.max(0, (p.total_debt || 0) - (p.mortgage_debt || 0));
        return Math.round(cash + invested + homeEq - nonMortgageDebt);
      })
    });

    const markLines: any[] = [];
    goals.forEach(goal => {
        const achievedPoint = points.find(p => p.achieved_goals.includes(goal.name));
        if (achievedPoint) {
            markLines.push({ xAxis: achievedPoint.month_label, label: { formatter: `📍 ${goal.name}`, position: 'insideStartTop', color: theme.palette.text.primary } });
        }
    });

    const activeLegendItems = [
      ...loanNames,
      'Operating Cash',
      ...(destinationNames.length > 0 ? destinationNames : ['Investment Portfolio']),
      ...(hasHomeEquity ? ['Home Equity'] : []),
      'Total Net Worth'
    ];

    const debtOption: any = {
      title: { 
        text: 'Net Worth & Destination Growth', 
        left: 'center', 
        top: isMobile ? 4 : 10,
        textStyle: { color: theme.palette.text.primary, fontWeight: 700, fontSize: isMobile ? 14 : 16 } 
      },
      tooltip: { 
        trigger: 'axis',
        confine: true,
        formatter: (params: any[]) => {
          let out = `<b>${params[0].axisValue}</b><br/>`;
          params.forEach(p => {
            out += `${p.marker} ${p.seriesName}: ${usd.format(p.value)}<br/>`;
          });
          return out;
        }
      },
      legend: { 
        type: 'scroll',
        data: activeLegendItems, 
        bottom: 4, 
        left: 'center',
        padding: [0, 16],
        itemGap: isMobile ? 10 : 14,
        formatter: (name: string) => (name.length > 22 ? `${name.substring(0, 20)}…` : name),
        textStyle: { color: theme.palette.text.primary, fontSize: isMobile ? 11 : 12 },
        pageIconColor: theme.palette.primary.main,
        pageIconInactiveColor: theme.palette.text.disabled,
        pageTextStyle: { color: theme.palette.text.secondary, fontSize: 11 },
      },
      grid: { left: isMobile ? '2%' : '5%', right: isMobile ? '3%' : '4%', top: isMobile ? 42 : 55, bottom: isMobile ? 50 : 65, containLabel: true },
      xAxis: {
        type: 'category',
        data: points.map(p => p.month_label),
        axisLabel: { fontSize: isMobile ? 10 : 12, hideOverlap: true },
      },
      yAxis: { 
        type: 'value', 
        axisLabel: { 
          fontSize: isMobile ? 10 : 12,
          formatter: (val: number) => {
            const abs = Math.abs(val);
            const sign = val < 0 ? '-' : '';
            if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
            return `${sign}$${abs}`;
          } 
        } 
      },
      series: debtSeries
    };

    if (markLines.length > 0 && debtSeries.length > 0) {
        debtOption.series[0].markLine = {
            symbol: ['none', 'none'],
            lineStyle: { type: 'dashed', color: theme.palette.warning.main, width: 2 },
            data: markLines
        };
    }

    debtChart.setOption(debtOption, true);

    // Curated, harmonious fintech palette designed to avoid garish, high-saturation RGB clashing
    const isDark = theme.palette.mode === 'dark';
    const cashflowPalette = {
      recurring: isDark ? '#818cf8' : '#6366f1',    // Sophisticated indigo
      variable: isDark ? '#38bdf8' : '#0ea5e9',     // Soft sky blue
      investing: isDark ? '#2dd4bf' : '#14b8a6',    // Modern teal
      loans: isDark ? '#fda4af' : '#fb7185',        // Gentle rose / coral (calm, non-alarming)
      goalFunding: isDark ? '#c084fc' : '#a855f7',  // Soft lavender
      remainder: isDark ? '#6ee7b7' : '#34d399',    // Fresh soothing mint / emerald
    };

    // Prepare Cashflow Series
    const cashflowOption = {
      title: {
        text: 'Monthly Cashflow',
        left: 'center',
        top: isMobile ? 4 : 8,
        textStyle: { color: theme.palette.text.primary, fontWeight: 600, fontSize: isMobile ? 14 : 16 }
      },
      tooltip: { 
          trigger: 'axis', 
          confine: true,
          axisPointer: { type: 'shadow' },
          formatter: (params: any[]) => {
            let out = `<b>${params[0].axisValue}</b><br/>`;
            params.forEach(p => {
              out += `${p.marker} ${p.seriesName}: ${usd.format(p.value)}<br/>`;
            });
            const pt = points[params[0].dataIndex];
            out += `<br/><b>Total Income: ${usd.format(pt.income)}</b>`;
            if (onMonthClick) {
              out += `<br/><span style="font-size: 11px; color: #1976d2; font-weight: 600; display: inline-block; margin-top: 4px;">👆 Tap bar to inspect month breakdown</span>`;
            }
            return out;
          }
      },
      legend: { 
        type: 'scroll',
        data: ['Recurring', 'Variable', 'Investing', 'Loans', 'Goal Funding', 'Remainder'], 
        bottom: 4, 
        left: 'center',
        padding: [0, 16],
        itemGap: isMobile ? 10 : 14,
        textStyle: { color: theme.palette.text.primary, fontSize: isMobile ? 11 : 12 },
        itemWidth: 12,
        itemHeight: 12,
        itemStyle: { borderRadius: 3 },
        pageIconColor: theme.palette.primary.main,
        pageIconInactiveColor: theme.palette.text.disabled,
        pageTextStyle: { color: theme.palette.text.secondary, fontSize: 11 },
      },
      grid: { left: isMobile ? '2%' : '5%', right: isMobile ? '3%' : '4%', top: isMobile ? 42 : 60, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: points.map(p => p.month_label),
        axisLabel: { fontSize: isMobile ? 10 : 12, hideOverlap: true },
      },
      yAxis: { 
        type: 'value', 
        axisLabel: { 
          fontSize: isMobile ? 10 : 12,
          formatter: (val: number) => {
            const abs = Math.abs(val);
            const sign = val < 0 ? '-' : '';
            if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
            return `${sign}$${abs}`;
          } 
        } 
      },
      series: [
        { 
          name: 'Recurring', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => p.recurring_spend), 
          itemStyle: { color: cashflowPalette.recurring, borderRadius: [0, 0, 2, 2] } 
        },
        { 
          name: 'Variable', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => p.variable_spend), 
          itemStyle: { color: cashflowPalette.variable } 
        },
        { 
          name: 'Investing', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => p.savings_spend), 
          itemStyle: { color: cashflowPalette.investing } 
        },
        { 
          name: 'Loans', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => p.loan_payments), 
          itemStyle: { color: cashflowPalette.loans } 
        },
        { 
          name: 'Goal Funding', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => p.goal_contributions), 
          itemStyle: { color: cashflowPalette.goalFunding } 
        },
        { 
          name: 'Remainder', 
          type: 'bar', 
          stack: 'Income', 
          barMaxWidth: 36,
          data: points.map(p => Math.max(0, p.remainder)), 
          itemStyle: { color: cashflowPalette.remainder, borderRadius: [2, 2, 0, 0] } 
        }
      ]
    };
    
    cashflowChart.setOption(cashflowOption, true);

    if (onMonthClick) {
      cashflowChart.getZr().setCursorStyle('pointer');
      cashflowChart.on('click', (params: any) => {
        const idx = params.dataIndex;
        if (idx != null && idx >= 0 && idx < points.length) {
          const monthKey = labelToMonthKey(points[idx].month_label);
          onMonthClick(monthKey);
        }
      });
    }
    
    const resizeObserver = new ResizeObserver(() => {
      debtChart.resize();
      cashflowChart.resize();
    });
    if (debtChartRef.current) resizeObserver.observe(debtChartRef.current);
    if (cashflowChartRef.current) resizeObserver.observe(cashflowChartRef.current);

    const handleResize = () => { debtChart.resize(); cashflowChart.resize(); };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      debtChart.dispose();
      cashflowChart.dispose();
    };
  }, [points, theme, isMobile, goals, debtChartRef, cashflowChartRef, onMonthClick]);

  return null; // This component just manages the chart side-effects on the provided refs
}
