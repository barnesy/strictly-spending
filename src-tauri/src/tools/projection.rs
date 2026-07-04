use rusqlite::Result;
use serde::{Deserialize, Serialize};
use chrono::{Local, Datelike};
use tauri::State;
use crate::db::DbState;
use crate::db::loans::get_loans;

#[derive(Debug, Serialize, Deserialize)]
pub struct Windfall {
    pub month_index: u32,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GoalParam {
    pub name: String,
    pub target_amount: f64,
    pub monthly_contribution: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectionParams {
    pub base_income: f64,
    pub recurring_budget: f64,
    pub savings_budget: f64,
    pub investment_growth_rate: f64,
    pub starting_balance: f64,
    pub income_gaps: Vec<u32>,
    pub windfalls: Vec<Windfall>,
    pub variable_budget: f64,
    pub global_extra_loan_payment: f64,
    pub divert_extra_to_savings: bool,
    pub loan_strategy: Option<String>, // "avalanche", "snowball", or "evenly"
    pub months: u32,
    pub goals: Vec<GoalParam>,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoanBalanceProjection {
    pub id: Option<i64>,
    pub name: String,
    pub balance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectionPoint {
    pub month_index: u32,
    pub month_label: String,
    pub starting_balance: f64,
    pub income: f64,
    pub recurring_spend: f64,
    pub variable_spend: f64,
    pub savings_spend: f64,
    pub loan_payments: f64,
    pub total_debt: f64,
    pub loans: Vec<LoanBalanceProjection>,
    pub goal_contributions: f64,
    pub achieved_goals: Vec<String>,
    pub remainder: f64,
    pub cumulative_remainder: f64,
    pub ending_balance: f64,
    pub investment_balance: f64,
}

#[tauri::command]
pub fn calculate_projection(state: State<DbState>, params: ProjectionParams) -> Result<Vec<ProjectionPoint>, String> {
    let base_recurring = params.recurring_budget;

    let mut loans = get_loans(state.clone()).unwrap_or_default();
    loans.retain(|l| l.enabled.unwrap_or(true));
    
    let accounts = crate::db::get_accounts(state.clone()).unwrap_or_default();

    let today = Local::now().naive_local().date();
    let mut current_year = today.year();
    let mut current_month = today.month();

    // Fast-forward loans to today
    for loan in &mut loans {
        let r = (loan.rate / 100.0) / 12.0;
        let n = (loan.term_years * 12) as f64;
        
        let standard_payment = if r > 0.0 && n > 0.0 {
            loan.principal * (r * (1.0_f64 + r).powf(n)) / ((1.0_f64 + r).powf(n) - 1.0_f64)
        } else if n > 0.0 {
            loan.principal / n
        } else {
            0.0
        };

        let actual_payment = loan.monthly_payment.unwrap_or(standard_payment);
        loan.monthly_payment = Some(actual_payment); // ensure simulation uses this

        // If there's an account with the same name that has a balance, use it as the source of truth
        if let Some(acc) = accounts.iter().find(|a| a.name == loan.name) {
            if let Some(bal) = acc.current_balance {
                loan.principal = bal.abs(); // Ensure it's positive for debt calculations
                continue;
            }
        }

        let start_date = chrono::NaiveDate::parse_from_str(&loan.start_date, "%Y-%m-%d")
            .unwrap_or(today);
            
        let mut current_principal = loan.principal - loan.down_payment.unwrap_or(0.0);
        let extra_monthly = loan.extra_monthly_payment.unwrap_or(0.0);
        let extra_one_time = loan.extra_one_time_payment.unwrap_or(0.0);
        let extra_one_time_month = loan.extra_one_time_month.unwrap_or(0) as i32;
        
        let mut months_passed = (today.year() - start_date.year()) * 12 + (today.month() as i32 - start_date.month() as i32) + 1;
        months_passed = months_passed.max(0);
        
        for month_idx in 1..=months_passed {
            let interest = current_principal * r;
            let mut principal_payment = actual_payment - interest;
            
            principal_payment += extra_monthly;
            if month_idx == extra_one_time_month {
                principal_payment += extra_one_time;
            }
            
            current_principal -= principal_payment;
            if current_principal < 0.0 {
                current_principal = 0.0;
                break;
            }
        }
        
        loan.principal = current_principal;
    }

    let mut results = Vec::new();
    let mut current_balance = params.starting_balance;
    let mut current_investment_balance = 0.0;
    let mut current_cumulative_remainder = 0.0;
    
    let mut goal_balances: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

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

        let mut month_goal_contributions = 0.0;
        let mut achieved_goals = Vec::new();

        for goal in &params.goals {
            let balance = goal_balances.get(&goal.name).copied().unwrap_or(0.0);
            if balance < goal.target_amount {
                let remaining = goal.target_amount - balance;
                let contribution = goal.monthly_contribution.min(remaining);
                
                let new_balance = balance + contribution;
                goal_balances.insert(goal.name.clone(), new_balance);
                
                month_goal_contributions += contribution;

                if new_balance >= goal.target_amount {
                    achieved_goals.push(goal.name.clone());
                }
            }
        }

        let mut month_loan_payments = 0.0;
        let mut month_total_debt = 0.0;
        let mut month_loans = Vec::new();

        let active_loans_count = loans.iter().filter(|l| l.principal > 0.0).count() as f64;
        let mut extra_payment_remaining = params.global_extra_loan_payment;

        let strategy = params.loan_strategy.as_deref().unwrap_or("evenly");
        if strategy == "avalanche" {
            loans.sort_by(|a, b| b.rate.partial_cmp(&a.rate).unwrap_or(std::cmp::Ordering::Equal));
        } else if strategy == "snowball" {
            loans.sort_by(|a, b| a.principal.partial_cmp(&b.principal).unwrap_or(std::cmp::Ordering::Equal));
        }

        for loan in &mut loans {
            if loan.principal <= 0.0 {
                month_loans.push(LoanBalanceProjection {
                    id: loan.id,
                    name: loan.name.clone(),
                    balance: 0.0,
                });
                continue;
            }

            let monthly_rate = (loan.rate / 100.0) / 12.0;
            let interest = loan.principal * monthly_rate;
            
            let mut payment = loan.monthly_payment.unwrap_or(0.0);
            payment += loan.extra_monthly_payment.unwrap_or(0.0);
            
            if active_loans_count > 0.0 {
                if strategy == "evenly" {
                    payment += params.global_extra_loan_payment / active_loans_count;
                } else if extra_payment_remaining > 0.0 {
                    // Avalanche or Snowball: apply as much extra as possible to this loan
                    let max_useful_extra = loan.principal + interest - payment;
                    if max_useful_extra > 0.0 {
                        let to_apply = extra_payment_remaining.min(max_useful_extra);
                        payment += to_apply;
                        extra_payment_remaining -= to_apply;
                    }
                }
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

            month_loans.push(LoanBalanceProjection {
                id: loan.id,
                name: loan.name.clone(),
                balance: loan.principal,
            });
        }

        let mut actual_extra_diverted = 0.0;
        if params.divert_extra_to_savings {
            if active_loans_count == 0.0 {
                actual_extra_diverted = params.global_extra_loan_payment;
            } else if strategy != "evenly" {
                actual_extra_diverted = extra_payment_remaining;
            }
        }

        let adj_variable = params.variable_budget;
        let mut adj_savings = params.savings_budget;
        
        if actual_extra_diverted > 0.0 {
            adj_savings += actual_extra_diverted;
        }
        
        let remainder = month_income - base_recurring - adj_variable - adj_savings - month_loan_payments - month_goal_contributions;
        current_cumulative_remainder += remainder;
        
        let ending_balance = current_balance + remainder;

        let monthly_growth_rate = (params.investment_growth_rate / 100.0) / 12.0;
        current_investment_balance *= 1.0_f64 + monthly_growth_rate;
        current_investment_balance += adj_savings;

        results.push(ProjectionPoint {
            month_index: i,
            month_label: label,
            starting_balance: current_balance,
            income: month_income,
            recurring_spend: base_recurring,
            variable_spend: adj_variable,
            savings_spend: adj_savings,
            loan_payments: month_loan_payments,
            total_debt: month_total_debt,
            loans: month_loans,
            goal_contributions: month_goal_contributions,
            achieved_goals,
            remainder,
            cumulative_remainder: current_cumulative_remainder,
            ending_balance,
            investment_balance: current_investment_balance,
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
