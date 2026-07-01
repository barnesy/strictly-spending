use rusqlite::Result;
use serde::{Deserialize, Serialize};
use chrono::{Local, Datelike};
use tauri::State;
use crate::db::{DbState, get_transactions, get_categories, get_merchant_overrides};
use crate::db::loans::get_loans;
use super::recurrence::build_recurrence_map_internal;
use super::forecast::build_forecast_internal;

#[derive(Debug, Serialize, Deserialize)]
pub struct Windfall {
    pub month_index: u32,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectionParams {
    pub base_income: f64,
    pub starting_balance: f64,
    pub income_gaps: Vec<u32>,
    pub windfalls: Vec<Windfall>,
    pub expense_modifier: f64,
    pub global_extra_loan_payment: f64,
    pub months: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectionPoint {
    pub month_index: u32,
    pub month_label: String,
    pub starting_balance: f64,
    pub income: f64,
    pub recurring_spend: f64,
    pub variable_spend: f64,
    pub loan_payments: f64,
    pub total_debt: f64,
    pub ending_balance: f64,
}

#[tauri::command]
pub fn calculate_projection(state: State<DbState>, params: ProjectionParams) -> Result<Vec<ProjectionPoint>, String> {
    let txns = get_transactions(state.clone(), "1970-01-01".into(), "2099-12-31".into(), None, None, None, None)?;
    let overrides = get_merchant_overrides(state.clone())?;
    let recurrence_map = build_recurrence_map_internal(&txns, &overrides);
    let categories = get_categories(state.clone())?;
    
    let forecasts = build_forecast_internal(&txns, &recurrence_map, &categories);

    let mut base_recurring: f64 = 0.0;
    let mut base_variable: f64 = 0.0;

    for f in forecasts {
        if f.kind == "recurring" {
            base_recurring += f.monthly_estimate.abs();
        } else {
            base_variable += f.monthly_estimate.abs();
        }
    }

    let mut loans = get_loans(state.clone()).unwrap_or_default();
    loans.retain(|l| l.enabled.unwrap_or(true));

    let mut results = Vec::new();
    let mut current_balance = params.starting_balance;

    let today = Local::now().naive_local().date();
    let mut current_year = today.year();
    let mut current_month = today.month();

    let months = vec![
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    for i in 1..=params.months {
        let label = format!("{} {}", months[(current_month - 1) as usize], current_year);

        let mut month_income = params.base_income;
        if params.income_gaps.contains(&i) {
            month_income = 0.0;
        }

        for w in &params.windfalls {
            if w.month_index == i {
                month_income += w.amount;
            }
        }

        let mut month_loan_payments = 0.0;
        let mut month_total_debt = 0.0;

        let active_loans_count = loans.iter().filter(|l| l.principal > 0.0).count() as f64;

        for loan in &mut loans {
            if loan.principal <= 0.0 {
                continue;
            }

            let monthly_rate = (loan.rate / 100.0) / 12.0;
            let interest = loan.principal * monthly_rate;
            
            let mut payment = loan.monthly_payment.unwrap_or(0.0);
            payment += loan.extra_monthly_payment.unwrap_or(0.0);
            
            if active_loans_count > 0.0 {
                payment += params.global_extra_loan_payment / active_loans_count;
            }

            if let Some(one_time_month) = loan.extra_one_time_month {
                if one_time_month == i as i64 {
                    payment += loan.extra_one_time_payment.unwrap_or(0.0);
                }
            }

            let mut principal_payment = payment - interest;
            if principal_payment < 0.0 {
                principal_payment = 0.0; // Negative amortization
            }

            if principal_payment > loan.principal {
                principal_payment = loan.principal;
                payment = principal_payment + interest;
            }

            loan.principal -= principal_payment;
            month_loan_payments += payment;
            month_total_debt += loan.principal;
        }

        let adj_variable = base_variable * params.expense_modifier;
        
        let ending_balance = current_balance + month_income - base_recurring - adj_variable - month_loan_payments;

        results.push(ProjectionPoint {
            month_index: i,
            month_label: label,
            starting_balance: current_balance,
            income: month_income,
            recurring_spend: base_recurring,
            variable_spend: adj_variable,
            loan_payments: month_loan_payments,
            total_debt: month_total_debt,
            ending_balance,
        });

        current_balance = ending_balance;

        current_month += 1;
        if current_month > 12 {
            current_month = 1;
            current_year += 1;
        }
    }

    Ok(results)
}
