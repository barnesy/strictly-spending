import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Budget } from '../types';

export const budgetSchema = z.object({
  category: z.string().min(1),
  monthlyAmount: z.number().min(0),
  userSet: z.boolean()
});

export const budgetsApi = {
  getBudgets: () => invoke<Budget[]>('get_budgets'),
  putBudget: (item: Budget) => invoke<void>('put_budget', { item: budgetSchema.parse(item) }),
  bulkPutBudgets: (budgets: Budget[]) => invoke<void>('bulk_put_budgets', { budgets: budgets.map(b => budgetSchema.parse(b)) }),
  clearBudgets: () => invoke<void>('clear_budgets'),
};
