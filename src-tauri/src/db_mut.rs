use rusqlite::{params, Result};
use tauri::State;
use crate::db::{DbState, Transaction, Account, Category, MerchantOverride, Budget, CategoryRule};

#[tauri::command]
pub fn add_transaction(state: State<DbState>, item: Transaction) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO transactions (account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            item.account_id, item.date, item.description, item.amount, item.raw_category, item.category, item.source, item.merchant_key, item.user_overridden, item.dedup_key, item.import_batch_id, item.recurrence, item.recurrence_override, item.is_business, item.tax_category, item.deduction_status
        ],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn bulk_add_transactions(state: State<DbState>, transactions: Vec<Transaction>, ignore_errors: bool) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for item in transactions {
        let sql = if ignore_errors {
            "INSERT OR IGNORE INTO transactions (account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)"
        } else {
            "INSERT INTO transactions (account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)"
        };
        tx.execute(sql, params![
            item.account_id, item.date, item.description, item.amount, item.raw_category, item.category, item.source, item.merchant_key, item.user_overridden, item.dedup_key, item.import_batch_id, item.recurrence, item.recurrence_override, item.is_business, item.tax_category, item.deduction_status
        ]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_transaction(state: State<DbState>, id: i64, updates: Transaction) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    // In a real app we might want dynamic updates, but for now we just overwrite all fields
    conn.execute(
        "UPDATE transactions SET account_id=?1, date=?2, description=?3, amount=?4, raw_category=?5, category=?6, source=?7, merchant_key=?8, user_overridden=?9, dedup_key=?10, import_batch_id=?11, recurrence=?12, recurrence_override=?13, is_business=?14, tax_category=?15, deduction_status=?16 WHERE id=?17",
        params![
            updates.account_id, updates.date, updates.description, updates.amount, updates.raw_category, updates.category, updates.source, updates.merchant_key, updates.user_overridden, updates.dedup_key, updates.import_batch_id, updates.recurrence, updates.recurrence_override, updates.is_business, updates.tax_category, updates.deduction_status, id
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_transaction(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM transactions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_transactions(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM transactions", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_account(state: State<DbState>, item: Account) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    if let Some(id) = item.id {
        conn.execute(
            "INSERT INTO accounts (id, name, type, institution, last4, source, enabled, current_balance) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, item.name, item.account_type, item.institution, item.last4, item.source, item.enabled, item.current_balance],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO accounts (name, type, institution, last4, source, enabled, current_balance) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.name, item.account_type, item.institution, item.last4, item.source, item.enabled, item.current_balance],
        ).map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
pub fn update_account(state: State<DbState>, id: i64, updates: Account) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE accounts SET name=?1, type=?2, institution=?3, last4=?4, source=?5, enabled=?6, current_balance=?7 WHERE id=?8",
        params![updates.name, updates.account_type, updates.institution, updates.last4, updates.source, updates.enabled, updates.current_balance, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_accounts(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM accounts", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_category(state: State<DbState>, item: Category) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO categories (name, color, type, sort_order, default_recurrence) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![item.name, item.color, item.category_type, item.sort_order, item.default_recurrence],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_category(state: State<DbState>, id: i64, updates: Category) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE categories SET name=?1, color=?2, type=?3, sort_order=?4, default_recurrence=?5 WHERE id=?6",
        params![updates.name, updates.color, updates.category_type, updates.sort_order, updates.default_recurrence, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_categories(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM categories", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_merchant_override(state: State<DbState>, item: MerchantOverride) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO merchant_overrides (merchant_key, recurrence) VALUES (?1, ?2) ON CONFLICT(merchant_key) DO UPDATE SET recurrence=excluded.recurrence",
        params![item.merchant_key, item.recurrence],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_merchant_override(state: State<DbState>, merchant_key: String) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM merchant_overrides WHERE merchant_key = ?1", params![merchant_key]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_merchant_overrides(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM merchant_overrides", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn put_budget(state: State<DbState>, item: Budget) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO budgets (category, monthly_amount, user_set) VALUES (?1, ?2, ?3) ON CONFLICT(category) DO UPDATE SET monthly_amount=excluded.monthly_amount, user_set=excluded.user_set",
        params![item.category, item.monthly_amount, item.user_set],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn bulk_put_budgets(state: State<DbState>, budgets: Vec<Budget>) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for budget in budgets {
        tx.execute(
            "INSERT INTO budgets (category, monthly_amount, user_set) VALUES (?1, ?2, ?3) ON CONFLICT(category) DO UPDATE SET monthly_amount=excluded.monthly_amount, user_set=excluded.user_set",
            params![budget.category, budget.monthly_amount, budget.user_set],
        ).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_budgets(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM budgets", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_rule(state: State<DbState>, item: CategoryRule) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO rules (pattern, category, priority, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![item.pattern, item.category, item.priority, item.created_at],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_rule(state: State<DbState>, id: i64, updates: CategoryRule) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE rules SET pattern=?1, category=?2, priority=?3, created_at=?4 WHERE id=?5",
        params![updates.pattern, updates.category, updates.priority, updates.created_at, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_rule(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM rules WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_rules(state: State<DbState>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM rules", []).map_err(|e| e.to_string())?;
    Ok(())
}
