use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Scenario {
    pub id: Option<i64>,
    pub name: String,
    #[serde(rename = "startingBalance")]
    pub starting_balance: f64,
    #[serde(rename = "baseIncome")]
    pub base_income: f64,
    #[serde(rename = "taxRate")]
    pub tax_rate: f64,
    #[serde(rename = "recurringBudget")]
    pub recurring_budget: f64,
    #[serde(rename = "variableBudget")]
    pub variable_budget: f64,
    #[serde(rename = "savingsBudget")]
    pub savings_budget: f64,
    #[serde(rename = "investmentGrowthRate")]
    pub investment_growth_rate: Option<f64>,
    #[serde(rename = "extraLoanPayment")]
    pub extra_loan_payment: f64,
    #[serde(rename = "divertExtraToSavings")]
    pub divert_extra_to_savings: Option<bool>,
    #[serde(rename = "loanStrategy")]
    pub loan_strategy: String,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    pub goals: Option<serde_json::Value>,
    pub destinations: Option<serde_json::Value>,
    #[serde(rename = "incomeStreams")]
    pub income_streams: Option<serde_json::Value>,
    #[serde(rename = "includeHomeEquity")]
    pub include_home_equity: Option<bool>,
    #[serde(rename = "homePropertyValue")]
    pub home_property_value: Option<f64>,
    #[serde(rename = "homeAppreciationRate")]
    pub home_appreciation_rate: Option<f64>,
}

#[tauri::command]
pub fn get_scenarios(state: State<DbState>) -> Result<Vec<Scenario>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, starting_balance, base_income, tax_rate, recurring_budget, variable_budget, savings_budget, extra_loan_payment, loan_strategy, created_at, goals, investment_growth_rate, divert_extra_to_savings, destinations, income_streams, include_home_equity, home_property_value, home_appreciation_rate FROM scenarios ORDER BY id DESC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        let goals_str: Option<String> = row.get(11)?;
        let goals = goals_str.and_then(|s| serde_json::from_str(&s).ok());
        let destinations_str: Option<String> = row.get(14).unwrap_or(None);
        let destinations = destinations_str.and_then(|s| serde_json::from_str(&s).ok());
        let income_streams_str: Option<String> = row.get(15).unwrap_or(None);
        let income_streams = income_streams_str.and_then(|s| serde_json::from_str(&s).ok());
        Ok(Scenario {
            id: row.get(0)?,
            name: row.get(1)?,
            starting_balance: row.get(2)?,
            base_income: row.get(3)?,
            tax_rate: row.get(4)?,
            recurring_budget: row.get(5)?,
            variable_budget: row.get(6)?,
            savings_budget: row.get(7)?,
            extra_loan_payment: row.get(8)?,
            loan_strategy: row.get(9)?,
            created_at: row.get(10)?,
            goals,
            investment_growth_rate: row.get(12).unwrap_or(Some(7.0)),
            divert_extra_to_savings: row.get(13).unwrap_or(Some(false)),
            destinations,
            income_streams,
            include_home_equity: row.get(16).unwrap_or(Some(true)),
            home_property_value: row.get(17).unwrap_or(None),
            home_appreciation_rate: row.get(18).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut scenarios = Vec::new();
    for row in iter {
        scenarios.push(row.map_err(|e| e.to_string())?);
    }
    Ok(scenarios)
}

#[tauri::command]
pub fn create_scenario(state: State<DbState>, scenario: Scenario) -> Result<i64, String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let created_at = chrono::Utc::now().to_rfc3339();
    let goals_str = scenario.goals.as_ref().map(|g| serde_json::to_string(g).unwrap_or_default());
    let destinations_str = scenario.destinations.as_ref().map(|d| serde_json::to_string(d).unwrap_or_default());
    let income_streams_str = scenario.income_streams.as_ref().map(|i| serde_json::to_string(i).unwrap_or_default());
    
    tx.execute(
        "INSERT INTO scenarios (name, starting_balance, base_income, tax_rate, recurring_budget, variable_budget, savings_budget, extra_loan_payment, loan_strategy, created_at, goals, investment_growth_rate, divert_extra_to_savings, destinations, income_streams, include_home_equity, home_property_value, home_appreciation_rate)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        params![
            scenario.name,
            scenario.starting_balance,
            scenario.base_income,
            scenario.tax_rate,
            scenario.recurring_budget,
            scenario.variable_budget,
            scenario.savings_budget,
            scenario.extra_loan_payment,
            scenario.loan_strategy,
            created_at,
            goals_str,
            scenario.investment_growth_rate,
            scenario.divert_extra_to_savings,
            destinations_str,
            income_streams_str,
            scenario.include_home_equity.unwrap_or(true),
            scenario.home_property_value,
            scenario.home_appreciation_rate,
        ],
    ).map_err(|e| e.to_string())?;
    let row_id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(row_id)
}

#[tauri::command]
pub fn update_scenario(state: State<DbState>, scenario: Scenario) -> Result<(), String> {
    if scenario.id.is_none() {
        return Err("Scenario ID is required for update".into());
    }
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let goals_str = scenario.goals.as_ref().map(|g| serde_json::to_string(g).unwrap_or_default());
    let destinations_str = scenario.destinations.as_ref().map(|d| serde_json::to_string(d).unwrap_or_default());
    let income_streams_str = scenario.income_streams.as_ref().map(|i| serde_json::to_string(i).unwrap_or_default());
    
    tx.execute(
        "UPDATE scenarios SET name=?1, starting_balance=?2, base_income=?3, tax_rate=?4, recurring_budget=?5, variable_budget=?6, savings_budget=?7, extra_loan_payment=?8, loan_strategy=?9, goals=?10, investment_growth_rate=?11, divert_extra_to_savings=?12, destinations=?13, income_streams=?14, include_home_equity=?15, home_property_value=?16, home_appreciation_rate=?17 WHERE id=?18",
        params![
            scenario.name,
            scenario.starting_balance,
            scenario.base_income,
            scenario.tax_rate,
            scenario.recurring_budget,
            scenario.variable_budget,
            scenario.savings_budget,
            scenario.extra_loan_payment,
            scenario.loan_strategy,
            goals_str,
            scenario.investment_growth_rate,
            scenario.divert_extra_to_savings,
            destinations_str,
            income_streams_str,
            scenario.include_home_equity.unwrap_or(true),
            scenario.home_property_value,
            scenario.home_appreciation_rate,
            scenario.id,
        ],
    ).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn delete_scenario(state: State<DbState>, id: i64) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM scenarios WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
