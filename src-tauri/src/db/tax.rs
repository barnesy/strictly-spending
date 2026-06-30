use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct TaxRule {
    pub id: Option<i64>,
    pub pattern: String,
    #[serde(rename = "isBusiness")]
    pub is_business: bool,
    #[serde(rename = "taxCategory")]
    pub tax_category: Option<String>,
    pub priority: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[tauri::command]
pub fn get_tax_rules(state: State<DbState>) -> Result<Vec<TaxRule>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, pattern, is_business, tax_category, priority, created_at FROM tax_rules").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(TaxRule {
            id: row.get(0)?,
            pattern: row.get(1)?,
            is_business: row.get(2)?,
            tax_category: row.get(3)?,
            priority: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_tax_rule(state: State<DbState>, item: TaxRule) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO tax_rules (pattern, is_business, tax_category, priority, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![item.pattern, item.is_business, item.tax_category, item.priority, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_tax_rule(state: State<DbState>, item: TaxRule) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO tax_rules (pattern, is_business, tax_category, priority, created_at, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![item.pattern, item.is_business, item.tax_category, item.priority, item.created_at, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_tax_rule(state: State<DbState>, id: i64, updates: TaxRule) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE tax_rules SET pattern=?1, is_business=?2, tax_category=?3, priority=?4, created_at=?5 WHERE id = ?6",
        params![updates.pattern, updates.is_business, updates.tax_category, updates.priority, updates.created_at, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_tax_rule(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM tax_rules WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_tax_rules(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM tax_rules", []).map_err(|e| e.to_string())?;
    Ok(())
}
