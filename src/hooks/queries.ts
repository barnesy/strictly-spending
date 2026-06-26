import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api';
import { buildRecurrenceMap } from '../recurrence';
import { useFilters, resolveDateRange } from '../store';
import { useShallow } from 'zustand/react/shallow';

export const useTransactions = (filters?: { category?: string, merchantKey?: string, accountId?: number, deductionStatus?: string }) => {
  const startDate = useFilters((state) => resolveDateRange(state).start.toISOString().split('T')[0]);
  const endDate = useFilters((state) => resolveDateRange(state).end.toISOString().split('T')[0]);

  return useQuery({
    queryKey: ['transactions', filters, startDate, endDate],
    queryFn: () => api.getTransactions(startDate, endDate, filters),
    placeholderData: keepPreviousData,
  });
};

export const buildDashboardFilters = (state: any) => {
  const range = resolveDateRange(state);
  return {
    startDate: range.start.toISOString().split('T')[0],
    endDate: range.end.toISOString().split('T')[0],
    enabledAccountIds: state.enabledAccountIds,
    disabledCategories: state.disabledCategories,
    spendOnly: state.spendOnly,
    recurrenceFilter: state.recurrenceFilter,
    searchQuery: state.searchQuery,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    demoMode: state.demoMode,
  };
};

export const useTransactionsPaginated = (page: number, pageSize: number) => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['transactions_paginated', filters, page, pageSize],
    queryFn: () => api.getTransactionsPaginated(filters, pageSize, page * pageSize),
    placeholderData: keepPreviousData,
  });
};

export const useTransactionCount = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['transaction_count', filters],
    queryFn: () => api.getTransactionCount(filters),
    placeholderData: keepPreviousData,
  });
};

export const useDashboardAggregates = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['dashboard_aggregates', filters],
    queryFn: () => api.getDashboardAggregates(filters),
    placeholderData: keepPreviousData,
  });
};

export const useTopMerchants = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['top_merchants', filters],
    queryFn: () => api.getTopMerchants(filters),
    placeholderData: keepPreviousData,
  });
};

export const useSpendChartData = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  const groupBy = useFilters((state) => state.groupBy);
  return useQuery({
    queryKey: ['spend_chart_data', filters, groupBy],
    queryFn: () => api.getSpendChartData(filters, groupBy),
    placeholderData: keepPreviousData,
  });
};

export const useIncomeChartData = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['income_chart_data', filters],
    queryFn: () => api.getIncomeChartData(filters),
    placeholderData: keepPreviousData,
  });
};

export const useConsolidatedRecurringMerchants = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['consolidated_recurring_merchants', demoMode],
    queryFn: () => api.getConsolidatedRecurringMerchants(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useCategoryTrailingAverages = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['category_trailing_averages', demoMode],
    queryFn: () => api.getCategoryTrailingAverages(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useUniqueMerchants = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['unique_merchants', demoMode],
    queryFn: () => api.getUniqueMerchants(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useLastMonthActualSpend = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['last_month_actual_spend', demoMode],
    queryFn: () => api.lastMonthActualSpend(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useTaxTransactions = (year: number) => {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  return useQuery({
    queryKey: ['transactions', 'tax', year],
    queryFn: () => api.getTransactions(startDate, endDate),
  });
};

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.getAccounts(),
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.getCategories(),
  });
};

export const useRules = () => {
  return useQuery({
    queryKey: ['rules'],
    queryFn: () => api.getRules(),
  });
};

export const useBudgets = () => {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: () => api.getBudgets(),
  });
};

export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
};

export const useMerchantOverrides = () => {
  return useQuery({
    queryKey: ['merchant_overrides'],
    queryFn: () => api.getMerchantOverrides(),
  });
};

export const useArtifacts = () => {
  return useQuery({
    queryKey: ['artifacts'],
    queryFn: () => api.getArtifacts(),
  });
};

export const useThreads = () => {
  return useQuery({
    queryKey: ['threads'],
    queryFn: () => api.getThreads(),
  });
};

export const useMessages = () => {
  return useQuery({
    queryKey: ['messages'],
    queryFn: () => api.getMessages(),
  });
};

export const useDocuments = () => {
  return useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(),
  });
};

export const useLoans = () => {
  return useQuery({
    queryKey: ['loans'],
    queryFn: () => api.getLoans(),
  });
};

export const useTaxRules = () => {
  return useQuery({
    queryKey: ['tax_rules'],
    queryFn: () => api.getTaxRules(),
  });
};

export const useCsvMappings = () => {
  return useQuery({
    queryKey: ['csv_mappings'],
    queryFn: () => api.getCsvMappings(),
  });
};

export const useRecurrenceMap = (isDemo: boolean = false) => {
  return useQuery({
    queryKey: ['recurrenceMap', isDemo],
    queryFn: () => buildRecurrenceMap(isDemo),
  });
};

export const useSortQueue = (demoMode: boolean = false) => {
  return useQuery({
    queryKey: ['sortQueue', demoMode],
    queryFn: () => api.getSortQueue(demoMode),
  });
};

export const useTransactionBounds = (demoMode: boolean) => {
  return useQuery({
    queryKey: ['transaction_bounds', demoMode],
    queryFn: () => api.getTransactionBounds(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useUncategorizedCount = (demoMode: boolean) => {
  return useQuery({
    queryKey: ['uncategorized_count', demoMode],
    queryFn: () => api.getUncategorizedCount(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useCategoryTransactionCounts = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['category_transaction_counts', demoMode],
    queryFn: () => api.getCategoryTransactionCounts(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useRuleMatchCounts = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['rule_match_counts', demoMode],
    queryFn: () => api.getRuleMatchCounts(demoMode),
    placeholderData: keepPreviousData,
  });
};

export const useMerchantGroups = () => {
  const demoMode = useFilters((state) => state.demoMode);
  return useQuery({
    queryKey: ['merchant_groups', demoMode],
    queryFn: () => api.getMerchantGroups(demoMode),
    placeholderData: keepPreviousData,
  });
};

