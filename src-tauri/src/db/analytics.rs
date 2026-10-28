use rusqlite::Result;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardFilters {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub enabled_account_ids: Option<Vec<i64>>,
    pub disabled_categories: Option<Vec<String>>,
    pub spend_only: Option<bool>,
    pub transaction_type: Option<String>,
    pub recurrence_filter: Option<String>,
    pub search_query: Option<String>,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub sort_by: Option<String>,
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
        if !ids.is_empty() {
            let mut placeholders = Vec::new();
            for id in ids {
                params.push(rusqlite::types::Value::Integer(*id));
                placeholders.push(format!("?{}", params.len()));
            }
            sql.push_str(&format!(" AND account_id IN ({})", placeholders.join(",")));
        } else {
            sql.push_str(" AND 1 = 0");
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

    if let Some(ref t_type) = filters.transaction_type {
        match t_type.as_str() {
            "income" => {
                sql.push_str(" AND (category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer')))");
            }
            "spend" => {
                sql.push_str(" AND amount < 0");
                sql.push_str(" AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income'))");
            }
            "transfer" => {
                sql.push_str(" AND category IN (SELECT name FROM categories WHERE type = 'transfer')");
            }
            "all" => {}
            _ => {}
        }
    } else if let Some(spend) = filters.spend_only {
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let order_clause = match filters.sort_by.as_deref() {
        Some("date_asc") => "date ASC, id ASC",
        Some("amount_desc") => "ABS(amount) DESC, date DESC",
        Some("amount_asc") => "ABS(amount) ASC, date DESC",
        _ => "date DESC, id DESC",
    };

    let query = format!(
        "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status, is_pending 
         FROM transactions 
         WHERE {} 
         ORDER BY {} 
         LIMIT {} OFFSET {}",
        where_clause, order_clause, limit, offset
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let tx_iter = stmt.query_map(rusqlite::params_from_iter(params), crate::db::row_to_transaction).map_err(|e| e.to_string())?;

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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    let mut base_filters = filters.clone();
    base_filters.spend_only = Some(false);
    base_filters.transaction_type = None;

    let mut summary_params = Vec::new();
    let base_where = build_dashboard_where_clause(&base_filters, &mut summary_params);
    let summary_query = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN amount < 0 AND category NOT IN (SELECT name FROM categories WHERE type IN ('transfer', 'income')) THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer')) THEN amount ELSE 0 END), 0)
         FROM transactions
         WHERE {}",
        base_where
    );
    let (total_spend, total_income): (f64, f64) = conn
        .query_row(&summary_query, rusqlite::params_from_iter(summary_params), |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap_or((0.0, 0.0));

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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let is_income = filters.transaction_type.as_deref() == Some("income");
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let order_clause = if is_income { "ORDER BY total DESC" } else { "ORDER BY total ASC" };

    let query = format!(
        "SELECT merchant_key, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt 
         FROM transactions 
         WHERE {} 
         GROUP BY merchant_key 
         {} 
         LIMIT 100",
        where_clause, order_clause
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
    for m in iter.flatten() {
        if is_income {
            if m.total > 0.0 {
                results.push(m);
            }
        } else {
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&filters, &mut params);
    
    let group_col = match group_by.as_str() {
        "account" => "CAST(account_id AS TEXT)",
        "merchant" => "merchant_key",
        "recurrence" => "recurrence",
        "all" => "'all'",
        _ => "category",
    };

    let amount_condition = if filters.transaction_type.as_deref() == Some("income") || filters.transaction_type.as_deref() == Some("all") {
        ""
    } else {
        "amount < 0 AND "
    };

    let query = format!(
        "SELECT strftime('%Y-%m', date) as month, COALESCE({}, '') as key, COALESCE(SUM(amount), 0) as total 
         FROM transactions 
         WHERE {}{} 
         GROUP BY month, key",
        group_col, amount_condition, where_clause
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut income_filters = filters.clone();
    income_filters.spend_only = Some(false);
    income_filters.transaction_type = None;
    let mut params = Vec::new();
    let where_clause = build_dashboard_where_clause(&income_filters, &mut params);
    
    let query = format!(
        "SELECT strftime('%Y-%m', date) as month, 'income' as key, COALESCE(SUM(amount), 0) as total 
         FROM transactions 
         WHERE (category IN (SELECT name FROM categories WHERE type = 'income') OR (amount > 0 AND category NOT IN (SELECT name FROM categories WHERE type = 'transfer'))) AND {} 
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
    account_id: Option<i64>,
) -> Result<Vec<ConsolidatedMerchant>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    let today = chrono::Local::now().naive_local().date();
    let cutoff = today - chrono::Duration::days(60);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    
    let source_clause = if is_demo { "source = 'demo'" } else { "source != 'demo'" };
    let account_clause = if let Some(aid) = account_id {
        format!("AND account_id = {}", aid)
    } else {
        String::new()
    };
    let query = format!(
        "SELECT merchant_key, category, SUM(ABS(amount)) as total, COUNT(*) as count
         FROM transactions
         WHERE {}
           {}
           AND date >= ?1
           AND amount < 0
           AND COALESCE(recurrence_override, recurrence, 'recurring') != 'onetime'
           AND category IN (SELECT name FROM categories WHERE default_recurrence = 'recurring')
         GROUP BY merchant_key, category",
        source_clause, account_clause
    );
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![cutoff_str], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for (merchant_key, category, total, count) in rows.flatten() {
        let count_f64 = if count > 0 { count as f64 } else { 1.0 };
        results.push(ConsolidatedMerchant {
            merchant_key,
            category,
            monthly_average: total / count_f64,
        });
    }
    
    results.sort_by(|a, b| b.monthly_average.partial_cmp(&a.monthly_average).unwrap_or(std::cmp::Ordering::Equal));
    
    Ok(results)
}

#[tauri::command]
pub fn get_category_trailing_averages(
    state: tauri::State<crate::db::DbState>,
    is_demo: bool,
    account_id: Option<i64>,
) -> Result<Vec<CategoryTrailingAvg>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
    let today = chrono::Local::now().naive_local().date();
    let cutoff = today - chrono::Duration::days(90);
    let cutoff_str = cutoff.format("%Y-%m-%d").to_string();
    
    let source_clause = if is_demo { "source = 'demo'" } else { "source != 'demo'" };
    let account_clause = if let Some(aid) = account_id {
        format!("AND account_id = {}", aid)
    } else {
        String::new()
    };
    let query = format!(
        "SELECT category, SUM(ABS(amount)) as total
         FROM transactions
         WHERE {}
           {}
           AND date >= ?1
           AND amount < 0
           AND category IN (SELECT name FROM categories WHERE type = 'spend')
         GROUP BY category",
        source_clause, account_clause
    );
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![cutoff_str], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
        ))
    }).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for (category, total) in rows.flatten() {
        results.push(CategoryTrailingAvg {
            category,
            average: total / 3.0,
        });
    }
    
    Ok(results)
}

#[tauri::command]
pub fn get_unique_merchants(
    state: tauri::State<crate::db::DbState>,
    is_demo: bool,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let query = if is_demo {
        "SELECT DISTINCT merchant_key FROM transactions WHERE source = 'demo' AND merchant_key != '' ORDER BY merchant_key ASC"
    } else {
        "SELECT DISTINCT merchant_key FROM transactions WHERE source != 'demo' AND merchant_key != '' ORDER BY merchant_key ASC"
    };
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    
    let mut results = Vec::new();
    for m in rows.flatten() {
        results.push(m);
    }
    Ok(results)
}

#[tauri::command]
pub fn get_transaction_bounds(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<(Option<String>, Option<String>), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let query = if demo_mode {
        "SELECT COUNT(*) FROM transactions WHERE category = 'Uncategorized' AND source = 'demo'"
    } else {
        "SELECT COUNT(*) FROM transactions WHERE category = 'Uncategorized' AND source != 'demo'"
    };
    let count: i64 = conn.query_row(query, [], |row| row.get(0)).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn get_category_transaction_counts(
    state: tauri::State<crate::db::DbState>,
    demo_mode: bool,
) -> Result<std::collections::HashMap<String, i64>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
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
    let (rules, grouped_txs) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;

        let mut rules_stmt = conn
            .prepare("SELECT id, pattern, category, priority FROM rules ORDER BY priority DESC")
            .map_err(|e| e.to_string())?;
        let rules_iter = rules_stmt
            .query_map([], |row| {
                Ok(crate::db::CategoryRule {
                    id: row.get(0)?,
                    pattern: row.get(1)?,
                    category: row.get(2)?,
                    priority: row.get(3)?,
                    created_at: String::new(),
                })
            })
            .map_err(|e| e.to_string())?;

        let mut rules = Vec::new();
        for r in rules_iter {
            rules.push(r.map_err(|e| e.to_string())?);
        }

        let tx_query = if demo_mode {
            "SELECT description, COALESCE(merchant_key, ''), COUNT(*) FROM transactions WHERE source = 'demo' GROUP BY description, COALESCE(merchant_key, '')"
        } else {
            "SELECT description, COALESCE(merchant_key, ''), COUNT(*) FROM transactions WHERE source != 'demo' GROUP BY description, COALESCE(merchant_key, '')"
        };

        let mut tx_stmt = conn.prepare(tx_query).map_err(|e| e.to_string())?;
        let tx_iter = tx_stmt
            .query_map([], |row| {
                let desc: String = row.get(0)?;
                let mkey: String = row.get(1)?;
                let cnt: i64 = row.get(2)?;
                Ok((desc, mkey, cnt))
            })
            .map_err(|e| e.to_string())?;

        let mut grouped_txs = Vec::new();
        for tx in tx_iter {
            grouped_txs.push(tx.map_err(|e| e.to_string())?);
        }

        (rules, grouped_txs)
    };

    let mut stats = std::collections::HashMap::with_capacity(rules.len());
    for r in &rules {
        stats.insert(r.id.unwrap_or(0), 0i64);
    }

    let prepared_rules = crate::tools::prepare_rules(&rules);

    for (desc, mkey, tx_count) in grouped_txs {
        if let Some(best) = crate::tools::match_best_prepared_rule(&desc, &mkey, &prepared_rules) {
            if let Some(count) = stats.get_mut(&best.id.unwrap_or(0)) {
                *count += tx_count;
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
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePreviewResult {
    pub total_matches: i64,
    pub affected_count: i64,
    pub sample_transactions: Vec<crate::db::Transaction>,
}

#[tauri::command]
pub fn preview_rule_matches(
    state: tauri::State<crate::db::DbState>,
    pattern: String,
    category: String,
    demo_mode: bool,
) -> Result<RulePreviewResult, String> {
    let norm = crate::tools::normalize_for_match(&pattern);
    if norm.is_empty() {
        return Ok(RulePreviewResult {
            total_matches: 0,
            affected_count: 0,
            sample_transactions: Vec::new(),
        });
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let query = if demo_mode {
        "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE source = 'demo' ORDER BY date DESC, id DESC"
    } else {
        "SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE source != 'demo' ORDER BY date DESC, id DESC"
    };

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let tx_iter = stmt
        .query_map([], crate::db::row_to_transaction)
        .map_err(|e| e.to_string())?;

    let mut total_matches = 0i64;
    let mut affected_count = 0i64;
    let mut sample_transactions = Vec::with_capacity(5);

    for tx_res in tx_iter {
        let tx = tx_res.map_err(|e| e.to_string())?;
        let desc_norm = crate::tools::normalize_for_match(&tx.description);
        let mkey_norm = crate::tools::normalize_for_match(&tx.merchant_key);
        let matched = (!desc_norm.is_empty() && crate::tools::matches_normalized_rule(&desc_norm, &norm))
            || (!mkey_norm.is_empty() && crate::tools::matches_normalized_rule(&mkey_norm, &norm));
        if matched {
            total_matches += 1;
            if tx.category != category {
                affected_count += 1;
            }
            if sample_transactions.len() < 5 {
                sample_transactions.push(tx);
            }
        }
    }

    Ok(RulePreviewResult {
        total_matches,
        affected_count,
        sample_transactions,
    })
}

fn normalize_raw_category_rust(raw: Option<&str>) -> Option<&'static str> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        return None;
    }
    match trimmed {
        "Bills & Utilities" | "Utilities" | "Electricity" | "Other utilities" | "Phone/Cable" | "Internet" => Some("Utilities"),
        "Entertainment" | "Amusement and Entertainment" | "Digital entertainment" | "Movies music & shows" | "Attractions" => Some("Entertainment"),
        "Fees & Adjustments" | "Other fees and charges" => Some("Fees & Interest"),
        "Shopping" | "Home" | "Gifts & Donations" | "Professional Services" | "Education" | "Business Services" | "Mail Order/Telephone Order Providers" | "Wholesale Distributors & Manufacturers" | "Household" | "Family" | "Business" | "Hobbies & gifts" | "Clothing shoes & accessories" | "Department & discount stores" | "Furniture" | "Jewelry" | "Other shopping" | "Cleaning" | "Hardware & appliances" | "Gardening" | "Children's clothing stores" | "Photography publishing & printing" | "Electronics & computers" | "Merchandise" | "Other Services" => Some("Shopping"),
        "Food & Drink" | "Eating Places, Restaurants" | "Restaurants" | "Dining & Entertainment" | "Fast food" | "Cafes & coffee shops" | "Bars & pubs" | "Dining" => Some("Restaurants & Coffee"),
        "Gas" | "Automotive" | "Transportation" | "Service Stations" | "Auto" | "Gas stations" | "Vehicle operating expenses" | "Vehicle dealers" | "Parking & tolls" | "Gas/Automotive" => Some("Transportation"),
        "Groceries" | "Supermarket grocery & convenience stores" | "Liquor stores" | "Supermarkets" => Some("Groceries"),
        "Travel" | "Hotels resorts & lodgings" | "Airlines" | "Airfare" | "Lodging" | "Other Travel" => Some("Travel"),
        "Health & Wellness" | "Health" | "Fitness & leisure" | "Drugs & pharmacy" | "Medical & healthcare" | "Healthcare" | "Medical Services" => Some("Health"),
        "Personal" | "Beauty products" => Some("Personal Care"),
        "Insurance" | "Special insurance" => Some("Insurance"),
        "Loans" | "Student loans" => Some("Student Loans"),
        "Deposits" | "Paychecks" | "Awards and Rebate Credits" => Some("Income"),
        "Transfers & Payments" | "Cash & Checks" | "Transfers between own accounts" | "P2P" | "Digital wallet" | "Cash withdrawals" | "Payment/Credit" | "Payments and Credits" | "Payment" => Some("Transfers"),
        "Taxes & Fees" | "Government services" | "Taxes fines & bail bonds" => Some("Taxes"),
        "Other" => Some("Uncategorized"),
        _ => None,
    }
}

#[tauri::command]
pub fn recategorize_all(
    state: tauri::State<crate::db::DbState>,
    force_user_rules: Option<bool>,
) -> Result<usize, String> {
    let force_user = force_user_rules.unwrap_or(true);
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let rules = {
        let mut stmt = conn
            .prepare("SELECT id, pattern, category, priority, created_at FROM rules")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok(crate::db::CategoryRule {
                    id: row.get(0)?,
                    pattern: row.get(1)?,
                    category: row.get(2)?,
                    priority: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in iter {
            out.push(r.map_err(|e| e.to_string())?);
        }
        out
    };

    let prepared_rules = crate::tools::prepare_rules(&rules);

    let candidates: Vec<(i64, String, String, Option<String>, f64, String, String, bool, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.description, COALESCE(t.merchant_key, ''), t.raw_category, t.amount, t.source, t.category, COALESCE(t.user_overridden, 0), COALESCE(a.type, '')
                 FROM transactions t
                 LEFT JOIN accounts a ON a.id = t.account_id",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i32>(7)? != 0,
                    row.get::<_, String>(8)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in iter {
            out.push(r.map_err(|e| e.to_string())?);
        }
        out
    };

    let mut updates: Vec<(i64, String)> = Vec::new();
    for (id, desc, mkey, raw_cat, amount, source, curr_cat, user_overridden, acc_type) in candidates {
        let best_rule = crate::tools::match_best_prepared_rule(&desc, &mkey, &prepared_rules);
        let mut new_cat = if let Some(rule) = best_rule {
            rule.category.clone()
        } else if let Some(mapped) = normalize_raw_category_rust(raw_cat.as_deref()) {
            mapped.to_string()
        } else if (source == "chase" || source == "boa-credit" || acc_type == "credit") && amount > 0.0 && raw_cat.is_none() {
            "Transfers".to_string()
        } else {
            "Uncategorized".to_string()
        };

        if user_overridden {
            if force_user {
                if let Some(rule) = best_rule {
                    if rule.priority >= 1000 {
                        new_cat = rule.category.clone();
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }
            } else {
                continue;
            }
        }

        if new_cat != curr_cat {
            updates.push((id, new_cat));
        }
    }

    if updates.is_empty() {
        return Ok(0);
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut updated_count = 0usize;
    {
        let mut update_stmt = tx
            .prepare("UPDATE transactions SET category = ?1 WHERE id = ?2")
            .map_err(|e| e.to_string())?;
        for (id, cat) in &updates {
            updated_count += update_stmt
                .execute(rusqlite::params![cat, id])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    if let Ok(mut cache) = state.recurrence_cache.lock() {
        *cache = None;
    }

    Ok(updated_count)
}

