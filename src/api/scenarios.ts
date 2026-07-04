import { invoke } from '@tauri-apps/api/core';

export interface Goal {
  id: string;
  name: string;
  amount: number;
  targetMonths: number;
  monthlyContribution: number;
}

export interface Scenario {
  id?: number;
  name: string;
  startingBalance: number;
  baseIncome: number;
  taxRate: number;
  recurringBudget: number;
  variableBudget: number;
  savingsBudget: number;
  extraLoanPayment: number;
  divertExtraToSavings?: boolean;
  loanStrategy: string;
  investmentGrowthRate?: number;
  createdAt?: string;
  goals?: Goal[];
}

export const scenariosApi = {
  list: () => invoke<Scenario[]>('get_scenarios'),
  create: (scenario: Scenario) => invoke<number>('create_scenario', { scenario }),
  update: (scenario: Scenario) => invoke<void>('update_scenario', { scenario }),
  delete: (id: number) => invoke<void>('delete_scenario', { id }),
};
