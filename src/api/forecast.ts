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

export interface ProjectionParams {
  base_income: number;
  recurring_budget: number;
  savings_budget: number;
  investment_growth_rate: number;
  starting_balance: number;
  income_gaps: number[];
  windfalls: Windfall[];
  variable_budget: number;
  global_extra_loan_payment: number;
  divert_extra_to_savings: boolean;
  loan_strategy?: string;
  months: number;
  goals: GoalParam[];
}

export const forecastApi = {
  calculateProjection: (params: ProjectionParams) =>
    invoke<ProjectionPoint[]>('calculate_projection', { params }),
};
