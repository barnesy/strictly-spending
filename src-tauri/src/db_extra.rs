
use rusqlite::{params, Connection, Result};
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

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: serde_json::Value,
}

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

pub fn init_extra_tables(conn: &Connection) -> Result<()> {
    conn.execute("CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, source TEXT, imported_at TEXT, row_count INTEGER, new_count INTEGER, duplicate_count INTEGER, content_hash TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, type TEXT, title TEXT, content TEXT, explanation TEXT, summary TEXT, created_at TEXT, updated_at TEXT, path TEXT, source TEXT, associated_checklist_id TEXT)", [])?;
    
    // Migrations for older schemas
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN path TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN source TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN associated_checklist_id TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN summary TEXT", []);

    conn.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, created_at TEXT, updated_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, role TEXT, content TEXT, action_result TEXT, created_at TEXT, active_skill_id TEXT, completed_stages TEXT, steps TEXT, token_usage TEXT, purpose TEXT, thinking TEXT)", [])?;
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN thinking TEXT", []);
    conn.execute("CREATE TABLE IF NOT EXISTS csv_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, header_hash TEXT, headers TEXT, date_column TEXT, description_column TEXT, amount_column TEXT, debit_column TEXT, credit_column TEXT, balance_column TEXT, account_name TEXT, account_type TEXT, institution TEXT)", [])?;

    conn.execute("CREATE TABLE IF NOT EXISTS tax_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT, is_business BOOLEAN, tax_category TEXT, priority INTEGER, created_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, principal REAL, rate REAL, term_years INTEGER, start_date TEXT, category TEXT, merchant TEXT, monthly_payment REAL, property_value REAL, down_payment REAL, extra_monthly_payment REAL, extra_one_time_payment REAL, extra_one_time_month INTEGER, created_at TEXT, enabled BOOLEAN)", [])?;
    Ok(())
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
pub fn put_import(state: State<DbState>, item: ImportBatch) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO imports (filename, source, imported_at, row_count, new_count, duplicate_count, content_hash, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![item.filename, item.source, item.imported_at, item.row_count, item.new_count, item.duplicate_count, item.content_hash, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_import(state: State<DbState>, id: i64, updates: ImportBatch) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE imports SET filename=?1, source=?2, imported_at=?3, row_count=?4, new_count=?5, duplicate_count=?6, content_hash=?7 WHERE id = ?8",
        params![updates.filename, updates.source, updates.imported_at, updates.row_count, updates.new_count, updates.duplicate_count, updates.content_hash, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_import(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM imports WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_imports(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM imports", []).map_err(|e| e.to_string())?;
    Ok(())
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
    conn.execute(
        "UPDATE artifacts SET type=?1, title=?2, content=?3, explanation=?4, summary=?5, created_at=?6, updated_at=?7, path=?8, source=?9, associated_checklist_id=?10 WHERE id = ?11",
        params![updates.type_val, updates.title, updates.content, updates.explanation, updates.summary, updates.created_at, updates.updated_at, updates.path, updates.source, updates.associated_checklist_id, id],
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

// Analytics and Pagination Endpoints

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub enabled_account_ids: Option<Vec<i64>>,
    pub disabled_categories: Option<Vec<String>>,
    pub spend_only: Option<bool>,
    pub recurrence_filter: Option<String>,
    pub search_query: Option<String>,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub demo_mode: Option<bool>,
}

fn build_dashboard_where_clause(
    filters: &DashboardFilters, 
    params: &mut Vec<rusqlite::types::Value>
) -> String {
    let mut sql = "1=1".to_string();

    if let Some(ref start) = filters.start_date {
        params.push(rusqlite::types::Value::Text(start.clone()));
        sql.push_str(&format!(" AND date >= ?{}", params.len()));
    }
    if let Some(ref end) = filters.end_date {
        params.push(rusqlite::types::Value::Text(end.clone()));
        sql.push_str(&format!(" AND date <= ?{}", params.len()));
    }

    if let Some(ref ids) = filters.enabled_account_ids {
        if ids.is_empty() {
            sql.push_str(" AND 1=0");
        } else {
            let mut placeholders = Vec::new();
            for id in ids {
                params.push(rusqlite::types::Value::Integer(*id));
                placeholders.push(format!("?{}", params.len()));
            }
            sql.push_str(&format!(" AND account_id IN ({})", placeholders.join(",")));
        }
    }

    if let Some(ref cats) = filters.disabled_categories {
        if !cats.is_empty() {
            let mut placeholders = Vec::new();
            for cat in cats {
                params.push(rusqlite::types::Value::Text(cat.clone()));
                placeholders.push(format!("?{}", params.len()));
            }
            sql.push_str(&format!(" AND category NOT IN ({})", placeholders.join(",")));
        }
    }

    if let Some(spend) = filters.spend_only {
        if spend {
            sql.push_str(" AND amount < 0");
            sql.push_str(" AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income'))");
        }
    }

    if let Some(ref rec) = filters.recurrence_filter {
        if rec == "recurring" {
            sql.push_str(" AND recurrence = 'recurring'");
        } else if rec == "onetime" {
            sql.push_str(" AND (recurrence IS NULL OR recurrence != 'recurring')");
        }
    }

    if let Some(ref q) = filters.search_query {
        if !q.is_empty() {
            params.push(rusqlite::types::Value::Text(format!("%{}%", q)));
            let p_idx = params.len();
            sql.push_str(&format!(" AND (description LIKE ?{} OR merchant_key LIKE ?{})", p_idx, p_idx));
        }
    }

    if let Some(min) = filters.min_price {
        params.push(rusqlite::types::Value::Real(min));
        sql.push_str(&format!(" AND ABS(amount) >= ?{}", params.len()));
    }
    
    if let Some(max) = filters.max_price {
        params.push(rusqlite::types::Value::Real(max));
        sql.push_str(&format!(" AND ABS(amount) <= ?{}", params.len()));
    }

    if let Some(demo) = filters.demo_mode {
        if demo {
            sql.push_str(" AND source = 'demo'");
        } else {
            sql.push_str(" AND source != 'demo'");
        }
    }

    sql
}

#[tauri::command]
pub fn get_transactions_paginated(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
    limit: usize,
    offset: usize,
) -> Result<Vec<crate::db::Transaction>, String> {
    let conn = state.conn.lock().unwrap();
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let query = format!(
        "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status 
         FROM transactions 
         WHERE {} 
         ORDER BY date DESC 
         LIMIT {} OFFSET {}",
        where_clause, limit, offset
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let tx_iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(crate::db::Transaction {
            id: row.get(0)?,
            account_id: row.get(1)?,
            date: row.get(2)?,
            description: row.get(3)?,
            amount: row.get(4)?,
            raw_category: row.get(5)?,
            category: row.get(6)?,
            source: row.get(7)?,
            merchant_key: row.get(8)?,
            user_overridden: row.get(9)?,
            dedup_key: row.get(10)?,
            import_batch_id: row.get(11)?,
            recurrence: row.get(12)?,
            recurrence_override: row.get(13)?,
            is_business: row.get(14)?,
            tax_category: row.get(15)?,
            deduction_status: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut transactions = Vec::new();
    for tx in tx_iter {
        transactions.push(tx.map_err(|e| e.to_string())?);
    }
    
    Ok(transactions)
}

#[tauri::command]
pub fn get_transaction_count(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let query = format!("SELECT COUNT(*) FROM transactions WHERE {}", where_clause);
    let count: i64 = conn.query_row(&query, rusqlite::params_from_iter(params), |row| row.get(0)).map_err(|e| e.to_string())?;
    
    Ok(count)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardAggregates {
    pub total_spend: f64,
    pub total_income: f64,
    pub account_totals: std::collections::HashMap<i64, f64>,
}

#[tauri::command]
pub fn get_dashboard_aggregates(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
) -> Result<DashboardAggregates, String> {
    let conn = state.conn.lock().unwrap();
    
    let mut spend_params = Vec::new();
    let spend_where = build_dashboard_where_clause(&filters, &mut spend_params);
    let spend_query = format!("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE amount < 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income')) AND {}", spend_where);
    let total_spend: f64 = conn.query_row(&spend_query, rusqlite::params_from_iter(spend_params), |row| row.get(0)).unwrap_or(0.0);

    let mut income_params = Vec::new();
    let income_where = build_dashboard_where_clause(&filters, &mut income_params);
    let income_query = format!("SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'spend')) AND {}", income_where);
    let total_income: f64 = conn.query_row(&income_query, rusqlite::params_from_iter(income_params), |row| row.get(0)).unwrap_or(0.0);

    let mut acc_params = Vec::new();
    let acc_where = build_dashboard_where_clause(&filters, &mut acc_params);
    let acc_query = format!("SELECT account_id, COALESCE(SUM(amount), 0) FROM transactions WHERE {} GROUP BY account_id", acc_where);
    
    let mut account_totals = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(&acc_query) {
        if let Ok(iter) = stmt.query_map(rusqlite::params_from_iter(acc_params), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
        }) {
            for row in iter.flatten() {
                account_totals.insert(row.0, row.1);
            }
        }
    }

    Ok(DashboardAggregates {
        total_spend,
        total_income,
        account_totals,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopMerchant {
    pub merchant_key: String,
    pub total: f64,
    pub count: i64,
}

#[tauri::command]
pub fn get_top_merchants(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
) -> Result<Vec<TopMerchant>, String> {
    let conn = state.conn.lock().unwrap();
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let query = format!(
        "SELECT merchant_key, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt 
         FROM transactions 
         WHERE {} 
         GROUP BY merchant_key 
         ORDER BY total ASC 
         LIMIT 100",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(TopMerchant {
            merchant_key: row.get(0)?,
            total: row.get(1)?,
            count: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for i in iter {
        if let Ok(m) = i {
            if m.total < 0.0 {
                results.push(m);
            }
        }
    }
    
    Ok(results)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendChartGroup {
    pub month: String,
    pub key: String,
    pub total: f64,
}

#[tauri::command]
pub fn get_spend_chart_data(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
    group_by: String,
) -> Result<Vec<SpendChartGroup>, String> {
    let conn = state.conn.lock().unwrap();
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let group_col = match group_by.as_str() {
        "account" => "CAST(account_id AS TEXT)",
        "merchant" => "merchant_key",
        "recurrence" => "recurrence",
        "all" => "'all'",
        _ => "category",
    };

    let query = format!(
        "SELECT strftime('%Y-%m', date) as month, COALESCE({}, '') as key, COALESCE(SUM(amount), 0) as total 
         FROM transactions 
         WHERE amount < 0 AND {} 
         GROUP BY month, key",
        group_col, where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(SpendChartGroup {
            month: row.get(0)?,
            key: row.get(1)?,
            total: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for i in iter.flatten() {
        results.push(i);
    }
    
    Ok(results)
}

#[tauri::command]
pub fn get_income_chart_data(
    state: tauri::State<crate::db::DbState>,
    filters: DashboardFilters,
) -> Result<Vec<SpendChartGroup>, String> {
    let conn = state.conn.lock().unwrap();
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let query = format!(
        "SELECT strftime('%Y-%m', date) as month, 'income' as key, COALESCE(SUM(amount), 0) as total 
         FROM transactions 
         WHERE amount > 0 AND category IN (SELECT name FROM categories WHERE type = 'income') AND {} 
         GROUP BY month",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(SpendChartGroup {
            month: row.get(0)?,
            key: row.get(1)?,
            total: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for i in iter.flatten() {
        results.push(i);
    }
    
    Ok(results)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsolidatedMerchant {
    pub merchant_key: String,
    pub category: String,
    pub monthly_average: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTrailingAvg {
    pub category: String,
    pub average: f64,
}

#[tauri::command]
pub fn get_consolidated_recurring_merchants(
    state: tauri::State<crate::db::DbState>,
    is_demo: bool,
) -> Result<Vec<ConsolidatedMerchant>, String> {
    let conn = state.conn.lock().unwrap();
    
    let today = chrono::Local::now().naive_local().date();
    let cutoff = today - chrono::Duration::days(60);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    
    let query = "
        SELECT merchant_key, category, SUM(ABS(amount)) as total
        FROM transactions
        WHERE amount < 0
          AND date >= ?
          AND category IN (SELECT name FROM categories WHERE default_recurrence = 'recurring')
          AND (
            (? = 1 AND source = 'demo') OR
            (? = 0 AND source != 'demo')
          )
        GROUP BY merchant_key, category
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let demo_val = if is_demo { 1 } else { 0 };
    let rows = stmt.query_map(rusqlite::params![cutoff_str, demo_val, demo_val], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for r in rows {
        if let Ok((merchant_key, category, total)) = r {
            results.push(ConsolidatedMerchant {
                merchant_key,
                category,
                monthly_average: total / 2.0,
            });
        }
    }
    
    results.sort_by(|a, b| b.monthly_average.partial_cmp(&a.monthly_average).unwrap_or(std::cmp::Ordering::Equal));
    
    Ok(results)
}

#[tauri::command]
pub fn get_category_trailing_averages(
    state: tauri::State<crate::db::DbState>,
    is_demo: bool,
) -> Result<Vec<CategoryTrailingAvg>, String> {
    let conn = state.conn.lock().unwrap();
    
    let today = chrono::Local::now().naive_local().date();
    let cutoff = today - chrono::Duration::days(90);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    
    let query = "
        SELECT category, SUM(ABS(amount)) as total
        FROM transactions
        WHERE amount < 0
          AND date >= ?
          AND category IN (SELECT name FROM categories WHERE type = 'spend')
          AND (
            (? = 1 AND source = 'demo') OR
            (? = 0 AND source != 'demo')
          )
        GROUP BY category
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let demo_val = if is_demo { 1 } else { 0 };
    let rows = stmt.query_map(rusqlite::params![cutoff_str, demo_val, demo_val], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for r in rows {
        if let Ok((category, total)) = r {
            results.push(CategoryTrailingAvg {
                category,
                average: total / 3.0,
            });
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub fn get_unique_merchants(
    state: tauri::State<crate::db::DbState>,
    is_demo: bool,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().unwrap();
    let query = "
        SELECT DISTINCT merchant_key 
        FROM transactions 
        WHERE merchant_key != ''
          AND (
            (? = 1 AND source = 'demo') OR
            (? = 0 AND source != 'demo')
          )
        ORDER BY merchant_key ASC
    ";
    let demo_val = if is_demo { 1 } else { 0 };
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![demo_val, demo_val], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for r in rows {
        if let Ok(m) = r {
            results.push(m);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn get_transaction_bounds(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<(Option<String>, Option<String>), String> {
    let conn = state.conn.lock().unwrap();
    let query = if demo_mode {
        "SELECT MIN(date), MAX(date) FROM transactions WHERE source = 'demo'"
    } else {
        "SELECT MIN(date), MAX(date) FROM transactions WHERE source != 'demo'"
    };
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let min_date: Option<String> = row.get(0).ok();
        let max_date: Option<String> = row.get(1).ok();
        Ok((min_date, max_date))
    } else {
        Ok((None, None))
    }
}

#[tauri::command]
pub fn get_uncategorized_count(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    let query = if demo_mode {
        "SELECT COUNT(*) FROM transactions WHERE category = 'Uncategorized' AND source = 'demo'"
    } else {
        "SELECT COUNT(*) FROM transactions WHERE category = 'Uncategorized' AND source != 'demo'"
    };
    let count: i64 = conn.query_row(query, [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(count)
}

fn normalize_for_match(s: &str) -> String {
    let mut cleaned = s.to_lowercase();
    for pattern in &["co id:", "des:", "id:", "indn:", "ref:"] {
        cleaned = cleaned.replace(pattern, " ");
    }
    let mut result = String::with_capacity(cleaned.len());
    let mut last_was_space = false;
    for c in cleaned.chars() {
        if c == '*' || c == '.' || c == '/' || c == '&' || c == '-' || c == '#' || c == '+' || c == ',' {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else if c.is_whitespace() {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(c);
            last_was_space = false;
        }
    }
    result.trim().to_string()
}

#[tauri::command]
pub fn get_category_transaction_counts(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<std::collections::HashMap<String, i64>, String> {
    let conn = state.conn.lock().unwrap();
    let query = if demo_mode {
        "SELECT category, COUNT(*) FROM transactions WHERE source = 'demo' GROUP BY category"
    } else {
        "SELECT category, COUNT(*) FROM transactions WHERE source != 'demo' GROUP BY category"
    };
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?;
    
    let mut counts = std::collections::HashMap::new();
    for item in rows {
        let (cat, count) = item.map_err(|e| e.to_string())?;
        counts.insert(cat, count);
    }
    Ok(counts)
}

#[tauri::command]
pub fn get_rule_match_counts(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<std::collections::HashMap<i64, i64>, String> {
    let conn = state.conn.lock().unwrap();
    
    let mut rules_stmt = conn.prepare("SELECT id, pattern, category, priority FROM rules ORDER BY priority DESC").map_err(|e| e.to_string())?;
    let rules_iter = rules_stmt.query_map([], |row| {
        Ok(crate::db::CategoryRule {
            id: row.get(0)?,
            pattern: row.get(1)?,
            category: row.get(2)?,
            priority: row.get(3)?,
            created_at: String::new(),
        })
    }).map_err(|e| e.to_string())?;
    
    let mut rules = Vec::new();
    for r in rules_iter {
        rules.push(r.map_err(|e| e.to_string())?);
    }
    
    let tx_query = if demo_mode {
        "SELECT description, merchant_key FROM transactions WHERE source = 'demo'"
    } else {
        "SELECT description, merchant_key FROM transactions WHERE source != 'demo'"
    };
    
    let mut tx_stmt = conn.prepare(tx_query).map_err(|e| e.to_string())?;
    let tx_iter = tx_stmt.query_map([], |row| {
        let desc: String = row.get(0)?;
        let mkey: Option<String> = row.get(1)?;
        Ok((desc, mkey))
    }).map_err(|e| e.to_string())?;
    
    let normalized_rules: Vec<(i64, String)> = rules.iter().map(|r| {
        let pattern_norm = if !r.pattern.is_empty() {
            normalize_for_match(&r.pattern)
        } else {
            String::new()
        };
        (r.id.unwrap_or(0), pattern_norm)
    }).collect();
    
    let mut stats = std::collections::HashMap::new();
    for (id, _) in &normalized_rules {
        stats.insert(*id, 0i64);
    }
    
    for tx in tx_iter {
        let (desc, mkey) = tx.map_err(|e| e.to_string())?;
        let desc_norm = normalize_for_match(&desc);
        let mkey_norm = mkey.map(|k| normalize_for_match(&k)).unwrap_or_default();
        
        for (rule_id, pattern_norm) in &normalized_rules {
            if !pattern_norm.is_empty() && (desc_norm.contains(pattern_norm) || (!mkey_norm.is_empty() && mkey_norm.contains(pattern_norm))) {
                if let Some(count) = stats.get_mut(rule_id) {
                    *count += 1;
                }
                break;
            }
        }
    }
    
    Ok(stats)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MerchantGroup {
    pub merchant_key: String,
    pub total_spend: f64,
    pub total_transactions: i64,
    pub categories: std::collections::HashMap<String, i64>,
    pub most_common_category: String,
    pub earliest_date: String,
    pub latest_date: String,
}

#[tauri::command]
pub fn get_merchant_groups(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<Vec<MerchantGroup>, String> {
    let conn = state.conn.lock().unwrap();
    
    let query = if demo_mode {
        "SELECT merchant_key, category, COUNT(*), SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), MIN(date), MAX(date) FROM transactions WHERE source = 'demo' GROUP BY merchant_key, category"
    } else {
        "SELECT merchant_key, category, COUNT(*), SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), MIN(date), MAX(date) FROM transactions WHERE source != 'demo' GROUP BY merchant_key, category"
    };
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let merchant_key: String = row.get::<_, Option<String>>(0)?.unwrap_or_else(|| "Unknown".to_string());
        let category: String = row.get(1)?;
        let count: i64 = row.get(2)?;
        let spend: f64 = row.get(3)?;
        let earliest: String = row.get(4)?;
        let latest: String = row.get(5)?;
        Ok((merchant_key, category, count, spend, earliest, latest))
    }).map_err(|e| e.to_string())?;
    
    let mut groups: std::collections::HashMap<String, MerchantGroup> = std::collections::HashMap::new();
    
    for row_res in rows {
        let (key, cat, count, spend, earliest, latest) = row_res.map_err(|e| e.to_string())?;
        
        let g = groups.entry(key.clone()).or_insert_with(|| MerchantGroup {
            merchant_key: key,
            total_spend: 0.0,
            total_transactions: 0,
            categories: std::collections::HashMap::new(),
            most_common_category: String::new(),
            earliest_date: earliest.clone(),
            latest_date: latest.clone(),
        });
        
        g.total_spend += spend;
        g.total_transactions += count;
        g.categories.insert(cat, count);
        
        if earliest < g.earliest_date {
            g.earliest_date = earliest;
        }
        if latest > g.latest_date {
            g.latest_date = latest;
        }
    }
    
    for g in groups.values_mut() {
        let mut max_count = -1;
        let mut best_cat = "Uncategorized".to_string();
        for (cat, count) in &g.categories {
            if *count > max_count {
                max_count = *count;
                best_cat = cat.clone();
            }
        }
        g.most_common_category = best_cat;
    }
    
    let result: Vec<MerchantGroup> = groups.into_values().collect();
    Ok(result)
}

