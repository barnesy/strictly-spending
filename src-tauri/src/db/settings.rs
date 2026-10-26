use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: serde_json::Value,
}

#[tauri::command]
pub fn get_settings(state: State<DbState>) -> Result<Vec<AppSetting>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(AppSetting {
            key: row.get(0)?,
            value: row.get::<_, Option<String>>(1)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)).unwrap_or(serde_json::Value::Null),
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn get_setting(state: State<DbState>, key: String) -> Result<Option<serde_json::Value>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let val_str: Option<String> = row.get(0).map_err(|e| e.to_string())?;
        let val = val_str
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(serde_json::Value::Null);
        Ok(Some(val))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn put_setting(state: State<DbState>, item: AppSetting) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![item.key, serde_json::to_string(&item.value).unwrap_or_default()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_setting(state: State<DbState>, key: Option<String>, id: Option<String>) -> Result<(), String> {
    let target_key = key.or(id).ok_or_else(|| "Missing setting key".to_string())?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM settings WHERE key = ?1", params![target_key]).map_err(|e| e.to_string())?;
    Ok(())
}

