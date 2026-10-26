use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportBatch {
    pub id: Option<i64>,
    pub filename: String,
    pub source: String,
    #[serde(rename = "importedAt")]
    pub imported_at: String,
    #[serde(rename = "rowCount")]
    pub row_count: i64,
    #[serde(rename = "newCount")]
    pub new_count: i64,
    #[serde(rename = "duplicateCount")]
    pub duplicate_count: i64,
    #[serde(rename = "contentHash")]
    pub content_hash: Option<String>,
}

#[tauri::command]
pub fn get_imports(state: State<DbState>) -> Result<Vec<ImportBatch>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, filename, source, imported_at, row_count, new_count, duplicate_count, content_hash FROM imports").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(ImportBatch {
            id: row.get(0)?,
            filename: row.get(1)?,
            source: row.get(2)?,
            imported_at: row.get(3)?,
            row_count: row.get(4)?,
            new_count: row.get(5)?,
            duplicate_count: row.get(6)?,
            content_hash: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_import(state: State<DbState>, item: ImportBatch) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    if let Some(id) = item.id {
        conn.execute(
            "INSERT INTO imports (id, filename, source, imported_at, row_count, new_count, duplicate_count, content_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, item.filename, item.source, item.imported_at, item.row_count, item.new_count, item.duplicate_count, item.content_hash],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO imports (filename, source, imported_at, row_count, new_count, duplicate_count, content_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.filename, item.source, item.imported_at, item.row_count, item.new_count, item.duplicate_count, item.content_hash],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
pub fn delete_import(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM imports WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_imports(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM imports", []).map_err(|e| e.to_string())?;
    Ok(())
}

