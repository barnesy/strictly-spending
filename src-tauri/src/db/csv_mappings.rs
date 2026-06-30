use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvMapping {
    pub id: Option<i64>,
    pub name: String,
    #[serde(rename = "headerHash")]
    pub header_hash: String,
    pub headers: serde_json::Value,
    #[serde(rename = "dateColumn")]
    pub date_column: String,
    #[serde(rename = "descriptionColumn")]
    pub description_column: String,
    #[serde(rename = "amountColumn")]
    pub amount_column: Option<String>,
    #[serde(rename = "debitColumn")]
    pub debit_column: Option<String>,
    #[serde(rename = "creditColumn")]
    pub credit_column: Option<String>,
    #[serde(rename = "balanceColumn")]
    pub balance_column: Option<String>,
    #[serde(rename = "accountName")]
    pub account_name: String,
    #[serde(rename = "accountType")]
    pub account_type: String,
    pub institution: String,
}

#[tauri::command]
pub fn get_csv_mappings(state: State<DbState>) -> Result<Vec<CsvMapping>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution FROM csv_mappings").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(CsvMapping {
            id: row.get(0)?,
            name: row.get(1)?,
            header_hash: row.get(2)?,
            headers: row.get::<_, Option<String>>(3)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)).unwrap_or(serde_json::Value::Null),
            date_column: row.get(4)?,
            description_column: row.get(5)?,
            amount_column: row.get(6)?,
            debit_column: row.get(7)?,
            credit_column: row.get(8)?,
            balance_column: row.get(9)?,
            account_name: row.get(10)?,
            account_type: row.get(11)?,
            institution: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_csv_mapping(state: State<DbState>, item: CsvMapping) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO csv_mappings (name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![item.name, item.header_hash, serde_json::to_string(&item.headers).unwrap_or_default(), item.date_column, item.description_column, item.amount_column, item.debit_column, item.credit_column, item.balance_column, item.account_name, item.account_type, item.institution],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_csv_mapping(state: State<DbState>, item: CsvMapping) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO csv_mappings (name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![item.name, item.header_hash, serde_json::to_string(&item.headers).unwrap_or_default(), item.date_column, item.description_column, item.amount_column, item.debit_column, item.credit_column, item.balance_column, item.account_name, item.account_type, item.institution, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_csv_mapping(state: State<DbState>, id: i64, updates: CsvMapping) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE csv_mappings SET name=?1, header_hash=?2, headers=?3, date_column=?4, description_column=?5, amount_column=?6, debit_column=?7, credit_column=?8, balance_column=?9, account_name=?10, account_type=?11, institution=?12 WHERE id = ?13",
        params![updates.name, updates.header_hash, serde_json::to_string(&updates.headers).unwrap_or_default(), updates.date_column, updates.description_column, updates.amount_column, updates.debit_column, updates.credit_column, updates.balance_column, updates.account_name, updates.account_type, updates.institution, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_csv_mapping(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM csv_mappings WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_csv_mappings(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM csv_mappings", []).map_err(|e| e.to_string())?;
    Ok(())
}
