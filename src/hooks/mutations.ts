import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { 
  Transaction, Account, CategoryRule, Category, 
  MerchantOverride, Budget, AppSetting, Loan, TaxRule, ChatArtifact
} from '../types';
import type { Scenario } from '../api/scenarios';

import type { QueryClient } from '@tanstack/react-query';

const TRANSACTION_DERIVED_QUERY_KEYS = [
  'transactions',
  'transactions_paginated',
  'transaction_count',
  'dashboard_aggregates',
  'top_merchants',
  'spend_chart_data',
  'comparison_month_spend_chart_data',
  'income_chart_data',
  'comparison_month_income_chart_data',
  'historical_spend_by_category',
  'historical_monthly_income',
  'recurrenceMap',
  'recurrence_map',
  'last_month_actual_spend',
  'budgets',
  'uncategorized_count',
  'category_transaction_counts',
  'rule_match_counts',
  'merchant_groups',
  'sortQueue',
  'sort_queue',
  'consolidated_recurring_merchants',
  'category_trailing_averages',
  'unique_merchants',
  'transaction_bounds',
] as const;

export function invalidateTransactionDerivedQueries(queryClient: QueryClient) {
  for (const key of TRANSACTION_DERIVED_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

// TRANSACTIONS
export const useAddTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Transaction) => api.addTransaction(item),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<Transaction> }) => api.updateTransaction(id, updates),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useBulkAddTransactions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transactions, ignoreErrors }: { transactions: Transaction[], ignoreErrors?: boolean }) => 
      api.bulkAddTransactions(transactions, ignoreErrors),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useBulkUpdateTransactions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactions: Transaction[]) => api.bulkUpdateTransactions(transactions),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// ACCOUNTS
export const useAddAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Account) => api.addAccount(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useUpdateAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<Account> }) => api.updateAccount(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// CATEGORIES
export const useAddCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Category) => api.addCategory(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['category_transaction_counts'] });
    },
  });
};

export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<Category> }) => api.updateCategory(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// RULES
export const useAddRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: CategoryRule) => api.addRule(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['rule_match_counts'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useUpdateRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<CategoryRule> }) => api.updateRule(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['rule_match_counts'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useDeleteRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['rule_match_counts'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useClearRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearRules(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      queryClient.invalidateQueries({ queryKey: ['rule_match_counts'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// MERCHANT OVERRIDES
export const usePutMerchantOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: MerchantOverride) => api.putMerchantOverride(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant_overrides'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

export const useDeleteMerchantOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.deleteMerchantOverride(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant_overrides'] });
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// BUDGETS
export const usePutBudget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Budget) => api.putBudget(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  });
};

export const useBulkPutBudgets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (budgets: Budget[]) => api.bulkPutBudgets(budgets),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  });
};

export const useClearBudgets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearBudgets(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
  });
};

// SETTINGS
export const usePutSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string, value: any }) => api.putSetting(key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
};

export const useDeleteSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.deleteSetting(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
};

// LOANS
export const useAddLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Loan) => api.addLoan(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loans'] }),
  });
};

export const useUpdateLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Loan }) => api.updateLoan(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loans'] }),
  });
};

export const useDeleteLoan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteLoan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loans'] }),
  });
};

// TAX RULES
export const usePutTaxRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: TaxRule) => api.putTaxRule(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax_rules'] }),
  });
};

export const useDeleteTaxRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTaxRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tax_rules'] }),
  });
};

// OTHER
export const useClearTransactions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearTransactions(),
    onSuccess: () => {
      invalidateTransactionDerivedQueries(queryClient);
    },
  });
};

// ARTIFACTS
export const useDeleteArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteArtifact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts_count'] });
    },
  });
};

export const usePutArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: ChatArtifact) => api.putArtifact(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts_count'] });
    },
  });
};

// SCENARIOS
export const useCreateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Scenario) => api.scenariosApi.create(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });
};

export const useUpdateScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Scenario) => api.scenariosApi.update(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });
};

export const useDeleteScenario = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.scenariosApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });
};

