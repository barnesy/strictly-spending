import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { Transaction, SortCard, MerchantOverride } from '../types';
import type { DashboardFilters, DashboardAggregates, TopMerchant, SpendChartGroup, ConsolidatedMerchant, CategoryTrailingAvg, MerchantGroup } from './types';

export const transactionSchema = z.object({
  id: z.number().optional(),
  accountId: z.number(),
  date: z.string().min(10),
  description: z.string().min(1),
  amount: z.number(),
  rawCategory: z.string().optional(),
  category: z.string().min(1),
  source: z.enum(['chase', 'boa-credit', 'boa-checking', 'truist-checking', 'demo', 'custom']),
  merchantKey: z.string().min(1),
  userOverridden: z.boolean(),
  dedupKey: z.string().min(1),
  importBatchId: z.number().optional(),
  recurrence: z.enum(['recurring', 'onetime']),
  recurrenceOverride: z.enum(['recurring', 'onetime']).nullable().optional(),
  isBusiness: z.boolean().optional(),
  taxCategory: z.string().optional(),
  deductionStatus: z.enum(['pending', 'confirmed', 'rejected']).optional()
});

export const transactionsApi = {
  getTransactions: (
    startDate: string = '1970-01-01', 
    endDate: string = '2100-01-01',
    filters?: { category?: string, merchantKey?: string, accountId?: number, deductionStatus?: string }
  ) => invoke<Transaction[]>('get_transactions', { 
    startDate, endDate, 
    category: filters?.category, 
    merchantKey: filters?.merchantKey, 
    accountId: filters?.accountId, 
    deductionStatus: filters?.deductionStatus 
  }),
  getTransactionsPaginated: (filters: DashboardFilters, limit: number, offset: number) => 
    invoke<Transaction[]>('get_transactions_paginated', { filters, limit, offset }),
  getTransactionCount: (filters: DashboardFilters) => 
    invoke<number>('get_transaction_count', { filters }),
  getDashboardAggregates: (filters: DashboardFilters) => 
    invoke<DashboardAggregates>('get_dashboard_aggregates', { filters }),
  getTopMerchants: (filters: DashboardFilters) => 
    invoke<TopMerchant[]>('get_top_merchants', { filters }),
  getSpendChartData: (filters: DashboardFilters, groupBy: string) => 
    invoke<SpendChartGroup[]>('get_spend_chart_data', { filters, groupBy }),
  getIncomeChartData: (filters: DashboardFilters) => 
    invoke<SpendChartGroup[]>('get_income_chart_data', { filters }),
  getConsolidatedRecurringMerchants: (isDemo: boolean) => 
    invoke<ConsolidatedMerchant[]>('get_consolidated_recurring_merchants', { isDemo }),
  getCategoryTrailingAverages: (isDemo: boolean) => 
    invoke<CategoryTrailingAvg[]>('get_category_trailing_averages', { isDemo }),
  getUniqueMerchants: (isDemo: boolean) => 
    invoke<string[]>('get_unique_merchants', { isDemo }),
  lastMonthActualSpend: (isDemo: boolean) => 
    invoke<number>('last_month_actual_spend', { isDemo }),
  addTransaction: (item: Transaction) => invoke<number>('add_transaction', { item: transactionSchema.parse(item) }),
  updateTransaction: async (id: number, updates: Partial<Transaction>) => {
    const existing = await invoke<Transaction | null>('get_transaction', { id });
    if (!existing) throw new Error(`Transaction ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_transaction', { id, updates: transactionSchema.parse(full) });
  },
  deleteTransaction: (id: number) => invoke<void>('delete_transaction', { id }),
  bulkAddTransactions: (transactions: Transaction[], ignoreErrors: boolean = false) => 
    invoke<void>('bulk_add_transactions', { transactions: transactions.map(t => transactionSchema.parse(t)), ignoreErrors }),
  bulkUpdateTransactions: (transactions: Transaction[]) => 
    invoke<void>('bulk_update_transactions', { transactions: transactions.map(t => transactionSchema.parse(t)) }),
  getSortQueue: (demoMode: boolean) => invoke<SortCard[]>('get_sort_queue', { demoMode }),
  clearTransactions: () => invoke<void>('clear_transactions'),
  getTransactionBounds: (demoMode: boolean) => 
    invoke<[string | null, string | null]>('get_transaction_bounds', { demoMode }),
  getUncategorizedCount: (demoMode: boolean) => 
    invoke<number>('get_uncategorized_count', { demoMode }),
  getCategoryTransactionCounts: (demoMode: boolean) =>
    invoke<Record<string, number>>('get_category_transaction_counts', { demoMode }),
  getRuleMatchCounts: (demoMode: boolean) =>
    invoke<Record<number, number>>('get_rule_match_counts', { demoMode }),
  getMerchantGroups: (demoMode: boolean) =>
    invoke<MerchantGroup[]>('get_merchant_groups', { demoMode }),
};

export const merchantOverridesApi = {
  getMerchantOverrides: () => invoke<MerchantOverride[]>('get_merchant_overrides'),
  putMerchantOverride: (item: MerchantOverride) => invoke<void>('put_merchant_override', { item }),
  deleteMerchantOverride: (key: string) => invoke<void>('delete_merchant_override', { key }),
  clearMerchantOverrides: () => invoke<void>('clear_merchant_overrides'),
};
