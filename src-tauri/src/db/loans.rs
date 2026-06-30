use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Loan {
    pub id: Option<i64>,
    pub name: String,
    #[serde(rename = "type")]
    pub type_val: String,
    pub principal: f64,
    pub rate: f64,
    #[serde(rename = "termYears")]
    pub term_years: i64,
    #[serde(rename = "startDate")]
    pub start_date: String,
    pub category: String,
    pub merchant: Option<String>,
    #[serde(rename = "monthlyPayment")]
    pub monthly_payment: Option<f64>,
    #[serde(rename = "propertyValue")]
    pub property_value: Option<f64>,
    #[serde(rename = "downPayment")]
    pub down_payment: Option<f64>,
    #[serde(rename = "extraMonthlyPayment")]
    pub extra_monthly_payment: Option<f64>,
    #[serde(rename = "extraOneTimePayment")]
    pub extra_one_time_payment: Option<f64>,
    #[serde(rename = "extraOneTimeMonth")]
    pub extra_one_time_month: Option<i64>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub enabled: Option<bool>,
}

#[tauri::command]
pub fn get_loans(state: State<DbState>) -> Result<Vec<Loan>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled FROM loans").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(Loan {
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
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_loan(state: State<DbState>, item: Loan) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO loans (name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![item.name, item.type_val, item.principal, item.rate, item.term_years, item.start_date, item.category, item.merchant, item.monthly_payment, item.property_value, item.down_payment, item.extra_monthly_payment, item.extra_one_time_payment, item.extra_one_time_month, item.created_at, item.enabled],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_loan(state: State<DbState>, item: Loan) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO loans (name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![item.name, item.type_val, item.principal, item.rate, item.term_years, item.start_date, item.category, item.merchant, item.monthly_payment, item.property_value, item.down_payment, item.extra_monthly_payment, item.extra_one_time_payment, item.extra_one_time_month, item.created_at, item.enabled, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_loan(state: State<DbState>, id: i64, updates: Loan) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE loans SET name=?1, type=?2, principal=?3, rate=?4, term_years=?5, start_date=?6, category=?7, merchant=?8, monthly_payment=?9, property_value=?10, down_payment=?11, extra_monthly_payment=?12, extra_one_time_payment=?13, extra_one_time_month=?14, created_at=?15, enabled=?16 WHERE id = ?17",
        params![updates.name, updates.type_val, updates.principal, updates.rate, updates.term_years, updates.start_date, updates.category, updates.merchant, updates.monthly_payment, updates.property_value, updates.down_payment, updates.extra_monthly_payment, updates.extra_one_time_payment, updates.extra_one_time_month, updates.created_at, updates.enabled, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_loan(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM loans WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_loans(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM loans", []).map_err(|e| e.to_string())?;
    Ok(())
}
