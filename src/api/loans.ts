import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Loan } from '../types';

export const loanSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  type: z.enum(['house', 'car', 'student']),
  principal: z.number().min(0),
  rate: z.number().min(0),
  termYears: z.number().min(1),
  startDate: z.string().min(10),
  category: z.string().min(1),
  merchant: z.string().optional(),
  monthlyPayment: z.number().optional(),
  propertyValue: z.number().optional(),
  downPayment: z.number().optional(),
  extraMonthlyPayment: z.number().optional(),
  extraOneTimePayment: z.number().optional(),
  extraOneTimeMonth: z.number().optional(),
  createdAt: z.string().min(1),
  enabled: z.boolean().optional()
});

export const loansApi = {
  getLoans: () => invoke<Loan[]>('get_loans'),
  addLoan: (item: Loan) => invoke<number>('add_loan', { item: loanSchema.parse(item) }),
  putLoan: (item: Loan) => invoke<void>('put_loan', { item: loanSchema.parse(item) }),
  updateLoan: (id: number, updates: Loan) => invoke<void>('update_loan', { id, updates: loanSchema.parse(updates) }),
  deleteLoan: (id: number) => invoke<void>('delete_loan', { id }),
};
