import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import * as echarts from 'echarts';
import { usd } from '../lib';
import type { Goal } from '../api/scenarios';

export interface LoanBalanceProjection {
  id: number;
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
}

interface ForecastChartsProps {
  points: ProjectionPoint[];
  goals: Goal[];
  debtChartRef: React.RefObject<HTMLDivElement>;
  cashflowChartRef: React.RefObject<HTMLDivElement>;
}

export function ForecastCharts({ points, goals, debtChartRef, cashflowChartRef }: ForecastChartsProps) {
  const theme = useTheme();

  useEffect(() => {
    if (!debtChartRef.current || !cashflowChartRef.current || points.length === 0) return;
    
    const debtChart = echarts.init(debtChartRef.current);
    const cashflowChart = echarts.init(cashflowChartRef.current);
    
    // Prepare Debt Series
    const loanNames = Array.from(new Set(points.flatMap(p => p.loans.map(l => l.name))));
    const debtSeries: any[] = loanNames.map(name => ({
        name,
        type: 'line',
        stack: 'Total',
        areaStyle: { opacity: 0.6 },
        smooth: true,
        showSymbol: false,
        data: points.map(p => {
            const l = p.loans.find(l => l.name === name);
            return l ? l.balance : 0;
        })
    }));

    debtSeries.push({
        name: 'Account Balance',
        type: 'line',
        stack: undefined,
        areaStyle: undefined,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 4, color: theme.palette.success.main },
        itemStyle: { color: theme.palette.success.main },
        data: points.map(p => p.ending_balance)
    });

    const markLines: any[] = [];
    goals.forEach(goal => {
        const achievedPoint = points.find(p => p.achieved_goals.includes(goal.name));
        if (achievedPoint) {
            markLines.push({ xAxis: achievedPoint.month_label, label: { formatter: `📍 ${goal.name}`, position: 'insideStartTop', color: theme.palette.text.primary } });
        }
    });

    const debtOption: any = {
      title: { text: 'Debt Payoff Mountain', left: 'center', textStyle: { color: theme.palette.text.primary, fontWeight: 'bold' } },
      tooltip: { 
        trigger: 'axis',
        formatter: (params: any[]) => {
          let out = `<b>${params[0].axisValue}</b><br/>`;
          params.forEach(p => {
            out += `${p.marker} ${p.seriesName}: ${usd.format(p.value)}<br/>`;
          });
          return out;
        }
      },
      legend: { data: [...loanNames, 'Account Balance'], bottom: 0, textStyle: { color: theme.palette.text.primary } },
      grid: { left: '8%', right: '5%', top: '15%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: points.map(p => p.month_label) },
      yAxis: { type: 'value', axisLabel: { formatter: (val: number) => `$${val.toLocaleString()}` } },
      series: debtSeries
    };

    if (markLines.length > 0 && debtSeries.length > 0) {
        debtOption.series[0].markLine = {
            symbol: ['none', 'none'],
            lineStyle: { type: 'dashed', color: theme.palette.warning.main, width: 2 },
            data: markLines
        };
    }

    debtChart.setOption(debtOption);

    // Prepare Cashflow Series
    const cashflowOption = {
      title: { text: 'Monthly Cashflow', left: 'center', textStyle: { color: theme.palette.text.primary, fontWeight: 'bold' } },
      tooltip: { 
          trigger: 'axis', 
          axisPointer: { type: 'shadow' },
          formatter: (params: any[]) => {
            let out = `<b>${params[0].axisValue}</b><br/>`;
            params.forEach(p => {
              out += `${p.marker} ${p.seriesName}: ${usd.format(p.value)}<br/>`;
            });
            const pt = points[params[0].dataIndex];
            out += `<br/><b>Total Income: ${usd.format(pt.income)}</b>`;
            return out;
          }
      },
      legend: { data: ['Recurring', 'Variable', 'Investing', 'Loans', 'Goal Funding', 'Remainder'], bottom: 0, textStyle: { color: theme.palette.text.primary } },
      grid: { left: '8%', right: '5%', top: '15%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', data: points.map(p => p.month_label) },
      yAxis: { type: 'value', axisLabel: { formatter: (val: number) => `$${val.toLocaleString()}` } },
      series: [
        { name: 'Recurring', type: 'bar', stack: 'Income', data: points.map(p => p.recurring_spend), itemStyle: { color: theme.palette.primary.main } },
        { name: 'Variable', type: 'bar', stack: 'Income', data: points.map(p => p.variable_spend), itemStyle: { color: theme.palette.info.main } },
        { name: 'Investing', type: 'bar', stack: 'Income', data: points.map(p => p.savings_spend), itemStyle: { color: '#9c27b0' } },
        { name: 'Loans', type: 'bar', stack: 'Income', data: points.map(p => p.loan_payments), itemStyle: { color: theme.palette.error.main } },
        { name: 'Goal Funding', type: 'bar', stack: 'Income', data: points.map(p => p.goal_contributions), itemStyle: { color: theme.palette.secondary.main } },
        { name: 'Remainder', type: 'bar', stack: 'Income', data: points.map(p => Math.max(0, p.remainder)), itemStyle: { color: theme.palette.success.main } }
      ]
    };
    
    cashflowChart.setOption(cashflowOption);
    
    const handleResize = () => { debtChart.resize(); cashflowChart.resize(); };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      debtChart.dispose();
      cashflowChart.dispose();
    };
  }, [points, theme, goals, debtChartRef, cashflowChartRef]);

  return null; // This component just manages the chart side-effects on the provided refs
}
