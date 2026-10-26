import { invoke } from '@tauri-apps/api/core';
import type { ProjectionPoint } from '../components/ForecastCharts';

export interface GoalParam {
  name: string;
  target_amount: number;
  monthly_contribution: number;
}

export interface Windfall {
  month_index: number;
  amount: number;
}

export interface DestinationParam {
  id?: string;
  name: string;
  starting_balance: number;
  monthly_allocation: number;
  annual_growth_rate: number;
  enabled?: boolean;
}

export interface ProjectionParams {
  base_income: number;
  recurring_budget: number;
  savings_budget: number;
  investment_growth_rate: number;
  starting_balance: number;
  starting_investment_balance?: number;
  destinations?: DestinationParam[];
  income_gaps: number[];
  windfalls: Windfall[];
  variable_budget: number;
  global_extra_loan_payment: number;
  divert_extra_to_savings: boolean;
  loan_strategy?: string;
  months: number;
  goals: GoalParam[];
  include_home_equity?: boolean;
  home_property_value?: number;
  home_appreciation_rate?: number;
}

export const forecastApi = {
  calculateProjection: (params: ProjectionParams) =>
    invoke<ProjectionPoint[]>('calculate_projection', { params }),
  buildRecurrenceMap: (isDemo: boolean = false, accountId?: number) =>
    invoke<Record<string, import('../types').RecurrenceInfo>>('build_recurrence_map', { isDemo, accountId }),
  refreshRecurrenceAll: () =>
    invoke<{ updated: number }>('refresh_recurrence_all'),
};
