import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  amount: z.number().min(0),
  targetMonths: z.number().min(1),
  monthlyContribution: z.number().min(0),
});

export const destinationSchema = z.object({
  id: z.string(),
  accountId: z.number().optional(),
  name: z.string().default(''),
  accountType: z.string().default('savings'),
  currentBalance: z.number().default(0),
  monthlyAllocation: z.number().default(0),
  annualGrowthRate: z.number().default(7),
  isRothIra: z.boolean().optional(),
  enabled: z.boolean().default(true),
  isOverridden: z.boolean().optional(),
  realBalance: z.number().optional(),
  flowType: z.enum(['stay', 'move']).optional(),
  sourceAccountName: z.string().optional(),
  sourceAllocations: z.record(z.string(), z.number()).optional(),
});

export const incomeStreamPaymentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  date: z.string(),
  amount: z.number(),
  description: z.string().optional(),
});

export type IncomeStreamPayment = z.infer<typeof incomeStreamPaymentSchema>;

export const incomeStreamSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  accountId: z.number().optional(),
  accountName: z.string().optional(),
  monthlyAmount: z.number().default(0),
  paycheckAmount: z.number().optional(),
  frequency: z.enum(['monthly', 'biweekly', 'semimonthly', 'weekly', 'custom']).optional(),
  isTaxed: z.boolean().default(true),
  taxRate: z.number().optional(),
  enabled: z.boolean().default(true),
  isOverridden: z.boolean().optional(),
  realMonthlyAmount: z.number().optional(),
  recentPayments: z.array(incomeStreamPaymentSchema).optional(),
  selectedPaymentId: z.union([z.string(), z.number()]).optional(),
  lastPaymentDate: z.string().optional(),
  isFormerEmployer: z.boolean().optional(),
  investedAmount: z.number().default(0).optional(),
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
  destinations: z.array(destinationSchema).optional(),
  incomeStreams: z.array(incomeStreamSchema).optional(),
  includeHomeEquity: z.boolean().optional(),
  homePropertyValue: z.number().optional(),
  homeAppreciationRate: z.number().optional(),
});

export type Goal = z.infer<typeof goalSchema>;
export type DestinationAccount = z.infer<typeof destinationSchema>;
export type IncomeStream = z.infer<typeof incomeStreamSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

export const scenariosApi = {
  list: () => invoke<Scenario[]>('get_scenarios'),
  create: (scenario: Scenario) => invoke<number>('create_scenario', { scenario: scenarioSchema.parse(scenario) }),
  update: (scenario: Scenario) => invoke<void>('update_scenario', { scenario: scenarioSchema.parse(scenario) }),
  delete: (id: number) => invoke<void>('delete_scenario', { id }),
};
