use rusqlite::Result;
use chrono::{Local, NaiveDate, Duration, Datelike};
use tauri::State;
use crate::db::DbState;

#[tauri::command]
pub fn last_month_actual_spend(state: State<DbState>, is_demo: bool, account_id: Option<i64>) -> Result<f64, String> {
    let today = Local::now().naive_local().date();
    
    // Prior month bounds. If month is Jan (1), prev is Dec (12) of prior year.
    let (prev_year, prev_month) = if today.month() == 1 {
        (today.year() - 1, 12)
    } else {
        (today.year(), today.month() - 1)
    };
    
    let start_date = NaiveDate::from_ymd_opt(prev_year, prev_month, 1)
        .ok_or_else(|| "Invalid start date".to_string())?;
    
    let next_month_after_prev = if prev_month == 12 { 1 } else { prev_month + 1 };
    let year_after_prev = if prev_month == 12 { prev_year + 1 } else { prev_year };
    
    let end_date = NaiveDate::from_ymd_opt(year_after_prev, next_month_after_prev, 1)
        .ok_or_else(|| "Invalid end date".to_string())? - Duration::days(1);
    
    let start_str = start_date.format("%Y-%m-%d").to_string();
    let end_str = end_date.format("%Y-%m-%d").to_string();

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let demo_flag = if is_demo { 1 } else { 0 };
    let total: f64 = if let Some(aid) = account_id {
        conn.query_row(
            "SELECT COALESCE(SUM(ABS(amount)), 0.0)
             FROM transactions
             WHERE date BETWEEN ?1 AND ?2
               AND amount < 0
               AND account_id = ?4
               AND category IN (SELECT name FROM categories WHERE type = 'spend')
               AND ((?3 = 1 AND source = 'demo') OR (?3 = 0 AND source != 'demo'))",
            rusqlite::params![start_str, end_str, demo_flag, aid],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            "SELECT COALESCE(SUM(ABS(amount)), 0.0)
             FROM transactions
             WHERE date BETWEEN ?1 AND ?2
               AND amount < 0
               AND category IN (SELECT name FROM categories WHERE type = 'spend')
               AND ((?3 = 1 AND source = 'demo') OR (?3 = 0 AND source != 'demo'))",
            rusqlite::params![start_str, end_str, demo_flag],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?
    };
        
    Ok(total)
}

