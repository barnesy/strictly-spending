import { invoke } from '@tauri-apps/api/core';
import type { Transaction, Account, Category, MerchantOverride, Budget, CategoryRule } from './types';
import { useDataStore } from './dataStore';

export async function addTransaction(tx: Transaction): Promise<number> {
  const id = await invoke<number>('add_transaction', { tx });
  useDataStore.getState().refresh();
  return id;
}

export async function updateTransaction(id: number, changes: Partial<Transaction>): Promise<void> {
  const existing = useDataStore.getState().transactions.find(t => t.id === id) 
                
  if (!existing) throw new Error(`Transaction ${id} not found in state`);
  const updated = { ...existing, ...changes };
  await invoke('update_transaction', { id, updates: updated });
  useDataStore.getState().refresh();
}

export async function addAccount(acc: Account): Promise<number> {
  const id = await invoke<number>('add_account', { acc });
  useDataStore.getState().refresh();
  return id;
}

export async function updateAccount(id: number, changes: Partial<Account>): Promise<void> {
  const existing = useDataStore.getState().accounts.find(a => a.id === id);
  if (!existing) throw new Error(`Account ${id} not found`);
  const updated = { ...existing, ...changes };
  await invoke('update_account', { id, acc: updated });
  useDataStore.getState().refresh();
}

export async function addCategory(cat: Category): Promise<number> {
  const id = await invoke<number>('add_category', { cat });
  useDataStore.getState().refresh();
  return id;
}

export async function updateCategory(id: number, changes: Partial<Category>): Promise<void> {
  const existing = useDataStore.getState().categories.find(c => c.id === id);
  if (!existing) throw new Error(`Category ${id} not found`);
  const updated = { ...existing, ...changes };
  await invoke('update_category', { id, cat: updated });
  useDataStore.getState().refresh();
}

export async function putMerchantOverride(over: MerchantOverride): Promise<void> {
  await invoke('put_merchant_override', { over });
  useDataStore.getState().refresh();
}

export async function deleteMerchantOverride(merchantKey: string): Promise<void> {
  await invoke('delete_merchant_override', { merchantKey });
  useDataStore.getState().refresh();
}

export async function putBudget(budget: Budget): Promise<void> {
  await invoke('put_budget', { budget });
  useDataStore.getState().refresh();
}

export async function bulkPutBudgets(budgets: Budget[]): Promise<void> {
  await invoke('bulk_put_budgets', { budgets });
  useDataStore.getState().refresh();
}

export async function addRule(rule: CategoryRule): Promise<number> {
  const id = await invoke<number>('add_rule', { rule });
  useDataStore.getState().refresh();
  return id;
}

export async function updateRule(id: number, changes: Partial<CategoryRule>): Promise<void> {
  const existing = useDataStore.getState().rules.find(r => r.id === id);
  if (!existing) throw new Error(`Rule ${id} not found`);
  const updated = { ...existing, ...changes };
  await invoke('update_rule', { id, rule: updated });
  useDataStore.getState().refresh();
}

export async function deleteRule(id: number): Promise<void> {
  await invoke('delete_rule', { id });
  useDataStore.getState().refresh();
}

export async function clearAllData(): Promise<void> {
  await invoke('clear_transactions');
  await invoke('clear_accounts');
  await invoke('clear_categories');
  await invoke('clear_merchant_overrides');
  await invoke('clear_budgets');
  await invoke('clear_rules');
  useDataStore.getState().refresh();
}
