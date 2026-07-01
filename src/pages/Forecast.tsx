import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, Slider, useTheme, Grid } from '@mui/material';
import { invoke } from '@tauri-apps/api/core';
import * as echarts from 'echarts';
import { usd } from '../lib';

interface ProjectionPoint {
    month_index: number;
    month_label: string;
    starting_balance: number;
    income: number;
    recurring_spend: number;
    variable_spend: number;
    loan_payments: number;
    total_debt: number;
    ending_balance: number;
}

export default function Forecast() {
  const theme = useTheme();
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [baseIncome, setBaseIncome] = useState(6000);
  const [startingBalance, setStartingBalance] = useState(15000);
  const [expenseModifier, setExpenseModifier] = useState(1.0);
  const [extraLoanPayment, setExtraLoanPayment] = useState(0);
  const [months, setMonths] = useState(36);

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res: ProjectionPoint[] = await invoke('calculate_projection', {
          params: {
            base_income: baseIncome,
            starting_balance: startingBalance,
            income_gaps: [],
            windfalls: [],
            expense_modifier: expenseModifier,
            global_extra_loan_payment: extraLoanPayment,
            months: months,
          }
        });
        setPoints(res);
      } catch (err) {
        console.error("Failed to load projection:", err);
      }
    }
    load();
  }, [baseIncome, startingBalance, expenseModifier, extraLoanPayment, months]);

  useEffect(() => {
    if (!chartRef.current || points.length === 0) return;
    const chart = echarts.init(chartRef.current);
    
    const option = {
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
      legend: { data: ['Ending Balance', 'Total Debt'], bottom: 0 },
      grid: { left: '8%', right: '5%', top: '5%', bottom: '10%', containLabel: true },
      xAxis: { type: 'category', data: points.map(p => p.month_label) },
      yAxis: { type: 'value', axisLabel: { formatter: (val: number) => `$${val.toLocaleString()}` } },
      series: [
        {
          name: 'Ending Balance',
          type: 'line',
          areaStyle: { opacity: 0.15 },
          smooth: true,
          data: points.map(p => p.ending_balance),
          itemStyle: { color: theme.palette.success.main }
        },
        {
          name: 'Total Debt',
          type: 'line',
          smooth: true,
          data: points.map(p => p.total_debt),
          itemStyle: { color: theme.palette.error.main }
        }
      ]
    };
    
    chart.setOption(option);
    
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [points, theme]);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Typography variant="h4" fontWeight={700} mb={4}>Financial Forecast</Typography>
      
      <Grid container spacing={4}>
        {/* Controls */}
        <Grid size={{ xs: 12, md: 4, lg: 3 }}>
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <Typography variant="h6" fontWeight="600" mb={4}>Simulator</Typography>
            
            <Typography variant="subtitle2" fontWeight="600" gutterBottom>Starting Balance</Typography>
            <Typography variant="h5" mb={1} color="success.main" fontWeight="700">{usd.format(startingBalance)}</Typography>
            <Slider 
              value={startingBalance} 
              min={0} max={100000} step={1000} 
              onChange={(_, val) => setStartingBalance(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Base Monthly Income</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{usd.format(baseIncome)}</Typography>
            <Slider 
              value={baseIncome} 
              min={0} max={30000} step={500} 
              onChange={(_, val) => setBaseIncome(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Variable Expense Modifier</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{Math.round(expenseModifier * 100)}%</Typography>
            <Slider 
              value={expenseModifier} 
              min={0} max={2} step={0.1} 
              onChange={(_, val) => setExpenseModifier(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Extra Monthly Loan Payment</Typography>
            <Typography variant="h5" mb={1} color="primary.main" fontWeight="700">{usd.format(extraLoanPayment)}</Typography>
            <Slider 
              value={extraLoanPayment} 
              min={0} max={10000} step={250} 
              onChange={(_, val) => setExtraLoanPayment(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Time Horizon</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{months} months</Typography>
            <Slider 
              value={months} 
              min={6} max={120} step={6} 
              onChange={(_, val) => setMonths(val as number)} 
            />
          </Paper>
        </Grid>

        {/* Chart */}
        <Grid size={{ xs: 12, md: 8, lg: 9 }}>
          <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', height: 700 }}>
             <Box ref={chartRef} sx={{ width: '100%', height: '100%' }} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
