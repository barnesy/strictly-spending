import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Account } from '../types';

export const accountSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  type: z.enum(['checking', 'credit', 'savings']),
  institution: z.string().min(1),
  last4: z.string().optional(),
  source: z.enum(['chase', 'boa-credit', 'boa-checking', 'truist-checking', 'demo', 'custom']),
  enabled: z.boolean(),
  currentBalance: z.number().optional()
});

export const accountsApi = {
  getAccounts: () => invoke<Account[]>('get_accounts'),
  addAccount: (item: Account) => invoke<number>('add_account', { item: accountSchema.parse(item) }),
  updateAccount: async (id: number, updates: Partial<Account>) => {
    const existing = (await invoke<Account[]>('get_accounts')).find(a => a.id === id);
    if (!existing) throw new Error(`Account ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_account', { id, updates: accountSchema.parse(full) });
  },
  deleteAccount: (id: number) => invoke<void>('delete_account', { id }),
  clearAccounts: () => invoke<void>('clear_accounts'),
};
