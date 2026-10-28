use crate::db::{
    self, row_to_transaction, Account, Budget, Category, CategoryRule, DbState,
};
use crate::db::loans::Loan;
use chrono::Datelike;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub executable_path: String,
    pub db_path: String,
    pub config_json: String,
    pub local_urls: Vec<String>,
}

fn detect_local_urls(port: u16) -> Vec<String> {
    let mut urls = Vec::new();
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip();
                if !ip.is_loopback() {
                    urls.push(format!("http://{}:{}", ip, port));
                }
            }
        }
    }
    urls
}

/// Resolves the path to `spending-viz.sqlite` when running outside the Tauri window lifecycle.
pub fn resolve_mcp_db_path(custom_path: Option<PathBuf>) -> PathBuf {
    if let Some(p) = custom_path {
        let raw = p.to_string_lossy();
        #[cfg(target_os = "windows")]
        {
            if raw.to_ascii_uppercase().starts_with("%APPDATA%") {
                if let Ok(appdata) = std::env::var("APPDATA") {
                    let suffix = raw["%APPDATA%".len()..].trim_start_matches(['\\', '/']);
                    let expanded = PathBuf::from(&appdata).join(suffix);
                    if expanded.exists() {
                        return expanded;
                    }
                    let legacy = PathBuf::from(&appdata).join("com.strictlyspending.app").join("spending-viz.sqlite");
                    if legacy.exists() {
                        return legacy;
                    }
                    return expanded;
                }
            }
        }
        return p;
    }
    if let Ok(env_path) = std::env::var("STRICTLY_SPENDING_DB_PATH") {
        let trimmed = env_path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let base = PathBuf::from(appdata);
            let primary = base.join("com.strictlyspending.finance").join("spending-viz.sqlite");
            if primary.exists() {
                return primary;
            }
            let legacy = base.join("com.strictlyspending.app").join("spending-viz.sqlite");
            if legacy.exists() {
                return legacy;
            }
            return primary;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let base = PathBuf::from(home).join("Library").join("Application Support");
            let primary = base.join("com.strictlyspending.finance").join("spending-viz.sqlite");
            if primary.exists() {
                return primary;
            }
            let legacy = base.join("com.strictlyspending.app").join("spending-viz.sqlite");
            if legacy.exists() {
                return legacy;
            }
            return primary;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            let base = PathBuf::from(xdg);
            let primary = base.join("com.strictlyspending.finance").join("spending-viz.sqlite");
            if primary.exists() {
                return primary;
            }
            let legacy = base.join("com.strictlyspending.app").join("spending-viz.sqlite");
            if legacy.exists() {
                return legacy;
            }
            return primary;
        }
        if let Ok(home) = std::env::var("HOME") {
            let base = PathBuf::from(home).join(".local").join("share");
            let primary = base.join("com.strictlyspending.finance").join("spending-viz.sqlite");
            if primary.exists() {
                return primary;
            }
            let legacy = base.join("com.strictlyspending.app").join("spending-viz.sqlite");
            if legacy.exists() {
                return legacy;
            }
            return primary;
        }
    }

    PathBuf::from("spending-viz.sqlite")
}

#[tauri::command]
pub fn get_mcp_server_info(app: tauri::AppHandle) -> Result<McpServerInfo, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir
        .join("spending-viz.sqlite")
        .to_string_lossy()
        .to_string();

    let config = json!({
        "mcpServers": {
            "strictly-spending": {
                "command": exe_path,
                "args": ["--mcp", "--db-path", db_path]
            }
        }
    });

    let config_json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;

    Ok(McpServerInfo {
        executable_path: exe_path,
        db_path,
        config_json,
        local_urls: detect_local_urls(5173),
    })
}

fn read_accounts(conn: &Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, type, institution, last4, source, enabled, current_balance FROM accounts ORDER BY name")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in iter {
        out.push(item.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn read_categories(conn: &Connection) -> Result<Vec<Category>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, type, sort_order, default_recurrence FROM categories ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                category_type: row.get(3)?,
                sort_order: row.get(4)?,
                default_recurrence: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in iter {
        out.push(item.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn read_budget_exclusions(
    conn: &Connection,
) -> (
    std::collections::HashSet<String>,
    std::collections::HashSet<String>,
) {
    let mut excluded_merchants = std::collections::HashSet::new();
    let mut excluded_categories = std::collections::HashSet::new();
    if let Ok(raw) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'budget_exclusions'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        if let Ok(val) = serde_json::from_str::<Value>(&raw) {
            if let Some(arr) = val.get("excludedMerchants").and_then(|v| v.as_array()) {
                for item in arr.iter().filter_map(|x| x.as_str()) {
                    excluded_merchants.insert(item.trim().to_lowercase());
                }
            }
            if let Some(arr) = val.get("excludedBudgetCategories").and_then(|v| v.as_array()) {
                for item in arr.iter().filter_map(|x| x.as_str()) {
                    excluded_categories.insert(item.trim().to_lowercase());
                }
            }
        }
    }
    (excluded_merchants, excluded_categories)
}

fn read_budgets(conn: &Connection) -> Result<Vec<Budget>, String> {
    let (_excluded_merchants, excluded_categories) = read_budget_exclusions(conn);
    let mut stmt = conn
        .prepare("SELECT category, monthly_amount, user_set FROM budgets ORDER BY category")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
            Ok(Budget {
                category: row.get(0)?,
                monthly_amount: row.get(1)?,
                user_set: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in iter {
        let b = item.map_err(|e| e.to_string())?;
        if !excluded_categories.contains(&b.category.trim().to_lowercase()) {
            out.push(b);
        }
    }
    Ok(out)
}

fn read_loans(conn: &Connection) -> Result<Vec<Loan>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, type, principal, rate, term_years, start_date, category, merchant, monthly_payment, property_value, down_payment, extra_monthly_payment, extra_one_time_payment, extra_one_time_month, created_at, enabled FROM loans")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in iter {
        out.push(item.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn read_rules(conn: &Connection) -> Result<Vec<CategoryRule>, String> {
    let mut stmt = conn
        .prepare("SELECT id, pattern, category, priority, created_at FROM rules ORDER BY priority DESC, id ASC")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
            Ok(CategoryRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                category: row.get(2)?,
                priority: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for item in iter {
        out.push(item.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn build_overview_resource(conn: &Connection) -> Result<Value, String> {
    let accounts = read_accounts(conn)?;
    let active_accounts: Vec<&Account> = accounts
        .iter()
        .filter(|a| a.source != "demo" && a.enabled)
        .collect();

    let mut liquid_cash = 0.0_f64;
    let mut investments = 0.0_f64;
    let mut credit_card_debt = 0.0_f64;

    for acc in &active_accounts {
        let bal = acc.current_balance.unwrap_or(0.0);
        match acc.account_type.as_str() {
            "checking" | "savings" => liquid_cash += bal,
            "investment" => investments += bal,
            "credit" => credit_card_debt += bal.min(0.0).abs(),
            _ => {}
        }
    }

    let uncategorized_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE source != 'demo' AND category = 'Uncategorized'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let (earliest_date, latest_date): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT MIN(date), MAX(date) FROM transactions WHERE source != 'demo'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((None, None));

    // Trailing 90-day average monthly spend
    let cutoff_90 = (chrono::Utc::now() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();
    let spend_90d: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(ABS(amount)), 0.0) FROM transactions WHERE source != 'demo' AND amount < 0 AND LOWER(category) NOT IN ('transfer', 'transfers') AND date >= ?1",
            params![cutoff_90],
            |r| r.get(0),
        )
        .unwrap_or(0.0);
    let est_monthly_outflow = (spend_90d / 3.0 * 100.0).round() / 100.0;
    let net_liquid = liquid_cash - credit_card_debt;
    let runway_months = if est_monthly_outflow > 0.0 {
        Some(((net_liquid / est_monthly_outflow) * 10.0).round() / 10.0)
    } else {
        None
    };

    Ok(json!({
        "liquidCash": (liquid_cash * 100.0).round() / 100.0,
        "investments": (investments * 100.0).round() / 100.0,
        "creditCardDebt": (credit_card_debt * 100.0).round() / 100.0,
        "netLiquidAfterCreditCards": (net_liquid * 100.0).round() / 100.0,
        "estimatedMonthlySpend": est_monthly_outflow,
        "estimatedRunwayMonths": runway_months,
        "uncategorizedTransactionCount": uncategorized_count,
        "earliestTransactionDate": earliest_date,
        "latestTransactionDate": latest_date,
        "activeAccountCount": active_accounts.len(),
    }))
}

fn schedule_c_info(slug: Option<&str>) -> (&'static str, f64) {
    match slug.unwrap_or("other").trim() {
        "advertising" => ("Advertising (Line 8)", 1.0),
        "carTruck" | "car_truck" => ("Car & Truck Expenses (Line 9)", 1.0),
        "commissions" => ("Commissions & Fees (Line 10)", 1.0),
        "contractLabor" | "contract_labor" => ("Contract Labor (Line 11)", 1.0),
        "depreciation" => ("Depreciation (Line 13)", 1.0),
        "insurance" => ("Insurance - Other than Health (Line 15)", 1.0),
        "interest" => ("Interest - Mortgage/Other (Line 16)", 1.0),
        "legalProfessional" | "legal_professional" => ("Legal & Professional Services (Line 17)", 1.0),
        "officeExpense" | "office_expense" | "office_expenses" => ("Office Expense & Software (Line 18)", 1.0),
        "rentLease" | "rent_lease" => ("Rent or Lease (Line 20)", 1.0),
        "repairsMaintenance" | "repairs_maintenance" => ("Repairs & Maintenance (Line 21)", 1.0),
        "supplies" => ("Supplies (Line 22)", 1.0),
        "taxesLicenses" | "taxes_licenses" => ("Taxes & Licenses (Line 23)", 1.0),
        "travel" => ("Travel (Line 24a)", 1.0),
        "meals" => ("Deductible Meals (Line 24b - 50%)", 0.5),
        "utilities" => ("Utilities (Line 25)", 1.0),
        _ => ("Other Business Expenses (Line 27a)", 1.0),
    }
}

fn infer_schedule_c_candidate(description: &str, category: &str) -> Option<&'static str> {
    let d = description.to_lowercase();
    let c = category.to_lowercase();
    if d.contains("stripe") || d.contains("paypal") || d.contains("square") || d.contains("shopify") {
        return Some("commissions");
    }
    if d.contains("github")
        || d.contains("aws")
        || d.contains("amazon web")
        || d.contains("vercel")
        || d.contains("openai")
        || d.contains("chatgpt")
        || d.contains("anthropic")
        || d.contains("claude")
        || d.contains("cursor")
        || d.contains("google cloud")
        || d.contains("figma")
        || d.contains("slack")
        || d.contains("zoom.us")
        || d.contains("adobe")
        || d.contains("jetbrains")
        || d.contains("supabase")
        || d.contains("cloudflare")
        || d.contains("namecheap")
        || d.contains("godaddy")
    {
        return Some("officeExpense");
    }
    if d.contains("upwork") || d.contains("fiverr") || d.contains("toptal") {
        return Some("contractLabor");
    }
    if d.contains("turbotax") || d.contains("h&r block") || d.contains("taxact") || d.contains("freetaxusa") || d.contains("cpa") {
        return Some("legalProfessional");
    }
    if d.contains("staples") || d.contains("office depot") || d.contains("officemax") {
        return Some("supplies");
    }
    if c == "travel" {
        return Some("travel");
    }
    if c == "taxes" {
        return Some("taxesLicenses");
    }
    None
}

fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

fn build_tax_package(
    conn: &Connection,
    tax_year: Option<i32>,
    include_pending: bool,
    output_dir: Option<&str>,
) -> Result<Value, String> {
    let resolved_year: i32 = match tax_year {
        Some(y) => y,
        None => {
            let latest_date: Option<String> = conn
                .query_row(
                    "SELECT MAX(date) FROM transactions WHERE source != 'demo'",
                    [],
                    |r| r.get(0),
                )
                .ok()
                .flatten();
            latest_date
                .and_then(|d| d.get(0..4).and_then(|y| y.parse::<i32>().ok()))
                .unwrap_or_else(|| chrono::Utc::now().year())
        }
    };

    let available_years: Vec<i32> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT CAST(SUBSTR(date, 1, 4) AS INTEGER) AS yr
                 FROM transactions
                 WHERE source != 'demo' AND LENGTH(date) >= 4
                 ORDER BY yr DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, i32>(0))
            .map_err(|e| e.to_string())?;
        let mut yrs = Vec::new();
        for r in rows.flatten() {
            if r > 1990 && r < 2100 {
                yrs.push(r);
            }
        }
        yrs
    };

    let accounts = read_accounts(conn)?;
    let acc_map: std::collections::HashMap<i64, &Account> = accounts
        .iter()
        .filter_map(|a| a.id.map(|id| (id, a)))
        .collect();

    let start_date = format!("{:04}-01-01", resolved_year);
    let end_date = format!("{:04}-12-31", resolved_year);

    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status
             FROM transactions
             WHERE source != 'demo' AND date BETWEEN ?1 AND ?2
             ORDER BY date ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![start_date, end_date], row_to_transaction)
        .map_err(|e| e.to_string())?;

    let mut total_income = 0.0_f64;
    let mut confirmed_business_gross = 0.0_f64;
    let mut confirmed_business_deductible = 0.0_f64;
    let mut candidate_business_gross = 0.0_f64;
    let mut candidate_business_deductible = 0.0_f64;
    let mut personal_deductions_total = 0.0_f64;

    // Schedule C category aggregates: label -> (count, gross, rate, deductible)
    let mut schedule_c_map: std::collections::BTreeMap<String, (usize, f64, f64, f64)> =
        std::collections::BTreeMap::new();

    let mut business_rows = Vec::new();
    let mut candidate_rows = Vec::new();
    let mut personal_rows = Vec::new();

    for r in rows {
        let t = r.map_err(|e| e.to_string())?;
        let cat_low = t.category.trim().to_lowercase();
        if cat_low == "transfer" || cat_low == "transfers" {
            continue;
        }
        if t.amount > 0.0 || cat_low == "income" {
            total_income += t.amount.abs();
            continue;
        }

        let gross = t.amount.abs();
        let acc = acc_map.get(&t.account_id);
        let acc_name = acc.map(|a| a.name.as_str()).unwrap_or("Unknown Account");
        let acc_inst = acc.map(|a| a.institution.as_str()).unwrap_or("Unknown");
        let is_bus = t.is_business.unwrap_or(false);
        let status = t.deduction_status.as_deref().unwrap_or("pending");

        if is_bus && status != "rejected" {
            let (label, rate) = schedule_c_info(t.tax_category.as_deref());
            let deductible = (gross * rate * 100.0).round() / 100.0;
            let entry = schedule_c_map
                .entry(label.to_string())
                .or_insert((0, 0.0, rate, 0.0));
            entry.0 += 1;
            entry.1 += gross;
            entry.3 += deductible;
            confirmed_business_gross += gross;
            confirmed_business_deductible += deductible;
            business_rows.push(json!({
                "id": t.id,
                "date": t.date,
                "account": acc_name,
                "institution": acc_inst,
                "description": t.description,
                "spendCategory": t.category,
                "scheduleCCategory": label,
                "taxCategorySlug": t.tax_category.clone().unwrap_or_else(|| "other".to_string()),
                "status": if status == "pending" { "tagged_business" } else { status },
                "grossAmount": (gross * 100.0).round() / 100.0,
                "deductionRate": rate,
                "deductibleAmount": deductible
            }));
        } else if status != "rejected" {
            if let Some(inferred_slug) = infer_schedule_c_candidate(&t.description, &t.category) {
                let (label, rate) = schedule_c_info(Some(inferred_slug));
                let deductible = (gross * rate * 100.0).round() / 100.0;
                candidate_business_gross += gross;
                candidate_business_deductible += deductible;
                if include_pending {
                    let entry = schedule_c_map
                        .entry(label.to_string())
                        .or_insert((0, 0.0, rate, 0.0));
                    entry.0 += 1;
                    entry.1 += gross;
                    entry.3 += deductible;
                }
                candidate_rows.push(json!({
                    "id": t.id,
                    "date": t.date,
                    "account": acc_name,
                    "institution": acc_inst,
                    "description": t.description,
                    "spendCategory": t.category,
                    "suggestedScheduleCCategory": label,
                    "suggestedTaxCategorySlug": inferred_slug,
                    "status": "candidate",
                    "grossAmount": (gross * 100.0).round() / 100.0,
                    "deductionRate": rate,
                    "deductibleAmount": deductible
                }));
                continue;
            }
            let d_low = t.description.to_lowercase();
            let is_personal_deductible = cat_low.contains("charity")
                || cat_low.contains("medical")
                || cat_low.contains("health")
                || cat_low.contains("dental")
                || cat_low.contains("vision")
                || cat_low.contains("tax")
                || d_low.contains("charity")
                || d_low.contains("donation")
                || d_low.contains("property tax");
            if is_personal_deductible {
                personal_deductions_total += gross;
                personal_rows.push(json!({
                    "id": t.id,
                    "date": t.date,
                    "account": acc_name,
                    "institution": acc_inst,
                    "description": t.description,
                    "category": t.category,
                    "amount": (gross * 100.0).round() / 100.0
                }));
            }
        }
    }

    // 1. Build Schedule C P&L CSV
    let mut pnl_csv = String::from(
        "IRS Schedule C Category,Transaction Count,Gross Spend,Deduction Rate,Net Deductible Spend\n",
    );
    let mut total_pnl_count = 0usize;
    let mut total_pnl_gross = 0.0_f64;
    let mut total_pnl_deductible = 0.0_f64;
    let mut schedule_c_breakdown = Vec::new();
    for (label, (count, gross, rate, deductible)) in &schedule_c_map {
        total_pnl_count += *count;
        total_pnl_gross += *gross;
        total_pnl_deductible += *deductible;
        pnl_csv.push_str(&format!(
            "{},{},{:.2},{}%,{:.2}\n",
            csv_escape(label),
            count,
            gross,
            (rate * 100.0).round(),
            deductible
        ));
        schedule_c_breakdown.push(json!({
            "scheduleCCategory": label,
            "transactionCount": count,
            "grossSpend": (*gross * 100.0).round() / 100.0,
            "deductionRate": rate,
            "netDeductibleSpend": (*deductible * 100.0).round() / 100.0
        }));
    }
    pnl_csv.push_str(&format!(
        "TOTAL SCHEDULE C EXPENSES,{},{:.2},,{:.2}\n",
        total_pnl_count, total_pnl_gross, total_pnl_deductible
    ));

    // 2. Build Business Expense Ledger CSV
    let mut ledger_csv = String::from(
        "Transaction ID,Date,Account,Institution,Description,Spend Category,IRS Schedule C Category,Status,Gross Amount,Deduction Rate,Deductible Amount\n",
    );
    for item in &business_rows {
        ledger_csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{:.2},{}%,{:.2}\n",
            item["id"].as_i64().unwrap_or(0),
            csv_escape(item["date"].as_str().unwrap_or("")),
            csv_escape(item["account"].as_str().unwrap_or("")),
            csv_escape(item["institution"].as_str().unwrap_or("")),
            csv_escape(item["description"].as_str().unwrap_or("")),
            csv_escape(item["spendCategory"].as_str().unwrap_or("")),
            csv_escape(item["scheduleCCategory"].as_str().unwrap_or("")),
            csv_escape(item["status"].as_str().unwrap_or("")),
            item["grossAmount"].as_f64().unwrap_or(0.0),
            (item["deductionRate"].as_f64().unwrap_or(1.0) * 100.0).round(),
            item["deductibleAmount"].as_f64().unwrap_or(0.0),
        ));
    }
    if include_pending {
        for item in &candidate_rows {
            ledger_csv.push_str(&format!(
                "{},{},{},{},{},{},{},{},{:.2},{}%,{:.2}\n",
                item["id"].as_i64().unwrap_or(0),
                csv_escape(item["date"].as_str().unwrap_or("")),
                csv_escape(item["account"].as_str().unwrap_or("")),
                csv_escape(item["institution"].as_str().unwrap_or("")),
                csv_escape(item["description"].as_str().unwrap_or("")),
                csv_escape(item["spendCategory"].as_str().unwrap_or("")),
                csv_escape(item["suggestedScheduleCCategory"].as_str().unwrap_or("")),
                "candidate",
                item["grossAmount"].as_f64().unwrap_or(0.0),
                (item["deductionRate"].as_f64().unwrap_or(1.0) * 100.0).round(),
                item["deductibleAmount"].as_f64().unwrap_or(0.0),
            ));
        }
    }

    // 3. Build Personal Itemized Deductions CSV
    let mut personal_csv =
        String::from("Transaction ID,Date,Account,Institution,Description,Category,Amount\n");
    for item in &personal_rows {
        personal_csv.push_str(&format!(
            "{},{},{},{},{},{},{:.2}\n",
            item["id"].as_i64().unwrap_or(0),
            csv_escape(item["date"].as_str().unwrap_or("")),
            csv_escape(item["account"].as_str().unwrap_or("")),
            csv_escape(item["institution"].as_str().unwrap_or("")),
            csv_escape(item["description"].as_str().unwrap_or("")),
            csv_escape(item["category"].as_str().unwrap_or("")),
            item["amount"].as_f64().unwrap_or(0.0),
        ));
    }

    // 4. Build Tax Summary Markdown Report
    let mut md = format!("# Tax Summary & Schedule C Report ({})\n\n", resolved_year);
    md.push_str(&format!(
        "- **Tax Year:** {}\n- **Total Recorded Deposits / Income:** ${:.2}\n- **Confirmed Schedule C Business Deductions:** ${:.2} (Gross: ${:.2})\n- **Candidate / Unreviewed Business Deductions:** ${:.2} (Gross: ${:.2})\n- **Combined Schedule C Deductions:** ${:.2}\n- **Itemized Personal Deductions (Medical/Charity/Tax):** ${:.2}\n\n",
        resolved_year,
        total_income,
        confirmed_business_deductible,
        confirmed_business_gross,
        candidate_business_deductible,
        candidate_business_gross,
        total_pnl_deductible,
        personal_deductions_total
    ));

    md.push_str("## IRS Schedule C Profit & Loss Breakdown\n\n");
    md.push_str("| IRS Schedule C Category | Txns | Gross Spend | Rate | Net Deductible |\n");
    md.push_str("| :--- | ---: | ---: | ---: | ---: |\n");
    for (label, (count, gross, rate, deductible)) in &schedule_c_map {
        md.push_str(&format!(
            "| {} | {} | ${:.2} | {:.0}% | ${:.2} |\n",
            label,
            count,
            gross,
            rate * 100.0,
            deductible
        ));
    }
    md.push_str(&format!(
        "| **TOTAL SCHEDULE C** | **{}** | **${:.2}** | | **${:.2}** |\n\n",
        total_pnl_count, total_pnl_gross, total_pnl_deductible
    ));

    if !candidate_rows.is_empty() {
        md.push_str(&format!(
            "## Candidate Business Deductions Pending Confirmation ({} items)\n\n",
            candidate_rows.len()
        ));
        md.push_str("| ID | Date | Account | Description | Suggested Schedule C Line | Gross | Deductible |\n");
        md.push_str("| ---: | :--- | :--- | :--- | :--- | ---: | ---: |\n");
        for item in candidate_rows.iter().take(50) {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} | ${:.2} | ${:.2} |\n",
                item["id"].as_i64().unwrap_or(0),
                item["date"].as_str().unwrap_or(""),
                item["account"].as_str().unwrap_or(""),
                item["description"].as_str().unwrap_or(""),
                item["suggestedScheduleCCategory"].as_str().unwrap_or(""),
                item["grossAmount"].as_f64().unwrap_or(0.0),
                item["deductibleAmount"].as_f64().unwrap_or(0.0),
            ));
        }
        md.push('\n');
    }

    if !personal_rows.is_empty() {
        md.push_str(&format!(
            "## Itemized Personal Deductions ({} items)\n\n",
            personal_rows.len()
        ));
        md.push_str("| ID | Date | Account | Description | Category | Amount |\n");
        md.push_str("| ---: | :--- | :--- | :--- | :--- | ---: |\n");
        for item in personal_rows.iter().take(50) {
            md.push_str(&format!(
                "| {} | {} | {} | {} | {} | ${:.2} |\n",
                item["id"].as_i64().unwrap_or(0),
                item["date"].as_str().unwrap_or(""),
                item["account"].as_str().unwrap_or(""),
                item["description"].as_str().unwrap_or(""),
                item["category"].as_str().unwrap_or(""),
                item["amount"].as_f64().unwrap_or(0.0),
            ));
        }
        md.push('\n');
    }

    let mut saved_files = Vec::new();
    if let Some(dir_str) = output_dir.filter(|s| !s.trim().is_empty()) {
        let dir = PathBuf::from(dir_str.trim());
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create output_dir: {}", e))?;

        let pnl_path = dir.join(format!("Schedule_C_PnL_{}.csv", resolved_year));
        std::fs::write(&pnl_path, &pnl_csv).map_err(|e| e.to_string())?;
        saved_files.push(pnl_path.to_string_lossy().to_string());

        let ledger_path = dir.join(format!("Business_Expense_Ledger_{}.csv", resolved_year));
        std::fs::write(&ledger_path, &ledger_csv).map_err(|e| e.to_string())?;
        saved_files.push(ledger_path.to_string_lossy().to_string());

        let personal_path = dir.join(format!("Personal_Deductions_{}.csv", resolved_year));
        std::fs::write(&personal_path, &personal_csv).map_err(|e| e.to_string())?;
        saved_files.push(personal_path.to_string_lossy().to_string());

        let md_path = dir.join(format!("Tax_Summary_Report_{}.md", resolved_year));
        std::fs::write(&md_path, &md).map_err(|e| e.to_string())?;
        saved_files.push(md_path.to_string_lossy().to_string());
    }

    Ok(json!({
        "taxYear": resolved_year,
        "availableTaxYears": available_years,
        "summary": {
            "totalIncome": (total_income * 100.0).round() / 100.0,
            "confirmedBusinessGross": (confirmed_business_gross * 100.0).round() / 100.0,
            "confirmedBusinessDeductible": (confirmed_business_deductible * 100.0).round() / 100.0,
            "candidateBusinessGross": (candidate_business_gross * 100.0).round() / 100.0,
            "candidateBusinessDeductible": (candidate_business_deductible * 100.0).round() / 100.0,
            "combinedScheduleCDeductible": (total_pnl_deductible * 100.0).round() / 100.0,
            "personalItemizedDeductions": (personal_deductions_total * 100.0).round() / 100.0,
            "confirmedBusinessTransactionCount": business_rows.len(),
            "candidateBusinessTransactionCount": candidate_rows.len(),
            "personalDeductionTransactionCount": personal_rows.len()
        },
        "scheduleCBreakdown": schedule_c_breakdown,
        "confirmedBusinessTransactions": business_rows,
        "candidateBusinessTransactions": candidate_rows,
        "personalDeductionTransactions": personal_rows,
        "documents": {
            "scheduleCPnlCsv": pnl_csv,
            "businessLedgerCsv": ledger_csv,
            "personalDeductionsCsv": personal_csv,
            "taxSummaryMarkdown": md
        },
        "savedFiles": saved_files
    }))
}

fn build_account_cashflow(conn: &Connection, filter_account_id: Option<i64>) -> Result<Value, String> {
    let accounts = read_accounts(conn)?;
    let cutoff_90 = (chrono::Local::now().naive_local().date() - chrono::Duration::days(90))
        .format("%Y-%m-%d")
        .to_string();

    let mut account_reports = Vec::new();
    for acc in accounts.iter().filter(|a| a.source != "demo" && a.enabled) {
        let Some(acc_id) = acc.id else { continue };
        if let Some(target_id) = filter_account_id {
            if acc_id != target_id {
                continue;
            }
        }

        let mut stmt = conn
            .prepare(
                "SELECT amount, category, COALESCE(recurrence, 'none')
                 FROM transactions
                 WHERE source != 'demo' AND account_id = ?1 AND date >= ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![acc_id, cutoff_90], |r| {
                Ok((
                    r.get::<_, f64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut income_90d = 0.0_f64;
        let mut recurring_bills_90d = 0.0_f64;
        let mut variable_spend_90d = 0.0_f64;
        let mut transfers_out_90d = 0.0_f64;
        let mut transfers_in_90d = 0.0_f64;

        for r in rows {
            let (amt, cat, rec) = r.map_err(|e| e.to_string())?;
            let cat_low = cat.trim().to_lowercase();
            if cat_low == "transfer" || cat_low == "transfers" {
                if amt < 0.0 {
                    transfers_out_90d += amt.abs();
                } else {
                    transfers_in_90d += amt;
                }
            } else if amt > 0.0 || cat_low == "income" {
                income_90d += amt.abs();
            } else if rec != "none" && !rec.is_empty() {
                recurring_bills_90d += amt.abs();
            } else {
                variable_spend_90d += amt.abs();
            }
        }

        let monthly_income = (income_90d / 3.0 * 100.0).round() / 100.0;
        let monthly_recurring = (recurring_bills_90d / 3.0 * 100.0).round() / 100.0;
        let monthly_variable = (variable_spend_90d / 3.0 * 100.0).round() / 100.0;
        let monthly_transfers_out = (transfers_out_90d / 3.0 * 100.0).round() / 100.0;
        let monthly_transfers_in = (transfers_in_90d / 3.0 * 100.0).round() / 100.0;
        let net_monthly_cashflow = ((monthly_income + monthly_transfers_in
            - monthly_recurring
            - monthly_variable
            - monthly_transfers_out)
            * 100.0)
            .round()
            / 100.0;
        let start_bal = acc.current_balance.unwrap_or(0.0);

        account_reports.push(json!({
            "accountId": acc_id,
            "name": acc.name,
            "institution": acc.institution,
            "type": acc.account_type,
            "currentBalance": (start_bal * 100.0).round() / 100.0,
            "monthlyIncome": monthly_income,
            "monthlyTransfersIn": monthly_transfers_in,
            "monthlyRecurringBills": monthly_recurring,
            "monthlyVariableSpend": monthly_variable,
            "monthlySavingsOrTransfersOut": monthly_transfers_out,
            "netMonthlyRemainder": net_monthly_cashflow,
            "trajectory": if net_monthly_cashflow >= 0.0 { "growing" } else { "depleting" },
            "projectedBalance1Month": ((start_bal + net_monthly_cashflow) * 100.0).round() / 100.0,
            "projectedBalance3Months": ((start_bal + net_monthly_cashflow * 3.0) * 100.0).round() / 100.0,
            "projectedBalance6Months": ((start_bal + net_monthly_cashflow * 6.0) * 100.0).round() / 100.0,
            "projectedBalance12Months": ((start_bal + net_monthly_cashflow * 12.0) * 100.0).round() / 100.0,
        }));
    }

    Ok(json!({
        "trailingWindowDays": 90,
        "accounts": account_reports
    }))
}

fn list_mcp_resources() -> Value {
    json!({
        "resources": [
            {
                "uri": "strictly://summary/overview",
                "name": "Financial Overview & Cash Runway",
                "description": "Liquid cash, credit card debt, investments, trailing 90-day monthly burn rate, cash runway in months, and uncategorized count.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://accounts",
                "name": "Bank & Credit Accounts",
                "description": "All checking, savings, credit, loan, and investment accounts with current balances.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://categories",
                "name": "Spend & Income Categories",
                "description": "All configured transaction categories, colors, types, and default recurrence.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://budgets",
                "name": "Monthly Category Budgets",
                "description": "Monthly spending targets per category.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://loans",
                "name": "Loans & Mortgages",
                "description": "Active loans with principal, interest rate (APR), term years, minimum payments, and extra payments.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://rules",
                "name": "Categorization Rules",
                "description": "All pattern-matching rules ordered by priority.",
                "mimeType": "application/json"
            },
            {
                "uri": "strictly://tax/summary",
                "name": "Schedule C & Personal Tax Summary",
                "description": "Live tax-year breakdown of Schedule C business expenses, candidate deductions, and itemized personal deductions.",
                "mimeType": "application/json"
            }
        ]
    })
}

fn read_mcp_resource(db_state: &DbState, uri: &str) -> Result<Value, String> {
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    let payload: Value = match uri {
        "strictly://summary/overview" => build_overview_resource(&conn)?,
        "strictly://accounts" => serde_json::to_value(read_accounts(&conn)?).map_err(|e| e.to_string())?,
        "strictly://categories" => serde_json::to_value(read_categories(&conn)?).map_err(|e| e.to_string())?,
        "strictly://budgets" => serde_json::to_value(read_budgets(&conn)?).map_err(|e| e.to_string())?,
        "strictly://loans" => serde_json::to_value(read_loans(&conn)?).map_err(|e| e.to_string())?,
        "strictly://rules" => serde_json::to_value(read_rules(&conn)?).map_err(|e| e.to_string())?,
        "strictly://tax/summary" => {
            let pkg = build_tax_package(&conn, None, true, None)?;
            json!({
                "taxYear": pkg["taxYear"],
                "availableTaxYears": pkg["availableTaxYears"],
                "summary": pkg["summary"],
                "scheduleCBreakdown": pkg["scheduleCBreakdown"],
                "candidateBusinessTransactions": pkg["candidateBusinessTransactions"],
                "personalDeductionTransactions": pkg["personalDeductionTransactions"]
            })
        }
        _ => return Err(format!("Unknown resource URI: {}", uri)),
    };

    let text = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    Ok(json!({
        "contents": [
            {
                "uri": uri,
                "mimeType": "application/json",
                "text": text
            }
        ]
    }))
}

fn list_mcp_tools() -> Value {
    json!({
        "tools": [
            {
                "name": "query_transactions",
                "description": "Query transactions from the Strictly Spending SQLite ledger with optional filters for date range, category, merchant substring, account ID, business flag, and amount bounds.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "start_date": { "type": "string", "description": "Inclusive start date (YYYY-MM-DD). Defaults to '2000-01-01'." },
                        "end_date": { "type": "string", "description": "Inclusive end date (YYYY-MM-DD). Defaults to '2099-12-31'." },
                        "category": { "type": "string", "description": "Exact category name filter (case-insensitive)." },
                        "search": { "type": "string", "description": "Case-insensitive substring match against description or merchantKey." },
                        "account_id": { "type": "integer", "description": "Filter by account ID." },
                        "is_business": { "type": "boolean", "description": "Filter by Schedule C business flag." },
                        "include_demo": { "type": "boolean", "description": "Include demo transactions (default false)." },
                        "limit": { "type": "integer", "description": "Maximum rows to return (default 100, max 500)." }
                    }
                }
            },
            {
                "name": "get_spending_summary",
                "description": "Compute total spend, total income, net cashflow, per-category breakdown, and top merchants over a date range.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "start_date": { "type": "string", "description": "Start date (YYYY-MM-DD)." },
                        "end_date": { "type": "string", "description": "End date (YYYY-MM-DD)." },
                        "include_demo": { "type": "boolean", "description": "Include demo transactions (default false)." }
                    },
                    "required": ["start_date", "end_date"]
                }
            },
            {
                "name": "categorize_transactions",
                "description": "Assign a category to specific transaction IDs or all transactions matching a merchant/description pattern, and optionally save a persistent CategoryRule.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string", "description": "Target category name (must exist or will be created if create_category is true)." },
                        "transaction_ids": { "type": "array", "items": { "type": "integer" }, "description": "Specific transaction IDs to recategorize." },
                        "merchant_pattern": { "type": "string", "description": "Case-insensitive substring pattern to match against description/merchant_key." },
                        "create_rule": { "type": "boolean", "description": "If true and merchant_pattern is provided, saves a persistent CategoryRule (default true)." },
                        "override_existing": { "type": "boolean", "description": "If true, also updates already-categorized transactions matching merchant_pattern (default false; by default updates Uncategorized)." }
                    },
                    "required": ["category"]
                }
            },
            {
                "name": "manage_budget",
                "description": "Create or update a monthly spending budget for a category.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string", "description": "Category name." },
                        "monthly_amount": { "type": "number", "description": "Target monthly spend amount in USD." }
                    },
                    "required": ["category", "monthly_amount"]
                }
            },
            {
                "name": "manage_loan",
                "description": "Add or update a loan or mortgage in the Loans tracker.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "integer", "description": "Loan ID to update. Omit to create a new loan." },
                        "name": { "type": "string", "description": "Loan display name." },
                        "type": { "type": "string", "enum": ["house", "car", "student", "personal"], "description": "Loan type." },
                        "principal": { "type": "number", "description": "Current remaining principal balance in USD." },
                        "rate": { "type": "number", "description": "Annual interest rate percentage (e.g. 6.5 for 6.5%)." },
                        "term_years": { "type": "integer", "description": "Loan term in years." },
                        "monthly_payment": { "type": "number", "description": "Required monthly payment in USD." },
                        "extra_monthly_payment": { "type": "number", "description": "Optional extra monthly principal payment in USD." }
                    },
                    "required": ["name", "type", "principal", "rate", "term_years"]
                }
            },
            {
                "name": "update_tax_classification",
                "description": "Mark transactions as Business (Schedule C) or Personal deductions by transaction IDs, category, or account ID.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "transaction_ids": { "type": "array", "items": { "type": "integer" }, "description": "Specific transaction IDs to update." },
                        "category": { "type": "string", "description": "Update all transactions in this spend category." },
                        "account_id": { "type": "integer", "description": "Update all transactions in this account." },
                        "tax_year": { "type": "integer", "description": "Restrict bulk category/account updates to a specific 4-digit tax year." },
                        "is_business": { "type": "boolean", "description": "True for business deduction, false for personal." },
                        "tax_category": { "type": "string", "description": "Schedule C tax category slug (e.g. 'advertising', 'carTruck', 'commissions', 'contractLabor', 'depreciation', 'insurance', 'interest', 'legalProfessional', 'officeExpense', 'rentLease', 'repairsMaintenance', 'supplies', 'taxesLicenses', 'travel', 'meals', 'utilities', 'other')." }
                    },
                    "required": ["is_business"]
                }
            },
            {
                "name": "generate_tax_documents",
                "description": "Produce complete tax documents and summaries from the ledger for a given tax year, including IRS Schedule C Profit & Loss CSV, Business Expense Ledger CSV, Personal Itemized Deductions CSV, and a Tax Summary Markdown report. Optionally writes the files directly to disk.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tax_year": { "type": "integer", "description": "4-digit tax year (e.g. 2025 or 2026). Defaults to the latest tax year in the ledger." },
                        "include_pending": { "type": "boolean", "description": "Include candidate/pending business expenses alongside confirmed deductions (default true)." },
                        "output_dir": { "type": "string", "description": "Optional directory path on disk where the generated CSV and Markdown tax documents should be saved." }
                    }
                }
            },
            {
                "name": "get_account_cashflow",
                "description": "Analyze monthly inflows (income), recurring bills, variable spend, savings transfers, net monthly surplus/deficit, and 12-month projected balance trajectory for a specific bank account or all active accounts.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "account_id": { "type": "integer", "description": "Optional account ID to inspect. If omitted, returns cashflow projections for all active accounts." }
                    }
                }
            },
            {
                "name": "sync_bank_accounts",
                "description": "Trigger a live SimpleFIN Bridge synchronization to pull the latest bank/card transactions and balances.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "start_date": { "type": "string", "description": "Optional start date YYYY-MM-DD for historical backfill." }
                    }
                }
            },
            {
                "name": "manage_rule",
                "description": "Create or update a merchant auto-categorization rule and optionally apply it retroactively to existing non-overridden transactions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "Normalized merchant keyword/pattern to match (e.g. 'starbucks', 'netflix')." },
                        "category": { "type": "string", "description": "Target category name." },
                        "priority": { "type": "integer", "description": "Rule priority (default 10; higher priority wins)." },
                        "apply_retroactively": { "type": "boolean", "description": "When true (default), recategorizes existing non-overridden transactions matching this rule." }
                    },
                    "required": ["pattern", "category"]
                }
            },
            {
                "name": "get_financial_insights",
                "description": "Detect subscription price spikes, duplicate charges, category spending pace spikes vs. 90-day baseline, and statistical outlier transactions.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "start_date": { "type": "string", "description": "Period start date YYYY-MM-DD (defaults to 1st of current month)." },
                        "end_date": { "type": "string", "description": "Period end date YYYY-MM-DD (defaults to today)." },
                        "include_demo": { "type": "boolean", "description": "Include demo transactions (default false)." }
                    }
                }
            },
            {
                "name": "run_cashflow_projection",
                "description": "Run a multi-month cashflow, debt-payoff (avalanche/snowball), and net-worth simulation using live account balances, loans, and trailing cashflow defaults.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "months": { "type": "integer", "description": "Number of months to project (1-360, default 12)." },
                        "base_income": { "type": "number", "description": "Monthly net income in USD (defaults to trailing 90-day average)." },
                        "recurring_budget": { "type": "number", "description": "Monthly recurring expenses in USD (defaults to trailing 90-day average)." },
                        "variable_budget": { "type": "number", "description": "Monthly discretionary/variable spend in USD (defaults to trailing 90-day average)." },
                        "savings_budget": { "type": "number", "description": "Monthly investment/savings contribution in USD (default 0)." },
                        "global_extra_loan_payment": { "type": "number", "description": "Extra monthly amount in USD applied toward loans (default 0)." },
                        "loan_strategy": { "type": "string", "enum": ["avalanche", "snowball", "evenly"], "description": "Debt payoff strategy (default 'avalanche')." },
                        "investment_growth_rate": { "type": "number", "description": "Annualized investment return % (default 7.0)." }
                    }
                }
            },
            {
                "name": "control_app_ui",
                "description": "Navigate the open Strictly Spending desktop app to a specific page/view, apply live filters (date range, single month, categories, merchant search, recurrence, price bounds), or configure Forecast parameters on screen.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "page": {
                            "type": "string",
                            "enum": ["/dashboard", "/timeline", "/transactions", "/budget", "/forecast", "/loans", "/sort", "/rules", "/categories", "/merchants", "/import", "/settings"],
                            "description": "Target page or view to navigate to in the desktop app. Use '/timeline' for the daily reconciliation timeline, '/transactions' for the full table view, or '/dashboard' for the bar chart view."
                        },
                        "reset_filters": {
                            "type": "boolean",
                            "description": "When true, resets existing filters to defaults before applying any new filter options."
                        },
                        "preset": {
                            "type": "string",
                            "enum": ["ytd", "last30", "last90", "thisMonth", "lastMonth", "allTime", "custom"],
                            "description": "Date range preset to apply."
                        },
                        "month": {
                            "type": "string",
                            "description": "Optional YYYY-MM month to drill into (e.g. '2026-10' or '2026-07'). Automatically sets the date range to that single month."
                        },
                        "start_date": {
                            "type": "string",
                            "description": "Custom start date YYYY-MM-DD."
                        },
                        "end_date": {
                            "type": "string",
                            "description": "Custom end date YYYY-MM-DD."
                        },
                        "only_categories": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Show ONLY these categories in the chart/timeline/table (disables all other categories)."
                        },
                        "exclude_categories": {
                            "type": "array",
                            "items": { "type": "string" },
                            "description": "Hide these specific categories in the chart/timeline/table."
                        },
                        "search_query": {
                            "type": "string",
                            "description": "Merchant or description search query to filter by (pass empty string '' to clear)."
                        },
                        "transaction_type": {
                            "type": "string",
                            "enum": ["all", "spend", "income"],
                            "description": "Filter by transaction type ('spend', 'income', or 'all')."
                        },
                        "recurrence_filter": {
                            "type": "string",
                            "enum": ["all", "recurring", "onetime"],
                            "description": "Filter by recurrence ('all', 'recurring', or 'onetime')."
                        },
                        "group_by": {
                            "type": "string",
                            "enum": ["category", "account"],
                            "description": "Group chart bars by 'category' or 'account'."
                        },
                        "profile": {
                            "type": "string",
                            "enum": ["all", "personal", "business"],
                            "description": "Account profile filter ('all', 'personal', or 'business')."
                        },
                        "min_amount": {
                            "type": "number",
                            "description": "Minimum transaction amount filter."
                        },
                        "max_amount": {
                            "type": "number",
                            "description": "Maximum transaction amount filter."
                        },
                        "forecast_months": {
                            "type": "integer",
                            "description": "Optional Forecast projection horizon in months (e.g. 12, 24, 60)."
                        },
                        "forecast_extra_loan_payment": {
                            "type": "number",
                            "description": "Optional extra monthly USD payment toward loans on the Forecast page."
                        },
                        "forecast_loan_strategy": {
                            "type": "string",
                            "enum": ["avalanche", "snowball", "custom"],
                            "description": "Optional loan payoff strategy to select on the Forecast page."
                        },
                        "forecast_savings_budget": {
                            "type": "number",
                            "description": "Optional monthly savings/investment budget on the Forecast page."
                        },
                        "message": {
                            "type": "string",
                            "description": "Short human-readable banner text shown in the app explaining what view was opened (e.g. 'Filtered to July Travel & Dining charges')."
                        }
                    }
                }
            }
        ]
    })
}

fn list_mcp_prompts() -> Value {
    json!({
        "prompts": [
            {
                "name": "monthly-financial-review",
                "description": "Comprehensive monthly review of income, spending vs. budgets, subscription alerts, and savings rate.",
                "arguments": [
                    {
                        "name": "month",
                        "description": "Optional YYYY-MM month to review (defaults to current month).",
                        "required": false
                    }
                ]
            },
            {
                "name": "tax-deduction-audit",
                "description": "Audit transactions for Schedule C business and personal deductions and compile ready-to-file tax documents (CSV & Markdown).",
                "arguments": [
                    {
                        "name": "tax_year",
                        "description": "Optional 4-digit tax year (e.g. '2026').",
                        "required": false
                    }
                ]
            },
            {
                "name": "subscription-cleanup",
                "description": "Identify recurring price hikes, duplicate charges, and unused subscriptions with annual savings estimates.",
                "arguments": []
            },
            {
                "name": "debt-payoff-optimizer",
                "description": "Compare avalanche vs. snowball debt payoff strategies across all active loans.",
                "arguments": [
                    {
                        "name": "extra_monthly_budget",
                        "description": "Optional extra monthly USD available to accelerate debt payoff.",
                        "required": false
                    }
                ]
            }
        ]
    })
}

fn get_mcp_prompt(name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "monthly-financial-review" => {
            let month = args
                .get("month")
                .and_then(|v| v.as_str())
                .unwrap_or("the current month");
            Ok(json!({
                "description": format!("Monthly financial review for {}", month),
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": format!(
                                "Please perform a comprehensive monthly financial review for {}:\n1. Read `strictly://summary/overview` and `strictly://budgets`.\n2. Call `get_spending_summary` and `get_financial_insights` for the period.\n3. Highlight net cashflow, savings rate, top over-budget categories, and any subscription price hikes or outlier transactions.\n4. Provide 3 concrete, quantified recommendations.",
                                month
                            )
                        }
                    }
                ]
            }))
        }
        "tax-deduction-audit" => {
            let year = args
                .get("tax_year")
                .and_then(|v| v.as_str())
                .unwrap_or("the latest tax year");
            Ok(json!({
                "description": format!("Schedule C & Personal Tax Package Generator for {}", year),
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": format!(
                                "Prepare my tax deduction audit and generate my tax documents for {}:\n1. Call `generate_tax_documents` (with `include_pending: true`) to compile the Schedule C Profit & Loss breakdown, Business Expense Ledger, Candidate Business Deductions, and Itemized Personal Deductions.\n2. Present the Schedule C P&L summary and highlight any candidate business deductions that need confirmation.\n3. Ask if I want to confirm any candidate deductions via `update_tax_classification` or save the CSV/Markdown tax package to a folder on disk.",
                                year
                            )
                        }
                    }
                ]
            }))
        }
        "subscription-cleanup" => Ok(json!({
            "description": "Audit recurring charges, price hikes, and duplicate subscriptions",
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": "Audit my recurring subscriptions and bills:\n1. Call `get_financial_insights` and read `strictly://summary/overview`.\n2. Identify any recurring price increases, duplicate charges within the same billing cycle, or overlapping subscriptions.\n3. Rank recurring charges by annualized cost and estimate how much I could save per year by trimming redundant services."
                    }
                }
            ]
        })),
        "debt-payoff-optimizer" => {
            let extra = args
                .get("extra_monthly_budget")
                .and_then(|v| v.as_str())
                .unwrap_or("250");
            Ok(json!({
                "description": "Optimize loan payoff strategy using avalanche vs. snowball simulations",
                "messages": [
                    {
                        "role": "user",
                        "content": {
                            "type": "text",
                            "text": format!(
                                "Analyze my loans and optimize my payoff plan:\n1. Read `strictly://loans` to inspect principals, interest rates, and monthly payments.\n2. Call `run_cashflow_projection` comparing baseline (`global_extra_loan_payment: 0`) against adding ${}/month under both `avalanche` and `snowball` strategies.\n3. Compare payoff timelines, total debt remaining, and net worth impact.",
                                extra
                            )
                        }
                    }
                ]
            }))
        }
        _ => Err(format!("Unknown prompt: {}", name)),
    }
}

fn execute_mcp_tool(db_state: &DbState, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "query_transactions" => {
            let start_date = args
                .get("start_date")
                .and_then(|v| v.as_str())
                .unwrap_or("2000-01-01");
            let end_date = args
                .get("end_date")
                .and_then(|v| v.as_str())
                .unwrap_or("2099-12-31");
            let category = args.get("category").and_then(|v| v.as_str());
            let search = args.get("search").and_then(|v| v.as_str());
            let account_id = args.get("account_id").and_then(|v| v.as_i64());
            let is_business = args.get("is_business").and_then(|v| v.as_bool());
            let include_demo = args
                .get("include_demo")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let limit = args
                .get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(100)
                .clamp(1, 500);

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let mut sql = String::from(
                "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status
                 FROM transactions
                 WHERE date BETWEEN ?1 AND ?2",
            );
            let mut bind_vals: Vec<rusqlite::types::Value> = vec![
                rusqlite::types::Value::Text(start_date.to_string()),
                rusqlite::types::Value::Text(end_date.to_string()),
            ];

            if !include_demo {
                sql.push_str(" AND source != 'demo'");
            }
            if let Some(cat) = category {
                sql.push_str(&format!(" AND LOWER(category) = LOWER(?{})", bind_vals.len() + 1));
                bind_vals.push(rusqlite::types::Value::Text(cat.to_string()));
            }
            if let Some(q) = search {
                let like = format!("%{}%", q.to_lowercase());
                sql.push_str(&format!(
                    " AND (LOWER(description) LIKE ?{0} OR LOWER(merchant_key) LIKE ?{0})",
                    bind_vals.len() + 1
                ));
                bind_vals.push(rusqlite::types::Value::Text(like));
            }
            if let Some(acc) = account_id {
                sql.push_str(&format!(" AND account_id = ?{}", bind_vals.len() + 1));
                bind_vals.push(rusqlite::types::Value::Integer(acc));
            }
            if let Some(bus) = is_business {
                sql.push_str(&format!(" AND is_business = ?{}", bind_vals.len() + 1));
                bind_vals.push(rusqlite::types::Value::Integer(if bus { 1 } else { 0 }));
            }

            sql.push_str(&format!(" ORDER BY date DESC, id DESC LIMIT {}", limit));

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(bind_vals), row_to_transaction)
                .map_err(|e| e.to_string())?;

            let mut txns = Vec::new();
            let mut total_spend = 0.0_f64;
            let mut total_income = 0.0_f64;
            for r in rows {
                let t = r.map_err(|e| e.to_string())?;
                if t.amount < 0.0 {
                    total_spend += t.amount.abs();
                } else {
                    total_income += t.amount;
                }
                txns.push(t);
            }

            Ok(json!({
                "count": txns.len(),
                "totalSpend": (total_spend * 100.0).round() / 100.0,
                "totalIncome": (total_income * 100.0).round() / 100.0,
                "transactions": txns
            }))
        }

        "get_spending_summary" => {
            let start_date = args
                .get("start_date")
                .and_then(|v| v.as_str())
                .ok_or("Missing required parameter: start_date")?;
            let end_date = args
                .get("end_date")
                .and_then(|v| v.as_str())
                .ok_or("Missing required parameter: end_date")?;
            let include_demo = args
                .get("include_demo")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let source_clause = if include_demo { "" } else { "AND source != 'demo'" };

            let sql_cat = format!(
                "SELECT category,
                        COUNT(*) as txn_count,
                        ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 2) as spend,
                        ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) as income
                 FROM transactions
                 WHERE date BETWEEN ?1 AND ?2
                   AND LOWER(category) NOT IN ('transfer', 'transfers')
                   {}
                 GROUP BY category
                 ORDER BY spend DESC",
                source_clause
            );

            let mut stmt = conn.prepare(&sql_cat).map_err(|e| e.to_string())?;
            let iter = stmt
                .query_map(params![start_date, end_date], |r| {
                    Ok(json!({
                        "category": r.get::<_, String>(0)?,
                        "transactionCount": r.get::<_, i64>(1)?,
                        "spend": r.get::<_, f64>(2)?,
                        "income": r.get::<_, f64>(3)?,
                    }))
                })
                .map_err(|e| e.to_string())?;

            let mut by_category = Vec::new();
            let mut total_spend = 0.0_f64;
            let mut total_income = 0.0_f64;
            for item in iter {
                let v = item.map_err(|e| e.to_string())?;
                total_spend += v["spend"].as_f64().unwrap_or(0.0);
                total_income += v["income"].as_f64().unwrap_or(0.0);
                by_category.push(v);
            }

            let sql_merch = format!(
                "SELECT merchant_key,
                        MAX(description) as sample_description,
                        category,
                        COUNT(*) as count,
                        ROUND(SUM(ABS(amount)), 2) as total_spend
                 FROM transactions
                 WHERE date BETWEEN ?1 AND ?2
                   AND amount < 0
                   AND LOWER(category) NOT IN ('transfer', 'transfers')
                   {}
                 GROUP BY merchant_key
                 ORDER BY total_spend DESC
                 LIMIT 15",
                source_clause
            );
            let mut m_stmt = conn.prepare(&sql_merch).map_err(|e| e.to_string())?;
            let m_iter = m_stmt
                .query_map(params![start_date, end_date], |r| {
                    Ok(json!({
                        "merchantKey": r.get::<_, String>(0)?,
                        "description": r.get::<_, String>(1)?,
                        "category": r.get::<_, String>(2)?,
                        "count": r.get::<_, i64>(3)?,
                        "totalSpend": r.get::<_, f64>(4)?,
                    }))
                })
                .map_err(|e| e.to_string())?;
            let mut top_merchants = Vec::new();
            for m in m_iter {
                top_merchants.push(m.map_err(|e| e.to_string())?);
            }

            Ok(json!({
                "startDate": start_date,
                "endDate": end_date,
                "totalSpend": (total_spend * 100.0).round() / 100.0,
                "totalIncome": (total_income * 100.0).round() / 100.0,
                "netCashflow": ((total_income - total_spend) * 100.0).round() / 100.0,
                "byCategory": by_category,
                "topMerchants": top_merchants
            }))
        }

        "categorize_transactions" => {
            let category = args
                .get("category")
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or("Missing required parameter: category")?;
            let txn_ids: Vec<i64> = args
                .get("transaction_ids")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_i64()).collect())
                .unwrap_or_default();
            let merchant_pattern = args
                .get("merchant_pattern")
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());
            let create_rule = args
                .get("create_rule")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let override_existing = args
                .get("override_existing")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if txn_ids.is_empty() && merchant_pattern.is_none() {
                return Err("Provide either transaction_ids or merchant_pattern.".to_string());
            }

            let mut conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            let mut updated_count = 0usize;
            for id in &txn_ids {
                updated_count += tx
                    .execute(
                        "UPDATE transactions SET category = ?1, user_overridden = 1 WHERE id = ?2",
                        params![category, id],
                    )
                    .map_err(|e| e.to_string())?;
            }

            let mut rule_saved = false;
            if let Some(pattern) = merchant_pattern {
                let like = format!("%{}%", pattern.to_lowercase());
                let sql = if override_existing {
                    "UPDATE transactions SET category = ?1 WHERE (LOWER(description) LIKE ?2 OR LOWER(merchant_key) LIKE ?2)"
                } else {
                    "UPDATE transactions SET category = ?1 WHERE (category = 'Uncategorized' OR category = '') AND (LOWER(description) LIKE ?2 OR LOWER(merchant_key) LIKE ?2)"
                };
                updated_count += tx
                    .execute(sql, params![category, like])
                    .map_err(|e| e.to_string())?;

                if create_rule {
                    let now = chrono::Utc::now().to_rfc3339();
                    tx.execute(
                        "INSERT INTO rules (pattern, category, priority, created_at) VALUES (?1, ?2, 10, ?3)
                         ON CONFLICT(pattern) DO UPDATE SET category = excluded.category",
                        params![pattern.to_lowercase(), category, now],
                    )
                    .map_err(|e| e.to_string())?;
                    rule_saved = true;
                }
            }

            tx.commit().map_err(|e| e.to_string())?;
            if let Ok(mut c) = db_state.recurrence_cache.lock() {
                *c = None;
            }

            Ok(json!({
                "updatedTransactions": updated_count,
                "category": category,
                "ruleSaved": rule_saved,
                "merchantPattern": merchant_pattern
            }))
        }

        "manage_budget" => {
            let category = args
                .get("category")
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or("Missing required parameter: category")?;
            let monthly_amount = args
                .get("monthly_amount")
                .and_then(|v| v.as_f64())
                .ok_or("Missing required parameter: monthly_amount")?;

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR REPLACE INTO budgets (category, monthly_amount, user_set) VALUES (?1, ?2, 1)",
                params![category, monthly_amount],
            )
            .map_err(|e| e.to_string())?;

            Ok(json!({
                "category": category,
                "monthlyAmount": monthly_amount,
                "userSet": true
            }))
        }

        "manage_loan" => {
            let id = args.get("id").and_then(|v| v.as_i64());
            let loan_name = args
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required parameter: name")?;
            let loan_type = args
                .get("type")
                .and_then(|v| v.as_str())
                .ok_or("Missing required parameter: type")?;
            let principal = args
                .get("principal")
                .and_then(|v| v.as_f64())
                .ok_or("Missing required parameter: principal")?;
            let rate = args
                .get("rate")
                .and_then(|v| v.as_f64())
                .ok_or("Missing required parameter: rate")?;
            let term_years = args
                .get("term_years")
                .and_then(|v| v.as_i64())
                .ok_or("Missing required parameter: term_years")?;
            let monthly_payment = args.get("monthly_payment").and_then(|v| v.as_f64());
            let extra_monthly = args.get("extra_monthly_payment").and_then(|v| v.as_f64());
            let now = chrono::Utc::now().format("%Y-%m-%d").to_string();

            let mut conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;

            let result_id = if let Some(existing_id) = id {
                tx.execute(
                    "UPDATE loans SET name=?1, type=?2, principal=?3, rate=?4, term_years=?5, monthly_payment=COALESCE(?6, monthly_payment), extra_monthly_payment=COALESCE(?7, extra_monthly_payment) WHERE id=?8",
                    params![loan_name, loan_type, principal, rate, term_years, monthly_payment, extra_monthly, existing_id],
                )
                .map_err(|e| e.to_string())?;
                existing_id
            } else {
                tx.execute(
                    "INSERT INTO loans (name, type, principal, rate, term_years, start_date, category, monthly_payment, extra_monthly_payment, created_at, enabled)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'Debt', ?7, ?8, ?9, 1)",
                    params![loan_name, loan_type, principal, rate, term_years, now, monthly_payment, extra_monthly, now],
                )
                .map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            };

            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({
                "id": result_id,
                "name": loan_name,
                "type": loan_type,
                "principal": principal,
                "rate": rate,
                "termYears": term_years
            }))
        }

        "update_tax_classification" => {
            let is_business = args
                .get("is_business")
                .and_then(|v| v.as_bool())
                .ok_or("Missing required parameter: is_business")?;
            let tax_category = args
                .get("tax_category")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let txn_ids: Vec<i64> = args
                .get("transaction_ids")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_i64()).collect())
                .unwrap_or_default();
            let category = args.get("category").and_then(|v| v.as_str());
            let account_id = args.get("account_id").and_then(|v| v.as_i64());
            let tax_year = args.get("tax_year").and_then(|v| v.as_i64());

            if txn_ids.is_empty() && category.is_none() && account_id.is_none() {
                return Err("Provide at least one of transaction_ids, category, or account_id.".to_string());
            }

            let mut conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            let effective_tax_cat = if is_business {
                Some(tax_category.unwrap_or_else(|| "other".to_string()))
            } else {
                None
            };

            let mut updated_count = 0usize;
            for id in &txn_ids {
                updated_count += tx
                    .execute(
                        "UPDATE transactions SET is_business = ?1, tax_category = ?2, deduction_status = 'confirmed' WHERE id = ?3",
                        params![is_business, effective_tax_cat, id],
                    )
                    .map_err(|e| e.to_string())?;
            }

            if category.is_some() || account_id.is_some() {
                let mut sql = String::from(
                    "UPDATE transactions SET is_business = ?1, tax_category = ?2, deduction_status = 'confirmed' WHERE source != 'demo'",
                );
                let mut bind_vals: Vec<rusqlite::types::Value> = vec![
                    rusqlite::types::Value::Integer(if is_business { 1 } else { 0 }),
                    match &effective_tax_cat {
                        Some(s) => rusqlite::types::Value::Text(s.clone()),
                        None => rusqlite::types::Value::Null,
                    },
                ];

                if let Some(cat) = category {
                    sql.push_str(&format!(" AND LOWER(category) = LOWER(?{})", bind_vals.len() + 1));
                    bind_vals.push(rusqlite::types::Value::Text(cat.to_string()));
                }
                if let Some(acc) = account_id {
                    sql.push_str(&format!(" AND account_id = ?{}", bind_vals.len() + 1));
                    bind_vals.push(rusqlite::types::Value::Integer(acc));
                }
                if let Some(yr) = tax_year {
                    sql.push_str(&format!(" AND date LIKE ?{}", bind_vals.len() + 1));
                    bind_vals.push(rusqlite::types::Value::Text(format!("{}-%", yr)));
                }

                updated_count += tx
                    .execute(&sql, rusqlite::params_from_iter(bind_vals))
                    .map_err(|e| e.to_string())?;
            }

            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({
                "updatedTransactions": updated_count,
                "isBusiness": is_business,
                "taxCategory": effective_tax_cat
            }))
        }

        "generate_tax_documents" => {
            let tax_year = args
                .get("tax_year")
                .and_then(|v| v.as_i64())
                .map(|y| y as i32);
            let include_pending = args
                .get("include_pending")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let output_dir = args.get("output_dir").and_then(|v| v.as_str());

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            build_tax_package(&conn, tax_year, include_pending, output_dir)
        }

        "get_account_cashflow" => {
            let account_id = args.get("account_id").and_then(|v| v.as_i64());
            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            build_account_cashflow(&conn, account_id)
        }

        "sync_bank_accounts" => {
            let start_date = args
                .get("start_date")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let rt = tauri::async_runtime::block_on(crate::simplefin::sync_transactions_core(
                db_state, start_date,
            ))?;
            serde_json::to_value(rt).map_err(|e| e.to_string())
        }

        "manage_rule" => {
            let pattern = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Missing or empty `pattern` parameter".to_string())?;
            let category = args
                .get("category")
                .and_then(|v| v.as_str())
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Missing or empty `category` parameter".to_string())?;
            let priority = args.get("priority").and_then(|v| v.as_i64()).unwrap_or(10) as i32;
            let apply_retroactively = args
                .get("apply_retroactively")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            let mut conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            let now = chrono::Utc::now().to_rfc3339();

            let rule_id: i64 = tx
                .query_row(
                    "INSERT INTO rules (pattern, category, priority, created_at) VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(pattern) DO UPDATE SET category = excluded.category, priority = excluded.priority
                     RETURNING id",
                    params![pattern, category, priority, now],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let mut updated_transactions = 0usize;
            if apply_retroactively {
                let norm_pat = crate::tools::normalize_for_match(&pattern);
                if !norm_pat.is_empty() {
                    let candidates: Vec<(i64, String, String)> = {
                        let mut stmt = tx
                            .prepare(
                                "SELECT id, description, COALESCE(merchant_key, '')
                                 FROM transactions
                                 WHERE COALESCE(user_overridden, 0) = 0 AND category != ?1",
                            )
                            .map_err(|e| e.to_string())?;
                        let rows = stmt
                            .query_map(params![category], |row| {
                                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                            })
                            .map_err(|e| e.to_string())?;
                        let mut vec = Vec::new();
                        for r in rows {
                            vec.push(r.map_err(|e| e.to_string())?);
                        }
                        vec
                    };

                    let mut matched_ids = Vec::new();
                    for (tid, desc, mkey) in candidates {
                        let d_norm = crate::tools::normalize_for_match(&desc);
                        let m_norm = crate::tools::normalize_for_match(&mkey);
                        if (!d_norm.is_empty()
                            && crate::tools::matches_normalized_rule(&d_norm, &norm_pat))
                            || (!m_norm.is_empty()
                                && crate::tools::matches_normalized_rule(&m_norm, &norm_pat))
                        {
                            matched_ids.push(tid);
                        }
                    }

                    for chunk in matched_ids.chunks(500) {
                        let placeholders: Vec<String> =
                            (0..chunk.len()).map(|i| format!("?{}", i + 2)).collect();
                        let sql = format!(
                            "UPDATE transactions SET category = ?1 WHERE id IN ({})",
                            placeholders.join(", ")
                        );
                        let mut bind_vals: Vec<rusqlite::types::Value> =
                            vec![rusqlite::types::Value::Text(category.to_string())];
                        for id in chunk {
                            bind_vals.push(rusqlite::types::Value::Integer(*id));
                        }
                        updated_transactions += tx
                            .execute(&sql, rusqlite::params_from_iter(bind_vals))
                            .map_err(|e| e.to_string())?;
                    }
                }
            }

            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({
                "ruleId": rule_id,
                "pattern": pattern,
                "category": category,
                "priority": priority,
                "retroactivelyUpdatedTransactions": updated_transactions
            }))
        }

        "get_financial_insights" => {
            let now = chrono::Local::now().naive_local().date();
            let default_start = format!("{:04}-{:02}-01", now.year(), now.month());
            let default_end = now.format("%Y-%m-%d").to_string();
            let start_date = args
                .get("start_date")
                .and_then(|v| v.as_str())
                .unwrap_or(&default_start);
            let end_date = args
                .get("end_date")
                .and_then(|v| v.as_str())
                .unwrap_or(&default_end);
            let include_demo = args
                .get("include_demo")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let start_parsed = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
                .unwrap_or(now);
            let baseline_start = (start_parsed - chrono::Duration::days(90))
                .format("%Y-%m-%d")
                .to_string();

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
            let (excluded_merchants, excluded_categories) = read_budget_exclusions(&conn);
            let demo_clause = if include_demo {
                ""
            } else {
                " AND t.source != 'demo'"
            };

            // 1. Subscription price hikes (compare latest 2 charges for recurring merchants)
            let mut sub_stmt = conn
                .prepare(&format!(
                    "SELECT COALESCE(NULLIF(t.merchant_key, ''), LOWER(t.description)) AS mkey,
                            t.description, t.date, ABS(t.amount) AS amt
                     FROM transactions t
                     LEFT JOIN categories c ON LOWER(t.category) = LOWER(c.name)
                     WHERE t.amount < 0
                       AND COALESCE(c.type, 'spend') = 'spend'
                       AND (COALESCE(t.recurrence, 'none') != 'none' OR LOWER(t.category) = 'subscriptions')
                       {}
                     ORDER BY mkey ASC, t.date ASC",
                    demo_clause
                ))
                .map_err(|e| e.to_string())?;
            let sub_rows = sub_stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, f64>(3)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            let mut by_merchant: std::collections::BTreeMap<
                String,
                Vec<(String, String, f64)>,
            > = std::collections::BTreeMap::new();
            for r in sub_rows {
                let (mkey, desc, dt, amt) = r.map_err(|e| e.to_string())?;
                if excluded_merchants.contains(&mkey.trim().to_lowercase()) {
                    continue;
                }
                by_merchant.entry(mkey).or_default().push((desc, dt, amt));
            }

            let mut price_spikes = Vec::new();
            let mut duplicate_charges = Vec::new();
            for (mkey, charges) in &by_merchant {
                if charges.len() >= 2 {
                    let prev = &charges[charges.len() - 2];
                    let curr = &charges[charges.len() - 1];
                    if curr.2 - prev.2 >= 1.0 && prev.2 > 0.0 {
                        let pct = ((curr.2 - prev.2) / prev.2) * 100.0;
                        if pct >= 5.0 {
                            price_spikes.push(json!({
                                "merchantKey": mkey,
                                "merchantName": curr.0,
                                "previousAmount": (prev.2 * 100.0).round() / 100.0,
                                "newAmount": (curr.2 * 100.0).round() / 100.0,
                                "percentageIncrease": (pct * 10.0).round() / 10.0,
                                "latestDate": curr.1
                            }));
                        }
                    }
                    // Check duplicate billing within 7 days
                    if let (Ok(d1), Ok(d2)) = (
                        chrono::NaiveDate::parse_from_str(&prev.1, "%Y-%m-%d"),
                        chrono::NaiveDate::parse_from_str(&curr.1, "%Y-%m-%d"),
                    ) {
                        let days_apart = (d2 - d1).num_days().abs();
                        if days_apart <= 7 && (curr.2 - prev.2).abs() < 0.01 {
                            duplicate_charges.push(json!({
                                "merchantKey": mkey,
                                "merchantName": curr.0,
                                "amount": (curr.2 * 100.0).round() / 100.0,
                                "dates": [prev.1, curr.1]
                            }));
                        }
                    }
                }
            }

            // 2. Category spending pace spikes vs 90-day trailing baseline
            let mut cat_stmt = conn
                .prepare(&format!(
                    "SELECT t.category,
                            SUM(CASE WHEN t.date BETWEEN ?1 AND ?2 THEN -t.amount ELSE 0 END) AS curr_spend,
                            SUM(CASE WHEN t.date >= ?3 AND t.date < ?1 THEN -t.amount ELSE 0 END) AS base_spend
                     FROM transactions t
                     LEFT JOIN categories c ON LOWER(t.category) = LOWER(c.name)
                     WHERE t.date BETWEEN ?3 AND ?2
                       AND COALESCE(c.type, 'spend') = 'spend'
                       {}
                     GROUP BY t.category",
                    demo_clause
                ))
                .map_err(|e| e.to_string())?;
            let cat_rows = cat_stmt
                .query_map(params![start_date, end_date, baseline_start], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, f64>(1)?,
                        row.get::<_, f64>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?;

            let mut category_spikes = Vec::new();
            for r in cat_rows {
                let (cat, curr_spend, base_90d) = r.map_err(|e| e.to_string())?;
                if excluded_categories.contains(&cat.trim().to_lowercase()) {
                    continue;
                }
                let baseline_monthly = base_90d / 3.0;
                if baseline_monthly >= 20.0 && curr_spend - baseline_monthly >= 25.0 {
                    let pct = ((curr_spend - baseline_monthly) / baseline_monthly) * 100.0;
                    if pct >= 25.0 {
                        category_spikes.push(json!({
                            "category": cat,
                            "currentPeriodSpend": (curr_spend * 100.0).round() / 100.0,
                            "baselineMonthlySpend": (baseline_monthly * 100.0).round() / 100.0,
                            "percentageIncrease": (pct * 10.0).round() / 10.0
                        }));
                    }
                }
            }

            Ok(json!({
                "period": { "startDate": start_date, "endDate": end_date },
                "subscriptionPriceSpikes": price_spikes,
                "duplicateCharges": duplicate_charges,
                "categorySpendingSpikes": category_spikes
            }))
        }

        "run_cashflow_projection" => {
            let months = args
                .get("months")
                .and_then(|v| v.as_u64())
                .unwrap_or(12)
                .clamp(1, 360) as u32;

            // Compute sensible live defaults from SQLite when optional params are omitted
            let (live_cash, live_invest, avg_income, avg_recurring, avg_variable) = {
                let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
                let cash: f64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(current_balance), 0.0) FROM accounts WHERE COALESCE(enabled, 1) = 1 AND source != 'demo' AND LOWER(COALESCE(type, 'checking')) IN ('checking', 'savings', 'cash')",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0.0);
                let invest: f64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(current_balance), 0.0) FROM accounts WHERE COALESCE(enabled, 1) = 1 AND source != 'demo' AND LOWER(COALESCE(type, '')) IN ('investment', 'retirement', 'brokerage')",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or(0.0);

                let cutoff = (chrono::Local::now().naive_local().date()
                    - chrono::Duration::days(90))
                .format("%Y-%m-%d")
                .to_string();

                let inc_90: f64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t LEFT JOIN categories c ON LOWER(t.category) = LOWER(c.name) WHERE t.date >= ?1 AND t.source != 'demo' AND t.amount > 0 AND COALESCE(c.type, 'spend') = 'income'",
                        params![cutoff],
                        |r| r.get(0),
                    )
                    .unwrap_or(0.0);
                let rec_90: f64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(-t.amount), 0.0) FROM transactions t LEFT JOIN categories c ON LOWER(t.category) = LOWER(c.name) WHERE t.date >= ?1 AND t.source != 'demo' AND t.amount < 0 AND COALESCE(c.type, 'spend') = 'spend' AND COALESCE(t.recurrence, 'none') != 'none'",
                        params![cutoff],
                        |r| r.get(0),
                    )
                    .unwrap_or(0.0);
                let var_90: f64 = conn
                    .query_row(
                        "SELECT COALESCE(SUM(-t.amount), 0.0) FROM transactions t LEFT JOIN categories c ON LOWER(t.category) = LOWER(c.name) WHERE t.date >= ?1 AND t.source != 'demo' AND t.amount < 0 AND COALESCE(c.type, 'spend') = 'spend' AND COALESCE(t.recurrence, 'none') = 'none'",
                        params![cutoff],
                        |r| r.get(0),
                    )
                    .unwrap_or(0.0);

                (cash, invest, inc_90 / 3.0, rec_90 / 3.0, var_90 / 3.0)
            };

            let params = crate::tools::projection::ProjectionParams {
                base_income: args
                    .get("base_income")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(avg_income),
                recurring_budget: args
                    .get("recurring_budget")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(avg_recurring),
                variable_budget: args
                    .get("variable_budget")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(avg_variable),
                savings_budget: args
                    .get("savings_budget")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
                investment_growth_rate: args
                    .get("investment_growth_rate")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(7.0),
                starting_balance: live_cash,
                starting_investment_balance: Some(live_invest),
                destinations: None,
                income_gaps: Vec::new(),
                windfalls: Vec::new(),
                global_extra_loan_payment: args
                    .get("global_extra_loan_payment")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
                divert_extra_to_savings: true,
                loan_strategy: Some(
                    args.get("loan_strategy")
                        .and_then(|v| v.as_str())
                        .unwrap_or("avalanche")
                        .to_string(),
                ),
                months,
                goals: Vec::new(),
                include_home_equity: Some(true),
                home_property_value: None,
                home_appreciation_rate: Some(3.0),
            };

            let points = crate::tools::projection::calculate_projection_core(db_state, params)?;
            let first = points.first();
            let last = points.last();
            Ok(json!({
                "monthsProjected": points.len(),
                "startingCashBalance": (live_cash * 100.0).round() / 100.0,
                "endingCashBalance": last.map(|p| (p.ending_balance * 100.0).round() / 100.0).unwrap_or(live_cash),
                "endingInvestmentBalance": last.map(|p| (p.investment_balance * 100.0).round() / 100.0).unwrap_or(live_invest),
                "startingTotalDebt": first.map(|p| (p.total_debt * 100.0).round() / 100.0).unwrap_or(0.0),
                "endingTotalDebt": last.map(|p| (p.total_debt * 100.0).round() / 100.0).unwrap_or(0.0),
                "endingNetWorth": last.and_then(|p| p.net_worth).map(|nw| (nw * 100.0).round() / 100.0),
                "timeline": points
            }))
        }

        "control_app_ui" => {
            use std::sync::atomic::{AtomicU64, Ordering};
            static CMD_SEQ: AtomicU64 = AtomicU64::new(1);

            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(1_700_000_000_000);
            let seq = CMD_SEQ.fetch_add(1, Ordering::Relaxed);
            let cmd_id = now_ms.saturating_mul(1000).saturating_add(seq % 1000);

            let conn = db_state.conn.lock().map_err(|e| e.to_string())?;

            let mut all_categories: Vec<String> = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT name FROM categories") {
                if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                    for r in rows.flatten() {
                        all_categories.push(r);
                    }
                }
            }

            let only_cats: Option<Vec<String>> = args
                .get("only_categories")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                        .filter(|s| !s.is_empty())
                        .collect()
                });

            let exclude_cats: Option<Vec<String>> = args
                .get("exclude_categories")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                        .filter(|s| !s.is_empty())
                        .collect()
                });

            let matches_cat = |cat: &str, targets: &[String]| -> bool {
                let c_low = cat.trim().to_lowercase();
                let c_stem = c_low.trim_end_matches('s');
                targets.iter().any(|t| {
                    let t_low = t.trim().to_lowercase();
                    let t_stem = t_low.trim_end_matches('s');
                    c_low == t_low || (!c_stem.is_empty() && c_stem == t_stem)
                })
            };

            let computed_disabled_categories: Option<Vec<String>> = if let Some(ref keep) = only_cats {
                Some(
                    all_categories
                        .iter()
                        .filter(|cat| !matches_cat(cat, keep))
                        .cloned()
                        .collect(),
                )
            } else if let Some(ref excl) = exclude_cats {
                let mut matched: Vec<String> = all_categories
                    .iter()
                    .filter(|cat| matches_cat(cat, excl))
                    .cloned()
                    .collect();
                for raw in excl {
                    if !matched.iter().any(|m| m.eq_ignore_ascii_case(raw)) {
                        matched.push(raw.clone());
                    }
                }
                Some(matched)
            } else {
                None
            };

            let cmd_payload = json!({
                "id": cmd_id,
                "page": args.get("page").and_then(|v| v.as_str()),
                "resetFilters": args.get("reset_filters").and_then(|v| v.as_bool()).unwrap_or(false),
                "preset": args.get("preset").and_then(|v| v.as_str()),
                "month": args.get("month").and_then(|v| v.as_str()),
                "startDate": args.get("start_date").and_then(|v| v.as_str()),
                "endDate": args.get("end_date").and_then(|v| v.as_str()),
                "onlyCategories": only_cats,
                "excludeCategories": exclude_cats,
                "disabledCategories": computed_disabled_categories,
                "searchQuery": args.get("search_query").and_then(|v| v.as_str()),
                "transactionType": args.get("transaction_type").and_then(|v| v.as_str()),
                "recurrenceFilter": args.get("recurrence_filter").and_then(|v| v.as_str()),
                "groupBy": args.get("group_by").and_then(|v| v.as_str()),
                "profile": args.get("profile").and_then(|v| v.as_str()),
                "minAmount": args.get("min_amount").and_then(|v| v.as_f64()),
                "maxAmount": args.get("max_amount").and_then(|v| v.as_f64()),
                "forecastMonths": args.get("forecast_months").and_then(|v| v.as_i64()),
                "forecastExtraLoanPayment": args.get("forecast_extra_loan_payment").and_then(|v| v.as_f64()),
                "forecastLoanStrategy": args.get("forecast_loan_strategy").and_then(|v| v.as_str()),
                "forecastSavingsBudget": args.get("forecast_savings_budget").and_then(|v| v.as_f64()),
                "message": args.get("message").and_then(|v| v.as_str()),
            });

            let serialized = serde_json::to_string(&cmd_payload).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('mcp_ui_command', ?1)",
                rusqlite::params![serialized],
            )
            .map_err(|e| e.to_string())?;

            Ok(json!({
                "status": "dispatched",
                "command": cmd_payload
            }))
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

/// Processes a single JSON-RPC 2.0 MCP request object and returns an optional response object
/// (`None` for notifications that do not have an `id`).
pub fn handle_mcp_request(db_state: &DbState, req: &Value) -> Option<Value> {
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let id = req.get("id").cloned();

    // JSON-RPC notifications (no id) do not receive a response
    if id.is_none() || method.starts_with("notifications/") {
        return None;
    }
    let req_id = id.unwrap_or(Value::Null);

    let result: Result<Value, (i64, String)> = match method {
        "initialize" => Ok(json!({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "resources": {},
                "tools": {},
                "prompts": {}
            },
            "serverInfo": {
                "name": "strictly-spending",
                "version": env!("CARGO_PKG_VERSION")
            },
            "instructions": "Strictly Spending personal finance & Schedule C tax MCP server. Read resources under strictly:// for instant overviews, accounts, budgets, loans, and rules, or call tools/prompts to query transactions, recategorize merchants, audit subscriptions, simulate projections, or sync SimpleFIN bank accounts."
        })),
        "ping" => Ok(json!({})),
        "resources/list" => Ok(list_mcp_resources()),
        "resources/read" => {
            let uri = req
                .get("params")
                .and_then(|p| p.get("uri"))
                .and_then(|u| u.as_str())
                .unwrap_or("");
            read_mcp_resource(db_state, uri).map_err(|e| (-32602, e))
        }
        "prompts/list" => Ok(list_mcp_prompts()),
        "prompts/get" => {
            let params = req.get("params").cloned().unwrap_or_else(|| json!({}));
            let prompt_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let prompt_args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            get_mcp_prompt(prompt_name, &prompt_args).map_err(|e| (-32602, e))
        }
        "tools/list" => Ok(list_mcp_tools()),
        "tools/call" => {
            let params = req.get("params").cloned().unwrap_or_else(|| json!({}));
            let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let tool_args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            match execute_mcp_tool(db_state, tool_name, &tool_args) {
                Ok(val) => {
                    let pretty = serde_json::to_string_pretty(&val).unwrap_or_else(|_| val.to_string());
                    Ok(json!({
                        "content": [
                            {
                                "type": "text",
                                "text": pretty
                            }
                        ],
                        "isError": false
                    }))
                }
                Err(err_msg) => Ok(json!({
                    "content": [
                        {
                            "type": "text",
                            "text": format!("Error: {}", err_msg)
                        }
                    ],
                    "isError": true
                })),
            }
        }
        _ => Err((-32601, format!("Method not found: {}", method))),
    };

    Some(match result {
        Ok(res) => json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": res
        }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {
                "code": code,
                "message": message
            }
        }),
    })
}

/// Runs the Model Context Protocol (MCP) JSON-RPC 2.0 server over `stdin`/`stdout`.
pub fn run_mcp_stdio(custom_db_path: Option<PathBuf>) -> Result<(), String> {
    let db_path = resolve_mcp_db_path(custom_db_path);
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let conn = db::init_db(db_path).map_err(|e| e.to_string())?;
    let db_state = DbState {
        conn: Mutex::new(conn),
        recurrence_cache: Mutex::new(None),
    };

    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut reader = stdin.lock();
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break; // EOF
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Support both Content-Length header framing and standard newline-delimited JSON-RPC
        let payload_str = if trimmed.to_ascii_lowercase().starts_with("content-length:") {
            let len: usize = trimmed["content-length:".len()..]
                .trim()
                .parse()
                .unwrap_or(0);
            // Consume empty header separator line(s)
            loop {
                let mut hdr_line = String::new();
                let n = reader.read_line(&mut hdr_line).map_err(|e| e.to_string())?;
                if n == 0 || hdr_line.trim().is_empty() {
                    break;
                }
            }
            let mut buf = vec![0u8; len];
            use std::io::Read;
            reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
            String::from_utf8_lossy(&buf).to_string()
        } else {
            trimmed.to_string()
        };

        let parsed: Value = match serde_json::from_str(&payload_str) {
            Ok(v) => v,
            Err(e) => {
                let err_resp = json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": {
                        "code": -32700,
                        "message": format!("Parse error: {}", e)
                    }
                });
                let out_str = serde_json::to_string(&err_resp).unwrap_or_default();
                let _ = writeln!(stdout, "{}", out_str);
                let _ = stdout.flush();
                continue;
            }
        };

        if let Some(resp) = handle_mcp_request(&db_state, &parsed) {
            let out_str = serde_json::to_string(&resp).map_err(|e| e.to_string())?;
            writeln!(stdout, "{}", out_str).map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn make_test_state() -> DbState {
        let mut conn = Connection::open_in_memory().unwrap();
        db::init_tables(&conn).unwrap();
        db::run_migrations(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO accounts (id, name, type, institution, source, enabled, current_balance)
             VALUES (1, 'Checking', 'checking', 'BoA', 'simplefin', 1, 8500.0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO transactions (id, account_id, date, description, amount, category, source, merchant_key, user_overridden, dedup_key, recurrence)
             VALUES (101, 1, '2026-10-05', 'SHELL OIL 123', -48.50, 'Uncategorized', 'simplefin', 'shelloil', 0, 'dk1', 'none')",
            [],
        )
        .unwrap();
        DbState {
            conn: Mutex::new(conn),
            recurrence_cache: Mutex::new(None),
        }
    }

    #[test]
    fn test_mcp_initialize_and_resources() {
        let state = make_test_state();
        let init_req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        });
        let init_resp = handle_mcp_request(&state, &init_req).unwrap();
        assert_eq!(init_resp["result"]["serverInfo"]["name"], "strictly-spending");

        let read_req = json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "resources/read",
            "params": { "uri": "strictly://summary/overview" }
        });
        let read_resp = handle_mcp_request(&state, &read_req).unwrap();
        let text = read_resp["result"]["contents"][0]["text"].as_str().unwrap();
        let parsed: Value = serde_json::from_str(text).unwrap();
        assert_eq!(parsed["liquidCash"], 8500.0);
        assert_eq!(parsed["uncategorizedTransactionCount"], 1);
    }

    #[test]
    fn test_mcp_categorize_and_query_tools() {
        let state = make_test_state();
        let cat_req = json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "categorize_transactions",
                "arguments": {
                    "category": "Transportation",
                    "merchant_pattern": "shelloil",
                    "create_rule": true
                }
            }
        });
        let cat_resp = handle_mcp_request(&state, &cat_req).unwrap();
        assert_eq!(cat_resp["result"]["isError"], false);

        let q_req = json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "query_transactions",
                "arguments": {
                    "category": "Transportation"
                }
            }
        });
        let q_resp = handle_mcp_request(&state, &q_req).unwrap();
        let body: Value =
            serde_json::from_str(q_resp["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(body["count"], 1);
        assert_eq!(body["totalSpend"], 48.5);
    }

    #[test]
    fn test_mcp_prompts_and_extended_tools() {
        let state = make_test_state();

        // Test prompts/list and prompts/get
        let list_req = json!({
            "jsonrpc": "2.0",
            "id": 10,
            "method": "prompts/list"
        });
        let list_resp = handle_mcp_request(&state, &list_req).unwrap();
        assert!(list_resp["result"]["prompts"].as_array().unwrap().len() >= 4);

        let get_req = json!({
            "jsonrpc": "2.0",
            "id": 11,
            "method": "prompts/get",
            "params": {
                "name": "monthly-financial-review",
                "arguments": { "month": "2026-10" }
            }
        });
        let get_resp = handle_mcp_request(&state, &get_req).unwrap();
        assert!(get_resp["result"]["messages"][0]["content"]["text"]
            .as_str()
            .unwrap()
            .contains("2026-10"));

        // Test manage_rule with retroactive categorization
        let rule_req = json!({
            "jsonrpc": "2.0",
            "id": 12,
            "method": "tools/call",
            "params": {
                "name": "manage_rule",
                "arguments": {
                    "pattern": "shell oil",
                    "category": "Transportation",
                    "apply_retroactively": true
                }
            }
        });
        let rule_resp = handle_mcp_request(&state, &rule_req).unwrap();
        let rule_body: Value =
            serde_json::from_str(rule_resp["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(rule_body["retroactivelyUpdatedTransactions"], 1);

        // Test run_cashflow_projection
        let proj_req = json!({
            "jsonrpc": "2.0",
            "id": 13,
            "method": "tools/call",
            "params": {
                "name": "run_cashflow_projection",
                "arguments": {
                    "months": 6,
                    "base_income": 6000.0,
                    "recurring_budget": 2500.0,
                    "variable_budget": 1500.0
                }
            }
        });
        let proj_resp = handle_mcp_request(&state, &proj_req).unwrap();
        let proj_body: Value =
            serde_json::from_str(proj_resp["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(proj_body["monthsProjected"], 6);
        assert!(proj_body["endingCashBalance"].as_f64().unwrap() > 8500.0);

        // Test control_app_ui
        let ui_req = json!({
            "jsonrpc": "2.0",
            "id": 14,
            "method": "tools/call",
            "params": {
                "name": "control_app_ui",
                "arguments": {
                    "page": "/timeline",
                    "month": "2026-10",
                    "only_categories": ["Food"],
                    "message": "Showing October Food timeline"
                }
            }
        });
        let ui_resp = handle_mcp_request(&state, &ui_req).unwrap();
        assert_eq!(ui_resp["result"]["isError"], false);
        let ui_body: Value =
            serde_json::from_str(ui_resp["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(ui_body["status"], "dispatched");
        assert_eq!(ui_body["command"]["page"], "/timeline");
        assert_eq!(ui_body["command"]["month"], "2026-10");
        assert_eq!(ui_body["command"]["message"], "Showing October Food timeline");

        // Test update_tax_classification + generate_tax_documents
        let tax_cls_req = json!({
            "jsonrpc": "2.0",
            "id": 15,
            "method": "tools/call",
            "params": {
                "name": "update_tax_classification",
                "arguments": {
                    "transaction_ids": [101],
                    "is_business": true,
                    "tax_category": "carTruck"
                }
            }
        });
        let tax_cls_resp = handle_mcp_request(&state, &tax_cls_req).unwrap();
        assert_eq!(tax_cls_resp["result"]["isError"], false);

        let tax_doc_req = json!({
            "jsonrpc": "2.0",
            "id": 16,
            "method": "tools/call",
            "params": {
                "name": "generate_tax_documents",
                "arguments": {
                    "tax_year": 2026
                }
            }
        });
        let tax_doc_resp = handle_mcp_request(&state, &tax_doc_req).unwrap();
        assert_eq!(tax_doc_resp["result"]["isError"], false);
        let tax_doc_body: Value =
            serde_json::from_str(tax_doc_resp["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(tax_doc_body["taxYear"], 2026);
        assert_eq!(tax_doc_body["summary"]["confirmedBusinessDeductible"], 48.5);
        assert!(tax_doc_body["documents"]["scheduleCPnlCsv"]
            .as_str()
            .unwrap()
            .contains("Car & Truck Expenses (Line 9)"));

        // Test get_account_cashflow
        let cf_req = json!({
            "jsonrpc": "2.0",
            "id": 17,
            "method": "tools/call",
            "params": {
                "name": "get_account_cashflow",
                "arguments": {
                    "account_id": 1
                }
            }
        });
        let cf_resp = handle_mcp_request(&state, &cf_req).unwrap();
        assert_eq!(cf_resp["result"]["isError"], false);
        let cf_body: Value =
            serde_json::from_str(cf_resp["result"]["content"][0]["text"].as_str().unwrap())
                .unwrap();
        assert_eq!(cf_body["accounts"].as_array().unwrap().len(), 1);
        assert_eq!(cf_body["accounts"][0]["currentBalance"], 8500.0);
    }
}
