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
    conn.execute("CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact_id ON artifact_versions(artifact_id)", [])?;

    conn.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, created_at TEXT, updated_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT, role TEXT, content TEXT, action_result TEXT, created_at TEXT, active_skill_id TEXT, completed_stages TEXT, steps TEXT, token_usage TEXT, purpose TEXT, thinking TEXT)", [])?;
    let _ = conn.execute("ALTER TABLE messages ADD COLUMN thinking TEXT", []);
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)", [])?;
    
    conn.execute("CREATE TABLE IF NOT EXISTS csv_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, header_hash TEXT, headers TEXT, date_column TEXT, description_column TEXT, amount_column TEXT, debit_column TEXT, credit_column TEXT, balance_column TEXT, account_name TEXT, account_type TEXT, institution TEXT, account_column TEXT, account_mappings TEXT)", [])?;
    let _ = conn.execute("ALTER TABLE csv_mappings ADD COLUMN account_column TEXT", []);
    let _ = conn.execute("ALTER TABLE csv_mappings ADD COLUMN account_mappings TEXT", []);

    conn.execute("CREATE TABLE IF NOT EXISTS tax_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT, is_business BOOLEAN, tax_category TEXT, priority INTEGER, created_at TEXT)", [])?;
    conn.execute("CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, type TEXT, principal REAL, rate REAL, term_years INTEGER, start_date TEXT, category TEXT, merchant TEXT, monthly_payment REAL, property_value REAL, down_payment REAL, extra_monthly_payment REAL, extra_one_time_payment REAL, extra_one_time_month INTEGER, created_at TEXT, enabled BOOLEAN)", [])?;
    
    conn.execute("CREATE TABLE IF NOT EXISTS scenarios (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, starting_balance REAL, base_income REAL, tax_rate REAL, recurring_budget REAL, variable_budget REAL, savings_budget REAL, extra_loan_payment REAL, loan_strategy TEXT, created_at TEXT, goals TEXT)", [])?;
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN goals TEXT", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN investment_growth_rate REAL DEFAULT 7.0", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN divert_extra_to_savings BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN destinations TEXT", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN income_streams TEXT", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN include_home_equity BOOLEAN DEFAULT 1", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN home_property_value REAL", []);
    let _ = conn.execute("ALTER TABLE scenarios ADD COLUMN home_appreciation_rate REAL", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS plaid_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT UNIQUE NOT NULL,
            access_token TEXT NOT NULL,
            institution_id TEXT,
            institution_name TEXT,
            next_cursor TEXT,
            status TEXT DEFAULT 'active',
            created_at TEXT,
            last_synced_at TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS plaid_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT NOT NULL,
            account_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            mask TEXT,
            account_type TEXT,
            subtype TEXT,
            strictly_account_id INTEGER,
            FOREIGN KEY (strictly_account_id) REFERENCES accounts(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS simplefin_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT UNIQUE NOT NULL,
            org_name TEXT,
            name TEXT NOT NULL,
            currency TEXT,
            balance REAL,
            available_balance REAL,
            balance_date INTEGER,
            strictly_account_id INTEGER,
            FOREIGN KEY (strictly_account_id) REFERENCES accounts(id)
        )",
        [],
    )?;
    let _ = conn.execute("ALTER TABLE simplefin_accounts ADD COLUMN available_balance REAL", []);
    let _ = conn.execute("ALTER TABLE simplefin_accounts ADD COLUMN balance_date INTEGER", []);

    Ok(())
}
