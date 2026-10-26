use rusqlite::Result;
use serde::{Deserialize, Serialize};
use chrono::{Local, Datelike};
use tauri::State;
use crate::db::DbState;

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DestinationParam {
    pub id: Option<String>,
    pub name: String,
    pub starting_balance: f64,
    pub monthly_allocation: f64,
    pub annual_growth_rate: f64,
    pub enabled: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DestinationBalanceProjection {
    pub name: String,
    pub balance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectionParams {
    pub base_income: f64,
    pub recurring_budget: f64,
    pub savings_budget: f64,
    pub investment_growth_rate: f64,
    pub starting_balance: f64,
    #[serde(default)]
    pub starting_investment_balance: Option<f64>,
    #[serde(default)]
    pub destinations: Option<Vec<DestinationParam>>,
    pub income_gaps: Vec<u32>,
    pub windfalls: Vec<Windfall>,
    pub variable_budget: f64,
    pub global_extra_loan_payment: f64,
    pub divert_extra_to_savings: bool,
    pub loan_strategy: Option<String>, // "avalanche", "snowball", or "evenly"
    pub months: u32,
    pub goals: Vec<GoalParam>,
    #[serde(default)]
    pub include_home_equity: Option<bool>,
    #[serde(default)]
    pub home_property_value: Option<f64>,
    #[serde(default)]
    pub home_appreciation_rate: Option<f64>,
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
    #[serde(default)]
    pub destination_balances: Vec<DestinationBalanceProjection>,
    #[serde(default)]
    pub home_equity: Option<f64>,
    #[serde(default)]
    pub property_value: Option<f64>,
    #[serde(default)]
    pub mortgage_debt: Option<f64>,
    #[serde(default)]
    pub net_worth: Option<f64>,
    #[serde(default)]
    pub liquid_net_worth: Option<f64>,
}

#[tauri::command]
pub fn calculate_projection(state: State<DbState>, params: ProjectionParams) -> Result<Vec<ProjectionPoint>, String> {
    calculate_projection_core(&state, params)
}

pub fn calculate_projection_core(db_state: &DbState, params: ProjectionParams) -> Result<Vec<ProjectionPoint>, String> {
    let base_recurring = params.recurring_budget;

    let (mut loans, accounts) = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt_loans = conn
            .prepare("SELECT id, name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled FROM loans")
            .map_err(|e| e.to_string())?;
        let loan_iter = stmt_loans
            .query_map([], |row| {
                Ok(crate::db::loans::Loan {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    type_val: row.get(2)?,
                    principal: row.get(3)?,
                    rate: row.get(4)?,
                    term_years: row.get(5)?,
                    start_date: row.get(6)?,
                    category: row.get(7)?,
                    merchant: row.get(8)?,
                    monthly_payment: row.get(9)?,
                    property_value: row.get(10)?,
                    down_payment: row.get(11)?,
                    extra_monthly_payment: row.get(12)?,
                    extra_one_time_payment: row.get(13)?,
                    extra_one_time_month: row.get(14)?,
                    created_at: row.get(15)?,
                    enabled: row.get(16)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut loans_vec = Vec::new();
        for l in loan_iter {
            loans_vec.push(l.map_err(|e| e.to_string())?);
        }

        let mut stmt_acc = conn
            .prepare("SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts")
            .map_err(|e| e.to_string())?;
        let acc_iter = stmt_acc
            .query_map([], |row| {
                Ok(crate::db::Account {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    account_type: row.get(2)?,
                    institution: row.get(3)?,
                    last4: row.get(4)?,
                    source: row.get(5)?,
                    enabled: row.get(6)?,
                    current_balance: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut acc_vec = Vec::new();
        for a in acc_iter {
            acc_vec.push(a.map_err(|e| e.to_string())?);
        }
        (loans_vec, acc_vec)
    };
    loans.retain(|l| l.enabled.unwrap_or(true));

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

        // If there's an account with matching name, merchant, or type, use it as the source of truth
        if let Some(acc) = accounts.iter().find(|a| {
            a.name == loan.name
            || (loan.merchant.as_ref().map_or(false, |m| a.name.to_lowercase().contains(&m.to_lowercase())))
            || (loan.type_val == "house" && a.account_type == "mortgage")
        }) {
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
    let mut simulated_destinations: Vec<DestinationParam> = params.destinations.unwrap_or_default();
    let has_explicit_destinations = !simulated_destinations.is_empty();

    let mut current_investment_balance = if has_explicit_destinations {
        simulated_destinations.iter().filter(|d| d.enabled.unwrap_or(true)).map(|d| d.starting_balance).sum()
    } else {
        params.starting_investment_balance.unwrap_or(0.0)
    };
    let mut current_cumulative_remainder = 0.0;
    
    let mut goal_balances: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    let house_loan = loans.iter().find(|l| l.type_val == "house" || l.category.to_lowercase().contains("housing") || l.category.to_lowercase().contains("mortgage"));
    let base_property_val = params.home_property_value
        .or_else(|| house_loan.and_then(|l| l.property_value))
        .unwrap_or(500000.0);
    let appreciation_rate = params.home_appreciation_rate.unwrap_or(0.0);
    let include_home_equity = params.include_home_equity.unwrap_or(true);

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
        let mut month_mortgage_debt = 0.0;
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
            
            let scheduled_payment = loan.monthly_payment.unwrap_or(0.0);
            let mut payment = scheduled_payment;
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
            if principal_payment > loan.principal {
                principal_payment = loan.principal;
                payment = principal_payment + interest;
            }

            let is_house_loan = loan.type_val == "house" || loan.category.to_lowercase().contains("housing") || loan.category.to_lowercase().contains("mortgage");
            loan.principal -= principal_payment;
            // Scheduled loan payments (mortgage, auto loan) are already included in `base_recurring` (Fixed Recurring Bills).
            // Only count incremental extra loan payments here so they are not subtracted twice from `remainder`.
            let extra_only = (payment - scheduled_payment).max(0.0);
            month_loan_payments += extra_only;
            month_total_debt += loan.principal;
            if is_house_loan {
                month_mortgage_debt += loan.principal;
            }

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

        let mut month_destination_balances = Vec::new();
        let mut total_destination_allocation = 0.0;

        if has_explicit_destinations {
            for dest in &mut simulated_destinations {
                if dest.enabled.unwrap_or(true) {
                    let monthly_rate = (dest.annual_growth_rate / 100.0) / 12.0;
                    dest.starting_balance *= 1.0 + monthly_rate;
                    dest.starting_balance += dest.monthly_allocation;
                    total_destination_allocation += dest.monthly_allocation;
                }
                month_destination_balances.push(DestinationBalanceProjection {
                    name: dest.name.clone(),
                    balance: dest.starting_balance,
                });
            }
            current_investment_balance = month_destination_balances.iter().map(|d| d.balance).sum();
        }

        let adj_variable = params.variable_budget;
        let mut adj_savings = if has_explicit_destinations { total_destination_allocation } else { params.savings_budget };
        
        if actual_extra_diverted > 0.0 {
            adj_savings += actual_extra_diverted;
            if has_explicit_destinations && !simulated_destinations.is_empty() {
                simulated_destinations[0].starting_balance += actual_extra_diverted;
                if let Some(first_mb) = month_destination_balances.first_mut() {
                    first_mb.balance += actual_extra_diverted;
                }
                current_investment_balance += actual_extra_diverted;
            }
        }
        
        let remainder = month_income - base_recurring - adj_variable - adj_savings - month_loan_payments - month_goal_contributions;
        current_cumulative_remainder += remainder;
        
        let ending_balance = current_balance + remainder;

        if !has_explicit_destinations {
            let monthly_growth_rate = (params.investment_growth_rate / 100.0) / 12.0;
            current_investment_balance *= 1.0_f64 + monthly_growth_rate;
            current_investment_balance += adj_savings;
        }

        let monthly_appreciation = (appreciation_rate / 100.0) / 12.0;
        let current_prop_val = (base_property_val * (1.0 + monthly_appreciation).powi(i as i32)).round();
        let home_equity = (current_prop_val - month_mortgage_debt).max(0.0).round();
        let non_mortgage_debt = (month_total_debt - month_mortgage_debt).max(0.0);
        let net_worth = if include_home_equity {
            (ending_balance + current_investment_balance + home_equity - non_mortgage_debt).round()
        } else {
            (ending_balance + current_investment_balance - month_total_debt).round()
        };
        let liquid_net_worth = (ending_balance + current_investment_balance - month_total_debt).round();

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
            destination_balances: month_destination_balances,
            home_equity: Some(home_equity),
            property_value: Some(current_prop_val),
            mortgage_debt: Some(month_mortgage_debt.round()),
            net_worth: Some(net_worth),
            liquid_net_worth: Some(liquid_net_worth),
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
