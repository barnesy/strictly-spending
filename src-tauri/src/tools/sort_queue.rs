use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;
use rusqlite::Result;

use crate::db::{DbState, Transaction, CategoryRule, Category};
use crate::tools::recurrence::RecurrenceInfo;

#[derive(Debug, Serialize, Deserialize)]
pub struct SortCard {
    #[serde(rename = "merchantKey")]
    pub merchant_key: String,
    pub txns: Vec<Transaction>,
    #[serde(rename = "totalAbs")]
    pub total_abs: f64,
    #[serde(rename = "sampleTxns")]
    pub sample_txns: Vec<Transaction>,
    pub recurrence: Option<RecurrenceInfo>,
    #[serde(rename = "suggestedCategory")]
    pub suggested_category: Option<String>,
    #[serde(rename = "amountSign")]
    pub amount_sign: String,
}

fn infer_type_category(amount: f64, source: &str, raw_category: Option<&str>) -> Option<String> {
    if (source == "chase" || source == "boa-credit") && amount > 0.0 {
        if raw_category.is_none() || raw_category.unwrap().is_empty() {
            return Some("Transfers".to_string());
        }
    }
    None
}

fn suggest_category(
    txns: &[Transaction],
    merchant_key: &str,
    recurrence: Option<&RecurrenceInfo>,
    parsed_rules: &[(CategoryRule, Vec<String>)],
    valid_category_names: &HashSet<String>,
) -> Option<String> {
    if txns.is_empty() {
        return None;
    }
    let first = &txns[0];

    // 1. infer_type_category
    if let Some(inferred) = infer_type_category(first.amount, &first.source, first.raw_category.as_deref()) {
        if valid_category_names.contains(&inferred) {
            return Some(inferred);
        }
    }

    // 2. Fuzzy keyword match
    let lower_key = merchant_key.to_lowercase();
    let key_tokens: HashSet<&str> = lower_key
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() >= 3)
        .collect();

    if !key_tokens.is_empty() {
        let mut best: Option<&CategoryRule> = None;
        for (rule, tokens) in parsed_rules {
            if tokens.is_empty() {
                continue;
            }
            let all_match = tokens.iter().all(|pt| key_tokens.contains(pt.as_str()));
            if all_match {
                if let Some(b) = best {
                    if rule.priority > b.priority {
                        best = Some(rule);
                    }
                } else {
                    best = Some(rule);
                }
            }
        }
        if let Some(b) = best {
            return Some(b.category.clone());
        }
    }

    // 3. Recurring-amount lean
    if let Some(rec) = recurrence {
        if (rec.kind == "monthly" || rec.kind == "weekly" || rec.kind == "biweekly" || rec.kind == "annual") && rec.mean_amount > 0.0 {
            let amt = rec.mean_amount;
            if rec.kind == "monthly" {
                if amt >= 1000.0 && valid_category_names.contains("Housing") {
                    return Some("Housing".to_string());
                }
                if amt >= 5.0 && amt <= 50.0 && valid_category_names.contains("Subscriptions") {
                    return Some("Subscriptions".to_string());
                }
            }
        }
    }

    None
}

#[tauri::command]
pub fn get_sort_queue(state: State<DbState>, demo_mode: bool) -> Result<Vec<SortCard>, String> {
    let conn = state.conn.lock().unwrap();

    let mut uncategorized: Vec<Transaction> = Vec::new();
    let mut valid_category_names = HashSet::new();
    let mut parsed_rules = Vec::new();

    {
        // Fetch Uncategorized transactions
        let mut stmt = conn.prepare("SELECT id, account_id, date, description, amount, raw_category, category, source, merchant_key, user_overridden, dedup_key, import_batch_id, recurrence, recurrence_override, is_business, tax_category, deduction_status FROM transactions WHERE category = 'Uncategorized'").map_err(|e| e.to_string())?;
        
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

        for tx in tx_iter {
            if let Ok(t) = tx {
                let is_demo = t.source == "demo";
                if demo_mode == is_demo {
                    uncategorized.push(t);
                }
            }
        }

        // Fetch Categories
        let mut cat_stmt = conn.prepare("SELECT id, name, color, type, sort_order, default_recurrence FROM categories").map_err(|e| e.to_string())?;
        let cat_iter = cat_stmt.query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                category_type: row.get(3)?,
                sort_order: row.get(4)?,
                default_recurrence: row.get(5)?,
            })
        }).map_err(|e| e.to_string())?;
        for cat in cat_iter {
            if let Ok(c) = cat {
                valid_category_names.insert(c.name);
            }
        }

        // Fetch Rules
        let mut rules_stmt = conn.prepare("SELECT id, pattern, category, priority, created_at FROM rules").map_err(|e| e.to_string())?;
        let rules_iter = rules_stmt.query_map([], |row| {
            Ok(CategoryRule {
                id: row.get(0)?,
                pattern: row.get(1)?,
                category: row.get(2)?,
                priority: row.get(3)?,
                created_at: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        
        for rule in rules_iter {
            if let Ok(r) = rule {
                if valid_category_names.contains(&r.category) {
                    let lower_pat = r.pattern.to_lowercase();
                    let tokens: Vec<String> = lower_pat
                        .split(|c: char| !c.is_ascii_alphanumeric())
                        .filter(|t| t.len() >= 3)
                        .map(|s| s.to_string())
                        .collect();
                    if !tokens.is_empty() {
                        parsed_rules.push((r, tokens));
                    }
                }
            }
        }
    }

    // Drop lock before calling build_recurrence_map, which also needs a lock.
    drop(conn);

    let recurrence_map = crate::tools::recurrence::build_recurrence_map(state.clone(), demo_mode)
        .map_err(|e| e.to_string())?;

    // Group by merchant_key
    let mut by_key: HashMap<String, Vec<Transaction>> = HashMap::new();
    for t in uncategorized {
        let k = t.merchant_key.clone();
        by_key.entry(k).or_default().push(t);
    }

    let mut cards: Vec<SortCard> = Vec::new();

    for (merchant_key, mut txns) in by_key {
        if txns.is_empty() {
            continue;
        }

        // Newest-first samples
        txns.sort_by(|a, b| b.date.cmp(&a.date));
        let sample_txns = txns.iter().take(10).cloned().collect();

        let total_abs: f64 = txns.iter().map(|t| t.amount.abs()).sum();
        let net_sum: f64 = txns.iter().map(|t| t.amount).sum();
        let amount_sign = if net_sum >= 0.0 { "income".to_string() } else { "spend".to_string() };

        let rec = recurrence_map.get(&merchant_key);
        let suggestion = suggest_category(&txns, &merchant_key, rec, &parsed_rules, &valid_category_names);

        cards.push(SortCard {
            merchant_key,
            txns,
            total_abs,
            sample_txns,
            recurrence: rec.cloned(),
            suggested_category: suggestion,
            amount_sign,
        });
    }

    cards.sort_by(|a, b| b.total_abs.partial_cmp(&a.total_abs).unwrap_or(std::cmp::Ordering::Equal));

    Ok(cards)
}
