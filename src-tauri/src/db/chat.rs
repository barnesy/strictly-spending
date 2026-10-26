use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatArtifact {
    pub id: String,
    #[serde(rename = "type")]
    pub type_val: String,
    pub title: String,
    pub content: String,
    pub explanation: Option<String>,
    pub summary: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub path: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "associatedChecklistId")]
    pub associated_checklist_id: Option<String>,
}

#[tauri::command]
pub fn get_artifacts(state: State<DbState>) -> Result<Vec<ChatArtifact>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id FROM artifacts").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(ChatArtifact {
            id: row.get(0)?,
            type_val: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            explanation: row.get(4)?,
            summary: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            path: row.get(8)?,
            source: row.get(9)?,
            associated_checklist_id: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn put_artifact(state: State<DbState>, item: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO artifacts (id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![item.id, item.type_val, item.title, item.content, item.explanation, item.summary, item.created_at, item.updated_at, item.path, item.source, item.associated_checklist_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_artifact(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM artifacts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

