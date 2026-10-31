export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  enabledAccountIds?: number[];
  disabledCategories?: string[];
  spendOnly?: boolean;
  transactionType?: 'all' | 'spend' | 'income' | 'transfer';
  recurrenceFilter?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
  demoMode?: boolean;
}

export interface DashboardAggregates {
  totalSpend: number;
  totalIncome: number;
  accountTotals: Record<number, number>;
}

export interface TopMerchant {
  merchantKey: string;
  total: number;
  count: number;
}

export interface SpendChartGroup {
  month: string;
  key: string;
  total: number;
}

export interface ConsolidatedMerchant {
  merchantKey: string;
  category: string;
  monthlyAverage: number;
  accountId?: number;
}

export interface CategoryTrailingAvg {
  category: string;
  average: number;
}

export interface MerchantGroup {
  merchantKey: string;
  totalSpend: number;
  totalTransactions: number;
  categories: Record<string, number>;
  mostCommonCategory: string;
  earliestDate: string;
  latestDate: string;
}

export interface RuleSuggestion {
  pattern: string;
  category: string;
  overridesCount: number;
  sampleDescription: string;
}

export interface RulePreviewResult {
  totalMatches: number;
  affectedCount: number;
  sampleTransactions: import('../types').Transaction[];
}

