export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  enabledAccountIds?: number[];
  disabledCategories?: string[];
  spendOnly?: boolean;
  recurrenceFilter?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
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
