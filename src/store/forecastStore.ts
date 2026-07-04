import { create } from 'zustand';
import type { Scenario, Goal } from '../api/scenarios';

interface ForecastState {
  baseIncome: number;
  taxRate: number;
  recurringBudget: number;
  savingsBudget: number;
  startingBalance: number;
  variableBudget: number;
  extraLoanPayment: number;
  divertExtraToSavings: boolean;
  loanStrategy: 'avalanche' | 'snowball' | 'custom';
  months: number;
  investmentGrowthRate: number;
  goals: Goal[];
  
  // Actions
  setBaseIncome: (val: number) => void;
  setTaxRate: (val: number) => void;
  setRecurringBudget: (val: number) => void;
  setSavingsBudget: (val: number) => void;
  setStartingBalance: (val: number) => void;
  setVariableBudget: (val: number) => void;
  setExtraLoanPayment: (val: number) => void;
  setDivertExtraToSavings: (val: boolean) => void;
  setLoanStrategy: (val: 'avalanche' | 'snowball' | 'custom') => void;
  setMonths: (val: number) => void;
  setInvestmentGrowthRate: (val: number) => void;
  setGoals: (val: Goal[]) => void;
  
  // Bulk load
  loadScenario: (scenario: Scenario) => void;
}

export const useForecastStore = create<ForecastState>((set) => ({
  baseIncome: 6000,
  taxRate: 0,
  recurringBudget: 2500,
  savingsBudget: 0,
  startingBalance: 15000,
  variableBudget: 2500,
  extraLoanPayment: 0,
  divertExtraToSavings: false,
  loanStrategy: 'avalanche',
  investmentGrowthRate: 7.0,
  months: 36,
  goals: [
    { id: '1', name: 'Japan Trip', amount: 5000, targetMonths: 10, monthlyContribution: 500 }
  ],

  setBaseIncome: (val) => set({ baseIncome: val }),
  setTaxRate: (val) => set({ taxRate: val }),
  setRecurringBudget: (val) => set({ recurringBudget: val }),
  setSavingsBudget: (val) => set({ savingsBudget: val }),
  setStartingBalance: (val) => set({ startingBalance: val }),
  setVariableBudget: (val) => set({ variableBudget: val }),
  setExtraLoanPayment: (val) => set({ extraLoanPayment: val }),
  setDivertExtraToSavings: (val) => set({ divertExtraToSavings: val }),
  setLoanStrategy: (val) => set({ loanStrategy: val }),
  setInvestmentGrowthRate: (val) => set({ investmentGrowthRate: val }),
  setMonths: (val) => set({ months: val }),
  setGoals: (val) => set({ goals: val }),

  loadScenario: (scenario) => set({
    baseIncome: scenario.baseIncome,
    taxRate: scenario.taxRate,
    recurringBudget: scenario.recurringBudget,
    savingsBudget: scenario.savingsBudget,
    startingBalance: scenario.startingBalance,
    variableBudget: scenario.variableBudget,
    extraLoanPayment: scenario.extraLoanPayment,
    divertExtraToSavings: scenario.divertExtraToSavings || false,
    loanStrategy: scenario.loanStrategy as 'avalanche' | 'snowball' | 'custom',
    investmentGrowthRate: scenario.investmentGrowthRate ?? 7.0,
    goals: scenario.goals || [],
  })
}));
