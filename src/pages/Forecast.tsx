import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, Slider, useTheme, Grid, ToggleButtonGroup, ToggleButton, TextField, Button, IconButton, Snackbar, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import DeleteIcon from '@mui/icons-material/Delete';
import { invoke } from '@tauri-apps/api/core';
import * as echarts from 'echarts';
import { usd } from '../lib';
import { usePutArtifact } from '../hooks/mutations';
import { useScenarios } from '../hooks/queries';
import { useCreateScenario, useUpdateScenario, useDeleteScenario } from '../hooks/mutations';
import type { Scenario, Goal } from '../api/scenarios';
import { useForecastStore } from '../store/forecastStore';
import { ForecastCharts } from '../components/ForecastCharts';
import type { ProjectionPoint } from '../components/ForecastCharts';

// Interfaces moved to ForecastCharts.tsx and scenarios.ts

export default function Forecast() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  
  const { 
    baseIncome, setBaseIncome, 
    taxRate, setTaxRate, 
    recurringBudget, setRecurringBudget, 
    savingsBudget, setSavingsBudget, 
    startingBalance, setStartingBalance, 
    variableBudget, setVariableBudget, 
    extraLoanPayment, setExtraLoanPayment, 
    loanStrategy, setLoanStrategy, 
    months, setMonths, 
    goals, setGoals 
  } = useForecastStore();
  
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const putArtifact = usePutArtifact();
  
  const { data: scenarios = [] } = useScenarios();
  const createScenario = useCreateScenario();
  const updateScenario = useUpdateScenario();
  const deleteScenario = useDeleteScenario();
  
  // selectedScenarioId was duplicated, keeping only one declaration
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | ''>('');
  const [scenarioName, setScenarioName] = useState('');

  const debtChartRef = useRef<HTMLDivElement>(null);
  const cashflowChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const monthlyTax = baseIncome * (taxRate / 100);
        const res: ProjectionPoint[] = await invoke('calculate_projection', {
          params: {
            base_income: baseIncome - monthlyTax,
            recurring_budget: recurringBudget,
            savings_budget: savingsBudget,
            starting_balance: startingBalance,
            income_gaps: [],
            windfalls: [],
            variable_budget: variableBudget,
            global_extra_loan_payment: extraLoanPayment,
            loan_strategy: loanStrategy,
            months: months,
            goals: goals.map(g => ({ name: g.name, target_amount: g.amount, monthly_contribution: g.monthlyContribution })),
          }
        });
        setPoints(res);
      } catch (err) {
        console.error("Failed to load projection:", err);
      }
    }
    load();
  }, [baseIncome, taxRate, recurringBudget, savingsBudget, startingBalance, variableBudget, extraLoanPayment, loanStrategy, months, goals]);

  useEffect(() => {
    async function fetchInitialData() {
        try {
            const budgets: any[] = await invoke('get_budgets');
            const categories: any[] = await invoke('get_categories');
            
            let totalVariable = 0;
            let totalRecurring = 0;
            let totalIncome = 0;
            for (const b of budgets) {
                const cat = categories.find((c: any) => c.name === b.category);
                if (cat) {
                    if (cat.type === 'income') {
                        totalIncome += b.monthly_amount;
                    } else if (cat.default_recurrence === 'recurring') {
                        totalRecurring += b.monthly_amount;
                    } else {
                        totalVariable += b.monthly_amount;
                    }
                }
            }
            if (totalVariable > 0) {
                setVariableBudget(totalVariable);
            }
            if (totalRecurring > 0) {
                setRecurringBudget(totalRecurring);
            }
            if (totalIncome > 0) {
                setBaseIncome(totalIncome);
            }

            const accounts: any[] = await invoke('get_accounts');
            let totalCash = 0;
            for (const a of accounts) {
                if (a.type === 'checking' || a.type === 'savings') {
                    totalCash += a.current_balance || 0;
                }
            }
            if (totalCash > 0) {
                setStartingBalance(totalCash);
            }
        } catch (err) {
            console.error("Failed to fetch initial data:", err);
        }
    }
    fetchInitialData();
  }, []);

  // Charts logic extracted to <ForecastCharts />

  const minRemainder = points.length > 0 ? Math.min(...points.map(p => p.remainder)) : 0;
  const minPoint = points.find(p => p.remainder === minRemainder);
  const isNegativeCashflow = minRemainder < 0;

  const handleSaveScenario = () => {
    const markdown = `# Financial Forecast Scenario

## Settings Snapshot
- **Starting Balance:** ${usd.format(startingBalance)}
- **Base Monthly Income:** ${usd.format(baseIncome)}
- **Tax Rate:** ${taxRate}%
- **Recurring Budget:** ${usd.format(recurringBudget)}
- **Variable Budget:** ${usd.format(variableBudget)}
- **Investing/Savings:** ${usd.format(savingsBudget)}
- **Extra Loan Payment:** ${usd.format(extraLoanPayment)}
- **Loan Strategy:** ${loanStrategy}

## Results
- **Safe Cash to Blow:** ${usd.format(minRemainder)}
- **Tightest Month:** ${minPoint?.month_label || 'N/A'}
`;

    const debtChartInstance = debtChartRef.current ? echarts.getInstanceByDom(debtChartRef.current) : null;
    const cashflowChartInstance = cashflowChartRef.current ? echarts.getInstanceByDom(cashflowChartRef.current) : null;

    let finalMarkdown = markdown;
    if (debtChartInstance) {
        finalMarkdown += `\n\n## Debt Payoff Mountain\n![Debt Chart](${debtChartInstance.getDataURL({ type: 'png', backgroundColor: theme.palette.background.paper })})\n`;
    }
    if (cashflowChartInstance) {
        finalMarkdown += `\n\n## Monthly Cashflow\n![Cashflow Chart](${cashflowChartInstance.getDataURL({ type: 'png', backgroundColor: theme.palette.background.paper })})\n`;
    }

    putArtifact.mutate({
      id: `scenario-${Date.now()}`,
      type: 'markdown',
      title: `Scenario: ${usd.format(minRemainder)} Blow Money`,
      content: finalMarkdown,
      explanation: 'A snapshot of a financial scenario from the forecast simulator.',
      summary: 'Forecast Scenario Snapshot',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      path: null,
      source: null,
      associatedChecklistId: null
    }, {
      onSuccess: () => {
        setSnackbarMessage('Scenario saved to Artifacts successfully!');
      },
      onError: () => {
        setSnackbarMessage('Failed to save scenario.');
      }
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100vh', bgcolor: 'background.default' }}>
      <Typography variant="h4" fontWeight={700} mb={1}>Financial Forecast</Typography>
      <Typography variant="subtitle1" color="text.secondary" mb={4}>Gamify your debt payoff and savings goals.</Typography>
      


      <PanelGroup 
        orientation={isMobile ? 'vertical' : 'horizontal'}
        onLayoutChanged={() => {
          if (debtChartRef.current) echarts.getInstanceByDom(debtChartRef.current)?.resize();
          if (cashflowChartRef.current) echarts.getInstanceByDom(cashflowChartRef.current)?.resize();
        }}
      >
        {/* Controls */}
        <Panel defaultSize="35%" minSize="25%" maxSize="50%" style={{ paddingRight: isMobile ? 0 : 16, paddingBottom: isMobile ? 16 : 0, overflow: 'auto' }}>
          <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <Typography variant="h6" fontWeight="600" mb={4}>Simulator Settings</Typography>
            
            <Box sx={{ mb: 4, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" fontWeight="600" gutterBottom>Saved Scenarios</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Load Scenario</InputLabel>
                  <Select
                    label="Load Scenario"
                    value={selectedScenarioId}
                    onChange={(e) => {
                      const id = e.target.value as number;
                      const s = scenarios.find(x => x.id === id);
                      if (s) {
                        setSelectedScenarioId(s.id || '');
                        setScenarioName(s.name);
                        useForecastStore.getState().loadScenario(s);
                      }
                    }}
                  >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {scenarios.map(s => (
                      <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {selectedScenarioId !== '' && (
                  <IconButton color="error" onClick={() => {
                    deleteScenario.mutate(selectedScenarioId as number, {
                      onSuccess: () => {
                        setSelectedScenarioId('');
                        setScenarioName('');
                        setSnackbarMessage('Scenario deleted');
                      }
                    });
                  }}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  label="Scenario Name"
                  fullWidth
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                />
                <Button 
                  variant="contained" 
                  disabled={!scenarioName}
                  onClick={() => {
                    const data: Scenario = {
                      name: scenarioName,
                      startingBalance,
                      baseIncome,
                      taxRate,
                      recurringBudget,
                      variableBudget,
                      savingsBudget,
                      extraLoanPayment,
                      loanStrategy,
                      goals
                    };
                    if (selectedScenarioId) {
                      updateScenario.mutate({ ...data, id: selectedScenarioId as number }, {
                        onSuccess: () => setSnackbarMessage('Scenario updated')
                      });
                    } else {
                      createScenario.mutate(data, {
                        onSuccess: (id: number) => {
                          setSelectedScenarioId(id);
                          setSnackbarMessage('Scenario created');
                        }
                      });
                    }
                  }}
                >
                  Save
                </Button>
              </Box>
            </Box>

            <Typography variant="subtitle2" fontWeight="600" gutterBottom>Starting Balance</Typography>
            <Typography variant="h5" mb={1} color="success.main" fontWeight="700">{usd.format(startingBalance)}</Typography>
            <Slider 
              value={startingBalance} 
              min={0} max={100000} step={1000} 
              onChange={(_, val) => setStartingBalance(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Base Monthly Income</Typography>
            <Typography variant="h5" mb={0.5} fontWeight="700">{usd.format(baseIncome)}</Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>Year Total: {usd.format(baseIncome * 12)}</Typography>
            <Slider 
              value={baseIncome} 
              min={0} max={30000} step={500} 
              onChange={(_, val) => setBaseIncome(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Tax Percentage</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{taxRate}%</Typography>
            <Slider 
              value={taxRate} 
              min={0} max={50} step={1} 
              marks={[
                { value: 10, label: '10%' },
                { value: 12, label: '12%' },
                { value: 22, label: '22%' },
                { value: 24, label: '24%' },
                { value: 32, label: '32%' },
                { value: 35, label: '35%' },
                { value: 37, label: '37%' },
              ]}
              onChange={(_, val) => setTaxRate(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Monthly Recurring Budget</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{usd.format(recurringBudget)}</Typography>
            <Slider 
              value={recurringBudget} 
              min={0} max={15000} step={100} 
              onChange={(_, val) => setRecurringBudget(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Monthly Variable Budget</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{usd.format(variableBudget)}</Typography>
            <Slider 
              value={variableBudget} 
              min={0} max={10000} step={100} 
              onChange={(_, val) => setVariableBudget(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Monthly Savings / Investing</Typography>
            <Typography variant="h5" mb={1} fontWeight="700" color="secondary.main">{usd.format(savingsBudget)}</Typography>
            <Slider 
              value={savingsBudget} 
              min={0} max={10000} step={100} 
              onChange={(_, val) => setSavingsBudget(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Extra Monthly Loan Payment</Typography>
            <Typography variant="h5" mb={1} color="primary.main" fontWeight="700">{usd.format(extraLoanPayment)}</Typography>
            <Slider 
              value={extraLoanPayment} 
              min={0} max={10000} step={250} 
              onChange={(_, val) => setExtraLoanPayment(val as number)} 
            />

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 4 }}>Loan Payoff Strategy</Typography>
            <ToggleButtonGroup
              color="primary"
              value={loanStrategy}
              exclusive
              fullWidth
              onChange={(_, val) => val && setLoanStrategy(val)}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="avalanche" sx={{ textTransform: 'none' }}>Avalanche</ToggleButton>
              <ToggleButton value="snowball" sx={{ textTransform: 'none' }}>Snowball</ToggleButton>
              <ToggleButton value="evenly" sx={{ textTransform: 'none' }}>Evenly</ToggleButton>
            </ToggleButtonGroup>

            <Typography variant="subtitle2" fontWeight="600" gutterBottom sx={{ mt: 2 }}>Time Horizon</Typography>
            <Typography variant="h5" mb={1} fontWeight="700">{months} months</Typography>
            <Slider 
              value={months} 
              min={6} max={240} step={6} 
              onChange={(_, val) => setMonths(val as number)} 
            />
          </Paper>

          <Paper sx={{ p: 3, mt: 4, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <Typography variant="h6" fontWeight="600" mb={2}>Custom Goals</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Add arbitrary goals to see when your cumulative remainder can afford them.
            </Typography>

            {goals.map((g, idx) => (
                <Box key={g.id} sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                    <TextField 
                        size="small" 
                        label="Name" 
                        value={g.name} 
                        onChange={e => {
                            const newGoals = [...goals];
                            newGoals[idx].name = e.target.value;
                            setGoals(newGoals);
                        }} 
                    />
                    <TextField 
                        size="small" 
                        label="Amount ($)" 
                        type="number"
                        value={g.amount} 
                        onChange={e => {
                            const newGoals = [...goals];
                            const amt = Number(e.target.value);
                            newGoals[idx].amount = amt;
                            newGoals[idx].monthlyContribution = amt / newGoals[idx].targetMonths;
                            setGoals(newGoals);
                        }} 
                    />
                    <TextField 
                        size="small" 
                        label="Target (Months)" 
                        type="number"
                        value={g.targetMonths} 
                        onChange={e => {
                            const newGoals = [...goals];
                            const t = Math.max(1, Number(e.target.value));
                            newGoals[idx].targetMonths = t;
                            newGoals[idx].monthlyContribution = newGoals[idx].amount / t;
                            setGoals(newGoals);
                        }} 
                    />
                    <TextField 
                        size="small" 
                        label="Monthly ($)" 
                        type="number"
                        value={Math.round(g.monthlyContribution)} 
                        onChange={e => {
                            const newGoals = [...goals];
                            const m = Math.max(1, Number(e.target.value));
                            newGoals[idx].monthlyContribution = m;
                            newGoals[idx].targetMonths = Math.ceil(newGoals[idx].amount / m);
                            setGoals(newGoals);
                        }} 
                    />
                    <IconButton size="small" color="error" onClick={() => setGoals(goals.filter(x => x.id !== g.id))}>
                        <DeleteIcon />
                    </IconButton>
                </Box>
            ))}
            <Button variant="outlined" fullWidth onClick={() => setGoals([...goals, { id: Math.random().toString(), name: 'New Goal', amount: 1000, targetMonths: 10, monthlyContribution: 100 }])}>
                + Add Goal
            </Button>
            
            <Button variant="contained" color="primary" fullWidth sx={{ mt: 4 }} onClick={handleSaveScenario}>
              Save Scenario as Artifact
            </Button>

          </Paper>
        </Panel>

        {!isMobile && (
          <PanelResizeHandle style={{ width: 8, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: 4, height: 24, borderRadius: 2, bgcolor: 'divider' }} />
          </PanelResizeHandle>
        )}

        {/* Charts */}
        <Panel minSize="30%" style={{ paddingLeft: isMobile ? 0 : 16, overflow: 'auto' }}>
          <Paper sx={{ p: 4, mb: 4, border: '1px solid', borderColor: 'divider', boxShadow: 'none', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Typography variant="h6" fontWeight="bold" mb={1}>Safe Cash to Blow</Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>Your minimum monthly remainder after all obligations across the entire timeline.</Typography>
              <Typography variant="h3" fontWeight="900" color={minRemainder >= 0 ? 'success.main' : 'error.main'}>
                {usd.format(minRemainder)}
              </Typography>
              
              {minPoint && (
                <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider', width: '100%', maxWidth: 400, mx: 'auto', textAlign: 'left' }}>
                  <Typography variant="body2" fontWeight="bold" mb={1.5} color="text.secondary">Math for {minPoint.month_label} (Tightest Month):</Typography>
                  <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2">Net Income</Typography><Typography variant="body2">{usd.format(minPoint.income)}</Typography></Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="text.secondary">- Recurring</Typography><Typography variant="body2" color="error.main">-{usd.format(minPoint.recurring_spend)}</Typography></Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="text.secondary">- Variable</Typography><Typography variant="body2" color="error.main">-{usd.format(minPoint.variable_spend)}</Typography></Box>
                  {minPoint.savings_spend > 0 && <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="text.secondary">- Investing</Typography><Typography variant="body2" color="error.main">-{usd.format(minPoint.savings_spend)}</Typography></Box>}
                  <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="text.secondary">- Loans</Typography><Typography variant="body2" color="error.main">-{usd.format(minPoint.loan_payments)}</Typography></Box>
                  {minPoint.goal_contributions > 0 && <Box display="flex" justifyContent="space-between" mb={0.5}><Typography variant="body2" color="text.secondary">- Goals</Typography><Typography variant="body2" color="error.main">-{usd.format(minPoint.goal_contributions)}</Typography></Box>}
                </Box>
              )}
          </Paper>

          <Paper sx={{ p: 3, mb: 4, border: '1px solid', borderColor: 'divider', boxShadow: 'none', height: 500 }}>
             <Box ref={debtChartRef} sx={{ width: '100%', height: '100%' }} />
          </Paper>
          <Paper sx={{ p: 3, mb: 4, border: '1px solid', borderColor: 'divider', boxShadow: 'none', height: 500 }}>
             <Box ref={cashflowChartRef} sx={{ width: '100%', height: '100%' }} />
          </Paper>
          <ForecastCharts points={points} goals={goals} debtChartRef={debtChartRef} cashflowChartRef={cashflowChartRef} />
        </Panel>
      </PanelGroup>

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage || ''}
      />
    </Box>
  );
}
