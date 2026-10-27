use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::{DbState, Transaction};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SimpleFinConfig {
    pub access_url: String,
    pub claimed_at: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SimpleFinAccountRecord {
    pub id: i64,
    pub account_id: String,
    pub org_name: Option<String>,
    pub name: String,
    pub currency: Option<String>,
    pub balance: Option<f64>,
    pub available_balance: Option<f64>,
    pub balance_date: Option<i64>,
    pub strictly_account_id: Option<i64>,
    pub latest_transaction_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SimpleFinSyncResponse {
    pub added: usize,
    pub accounts_synced: usize,
    pub last_synced_at: String,
    pub sync_start_date: Option<String>,
    pub warnings: Vec<String>,
    pub accounts: Vec<SimpleFinAccountRecord>,
}

// SimpleFIN JSON payload response types
#[derive(Debug, Deserialize)]
struct SFinResponse {
    #[serde(default)]
    errlist: Vec<SFinError>,
    #[serde(default)]
    accounts: Vec<SFinAccount>,
    #[serde(default)]
    connections: Vec<SFinConnection>,
}

#[derive(Debug, Deserialize)]
struct SFinError {
    #[serde(default)]
    code: String,
    #[serde(default)]
    msg: String,
}

#[derive(Debug, Deserialize)]
struct SFinConnection {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    conn_id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    org_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SFinAccount {
    id: String,
    name: String,
    #[serde(default)]
    currency: Option<String>,
    #[serde(default)]
    balance: Option<String>,
    #[serde(default, rename = "available-balance")]
    available_balance: Option<String>,
    #[serde(default, rename = "balance-date")]
    balance_date: Option<i64>,
    #[serde(default)]
    org_name: Option<String>,
    #[serde(default)]
    conn_id: Option<String>,
    #[serde(default)]
    transactions: Vec<SFinTransaction>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SFinTransaction {
    id: String,
    #[serde(default)]
    posted: Option<i64>,
    #[serde(default)]
    transacted_at: Option<i64>,
    amount: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    payee: Option<String>,
    #[serde(default)]
    memo: Option<String>,
    #[serde(default)]
    pending: Option<bool>,
}

fn is_allowed_simplefin_host(host_and_path: &str) -> bool {
    let host_port = host_and_path.split('/').next().unwrap_or("");
    let host = host_port.split(':').next().unwrap_or("").to_ascii_lowercase();
    host == "simplefin.org" || host.ends_with(".simplefin.org")
}

fn redact_config_for_ui(mut config: SimpleFinConfig) -> SimpleFinConfig {
    if !config.access_url.trim().is_empty() {
        config.access_url = "[REDACTED]".to_string();
    }
    config
}

// Helper to parse basic auth credentials and target URL from a SimpleFIN Access URL
pub fn parse_simplefin_url(raw_url: &str) -> Result<(String, String, String), String> {
    let trimmed = raw_url.trim();
    let scheme_split: Vec<&str> = trimmed.split("://").collect();
    if scheme_split.len() != 2 {
        return Err("Invalid SimpleFIN URL format: missing scheme".to_string());
    }
    let scheme = scheme_split[0];
    if !scheme.eq_ignore_ascii_case("https") {
        return Err("Invalid SimpleFIN URL: only https:// is permitted".to_string());
    }
    let rest = scheme_split[1];

    let at_split: Vec<&str> = rest.splitn(2, '@').collect();
    if at_split.len() != 2 {
        return Err("Invalid SimpleFIN URL format: missing credentials before @".to_string());
    }
    let auth_part = at_split[0];
    let host_part = at_split[1];

    if !is_allowed_simplefin_host(host_part) {
        return Err("Invalid SimpleFIN URL host: must be an official simplefin.org domain".to_string());
    }

    let colon_split: Vec<&str> = auth_part.splitn(2, ':').collect();
    if colon_split.len() != 2 {
        return Err("Invalid SimpleFIN URL credentials: expected username:password".to_string());
    }
    let username = colon_split[0].to_string();
    let password = colon_split[1].to_string();

    let clean_url = format!("https://{}", host_part.trim_end_matches('/'));
    Ok((username, password, clean_url))
}

pub fn resolve_transaction_date(posted: Option<i64>, transacted_at: Option<i64>) -> String {
    // Timestamp: prefer posted if positive (> 0); otherwise use transacted_at if positive (> 0); fallback to now
    let epoch = match (posted, transacted_at) {
        (Some(p), _) if p > 0 => p,
        (_, Some(ta)) if ta > 0 => ta,
        _ => chrono::Utc::now().timestamp(),
    };

    let mut date = chrono::DateTime::from_timestamp(epoch, 0)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());

    // Extra safety guard: never allow 1970 or pre-2000 dates
    if date.as_str() < "2000-01-01" {
        if let Some(ta) = transacted_at.filter(|&x| x > 0) {
            date = chrono::DateTime::from_timestamp(ta, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
        } else {
            date = chrono::Local::now().format("%Y-%m-%d").to_string();
        }
    }
    date
}

// 1. Get current SimpleFIN configuration (internal helper returns unredacted config)
pub fn get_config(conn_mutex: &std::sync::Mutex<rusqlite::Connection>) -> Result<SimpleFinConfig, String> {
    let conn = conn_mutex.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = 'simplefin_config'")
        .map_err(|e| e.to_string())?;

    let row = stmt.query_row([], |r| r.get::<_, String>(0)).ok();
    if let Some(json_str) = row {
        serde_json::from_str(&json_str).map_err(|e| e.to_string())
    } else {
        Ok(SimpleFinConfig::default())
    }
}

pub fn save_config(conn_mutex: &std::sync::Mutex<rusqlite::Connection>, mut config: SimpleFinConfig) -> Result<(), String> {
    if config.access_url == "[REDACTED]" {
        if let Ok(existing) = get_config(conn_mutex) {
            config.access_url = existing.access_url;
        }
    }
    let json_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let mut conn = conn_mutex.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('simplefin_config', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![json_str],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn simplefin_get_config(state: State<DbState>) -> Result<SimpleFinConfig, String> {
    get_config(&state.conn).map(redact_config_for_ui)
}

// 2. Save SimpleFIN configuration directly
#[tauri::command]
pub fn simplefin_save_config(state: State<DbState>, config: SimpleFinConfig) -> Result<(), String> {
    save_config(&state.conn, config)
}

// 3. Claim a one-time setup token (or directly save if already an access URL)
#[tauri::command]
pub async fn simplefin_claim_setup_token(
    state: State<'_, DbState>,
    token_input: String,
) -> Result<SimpleFinConfig, String> {
    let trimmed = token_input.trim();
    if trimmed.is_empty() {
        return Err("Setup token cannot be empty".to_string());
    }

    let access_url = if trimmed.starts_with("https://") && trimmed.contains('@') {
        // Direct Access URL pasted
        trimmed.to_string()
    } else {
        // Base64-encoded Claim URL or raw claim URL
        let claim_url = if trimmed.starts_with("https://") {
            trimmed.to_string()
        } else {
            use base64::Engine;
            let decoded_bytes = base64::engine::general_purpose::STANDARD
                .decode(trimmed)
                .map_err(|e| format!("Invalid base64 setup token: {}", e))?;
            String::from_utf8(decoded_bytes)
                .map_err(|e| format!("Token does not contain valid UTF-8: {}", e))?
        };

        let claim_url_clean = claim_url.trim().to_string();
        let after_scheme = claim_url_clean
            .strip_prefix("https://")
            .ok_or_else(|| "Decoded setup token is not a valid HTTPS URL".to_string())?;
        if !is_allowed_simplefin_host(after_scheme) {
            return Err("Decoded setup token host must be an official simplefin.org domain".to_string());
        }

        let client = reqwest::Client::new();
        let resp = client
            .post(&claim_url_clean)
            .header(reqwest::header::CONTENT_LENGTH, 0)
            .send()
            .await
            .map_err(|e| format!("Failed to claim SimpleFIN token: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            if status.as_u16() == 403 {
                return Err("This setup token has already been claimed or has expired. Please generate a new one at SimpleFIN.".to_string());
            } else if status.as_u16() == 402 {
                return Err("Payment required: Please verify your SimpleFIN subscription at bridge.simplefin.org.".to_string());
            }
            return Err(format!("SimpleFIN claim failed (HTTP {}): {}", status, body));
        }

        resp.text()
            .await
            .map_err(|e| format!("Failed to read SimpleFIN response: {}", e))?
            .trim()
            .to_string()
    };

    // Verify format and simplefin.org host
    parse_simplefin_url(&access_url)?;

    let now = chrono::Utc::now().to_rfc3339();
    let config = SimpleFinConfig {
        access_url,
        claimed_at: Some(now),
        last_synced_at: None,
    };

    save_config(&state.conn, config.clone())?;
    Ok(redact_config_for_ui(config))
}

fn read_simplefin_accounts_from_db(
    conn: &rusqlite::Connection,
) -> Result<Vec<SimpleFinAccountRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                sa.id,
                sa.account_id,
                sa.org_name,
                sa.name,
                sa.currency,
                sa.balance,
                sa.available_balance,
                sa.balance_date,
                sa.strictly_account_id,
                (SELECT MAX(t.date) FROM transactions t WHERE t.account_id = sa.strictly_account_id AND t.date <= date('now', '+1 day')) AS latest_transaction_date
             FROM simplefin_accounts sa
             ORDER BY sa.org_name ASC, sa.name ASC"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(SimpleFinAccountRecord {
                id: r.get(0)?,
                account_id: r.get(1)?,
                org_name: r.get(2)?,
                name: r.get(3)?,
                currency: r.get(4)?,
                balance: r.get(5)?,
                available_balance: r.get(6)?,
                balance_date: r.get(7)?,
                strictly_account_id: r.get(8)?,
                latest_transaction_date: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

// 4. Get connected accounts (fetches from SimpleFIN and updates SQLite cache)
#[tauri::command]
pub async fn simplefin_get_accounts(
    state: State<'_, DbState>,
) -> Result<Vec<SimpleFinAccountRecord>, String> {
    let config = get_config(&state.conn)?;
    if config.access_url.trim().is_empty() {
        return Ok(Vec::new());
    }

    let (username, password, clean_url) = parse_simplefin_url(&config.access_url)?;
    let client = reqwest::Client::new();
    let accounts_url = format!("{}/accounts?version=2&balances-only=1", clean_url);

    let resp = client
        .get(&accounts_url)
        .basic_auth(&username, Some(&password))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to SimpleFIN: {}", e))?;

    let status = resp.status();
    if status.as_u16() == 402 {
        return Err("Payment required: Your SimpleFIN subscription is pending or inactive. Please activate your subscription at bridge.simplefin.org.".to_string());
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("SimpleFIN API error (HTTP {}): {}", status, body));
    }

    let sfin_data: SFinResponse = resp.json().await.map_err(|e| e.to_string())?;

    // Check errlist
    for err in &sfin_data.errlist {
        if err.msg.to_lowercase().contains("payment required") {
            return Err("Payment required: Please log in to your SimpleFIN Bridge account to activate your subscription ($1.50/mo or $15/yr).".to_string());
        }
    }

    // Map institution names
    let mut org_map = std::collections::HashMap::new();
    for conn in sfin_data.connections {
        let cid = conn.conn_id.or(conn.id);
        if let Some(id) = cid {
            let display_name = conn.org_name.or(conn.name).unwrap_or_else(|| "Bank".to_string());
            org_map.insert(id, display_name);
        }
    }

    // Update SQLite database cache
    {
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        for acc in &sfin_data.accounts {
            let balance_f64 = acc.balance.as_deref().and_then(|b| b.parse::<f64>().ok());
            let avail_f64 = acc.available_balance.as_deref().and_then(|b| b.parse::<f64>().ok());
            let org = acc.org_name.clone().or_else(|| {
                acc.conn_id.as_ref().and_then(|cid| org_map.get(cid).cloned())
            });

            tx.execute(
                "INSERT INTO simplefin_accounts (account_id, org_name, name, currency, balance, available_balance, balance_date, strictly_account_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
                 ON CONFLICT(account_id) DO UPDATE SET
                    org_name = COALESCE(excluded.org_name, simplefin_accounts.org_name),
                    name = excluded.name,
                    currency = excluded.currency,
                    balance = excluded.balance,
                    available_balance = excluded.available_balance,
                    balance_date = excluded.balance_date",
                params![acc.id, org, acc.name, acc.currency, balance_f64, avail_f64, acc.balance_date],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    read_simplefin_accounts_from_db(&conn)
}

// 5. Map a SimpleFIN account to a Strictly Spending account ID
#[tauri::command]
pub fn simplefin_map_account(
    state: State<DbState>,
    account_id: String,
    strictly_account_id: Option<i64>,
) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE simplefin_accounts SET strictly_account_id = ?1 WHERE account_id = ?2",
        params![strictly_account_id, account_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn sfin_descriptions_match(desc_a: &str, desc_b: &str) -> bool {
    let norm_a = desc_a.trim().to_lowercase();
    let norm_b = desc_b.trim().to_lowercase();
    if norm_a == norm_b {
        return true;
    }
    if (!norm_a.is_empty() && norm_b.contains(&norm_a)) || (!norm_b.is_empty() && norm_a.contains(&norm_b)) {
        return true;
    }
    if (norm_a.contains("qt") || norm_a.contains("quiktrip")) && (norm_b.contains("qt") || norm_b.contains("quiktrip")) {
        return true;
    }
    let stop_words: std::collections::HashSet<&str> = [
        "des", "indn", "purchase", "mobile", "web", "ppd", "the", "and", "for",
        "crd", "confirmation", "payment", "transfer", "id", "inc", "llc", "com", "store",
    ].iter().cloned().collect();

    let words_a: Vec<&str> = norm_a.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !stop_words.contains(w))
        .collect();
    let words_b: std::collections::HashSet<&str> = norm_b.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !stop_words.contains(w))
        .collect();

    words_a.into_iter().any(|w| words_b.contains(w))
}

fn is_generic_settled_description(desc_norm: &str) -> bool {
    matches!(
        desc_norm,
        "return" | "debit card return" | "online transfer" | "truist online transfer" | "transfer"
    )
}

fn is_pending_to_settled_match(
    pending_date: &str,
    pending_cents: i64,
    pending_desc: &str,
    settled_date: &str,
    settled_cents: i64,
    settled_desc: &str,
    settled_raw_desc: &str,
) -> bool {
    let Ok(p_nd) = chrono::NaiveDate::parse_from_str(pending_date, "%Y-%m-%d") else {
        return false;
    };
    let Ok(s_nd) = chrono::NaiveDate::parse_from_str(settled_date, "%Y-%m-%d") else {
        return false;
    };
    let days_diff = (s_nd - p_nd).num_days();
    if !(-1..=5).contains(&days_diff) {
        return false;
    }

    let desc_matches = sfin_descriptions_match(pending_desc, settled_desc)
        || sfin_descriptions_match(pending_desc, settled_raw_desc);

    if desc_matches {
        // 1a. Same exact amount
        if pending_cents == settled_cents {
            return true;
        }
        // 1b. Pre-tip restaurant/bar/service authorization -> settled with tip
        if pending_cents < 0 && settled_cents < 0 {
            let p_abs = pending_cents.abs();
            let s_abs = settled_cents.abs();
            let diff = s_abs - p_abs;
            if diff > 0 && diff <= std::cmp::max(5000, p_abs) {
                return true;
            }
            // 1c. Gas pump / pre-auth verification hold ($0.01 - $2.00) -> settled fill-up amount
            if p_abs <= 200 && s_abs > p_abs {
                return true;
            }
        }
    } else if (0..=4).contains(&days_diff) && pending_cents == settled_cents {
        // 2. Exact dollar-and-cent match within 0..4 days where pending description was a placeholder
        //    (e.g. "Mail Telephone Order" -> "AT&T", "UNIQLO" -> "Return", "Transfer From 4322" -> "Online Transfer")
        return true;
    }

    false
}

// 6. Sync transactions for mapped SimpleFIN accounts
pub async fn sync_transactions_core(
    db_state: &DbState,
    start_date: Option<String>,
) -> Result<SimpleFinSyncResponse, String> {
    let config = get_config(&db_state.conn)?;
    if config.access_url.trim().is_empty() {
        return Err("SimpleFIN is not configured. Please connect your SimpleFIN token.".to_string());
    }

    let (username, password, clean_url) = parse_simplefin_url(&config.access_url)?;

    // Account mappings: simplefin account_id -> strictly_account_id
    let account_map = {
        let conn = db_state.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT account_id, strictly_account_id FROM simplefin_accounts")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?)))
            .map_err(|e| e.to_string())?;

        let mut map = std::collections::HashMap::new();
        for r in rows {
            let (sfin_id, strictly_id) = r.map_err(|e| e.to_string())?;
            if let Some(sid) = strictly_id {
                map.insert(sfin_id, sid);
            }
        }
        map
    };

    // Load active rules for automatic category assignment on sync
    let rules: Vec<crate::db::CategoryRule> = {
        let conn = db_state.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, pattern, category, priority, created_at FROM rules")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(crate::db::CategoryRule {
                    id: r.get(0)?,
                    pattern: r.get(1)?,
                    category: r.get(2)?,
                    priority: r.get(3)?,
                    created_at: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    // Determine start timestamp:
    // If caller explicitly provides a date:
    //   - "0", "all", or "full" -> fetch all history (start-date=0)
    //   - "YYYY-MM-DD" -> parse to unix timestamp
    // If start_date is None or empty:
    //   - Optimize by retrieving only what we don't already have, with a safe 14-day gap ("safety bounds")
    let safe_buffer_days = 14;
    let (start_timestamp, sync_start_date) = if let Some(ref d) = start_date {
        let trimmed = d.trim();
        if trimmed == "0" || trimmed.eq_ignore_ascii_case("all") || trimmed.eq_ignore_ascii_case("full") {
            (Some(0), None)
        } else if let Ok(nd) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
            let ts = nd.and_hms_opt(0, 0, 0).map(|dt| dt.and_utc().timestamp());
            (ts, Some(trimmed.to_string()))
        } else {
            (Some(0), None)
        }
    } else {
        let mut candidate_date: Option<chrono::NaiveDate> = None;

        // 1. Check last_synced_at from config
        if let Some(ref last_sync_str) = config.last_synced_at {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(last_sync_str) {
                candidate_date = Some(dt.date_naive() - chrono::Duration::days(safe_buffer_days));
            }
        }

        // 2. Also check per-account latest transaction date in DB for mapped SimpleFIN accounts.
        let db_latest_date: Option<String> = {
            let conn = db_state.conn.lock().unwrap();
            let min_recent_query = "
                SELECT MIN(latest_date) FROM (
                    SELECT MAX(t.date) AS latest_date
                    FROM transactions t
                    JOIN simplefin_accounts sa ON sa.strictly_account_id = t.account_id
                    WHERE (t.source = 'simplefin' OR t.dedup_key LIKE 'simplefin_%')
                      AND t.date >= date('now', '-60 days')
                      AND t.date <= date('now', '+1 day')
                    GROUP BY t.account_id
                )
            ";
            let min_recent: Option<String> = conn.query_row(min_recent_query, [], |r| r.get(0)).unwrap_or(None);
            if min_recent.is_some() {
                min_recent
            } else {
                let fallback_query = "
                    SELECT MAX(t.date)
                    FROM transactions t
                    JOIN simplefin_accounts sa ON sa.strictly_account_id = t.account_id
                    WHERE (t.source = 'simplefin' OR t.dedup_key LIKE 'simplefin_%')
                      AND t.date >= '2000-01-01'
                      AND t.date <= date('now', '+1 day')
                ";
                conn.query_row(fallback_query, [], |r| r.get(0)).unwrap_or(None)
            }
        };

        if let Some(ref d_str) = db_latest_date {
            if let Ok(nd) = chrono::NaiveDate::parse_from_str(d_str, "%Y-%m-%d") {
                let buffered_db_date = nd - chrono::Duration::days(safe_buffer_days);
                candidate_date = match candidate_date {
                    Some(c) => Some(std::cmp::min(c, buffered_db_date)),
                    None => Some(buffered_db_date),
                };
            }
        }

        match candidate_date {
            Some(d) => {
                let ts = d.and_hms_opt(0, 0, 0)
                    .map(|dt| dt.and_utc().timestamp())
                    .unwrap_or(0);
                (Some(ts), Some(d.format("%Y-%m-%d").to_string()))
            }
            None => (Some(0), None), // First-time sync -> fetch all available history
        }
    };

    let mut accounts_url = format!("{}/accounts?version=2&pending=1", clean_url);
    if let Some(ts) = start_timestamp {
        accounts_url = format!("{}&start-date={}", accounts_url, ts);
    }

    let client = reqwest::Client::new();
    let resp = client
        .get(&accounts_url)
        .basic_auth(&username, Some(&password))
        .send()
        .await
        .map_err(|e| format!("SimpleFIN sync request failed: {}", e))?;

    let status = resp.status();
    if status.as_u16() == 402 {
        return Err("Payment required: Please verify your SimpleFIN subscription at bridge.simplefin.org.".to_string());
    }
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("SimpleFIN API error (HTTP {}): {}", status, body));
    }

    let sfin_data: SFinResponse = resp.json().await.map_err(|e| e.to_string())?;

    let mut warnings = Vec::new();
    for err in &sfin_data.errlist {
        warnings.push(format!("{}: {}", err.code, err.msg));
    }

    // Clean up any legacy corrupted 1970 timestamp transactions from previous syncs
    {
        let conn = db_state.conn.lock().unwrap();
        let _ = conn.execute(
            "DELETE FROM transactions WHERE (date LIKE '1970%' OR date < '2000-01-01') AND source = 'simplefin'",
            [],
        );
    }

    let mut converted = Vec::new();
    let mut accounts_synced = 0;

    // Load existing transactions for in-memory semantic deduplication and pending-to-settled transition
    #[derive(Clone)]
    struct ExistingCandidate {
        id: i64,
        date: String,
        amount_cents: i64,
        description_raw: String,
        description_norm: String,
        category: String,
        user_overridden: bool,
        dedup_key: String,
        is_pending: bool,
        claimed: bool,
    }

    let min_dedup_date = sync_start_date.as_deref().and_then(|d| {
        chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .ok()
            .map(|nd| (nd - chrono::Duration::days(7)).format("%Y-%m-%d").to_string())
    });

    let mut existing_by_account: std::collections::HashMap<i64, Vec<ExistingCandidate>> = std::collections::HashMap::new();
    {
        let conn = db_state.conn.lock().unwrap();
        let sql = if min_dedup_date.is_some() {
            "SELECT id, account_id, date, CAST(ROUND(amount * 100) AS INTEGER), description, LOWER(TRIM(description)), category, user_overridden, dedup_key, COALESCE(is_pending, 0) FROM transactions WHERE date >= ?1"
        } else {
            "SELECT id, account_id, date, CAST(ROUND(amount * 100) AS INTEGER), description, LOWER(TRIM(description)), category, user_overridden, dedup_key, COALESCE(is_pending, 0) FROM transactions"
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let map_row = |row: &rusqlite::Row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, bool>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, bool>(9)?,
            ))
        };
        let rows: Vec<(i64, i64, String, i64, String, String, String, bool, String, bool)> = if let Some(ref d) = min_dedup_date {
            stmt.query_map(params![d], map_row).map_err(|e| e.to_string())?.flatten().collect()
        } else {
            stmt.query_map([], map_row).map_err(|e| e.to_string())?.flatten().collect()
        };

        for (id, acc_id, date, amt_cents, desc_raw, desc_norm, category, user_overridden, dkey, is_pending) in rows {
            existing_by_account.entry(acc_id).or_default().push(ExistingCandidate {
                id,
                date,
                amount_cents: amt_cents,
                description_raw: desc_raw,
                description_norm: desc_norm,
                category,
                user_overridden,
                dedup_key: dkey,
                is_pending,
                claimed: false,
            });
        }
    }

    // Record metadata updates for all SimpleFIN accounts and deduplicate mapped accounts by strictly_account_id
    let mut sfin_meta_updates: Vec<(Option<f64>, Option<f64>, Option<i64>, String)> = Vec::new();
    let mut primary_accounts_by_strictly_id: std::collections::HashMap<i64, SFinAccount> = std::collections::HashMap::new();

    for acc in sfin_data.accounts {
        let balance_f64 = acc.balance.as_deref().and_then(|b| b.parse::<f64>().ok());
        let avail_f64 = acc.available_balance.as_deref().and_then(|b| b.parse::<f64>().ok());
        sfin_meta_updates.push((balance_f64, avail_f64, acc.balance_date, acc.id.clone()));

        let strictly_id = match account_map.get(&acc.id) {
            Some(&id) => id,
            None => {
                warnings.push(format!("Account '{}' ({}) is not mapped to Strictly Spending. Transactions skipped.", acc.name, acc.id));
                continue;
            }
        };

        match primary_accounts_by_strictly_id.entry(strictly_id) {
            std::collections::hash_map::Entry::Vacant(e) => {
                e.insert(acc);
            }
            std::collections::hash_map::Entry::Occupied(mut e) => {
                let existing = e.get();
                let new_key = (acc.balance_date.unwrap_or(0), acc.transactions.len());
                let old_key = (existing.balance_date.unwrap_or(0), existing.transactions.len());
                warnings.push(format!(
                    "Multiple SimpleFIN accounts ('{}' and '{}') are mapped to the same Strictly Spending account. Deduplicating feed to prevent duplicate transactions.",
                    existing.name, acc.name
                ));
                if new_key > old_key {
                    e.insert(acc);
                }
            }
        }
    }

    struct TransitionUpdate {
        id: i64,
        date: String,
        description: String,
        amount: f64,
        merchant_key: String,
        category: String,
        dedup_key: String,
        is_pending: bool,
    }

    let mut balance_updates: Vec<(f64, i64)> = Vec::new();
    let mut dedup_updates: Vec<(String, bool, i64)> = Vec::new();
    let mut transition_updates: Vec<TransitionUpdate> = Vec::new();
    let mut delete_ids: Vec<i64> = Vec::new();
    let prepared_rules = crate::tools::prepare_rules(&rules);

    for (strictly_id, acc) in primary_accounts_by_strictly_id {
        accounts_synced += 1;

        // Queue account balance update in Strictly Spending
        if let Some(balance_str) = &acc.balance {
            if let Ok(b) = balance_str.parse::<f64>() {
                balance_updates.push((b, strictly_id));
            }
        }

        let mut live_sfin_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut incoming_keys_by_bucket: std::collections::HashMap<(String, i64), std::collections::HashSet<String>> =
            std::collections::HashMap::new();
        let mut min_live_date: Option<String> = None;

        for t in &acc.transactions {
            let sfin_key = format!("simplefin_{}", t.id);
            live_sfin_keys.insert(sfin_key.clone());
            if let Ok(a) = t.amount.parse::<f64>() {
                let d = resolve_transaction_date(t.posted, t.transacted_at);
                if min_live_date.as_ref().map_or(true, |cur| &d < cur) {
                    min_live_date = Some(d.clone());
                }
                let cents = (a * 100.0).round() as i64;
                incoming_keys_by_bucket
                    .entry((d, cents))
                    .or_default()
                    .insert(sfin_key);
            }
        }

        // Compute the earliest date where a missing SimpleFIN key is guaranteed to have vanished
        // (because it was a pending hold that settled) rather than being older history outside the bank's feed window.
        let transition_min_date: String = {
            let recent_cutoff = chrono::Utc::now().date_naive() - chrono::Duration::days(21);
            let min_nd = if let Some(ref s) = sync_start_date {
                if let Ok(nd) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    std::cmp::max(recent_cutoff, nd + chrono::Duration::days(1))
                } else {
                    recent_cutoff
                }
            } else {
                recent_cutoff
            };
            min_nd.format("%Y-%m-%d").to_string()
        };

        let account_candidates = existing_by_account.entry(strictly_id).or_default();

        for t in acc.transactions {
            let date = resolve_transaction_date(t.posted, t.transacted_at);
            let t_is_pending = t.pending.unwrap_or(false) || t.posted.unwrap_or(0) <= 0;

            let amount_f64 = match t.amount.parse::<f64>() {
                Ok(a) => a,
                Err(_) => continue,
            };
            let amount_cents = (amount_f64 * 100.0).round() as i64;
            let sfin_key = format!("simplefin_{}", t.id);

            let description = t.payee.as_deref().filter(|p| !p.trim().is_empty()).unwrap_or(&t.description);
            let desc_norm = description.trim().to_lowercase();
            let raw_desc_norm = t.description.trim().to_lowercase();

            let merchant_key = crate::tools::extract_merchant_key(description);
            let memo_cat = t.memo
                .filter(|m| !m.trim().is_empty())
                .unwrap_or_else(|| "Uncategorized".to_string());

            let mut final_cat = memo_cat.clone();
            if final_cat == "Uncategorized" {
                let desc_lower = description.to_lowercase();
                if desc_lower.contains("transfer") || desc_lower.contains("txfr") {
                    final_cat = "Transfers".to_string();
                } else if let Some(rule) = crate::tools::match_best_prepared_rule(description, &merchant_key, &prepared_rules) {
                    final_cat = rule.category.clone();
                }
            }

            // Pass 1: Exact SimpleFIN transaction ID match (`dedup_key == sfin_key`).
            let mut matched_idx = account_candidates
                .iter()
                .position(|cand| !cand.claimed && cand.dedup_key == sfin_key);

            // Pass 2: Same `(date, amount_cents)` fuzzy description match against unclaimed candidates
            //         whose `dedup_key` is not owned by another incoming transaction in the same bucket.
            if matched_idx.is_none() {
                let bucket_incoming = incoming_keys_by_bucket.get(&(date.clone(), amount_cents));
                matched_idx = account_candidates.iter().position(|cand| {
                    !cand.claimed
                        && cand.date == date
                        && cand.amount_cents == amount_cents
                        && !bucket_incoming.map_or(false, |set| set.contains(&cand.dedup_key))
                        && (sfin_descriptions_match(&cand.description_norm, &desc_norm)
                            || sfin_descriptions_match(&cand.description_norm, &raw_desc_norm))
                });
            }

            if let Some(idx) = matched_idx {
                let cand = &mut account_candidates[idx];
                cand.claimed = true;
                if cand.dedup_key != sfin_key || cand.is_pending != t_is_pending {
                    dedup_updates.push((sfin_key.clone(), t_is_pending, cand.id));
                    cand.dedup_key = sfin_key;
                    cand.is_pending = t_is_pending;
                }
                continue;
            }

            // Pass 3: Pending -> Settled Transition!
            // If this incoming transaction is settled (`!t_is_pending`), check if it resolves an existing
            // pending transaction (or a vanished SimpleFIN pending hold) on this account within -1..=5 days.
            if !t_is_pending {
                let pending_match_idx = account_candidates.iter().position(|cand| {
                    if cand.claimed || cand.id == 0 {
                        return false;
                    }
                    let is_vanished_sfin = cand.dedup_key.starts_with("simplefin_")
                        && !live_sfin_keys.contains(&cand.dedup_key)
                        && cand.date >= transition_min_date;
                    if !cand.is_pending && !is_vanished_sfin {
                        return false;
                    }
                    is_pending_to_settled_match(
                        &cand.date,
                        cand.amount_cents,
                        &cand.description_norm,
                        &date,
                        amount_cents,
                        &desc_norm,
                        &raw_desc_norm,
                    )
                });

                if let Some(p_idx) = pending_match_idx {
                    let cand = &mut account_candidates[p_idx];
                    cand.claimed = true;

                    let keep_cand_desc = is_generic_settled_description(&desc_norm)
                        && !is_generic_settled_description(&cand.description_norm);
                    let resolved_desc = if keep_cand_desc {
                        cand.description_raw.clone()
                    } else {
                        description.to_string()
                    };
                    let resolved_merchant_key = crate::tools::extract_merchant_key(&resolved_desc);
                    let resolved_cat = if cand.user_overridden || (cand.category != "Uncategorized" && final_cat == "Uncategorized") {
                        cand.category.clone()
                    } else {
                        final_cat.clone()
                    };

                    transition_updates.push(TransitionUpdate {
                        id: cand.id,
                        date: date.clone(),
                        description: resolved_desc.clone(),
                        amount: amount_f64,
                        merchant_key: resolved_merchant_key,
                        category: resolved_cat.clone(),
                        dedup_key: sfin_key.clone(),
                        is_pending: false,
                    });

                    cand.date = date;
                    cand.amount_cents = amount_cents;
                    cand.description_raw = resolved_desc;
                    cand.description_norm = desc_norm;
                    cand.category = resolved_cat;
                    cand.dedup_key = sfin_key;
                    cand.is_pending = false;
                    continue;
                }
            }

            // Record as claimed so duplicate entries in the same sync don't re-insert
            account_candidates.push(ExistingCandidate {
                id: 0,
                date: date.clone(),
                amount_cents,
                description_raw: description.to_string(),
                description_norm: desc_norm.clone(),
                category: final_cat.clone(),
                user_overridden: false,
                dedup_key: sfin_key.clone(),
                is_pending: t_is_pending,
                claimed: true,
            });

            converted.push(Transaction {
                id: None,
                account_id: strictly_id,
                date,
                description: description.to_string(),
                amount: amount_f64,
                raw_category: Some(memo_cat.clone()),
                category: final_cat,
                source: "simplefin".to_string(),
                merchant_key,
                user_overridden: false,
                dedup_key: sfin_key,
                import_batch_id: None,
                recurrence: "onetime".to_string(),
                recurrence_override: None,
                is_business: Some(false),
                tax_category: None,
                deduction_status: None,
                is_pending: Some(t_is_pending),
            });
        }

        // Pass 4: Reconcile any remaining unclaimed vanished SimpleFIN pending rows whose settled
        // counterpart was already inserted during an earlier sync.
        let snapshot = account_candidates.clone();
        for cand in account_candidates.iter_mut() {
            if cand.claimed || cand.id == 0 {
                continue;
            }
            let is_vanished_sfin = cand.dedup_key.starts_with("simplefin_")
                && !live_sfin_keys.contains(&cand.dedup_key)
                && cand.date >= transition_min_date;
            if !cand.is_pending && !is_vanished_sfin {
                continue;
            }

            let matched_settled = snapshot.iter().find(|other| {
                if other.id == cand.id || other.id == 0 || other.is_pending {
                    return false;
                }
                let other_is_live_settled = live_sfin_keys.contains(&other.dedup_key);
                let other_is_later_generic_settled = other.id > cand.id
                    && other.date > cand.date
                    && is_generic_settled_description(&other.description_norm)
                    && !is_generic_settled_description(&cand.description_norm);
                (other_is_live_settled || other_is_later_generic_settled)
                    && is_pending_to_settled_match(
                        &cand.date,
                        cand.amount_cents,
                        &cand.description_norm,
                        &other.date,
                        other.amount_cents,
                        &other.description_norm,
                        &other.description_norm,
                    )
            });

            if let Some(other) = matched_settled {
                if is_generic_settled_description(&other.description_norm)
                    && !is_generic_settled_description(&cand.description_norm)
                {
                    let resolved_desc = cand.description_raw.clone();
                    let resolved_merchant_key = crate::tools::extract_merchant_key(&resolved_desc);
                    let resolved_cat = if cand.user_overridden
                        || (cand.category != "Uncategorized" && (other.category == "Uncategorized" || other.category == "Income"))
                    {
                        cand.category.clone()
                    } else {
                        other.category.clone()
                    };
                    transition_updates.push(TransitionUpdate {
                        id: other.id,
                        date: other.date.clone(),
                        description: resolved_desc,
                        amount: (other.amount_cents as f64) / 100.0,
                        merchant_key: resolved_merchant_key,
                        category: resolved_cat,
                        dedup_key: other.dedup_key.clone(),
                        is_pending: false,
                    });
                }
                delete_ids.push(cand.id);
                cand.claimed = true;
            } else if cand.is_pending && is_vanished_sfin {
                delete_ids.push(cand.id);
                cand.claimed = true;
            }
        }
    }

    if !sfin_meta_updates.is_empty()
        || !balance_updates.is_empty()
        || !dedup_updates.is_empty()
        || !transition_updates.is_empty()
        || !delete_ids.is_empty()
    {
        let mut conn = db_state.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (b, avail, bdate, sfin_acc_id) in &sfin_meta_updates {
            let _ = tx.execute(
                "UPDATE simplefin_accounts SET balance = ?1, available_balance = ?2, balance_date = ?3 WHERE account_id = ?4",
                params![b, avail, bdate, sfin_acc_id],
            );
        }
        for (b, strictly_id) in &balance_updates {
            let _ = tx.execute(
                "UPDATE accounts SET current_balance = ?1 WHERE id = ?2",
                params![b, strictly_id],
            );
        }
        for (sfin_key, is_pend, tx_id) in &dedup_updates {
            let _ = tx.execute(
                "UPDATE transactions SET dedup_key = ?1, is_pending = ?2 WHERE id = ?3",
                params![sfin_key, is_pend, tx_id],
            );
        }
        for tr in &transition_updates {
            let _ = tx.execute(
                "UPDATE transactions SET date = ?1, description = ?2, amount = ?3, merchant_key = ?4, category = ?5, dedup_key = ?6, is_pending = ?7 WHERE id = ?8",
                params![tr.date, tr.description, tr.amount, tr.merchant_key, tr.category, tr.dedup_key, tr.is_pending, tr.id],
            );
        }
        for del_id in &delete_ids {
            let _ = tx.execute("DELETE FROM transactions WHERE id = ?1", params![del_id]);
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    let added_count = converted.len();
    if !converted.is_empty() {
        crate::db_mut::bulk_add_transactions_inner(db_state, converted, true)?;
    }

    // Update last_synced_at in config
    let now = chrono::Utc::now().to_rfc3339();
    let mut updated_config = config;
    updated_config.last_synced_at = Some(now.clone());
    save_config(&db_state.conn, updated_config)?;

    let updated_accounts = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        read_simplefin_accounts_from_db(&conn)?
    };

    Ok(SimpleFinSyncResponse {
        added: added_count,
        accounts_synced,
        last_synced_at: now,
        sync_start_date,
        warnings,
        accounts: updated_accounts,
    })
}

#[tauri::command]
pub async fn simplefin_sync_transactions(
    state: State<'_, DbState>,
    start_date: Option<String>,
) -> Result<SimpleFinSyncResponse, String> {
    sync_transactions_core(&state, start_date).await
}

// 7. Remove SimpleFIN connection
#[tauri::command]
pub fn simplefin_remove_connection(state: State<DbState>) -> Result<(), String> {
    let mut conn = state.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM settings WHERE key = 'simplefin_config'", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM simplefin_accounts", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simplefin_url() {
        let raw = "https://user123:pass456@beta-bridge.simplefin.org/simplefin";
        let (u, p, clean) = parse_simplefin_url(raw).unwrap();
        assert_eq!(u, "user123");
        assert_eq!(p, "pass456");
        assert_eq!(clean, "https://beta-bridge.simplefin.org/simplefin");
    }

    #[test]
    fn test_parse_simplefin_url_trailing_slash() {
        let raw = "https://user:pass@bridge.simplefin.org/simplefin/";
        let (u, p, clean) = parse_simplefin_url(raw).unwrap();
        assert_eq!(u, "user");
        assert_eq!(p, "pass");
        assert_eq!(clean, "https://bridge.simplefin.org/simplefin");
    }

    #[test]
    fn test_resolve_transaction_date_pending_zero_posted() {
        // Pending Truist charge: posted is 0, transacted_at is Oct 9, 2026 (1791547200)
        let date = resolve_transaction_date(Some(0), Some(1791547200));
        assert_eq!(date, "2026-10-09");
    }

    #[test]
    fn test_resolve_transaction_date_posted_positive() {
        // Settled Truist transfer: posted is Sep 16, 2026 (1789560000)
        let date = resolve_transaction_date(Some(1789560000), Some(1789560000));
        assert_eq!(date, "2026-09-16");
    }

    #[test]
    fn test_resolve_transaction_date_no_posted() {
        // Only transacted_at is present: Oct 10, 2026 (1791633600)
        let date = resolve_transaction_date(None, Some(1791633600));
        assert_eq!(date, "2026-10-10");
    }

    #[test]
    fn test_is_pending_to_settled_match() {
        // 1. Pre-tip restaurant hold -> settled post-tip charge (Jenchan's -$116.29 -> -$140.29)
        assert!(is_pending_to_settled_match(
            "2026-10-11",
            -11629,
            "jenchan's restaura atlanta",
            "2026-10-11",
            -14029,
            "jenchan's rest",
            "jenchan's rest",
        ));

        // 2. Gas station $1.00 pre-auth hold -> settled fill-up (Shell -$1.00 -> -$61.11)
        assert!(is_pending_to_settled_match(
            "2026-10-11",
            -100,
            "shell",
            "2026-10-11",
            -6111,
            "shell",
            "shell",
        ));

        // 3. Placeholder pending description -> settled merchant with exact same amount within 1 day
        assert!(is_pending_to_settled_match(
            "2026-10-20",
            -10032,
            "mail telephone order",
            "2026-10-21",
            -10032,
            "at&t",
            "at&t *payment",
        ));

        // 4. Unrelated charges on same day with different amounts and descriptions must NOT match
        assert!(!is_pending_to_settled_match(
            "2026-10-11",
            -26164,
            "walmart",
            "2026-10-11",
            -14029,
            "jenchan's rest",
            "jenchan's rest",
        ));
    }

    #[test]
    fn test_parse_simplefin_url_security_and_redaction() {
        assert!(parse_simplefin_url("http://user:pass@beta-bridge.simplefin.org/simplefin").is_err());
        assert!(parse_simplefin_url("https://user:pass@evil-attacker.com/simplefin").is_err());
        assert!(parse_simplefin_url("https://user:pass@simplefin.org.evil.com/simplefin").is_err());

        let cfg = SimpleFinConfig {
            access_url: "https://user:pass@beta-bridge.simplefin.org/simplefin".to_string(),
            claimed_at: None,
            last_synced_at: None,
        };
        let redacted = redact_config_for_ui(cfg);
        assert_eq!(redacted.access_url, "[REDACTED]");
    }
}
