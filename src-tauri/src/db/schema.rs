use rusqlite::{Connection, Result};

pub fn legacy_init(conn: &Connection) -> Result<()> {
    conn.execute("CREATE TABLE IF NOT EXISTS imports (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, source TEXT, imported_at TEXT, row_count INTEGER, new_count INTEGER, duplicate_count INTEGER, content_hash TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, type TEXT, title TEXT, content TEXT, explanation TEXT, summary TEXT, created_at TEXT, updated_at TEXT, path TEXT, source TEXT, associated_checklist_id TEXT)", [])?;
    
    // Migrations for older schemas
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN path TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN source TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN associated_checklist_id TEXT", []);
    let _ = conn.execute("ALTER TABLE artifacts ADD COLUMN summary TEXT", []);

    conn.execute("CREATE TABLE IF NOT EXISTS artifact_versions (id TEXT PRIMARY KEY, artifact_id TEXT, content TEXT, summary TEXT, created_at TEXT)", [])?;

    conn.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, created_at TEXT, updated_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, role TEXT, content TEXT, action_result TEXT, created_at TEXT, active_skill_id TEXT, completed_stages TEXT, steps TEXT, token_usage TEXT, purpose TEXT, thinking TEXT)", [])?;
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN thinking TEXT", []);
    
    conn.execute("CREATE TABLE IF NOT EXISTS csv_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, header_hash TEXT, headers TEXT, date_column TEXT, description_column TEXT, amount_column TEXT, debit_column TEXT, credit_column TEXT, balance_column TEXT, account_name TEXT, account_type TEXT, institution TEXT)", [])?;

    conn.execute("CREATE TABLE IF NOT EXISTS tax_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT, is_business BOOLEAN, tax_category TEXT, priority INTEGER, created_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, principal REAL, rate REAL, term_years INTEGER, start_date TEXT, category TEXT, merchant TEXT, monthly_payment REAL, property_value REAL, down_payment REAL, extra_monthly_payment REAL, extra_one_time_payment REAL, extra_one_time_month INTEGER, created_at TEXT, enabled BOOLEAN)", [])?;
    Ok(())
}
