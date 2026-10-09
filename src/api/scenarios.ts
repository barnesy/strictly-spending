import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  amount: z.number().min(0),
  targetMonths: z.number().min(1),
  monthlyContribution: z.number().min(0),
});

export const scenarioSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  startingBalance: z.number(),
  baseIncome: z.number(),
  taxRate: z.number(),
  recurringBudget: z.number(),
  variableBudget: z.number(),
  savingsBudget: z.number(),
  extraLoanPayment: z.number(),
  divertExtraToSavings: z.boolean().optional(),
  loanStrategy: z.string(),
  investmentGrowthRate: z.number().optional(),
  createdAt: z.string().optional(),
  goals: z.array(goalSchema).optional(),
});

export type Goal = z.infer<typeof goalSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export const scenariosApi = {
  list: () => invoke<Scenario[]>('get_scenarios'),
  create: (scenario: Scenario) => invoke<number>('create_scenario', { scenario: scenarioSchema.parse(scenario) }),
  update: (scenario: Scenario) => invoke<void>('update_scenario', { scenario: scenarioSchema.parse(scenario) }),
  delete: (id: number) => invoke<void>('delete_scenario', { id }),
};
