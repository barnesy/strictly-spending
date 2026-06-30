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
    let conn = state.conn.lock().unwrap();
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
pub fn add_setting(state: State<DbState>, item: AppSetting) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)",
        params![item.key, serde_json::to_string(&item.value).unwrap_or_default()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_setting(state: State<DbState>, item: AppSetting) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![item.key, serde_json::to_string(&item.value).unwrap_or_default()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_setting(state: State<DbState>, id: String, updates: AppSetting) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE settings SET value=?1 WHERE key = ?2",
        params![serde_json::to_string(&updates.value).unwrap_or_default(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_setting(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM settings WHERE key = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_settings(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM settings", []).map_err(|e| e.to_string())?;
    Ok(())
}
