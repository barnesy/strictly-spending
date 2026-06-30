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

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatArtifactVersion {
    pub id: String,
    #[serde(rename = "artifactId")]
    pub artifact_id: String,
    pub content: String,
    pub summary: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatThread {
    pub id: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbChatMessage {
    pub id: Option<i64>,
    #[serde(rename = "threadId")]
    pub thread_id: String,
    pub role: String,
    pub content: String,
    #[serde(rename = "actionResult")]
    pub action_result: Option<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "activeSkillId")]
    pub active_skill_id: Option<String>,
    #[serde(rename = "completedStages")]
    pub completed_stages: Option<serde_json::Value>,
    pub steps: Option<serde_json::Value>,
    #[serde(rename = "tokenUsage")]
    pub token_usage: Option<serde_json::Value>,
    pub purpose: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
}

#[tauri::command]
pub fn get_artifacts(state: State<DbState>) -> Result<Vec<ChatArtifact>, String> {
    let conn = state.conn.lock().unwrap();
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
pub fn add_artifact(state: State<DbState>, item: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO artifacts (id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![item.id, item.type_val, item.title, item.content, item.explanation, item.summary, item.created_at, item.updated_at, item.path, item.source, item.associated_checklist_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_artifact(state: State<DbState>, item: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO artifacts (id, type, title, content, explanation, summary, created_at, updated_at, path, source, associated_checklist_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![item.id, item.type_val, item.title, item.content, item.explanation, item.summary, item.created_at, item.updated_at, item.path, item.source, item.associated_checklist_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_artifact(state: State<DbState>, id: String, updates: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    
    // Fetch current state to save as a version
    let mut stmt = conn.prepare("SELECT content, summary, updated_at FROM artifacts WHERE id = ?1").map_err(|e| e.to_string())?;
    let current_iter = stmt.query_map(params![id], |row| {
        Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, Option<String>>(1)?,
            row.get::<usize, String>(2)?,
        ))
    });
    
    if let Ok(mut iter) = current_iter {
        if let Some(Ok((content, summary, updated_at))) = iter.next() {
            let version_id = uuid::Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO artifact_versions (id, artifact_id, content, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![version_id, id, content, summary, updated_at],
            );
        }
    }

    conn.execute(
        "UPDATE artifacts SET type=?1, title=?2, content=?3, explanation=?4, summary=?5, created_at=?6, updated_at=?7, path=?8, source=?9, associated_checklist_id=?10 WHERE id = ?11",
        params![updates.type_val, updates.title, updates.content, updates.explanation, updates.summary, updates.created_at, updates.updated_at, updates.path, updates.source, updates.associated_checklist_id, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_artifact_versions(state: State<DbState>, artifact_id: String) -> Result<Vec<ChatArtifactVersion>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, artifact_id, content, summary, created_at FROM artifact_versions WHERE artifact_id = ?1 ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map(params![artifact_id], |row| {
        Ok(ChatArtifactVersion {
            id: row.get(0)?,
            artifact_id: row.get(1)?,
            content: row.get(2)?,
            summary: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for i in iter {
        results.push(i.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
pub fn restore_artifact_version(state: State<DbState>, artifact_id: String, version_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    
    // 1. Get the version content
    let mut stmt = conn.prepare("SELECT content, summary FROM artifact_versions WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut iter = stmt.query_map(params![version_id], |row| {
        Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, Option<String>>(1)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let (version_content, version_summary) = match iter.next() {
        Some(Ok(v)) => v,
        _ => return Err("Version not found".to_string()),
    };
    
    // 2. Get current state to save as a version before restoring
    let mut current_stmt = conn.prepare("SELECT content, summary, updated_at FROM artifacts WHERE id = ?1").map_err(|e| e.to_string())?;
    let current_iter = current_stmt.query_map(params![artifact_id], |row| {
        Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, Option<String>>(1)?,
            row.get::<usize, String>(2)?,
        ))
    });
    
    if let Ok(mut c_iter) = current_iter {
        if let Some(Ok((content, summary, updated_at))) = c_iter.next() {
            let new_version_id = uuid::Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO artifact_versions (id, artifact_id, content, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![new_version_id, artifact_id, content, summary, updated_at],
            );
        }
    }
    
    let now = chrono::Utc::now().to_rfc3339();
    
    // 3. Update the artifact
    conn.execute(
        "UPDATE artifacts SET content=?1, summary=?2, updated_at=?3 WHERE id = ?4",
        params![version_content, version_summary, now, artifact_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn delete_artifact(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM artifacts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_artifacts(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM artifacts", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_threads(state: State<DbState>) -> Result<Vec<ChatThread>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, title, created_at, updated_at FROM threads").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(ChatThread {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_thread(state: State<DbState>, item: ChatThread) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![item.id, item.title, item.created_at, item.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_thread(state: State<DbState>, item: ChatThread) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO threads (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![item.id, item.title, item.created_at, item.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_thread(state: State<DbState>, id: String, updates: ChatThread) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE threads SET title=?1, created_at=?2, updated_at=?3 WHERE id = ?4",
        params![updates.title, updates.created_at, updates.updated_at, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_thread(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM threads WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_threads(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM threads", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_messages(state: State<DbState>) -> Result<Vec<DbChatMessage>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking FROM messages").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(DbChatMessage {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            action_result: row.get::<_, Option<String>>(4)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
            created_at: row.get(5)?,
            active_skill_id: row.get(6)?,
            completed_stages: row.get::<_, Option<String>>(7)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
            steps: row.get::<_, Option<String>>(8)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
            token_usage: row.get::<_, Option<String>>(9)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
            purpose: row.get(10)?,
            thinking: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_message(state: State<DbState>, item: DbChatMessage) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![item.thread_id, item.role, item.content, serde_json::to_string(&item.action_result).unwrap_or_default(), item.created_at, item.active_skill_id, serde_json::to_string(&item.completed_stages).unwrap_or_default(), serde_json::to_string(&item.steps).unwrap_or_default(), serde_json::to_string(&item.token_usage).unwrap_or_default(), item.purpose, item.thinking],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_message(state: State<DbState>, item: DbChatMessage) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, thinking, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![item.thread_id, item.role, item.content, serde_json::to_string(&item.action_result).unwrap_or_default(), item.created_at, item.active_skill_id, serde_json::to_string(&item.completed_stages).unwrap_or_default(), serde_json::to_string(&item.steps).unwrap_or_default(), serde_json::to_string(&item.token_usage).unwrap_or_default(), item.purpose, item.thinking, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_message(state: State<DbState>, id: i64, updates: DbChatMessage) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE messages SET thread_id=?1, role=?2, content=?3, action_result=?4, created_at=?5, active_skill_id=?6, completed_stages=?7, steps=?8, token_usage=?9, purpose=?10, thinking=?11 WHERE id = ?12",
        params![updates.thread_id, updates.role, updates.content, serde_json::to_string(&updates.action_result).unwrap_or_default(), updates.created_at, updates.active_skill_id, serde_json::to_string(&updates.completed_stages).unwrap_or_default(), serde_json::to_string(&updates.steps).unwrap_or_default(), serde_json::to_string(&updates.token_usage).unwrap_or_default(), updates.purpose, updates.thinking, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_message(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_thread_messages(state: State<DbState>, thread_id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![thread_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_messages(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
    Ok(())
}
