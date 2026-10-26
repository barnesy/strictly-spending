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
    #[serde(rename = "accountColumn")]
    pub account_column: Option<String>,
    #[serde(rename = "accountMappings")]
    pub account_mappings: Option<serde_json::Value>,
}

#[tauri::command]
pub fn get_csv_mappings(state: State<DbState>) -> Result<Vec<CsvMapping>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, account_column, account_mappings FROM csv_mappings").map_err(|e| e.to_string())?;
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
            account_column: row.get(13)?,
            account_mappings: row.get::<_, Option<String>>(14)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn put_csv_mapping(state: State<DbState>, item: CsvMapping) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO csv_mappings (name, header_hash, headers, date_column, description_column, amount_column, debit_column, credit_column, balance_column, account_name, account_type, institution, account_column, account_mappings, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![item.name, item.header_hash, serde_json::to_string(&item.headers).unwrap_or_default(), item.date_column, item.description_column, item.amount_column, item.debit_column, item.credit_column, item.balance_column, item.account_name, item.account_type, item.institution, item.account_column, item.account_mappings.map(|m| serde_json::to_string(&m).unwrap_or_default()), item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_csv_mapping(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM csv_mappings WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

