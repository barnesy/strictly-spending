import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { 
  Transaction, Account, CategoryRule, Category, 
  MerchantOverride, Budget, AppSetting, Loan, TaxRule, ChatArtifact
} from '../types';

// TRANSACTIONS
export const useAddTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Transaction) => api.addTransaction(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['top_merchants'] });
      queryClient.invalidateQueries({ queryKey: ['spend_chart_data'] });
      queryClient.invalidateQueries({ queryKey: ['income_chart_data'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
    },
  });
};

export const useUpdateTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<Transaction> }) => api.updateTransaction(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
      queryClient.invalidateQueries({ queryKey: ['top_merchants'] });
    },
  });
};

export const useDeleteTransaction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
    },
  });
};

export const useBulkAddTransactions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ transactions, ignoreErrors }: { transactions: Transaction[], ignoreErrors?: boolean }) => 
      api.bulkAddTransactions(transactions, ignoreErrors),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
    },
  });
};

export const useBulkUpdateTransactions = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactions: Transaction[]) => api.bulkUpdateTransactions(transactions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
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
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
    },
  });
};

// CATEGORIES
export const useAddCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Category) => api.addCategory(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
};

export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<Category> }) => api.updateCategory(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
};

export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); // Affected via CASCADE or SET NULL
    },
  });
};

// RULES
export const useAddRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: CategoryRule) => api.addRule(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });
};

export const useUpdateRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number, updates: Partial<CategoryRule> }) => api.updateRule(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });
};

export const useDeleteRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });
};

export const useClearRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearRules(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
  });
};

// MERCHANT OVERRIDES
export const usePutMerchantOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: MerchantOverride) => api.putMerchantOverride(item),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['merchant_overrides'] }),
  });
};

export const useDeleteMerchantOverride = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.deleteMerchantOverride(key),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['merchant_overrides'] }),
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
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['transaction_count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_aggregates'] });
      queryClient.invalidateQueries({ queryKey: ['top_merchants'] });
      queryClient.invalidateQueries({ queryKey: ['spend_chart_data'] });
      queryClient.invalidateQueries({ queryKey: ['income_chart_data'] });
      queryClient.invalidateQueries({ queryKey: ['uncategorized_count'] });
    },
  });
};

// ARTIFACTS
export const useDeleteArtifact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteArtifact(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });
};

