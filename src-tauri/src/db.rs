use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use std::path::PathBuf;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Option<i64>,
    #[serde(rename = "accountId")]
    pub account_id: i64,
    pub date: String,
    pub description: String,
    pub amount: f64,
    #[serde(rename = "rawCategory")]
    pub raw_category: Option<String>,
    pub category: String,
    pub source: String,
    #[serde(rename = "merchantKey")]
    pub merchant_key: String,
    #[serde(rename = "userOverridden")]
    pub user_overridden: bool,
    #[serde(rename = "dedupKey")]
    pub dedup_key: String,
    #[serde(rename = "importBatchId")]
    pub import_batch_id: Option<i64>,
    pub recurrence: String,
    #[serde(rename = "recurrenceOverride")]
    pub recurrence_override: Option<String>,
    #[serde(rename = "isBusiness")]
    pub is_business: Option<bool>,
    #[serde(rename = "taxCategory")]
    pub tax_category: Option<String>,
    #[serde(rename = "deductionStatus")]
    pub deduction_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: Option<i64>,
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub institution: String,
    pub last4: Option<String>,
    pub source: String,
    pub enabled: bool,
    #[serde(rename = "currentBalance")]
    pub current_balance: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Category {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
    #[serde(rename = "type")]
    pub category_type: String,
    #[serde(rename = "sortOrder")]
    pub sort_order: i64,
    #[serde(rename = "defaultRecurrence")]
    pub default_recurrence: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MerchantOverride {
    #[serde(rename = "merchantKey")]
    pub merchant_key: String,
    pub recurrence: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Budget {
    pub category: String,
    #[serde(rename = "monthlyAmount")]
    pub monthly_amount: f64,
    #[serde(rename = "userSet")]
    pub user_set: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryRule {
    pub id: Option<i64>,
    pub pattern: String,
    pub category: String,
    pub priority: i64,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

pub fn init_db(db_path: PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            raw_category TEXT,
            category TEXT NOT NULL,
            source TEXT NOT NULL,
            merchant_key TEXT NOT NULL,
            user_overridden BOOLEAN NOT NULL DEFAULT 0,
            dedup_key TEXT NOT NULL UNIQUE,
            import_batch_id INTEGER,
            recurrence TEXT NOT NULL,
            recurrence_override TEXT,
            is_business BOOLEAN,
            tax_category TEXT,
            deduction_status TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_recurrence ON transactions(recurrence);",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            institution TEXT NOT NULL,
            last4 TEXT,
            source TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            current_balance REAL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            type TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            default_recurrence TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS merchant_overrides (
            merchant_key TEXT PRIMARY KEY,
            recurrence TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS budgets (
            category TEXT PRIMARY KEY,
            monthly_amount REAL NOT NULL,
            user_set BOOLEAN NOT NULL DEFAULT 0
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            priority INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    crate::db_extra::init_extra_tables(&conn)?;

    Ok(conn)
}

// Basic fetch methods to get started
#[tauri::command]
pub fn get_transactions(
    state: State<DbState>, 
    start_date: String, 
    end_date: String,
    category: Option<String>,
    merchant_key: Option<String>,
    account_id: Option<i64>,
    deduction_status: Option<String>
) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().unwrap();
    
    let mut query = "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE date BETWEEN ?1 AND ?2".to_string();
    
    let mut params: Vec<rusqlite::types::Value> = vec![
        rusqlite::types::Value::Text(start_date),
        rusqlite::types::Value::Text(end_date)
    ];
    
    if let Some(c) = category {
        query.push_str(&format!(" AND category = ?{}", params.len() + 1));
        params.push(rusqlite::types::Value::Text(c));
    }
    if let Some(m) = merchant_key {
        query.push_str(&format!(" AND merchant_key = ?{}", params.len() + 1));
        params.push(rusqlite::types::Value::Text(m));
    }
    if let Some(a) = account_id {
        query.push_str(&format!(" AND account_id = ?{}", params.len() + 1));
        params.push(rusqlite::types::Value::Integer(a));
    }
    if let Some(d) = deduction_status {
        query.push_str(&format!(" AND deduction_status = ?{}", params.len() + 1));
        params.push(rusqlite::types::Value::Text(d));
    }
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let tx_iter = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(Transaction {
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
pub fn get_recurring_transactions(state: State<DbState>) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE recurrence = 'recurring'").map_err(|e| e.to_string())?;
    
    let tx_iter = stmt.query_map([], |row| {
        Ok(Transaction {
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
pub fn get_forecast_transactions(state: State<DbState>, cutoff_date: String) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE date >= ?1").map_err(|e| e.to_string())?;
    
    let tx_iter = stmt.query_map(params![cutoff_date], |row| {
        Ok(Transaction {
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
pub fn get_accounts(state: State<DbState>) -> Result<Vec<Account>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(Account {
            id: row.get(0)?,
            name: row.get(1)?,
            account_type: row.get(2)?,
            institution: row.get(3)?,
            last4: row.get(4)?,
            source: row.get(5)?,
            enabled: row.get(6)?,
            current_balance: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn get_categories(state: State<DbState>) -> Result<Vec<Category>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, name, color, type, sort_order, default_recurrence FROM categories ORDER BY sort_order").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            category_type: row.get(3)?,
            sort_order: row.get(4)?,
            default_recurrence: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn get_merchant_overrides(state: State<DbState>) -> Result<Vec<MerchantOverride>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT merchant_key, recurrence FROM merchant_overrides").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(MerchantOverride {
            merchant_key: row.get(0)?,
            recurrence: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn get_budgets(state: State<DbState>) -> Result<Vec<Budget>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT category, monthly_amount, user_set FROM budgets").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(Budget {
            category: row.get(0)?,
            monthly_amount: row.get(1)?,
            user_set: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}

#[tauri::command]
pub fn get_rules(state: State<DbState>) -> Result<Vec<CategoryRule>, String> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, pattern, category, priority, created_at FROM rules").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(CategoryRule {
            id: row.get(0)?,
            pattern: row.get(1)?,
            category: row.get(2)?,
            priority: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for i in iter { results.push(i.map_err(|e| e.to_string())?); }
    Ok(results)
}
