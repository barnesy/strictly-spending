use rusqlite::Result;

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
