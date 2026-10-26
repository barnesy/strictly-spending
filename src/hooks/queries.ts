import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api';
import { buildRecurrenceMap } from '../domain/recurrence';
import { useFilters, resolveDateRange, formatLocalDate } from '../stores/store';
import { useShallow } from 'zustand/react/shallow';

export const useTransactions = (
  filters?: { category?: string; merchantKey?: string; accountId?: number; deductionStatus?: string },
  dateRange?: { startDate: string; endDate: string }
) => {
  const defaultStartDate = useFilters((state) => formatLocalDate(resolveDateRange(state).start));
  const defaultEndDate = useFilters((state) => formatLocalDate(resolveDateRange(state).end));
  const startDate = dateRange?.startDate ?? defaultStartDate;
  const endDate = dateRange?.endDate ?? defaultEndDate;

  return useQuery({
    queryKey: ['transactions', filters, startDate, endDate],
    queryFn: () => api.getTransactions(startDate, endDate, filters),
    placeholderData: keepPreviousData,
  });
};

export const useMerchantTransactions = (merchantKey: string) => {
  return useQuery({
    queryKey: ['transactions', 'merchant', merchantKey],
    queryFn: () => api.getTransactions('1970-01-01', '2100-01-01', { merchantKey }),
    enabled: Boolean(merchantKey),
    placeholderData: keepPreviousData,
  });
};

export const buildDashboardFilters = (state: any) => {
  const range = resolveDateRange(state);
  return {
    startDate: formatLocalDate(range.start),
    endDate: formatLocalDate(range.end),
    enabledAccountIds: state.seenAccountIds && state.seenAccountIds.length > 0
      ? state.enabledAccountIds
      : (state.enabledAccountIds && state.enabledAccountIds.length > 0 ? state.enabledAccountIds : undefined),
    disabledCategories: state.disabledCategories,
    spendOnly: state.spendOnly,
    transactionType: state.transactionType,
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

export const useArtifactsCount = () => {
  const lastViewedArtifactsAt = useFilters((s) => s.lastViewedArtifactsAt);
  return useQuery({
    queryKey: ['artifacts_count', lastViewedArtifactsAt],
    queryFn: async () => {
      const artifacts = await api.getArtifacts();
      if (!lastViewedArtifactsAt) return artifacts.length;
      const lastViewed = new Date(lastViewedArtifactsAt).getTime();
      return artifacts.filter(a => new Date(a.updatedAt || a.createdAt).getTime() > lastViewed).length;
    },
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

export const useComparisonMonthSpendChartData = (comparisonMonth: string | null, groupBy: 'category' | 'account' | 'recurring' | 'none' = 'category', enabled: boolean = true) => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['comparison_month_spend_chart_data', comparisonMonth, filters.enabledAccountIds, filters.disabledCategories, filters.transactionType, filters.demoMode, groupBy],
    queryFn: async () => {
      if (!comparisonMonth || comparisonMonth === 'none') return [];
      const [yearStr, monthStr] = comparisonMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${comparisonMonth}-01`;
      const endDate = `${comparisonMonth}-${String(lastDay).padStart(2, '0')}`;
      return api.getSpendChartData({
        ...filters,
        startDate,
        endDate,
      }, groupBy);
    },
    enabled: Boolean(comparisonMonth && comparisonMonth !== 'none') && enabled,
    staleTime: 60_000,
  });
};

export const usePriorYearSpendChartData = useComparisonMonthSpendChartData;

export const useIncomeChartData = () => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['income_chart_data', filters],
    queryFn: () => api.getIncomeChartData(filters),
    placeholderData: keepPreviousData,
  });
};

export const useComparisonMonthIncomeChartData = (comparisonMonth: string | null, enabled: boolean = true) => {
  const filters = useFilters(useShallow(buildDashboardFilters));
  return useQuery({
    queryKey: ['comparison_month_income_chart_data', comparisonMonth, filters.enabledAccountIds, filters.disabledCategories, filters.demoMode],
    queryFn: async () => {
      if (!comparisonMonth || comparisonMonth === 'none') return [];
      const [yearStr, monthStr] = comparisonMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${comparisonMonth}-01`;
      const endDate = `${comparisonMonth}-${String(lastDay).padStart(2, '0')}`;
      return api.getIncomeChartData({
        ...filters,
        startDate,
        endDate,
      });
    },
    enabled: Boolean(comparisonMonth && comparisonMonth !== 'none') && enabled,
    staleTime: 60_000,
  });
};

export const usePriorYearIncomeChartData = useComparisonMonthIncomeChartData;

const normalizeAccountScope = (accountScope?: number | number[]): number[] | undefined => {
  if (Array.isArray(accountScope)) {
    return accountScope.length > 0 ? [...accountScope].sort((a, b) => a - b) : undefined;
  }
  return accountScope !== undefined ? [accountScope] : undefined;
};

export const useConsolidatedRecurringMerchants = (accountScope?: number | number[]) => {
  const demoMode = useFilters((state) => state.demoMode);
  const ids = normalizeAccountScope(accountScope);
  return useQuery({
    queryKey: ['consolidated_recurring_merchants', demoMode, ids ?? 'all'],
    queryFn: async () => {
      if (!ids) return api.getConsolidatedRecurringMerchants(demoMode, undefined);
      if (ids.length === 1) return api.getConsolidatedRecurringMerchants(demoMode, ids[0]);
      const lists = await Promise.all(ids.map((id) => api.getConsolidatedRecurringMerchants(demoMode, id)));
      const byKey = new Map<string, { merchantKey: string; category: string; monthlyAverage: number }>();
      for (const list of lists) {
        for (const item of list) {
          const k = `${item.merchantKey}:::${item.category}`;
          const prev = byKey.get(k);
          if (prev) {
            prev.monthlyAverage += item.monthlyAverage;
          } else {
            byKey.set(k, { ...item });
          }
        }
      }
      return Array.from(byKey.values()).sort((a, b) => b.monthlyAverage - a.monthlyAverage);
    },
    placeholderData: keepPreviousData,
  });
};

export const useCategoryTrailingAverages = (accountScope?: number | number[]) => {
  const demoMode = useFilters((state) => state.demoMode);
  const ids = normalizeAccountScope(accountScope);
  return useQuery({
    queryKey: ['category_trailing_averages', demoMode, ids ?? 'all'],
    queryFn: async () => {
      if (!ids) return api.getCategoryTrailingAverages(demoMode, undefined);
      if (ids.length === 1) return api.getCategoryTrailingAverages(demoMode, ids[0]);
      const lists = await Promise.all(ids.map((id) => api.getCategoryTrailingAverages(demoMode, id)));
      const byCat = new Map<string, number>();
      for (const list of lists) {
        for (const item of list) {
          byCat.set(item.category, (byCat.get(item.category) || 0) + item.average);
        }
      }
      return Array.from(byCat.entries()).map(([category, average]) => ({ category, average }));
    },
    placeholderData: keepPreviousData,
  });
};

export const useHistoricalSpendByCategory = (accountScope?: number | number[]) => {
  const demoMode = useFilters((state) => state.demoMode);
  const enabledAccountIds = useFilters((state) => state.enabledAccountIds);
  const disabledCategories = useFilters((state) => state.disabledCategories);
  const scopedIds = normalizeAccountScope(accountScope);
  const effectiveAccountIds =
    scopedIds !== undefined
      ? scopedIds
      : enabledAccountIds && enabledAccountIds.length > 0
      ? enabledAccountIds
      : undefined;
  return useQuery({
    queryKey: ['historical_spend_by_category', demoMode, effectiveAccountIds, disabledCategories],
    queryFn: () => api.getSpendChartData({
      startDate: '1970-01-01',
      endDate: '2100-01-01',
      enabledAccountIds: effectiveAccountIds,
      disabledCategories,
      spendOnly: true,
      transactionType: 'spend',
      demoMode,
    }, 'category'),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
};

export const useHistoricalMonthlyIncome = (accountScope?: number | number[]) => {
  const demoMode = useFilters((state) => state.demoMode);
  const enabledAccountIds = useFilters((state) => state.enabledAccountIds);
  const scopedIds = normalizeAccountScope(accountScope);
  const effectiveAccountIds =
    scopedIds !== undefined
      ? scopedIds
      : enabledAccountIds && enabledAccountIds.length > 0
      ? enabledAccountIds
      : undefined;
  return useQuery({
    queryKey: ['historical_monthly_income', demoMode, effectiveAccountIds],
    queryFn: () => api.getIncomeChartData({
      startDate: '1970-01-01',
      endDate: '2100-01-01',
      enabledAccountIds: effectiveAccountIds,
      demoMode,
    }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
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

export const useLastMonthActualSpend = (accountScope?: number | number[]) => {
  const demoMode = useFilters((state) => state.demoMode);
  const ids = normalizeAccountScope(accountScope);
  return useQuery({
    queryKey: ['last_month_actual_spend', demoMode, ids ?? 'all'],
    queryFn: async () => {
      if (!ids) return api.lastMonthActualSpend(demoMode, undefined);
      if (ids.length === 1) return api.lastMonthActualSpend(demoMode, ids[0]);
      const totals = await Promise.all(ids.map((id) => api.lastMonthActualSpend(demoMode, id)));
      return totals.reduce((sum, val) => sum + val, 0);
    },
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

export const useRecurrenceMap = (isDemo: boolean = false, accountScope?: number | number[]) => {
  const ids = normalizeAccountScope(accountScope);
  return useQuery({
    queryKey: ['recurrenceMap', isDemo, ids ?? 'all'],
    queryFn: async () => {
      if (!ids) return buildRecurrenceMap(isDemo, undefined);
      if (ids.length === 1) return buildRecurrenceMap(isDemo, ids[0]);
      const maps = await Promise.all(ids.map((id) => buildRecurrenceMap(isDemo, id)));
      return Object.assign({}, ...maps);
    },
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

export const useScenarios = () => {
  return useQuery({
    queryKey: ['scenarios'],
    queryFn: () => api.scenariosApi.list(),
    placeholderData: keepPreviousData,
  });
};

