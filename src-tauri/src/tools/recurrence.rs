use rusqlite::Result;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use chrono::NaiveDate;
use tauri::State;
use crate::db::{DbState, Transaction, MerchantOverride, Category};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurrenceInfo {
    pub kind: String,
    pub count: usize,
    #[serde(rename = "meanIntervalDays")]
    pub mean_interval_days: f64,
    #[serde(rename = "meanAmount")]
    pub mean_amount: f64,
    #[serde(rename = "estMonthlyCost")]
    pub est_monthly_cost: f64,
    #[serde(rename = "lastDate")]
    pub last_date: Option<String>,
    pub source: String,
    #[serde(rename = "lastAmount", skip_serializing_if = "Option::is_none")]
    pub last_amount: Option<f64>,
    #[serde(rename = "priorAmount", skip_serializing_if = "Option::is_none")]
    pub prior_amount: Option<f64>,
    #[serde(rename = "priceHikeDelta", skip_serializing_if = "Option::is_none")]
    pub price_hike_delta: Option<f64>,
    #[serde(rename = "priceHikePct", skip_serializing_if = "Option::is_none")]
    pub price_hike_pct: Option<f64>,
    #[serde(rename = "accountId", skip_serializing_if = "Option::is_none")]
    pub account_id: Option<i64>,
}

impl Default for RecurrenceInfo {
    fn default() -> Self {
        Self {
            kind: "none".to_string(),
            count: 0,
            mean_interval_days: 0.0,
            mean_amount: 0.0,
            est_monthly_cost: 0.0,
            last_date: None,
            source: "auto".to_string(),
            last_amount: None,
            prior_amount: None,
            price_hike_delta: None,
            price_hike_pct: None,
            account_id: None,
        }
    }
}

fn days_between(a: &str, b: &str) -> i64 {
    let date_a = NaiveDate::parse_from_str(a, "%Y-%m-%d").unwrap_or_default();
    let date_b = NaiveDate::parse_from_str(b, "%Y-%m-%d").unwrap_or_default();
    (date_b - date_a).num_days()
}

fn compute_price_hike(spend: &[&Transaction]) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    if spend.is_empty() {
        return (None, None, None, None);
    }
    let last_amt = spend.last().map(|t| t.amount.abs()).unwrap_or(0.0);
    if spend.len() < 2 {
        return (Some(last_amt), None, None, None);
    }
    let prior_start = spend.len().saturating_sub(4);
    let prior_slice = &spend[prior_start..spend.len() - 1];
    if prior_slice.is_empty() {
        return (Some(last_amt), None, None, None);
    }
    let prior_avg = prior_slice.iter().map(|t| t.amount.abs()).sum::<f64>() / prior_slice.len() as f64;
    let delta = last_amt - prior_avg;
    if prior_avg > 1.0 && delta >= 1.0 && (delta / prior_avg) >= 0.03 && (delta / prior_avg) <= 1.5 {
        let pct = (delta / prior_avg) * 100.0;
        (Some(last_amt), Some(prior_avg), Some(delta), Some(pct))
    } else {
        (Some(last_amt), Some(prior_avg), None, None)
    }
}

pub fn detect_recurrence(txns: &[&Transaction]) -> RecurrenceInfo {
    let mut spend: Vec<&Transaction> = txns.iter().filter(|t| t.amount < 0.0).copied().collect();
    spend.sort_by(|a, b| a.date.cmp(&b.date));

    let (last_amount, prior_amount, price_hike_delta, price_hike_pct) = compute_price_hike(&spend);

        if spend.len() < 3 {
        return RecurrenceInfo {
            count: spend.len(),
            last_date: spend.last().map(|t| t.date.clone()),
            account_id: spend.last().map(|t| t.account_id),
            last_amount,
            prior_amount,
            price_hike_delta,
            price_hike_pct,
            ..Default::default()
        };
    }

    let mut intervals = Vec::new();
    for i in 1..spend.len() {
        intervals.push(days_between(&spend[i-1].date, &spend[i].date) as f64);
    }
    
    let mean = intervals.iter().sum::<f64>() / intervals.len() as f64;
    let variance = intervals.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / intervals.len() as f64;
    let stddev = variance.sqrt();

    let mean_amt = spend.iter().map(|t| t.amount.abs()).sum::<f64>() / spend.len() as f64;
    let amt_variance = spend.iter().map(|t| (t.amount.abs() - mean_amt).powi(2)).sum::<f64>() / spend.len() as f64;
    let amt_stddev = amt_variance.sqrt();
    let is_stable_amount = amt_stddev <= (mean_amt * 0.3) + 5.0;

    let mut kind = "none".to_string();
    if is_stable_amount {
        if (25.0..=35.0).contains(&mean) && stddev <= 7.0 { kind = "monthly".to_string(); }
        else if (12.0..=17.0).contains(&mean) && stddev <= 5.0 { kind = "biweekly".to_string(); }
        else if (5.0..=9.0).contains(&mean) && stddev <= 3.0 { kind = "weekly".to_string(); }
        else if (330.0..=400.0).contains(&mean) && stddev <= 40.0 { kind = "annual".to_string(); }
    }

    let recent_spend = if spend.len() >= 3 { &spend[spend.len()-3..] } else { &spend[..] };
    let mean_amount = recent_spend.iter().map(|t| t.amount.abs()).sum::<f64>() / recent_spend.len() as f64;

    let est_monthly_cost = match kind.as_str() {
        "monthly" => mean_amount,
        "biweekly" => mean_amount * (30.0 / 14.0),
        "weekly" => mean_amount * (30.0 / 7.0),
        "annual" => mean_amount / 12.0,
        _ => 0.0,
    };

    RecurrenceInfo {
        kind,
        count: spend.len(),
        mean_interval_days: mean,
        mean_amount,
        est_monthly_cost,
        last_date: Some(spend.last().unwrap().date.clone()),
        source: "auto".to_string(),
        last_amount,
        prior_amount,
        price_hike_delta,
        price_hike_pct,
        account_id: Some(spend.last().unwrap().account_id),
    }
}

pub fn apply_override(auto: RecurrenceInfo, overide: Option<&MerchantOverride>) -> RecurrenceInfo {
    if let Some(o) = overide {
        let kind = o.recurrence.clone();
        let mut est_monthly_cost = auto.est_monthly_cost;
        if kind != auto.kind && auto.mean_amount > 0.0 {
            est_monthly_cost = match kind.as_str() {
                "monthly" => auto.mean_amount,
                "biweekly" => auto.mean_amount * (30.0 / 14.0),
                "weekly" => auto.mean_amount * (30.0 / 7.0),
                "annual" => auto.mean_amount / 12.0,
                "none" => 0.0,
                _ => auto.est_monthly_cost,
            };
        }
        RecurrenceInfo {
            kind,
            est_monthly_cost,
            source: "override".to_string(),
            ..auto
        }
    } else {
        auto
    }
}

pub fn build_recurrence_map_internal(txns: &[Transaction], overrides: &[MerchantOverride]) -> HashMap<String, RecurrenceInfo> {
    let mut by_merchant: HashMap<String, Vec<&Transaction>> = HashMap::new();
    for t in txns {
        if !t.merchant_key.is_empty() {
            by_merchant.entry(t.merchant_key.clone()).or_default().push(t);
        }
    }

    let override_map: HashMap<String, &MerchantOverride> = overrides.iter()
        .map(|o| (o.merchant_key.clone(), o))
        .collect();

    let mut result = HashMap::new();
    for (merchant_key, m_txns) in by_merchant {
        let mut recurring_txns: Vec<&Transaction> = m_txns.iter().filter(|t| t.recurrence == "recurring").copied().collect();
        if recurring_txns.is_empty() { continue; }
        recurring_txns.sort_by(|a, b| a.date.cmp(&b.date));

        let mut spend_txns: Vec<&Transaction> = m_txns.iter().filter(|t| t.amount < 0.0).copied().collect();
        spend_txns.sort_by(|a, b| a.date.cmp(&b.date));
        let auto = detect_recurrence(&spend_txns);
        let mut final_info = apply_override(auto, override_map.get(&merchant_key).copied());

        if final_info.kind == "none" {
            if spend_txns.is_empty() {
                continue;
            }
            final_info.kind = "monthly".to_string();
            let recent_spend = if spend_txns.len() >= 3 { &spend_txns[spend_txns.len()-3..] } else { &spend_txns[..] };
            let mean_amount = recent_spend.iter().map(|t| t.amount.abs()).sum::<f64>() / recent_spend.len() as f64;
            final_info.mean_amount = mean_amount;
            final_info.est_monthly_cost = mean_amount;
        }

        final_info.count = recurring_txns.len();
        let last_txn = spend_txns.last().or_else(|| recurring_txns.last());
        final_info.last_date = last_txn.map(|t| t.date.clone());
        final_info.account_id = last_txn.map(|t| t.account_id);

        result.insert(merchant_key, final_info);
    }

    result
}

#[tauri::command]
pub fn build_recurrence_map(
    state: State<DbState>,
    is_demo: bool,
    account_id: Option<i64>,
) -> Result<HashMap<String, RecurrenceInfo>, String> {
    if !is_demo && account_id.is_none() {
        let cache = state.recurrence_cache.lock().map_err(|e| e.to_string())?;
        if let Some(cached_map) = cache.as_ref() {
            return Ok(cached_map.clone());
        }
    }

    let txns = crate::db::get_transactions(state.clone(), "1970-01-01".into(), "2099-12-31".into(), None, None, account_id, None).map_err(|e| e.to_string())?;
    let overrides = crate::db::get_merchant_overrides(state.clone()).map_err(|e| e.to_string())?;

    let filtered_txns: Vec<Transaction> = txns.into_iter()
        .filter(|t| if is_demo { t.source == "demo" } else { t.source != "demo" })
        .collect();

    let map = build_recurrence_map_internal(&filtered_txns, &overrides);

    if !is_demo && account_id.is_none() {
        let mut cache = state.recurrence_cache.lock().map_err(|e| e.to_string())?;
        *cache = Some(map.clone());
    }

    Ok(map)
}

pub fn resolve_recurrence_for_transaction(
    txn: &Transaction,
    category_map: &HashMap<String, &Category>,
    merchant_override_map: &HashMap<String, &MerchantOverride>,
    auto_recurring_merchant_keys: &HashSet<String>,
) -> String {
    if let Some(ro) = &txn.recurrence_override {
        if ro == "recurring" || ro == "onetime" {
            return ro.clone();
        }
    }

    let mkey = &txn.merchant_key;
    if !mkey.is_empty() {
        if let Some(over) = merchant_override_map.get(mkey) {
            if over.recurrence == "none" || over.recurrence == "onetime" {
                return "onetime".to_string();
            } else {
                return "recurring".to_string();
            }
        }
    }

    if !mkey.is_empty() && auto_recurring_merchant_keys.contains(mkey) {
        return "recurring".to_string();
    }

    if let Some(cat) = category_map.get(&txn.category) {
        if let Some(def_rec) = &cat.default_recurrence {
            return def_rec.clone();
        }
    }

    "onetime".to_string()
}

#[derive(Serialize)]
pub struct RefreshResult {
    pub updated: usize,
}

#[tauri::command]
pub fn refresh_recurrence_all(state: State<DbState>) -> Result<RefreshResult, String> {
    let categories = crate::db::get_categories(state.clone()).map_err(|e| e.to_string())?;
    let overrides = crate::db::get_merchant_overrides(state.clone()).map_err(|e| e.to_string())?;
    let mut txns = crate::db::get_transactions(state.clone(), "1970-01-01".into(), "2099-12-31".into(), None, None, None, None).map_err(|e| e.to_string())?;

    let category_map: HashMap<String, &Category> = categories.iter().map(|c| (c.name.clone(), c)).collect();
    let merchant_override_map: HashMap<String, &MerchantOverride> = overrides.iter().map(|o| (o.merchant_key.clone(), o)).collect();

    let mut by_merchant_real: HashMap<String, Vec<&Transaction>> = HashMap::new();
    let mut by_merchant_demo: HashMap<String, Vec<&Transaction>> = HashMap::new();
    for t in &txns {
        if !t.merchant_key.is_empty() {
            if t.source == "demo" {
                by_merchant_demo.entry(t.merchant_key.clone()).or_default().push(t);
            } else {
                by_merchant_real.entry(t.merchant_key.clone()).or_default().push(t);
            }
        }
    }

    let mut auto_recurring_real = HashSet::new();
    for (mkey, m_txns) in by_merchant_real {
        if detect_recurrence(&m_txns).kind != "none" {
            auto_recurring_real.insert(mkey);
        }
    }

    let mut auto_recurring_demo = HashSet::new();
    for (mkey, m_txns) in by_merchant_demo {
        if detect_recurrence(&m_txns).kind != "none" {
            auto_recurring_demo.insert(mkey);
        }
    }

    let mut updated = 0;
    let mut txs_to_update = Vec::new();

    for t in &mut txns {
        let auto_keys = if t.source == "demo" { &auto_recurring_demo } else { &auto_recurring_real };
        let resolved = resolve_recurrence_for_transaction(
            t,
            &category_map,
            &merchant_override_map,
            auto_keys,
        );
        if t.recurrence != resolved {
            t.recurrence = resolved;
            txs_to_update.push(t.clone());
            updated += 1;
        }
    }

    if !txs_to_update.is_empty() {
        crate::db_mut::bulk_update_transactions(state.clone(), txs_to_update).map_err(|e| e.to_string())?;
    }

    Ok(RefreshResult { updated })
}

