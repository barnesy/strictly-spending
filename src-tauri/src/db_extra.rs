
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
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
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
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
pub struct AppDocument {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub type_val: String,
    pub source: String,
    #[serde(rename = "associatedChecklistId")]
    pub associated_checklist_id: Option<String>,
    pub content: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentContent {
    pub id: String,
    pub content: String,
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
    conn.execute("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, type_val TEXT, title TEXT, content TEXT, explanation TEXT, created_at TEXT, updated_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, created_at TEXT, updated_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, role TEXT, content TEXT, action_result TEXT, created_at TEXT, active_skill_id TEXT, completed_stages TEXT, steps TEXT, token_usage TEXT, purpose TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS csv_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, header_hash TEXT, headers TEXT, date_column TEXT, description_column TEXT, amount_column TEXT, debit_column TEXT, credit_column TEXT, balance_column TEXT, account_name TEXT, account_type TEXT, institution TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT, path TEXT, type_val TEXT, source TEXT, associated_checklist_id TEXT, content TEXT, created_at TEXT, metadata TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS document_contents (id TEXT PRIMARY KEY, content TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS tax_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT, is_business BOOLEAN, tax_category TEXT, priority INTEGER, created_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type_val TEXT, principal REAL, rate REAL, term_years INTEGER, start_date TEXT, category TEXT, merchant TEXT, monthly_payment REAL, property_value REAL, down_payment REAL, extra_monthly_payment REAL, extra_one_time_payment REAL, extra_one_time_month INTEGER, created_at TEXT, enabled BOOLEAN)", [])?;
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
    let mut stmt = conn.prepare("SELECT id, type_val, title, content, explanation, created_at, updated_at FROM artifacts").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(ChatArtifact {
            id: row.get(0)?,
            type_val: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            explanation: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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
        "INSERT INTO artifacts (id, type_val, title, content, explanation, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![item.id, item.type_val, item.title, item.content, item.explanation, item.created_at, item.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_artifact(state: State<DbState>, item: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO artifacts (id, type_val, title, content, explanation, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![item.id, item.type_val, item.title, item.content, item.explanation, item.created_at, item.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_artifact(state: State<DbState>, id: String, updates: ChatArtifact) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE artifacts SET type_val=?1, title=?2, content=?3, explanation=?4, created_at=?5, updated_at=?6 WHERE id = ?7",
        params![updates.type_val, updates.title, updates.content, updates.explanation, updates.created_at, updates.updated_at, id],
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
    let mut stmt = conn.prepare("SELECT id, thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose FROM messages").map_err(|e| e.to_string())?;
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
        "INSERT INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![item.thread_id, item.role, item.content, serde_json::to_string(&item.action_result).unwrap_or_default(), item.created_at, item.active_skill_id, serde_json::to_string(&item.completed_stages).unwrap_or_default(), serde_json::to_string(&item.steps).unwrap_or_default(), serde_json::to_string(&item.token_usage).unwrap_or_default(), item.purpose],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_message(state: State<DbState>, item: DbChatMessage) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO messages (thread_id, role, content, action_result, created_at, active_skill_id, completed_stages, steps, token_usage, purpose, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![item.thread_id, item.role, item.content, serde_json::to_string(&item.action_result).unwrap_or_default(), item.created_at, item.active_skill_id, serde_json::to_string(&item.completed_stages).unwrap_or_default(), serde_json::to_string(&item.steps).unwrap_or_default(), serde_json::to_string(&item.token_usage).unwrap_or_default(), item.purpose, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_message(state: State<DbState>, id: i64, updates: DbChatMessage) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE messages SET thread_id=?1, role=?2, content=?3, action_result=?4, created_at=?5, active_skill_id=?6, completed_stages=?7, steps=?8, token_usage=?9, purpose=?10 WHERE id = ?11",
        params![updates.thread_id, updates.role, updates.content, serde_json::to_string(&updates.action_result).unwrap_or_default(), updates.created_at, updates.active_skill_id, serde_json::to_string(&updates.completed_stages).unwrap_or_default(), serde_json::to_string(&updates.steps).unwrap_or_default(), serde_json::to_string(&updates.token_usage).unwrap_or_default(), updates.purpose, id],
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
pub fn get_documents(state: State<DbState>) -> Result<Vec<AppDocument>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, path, type_val, source, associated_checklist_id, content, created_at, metadata FROM documents").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(AppDocument {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            type_val: row.get(3)?,
            source: row.get(4)?,
            associated_checklist_id: row.get(5)?,
            content: row.get(6)?,
            created_at: row.get(7)?,
            metadata: row.get::<_, Option<String>>(8)?.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)),
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_document(state: State<DbState>, item: AppDocument) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO documents (id, name, path, type_val, source, associated_checklist_id, content, created_at, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![item.id, item.name, item.path, item.type_val, item.source, item.associated_checklist_id, item.content, item.created_at, serde_json::to_string(&item.metadata).unwrap_or_default()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_document(state: State<DbState>, item: AppDocument) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO documents (id, name, path, type_val, source, associated_checklist_id, content, created_at, metadata) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![item.id, item.name, item.path, item.type_val, item.source, item.associated_checklist_id, item.content, item.created_at, serde_json::to_string(&item.metadata).unwrap_or_default()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_document(state: State<DbState>, id: String, updates: AppDocument) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE documents SET name=?1, path=?2, type_val=?3, source=?4, associated_checklist_id=?5, content=?6, created_at=?7, metadata=?8 WHERE id = ?9",
        params![updates.name, updates.path, updates.type_val, updates.source, updates.associated_checklist_id, updates.content, updates.created_at, serde_json::to_string(&updates.metadata).unwrap_or_default(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_document(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_documents(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM documents", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_document_contents(state: State<DbState>) -> Result<Vec<DocumentContent>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, content FROM document_contents").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(DocumentContent {
            id: row.get(0)?,
            content: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn add_document_content(state: State<DbState>, item: DocumentContent) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO document_contents (id, content) VALUES (?1, ?2)",
        params![item.id, item.content],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_document_content(state: State<DbState>, item: DocumentContent) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO document_contents (id, content) VALUES (?1, ?2)",
        params![item.id, item.content],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_document_content(state: State<DbState>, id: String, updates: DocumentContent) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE document_contents SET content=?1 WHERE id = ?2",
        params![updates.content, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_document_content(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM document_contents WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_document_contents(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM document_contents", []).map_err(|e| e.to_string())?;
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
    let mut stmt = conn.prepare("SELECT id, name, type_val, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled FROM loans").map_err(|e| e.to_string())?;
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
        "INSERT INTO loans (name, type_val, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![item.name, item.type_val, item.principal, item.rate, item.term_years, item.start_date, item.category, item.merchant, item.monthly_payment, item.property_value, item.down_payment, item.extra_monthly_payment, item.extra_one_time_payment, item.extra_one_time_month, item.created_at, item.enabled],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn put_loan(state: State<DbState>, item: Loan) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO loans (name, type_val, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled, id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![item.name, item.type_val, item.principal, item.rate, item.term_years, item.start_date, item.category, item.merchant, item.monthly_payment, item.property_value, item.down_payment, item.extra_monthly_payment, item.extra_one_time_payment, item.extra_one_time_month, item.created_at, item.enabled, item.id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_loan(state: State<DbState>, id: i64, updates: Loan) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE loans SET name=?1, type_val=?2, principal=?3, rate=?4, term_years=?5, start_date=?6, category=?7, merchant=?8, monthly_payment=?9, property_value=?10, down_payment=?11, extra_monthly_payment=?12, extra_one_time_payment=?13, extra_one_time_month=?14, created_at=?15, enabled=?16 WHERE id = ?17",
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
