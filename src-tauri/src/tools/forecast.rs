use rusqlite::Result;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use chrono::{Local, NaiveDate, Duration, Datelike};
use tauri::State;
use crate::db::{DbState, Transaction};
use super::recurrence::{build_recurrence_map_internal, RecurrenceInfo};

#[derive(Debug, Serialize, Deserialize)]
pub struct MerchantForecast {
    #[serde(rename = "merchantKey")]
    pub merchant_key: String,
    pub category: String,
    pub kind: String,
    #[serde(rename = "monthlyEstimate")]
    pub monthly_estimate: f64,
    #[serde(rename = "cadenceLabel")]
    pub cadence_label: Option<String>,
    #[serde(rename = "trailingCount")]
    pub trailing_count: Option<usize>,
    #[serde(rename = "lastSeen")]
    pub last_seen: String,
}

const TRAILING_DAYS: i64 = 90;

fn days_ago_iso(days: i64) -> String {
    let today = Local::now().naive_local().date();
    let past = today - Duration::days(days);
    past.format("%Y-%m-%d").to_string()
}

pub fn build_forecast_internal(
    txns: &[Transaction], 
    recurrence_map: &HashMap<String, RecurrenceInfo>,
    categories: &[crate::db::Category]
) -> Vec<MerchantForecast> {
    let spend_category_names: HashSet<String> = categories.iter()
        .filter(|c| c.category_type == "spend")
        .map(|c| c.name.clone())
        .collect();

    let trailing_cutoff = days_ago_iso(TRAILING_DAYS);

    let mut by_merchant: HashMap<String, Vec<&Transaction>> = HashMap::new();
    for t in txns {
        if !t.merchant_key.is_empty() {
            by_merchant.entry(t.merchant_key.clone()).or_default().push(t);
        }
    }

    let mut out = Vec::new();
    for (merchant_key, mut m_txns) in by_merchant {
        m_txns.sort_by(|a, b| a.date.cmp(&b.date));
        let most_recent = m_txns.last().unwrap();
        let category = most_recent.category.clone();

        if !spend_category_names.contains(&category) { continue; }

        let info = recurrence_map.get(&merchant_key);
        let recurring = info.map_or(false, |i| i.kind != "none");

        if recurring {
            let i = info.unwrap();
            if i.est_monthly_cost <= 0.0 { continue; }
            out.push(MerchantForecast {
                merchant_key,
                category,
                kind: "recurring".to_string(),
                monthly_estimate: i.est_monthly_cost,
                cadence_label: Some(i.kind.clone()),
                trailing_count: None,
                last_seen: most_recent.date.clone(),
            });
        } else {
            let trailing: Vec<&Transaction> = m_txns.iter()
                .filter(|t| t.date >= trailing_cutoff && t.amount < 0.0)
                .copied()
                .collect();
            
            if trailing.is_empty() { continue; }
            
            let total: f64 = trailing.iter().map(|t| t.amount.abs()).sum();
            let monthly_estimate = total / 3.0;
            
            if monthly_estimate <= 0.0 { continue; }
            
            out.push(MerchantForecast {
                merchant_key,
                category,
                kind: "variable".to_string(),
                monthly_estimate,
                cadence_label: None,
                trailing_count: Some(trailing.len()),
                last_seen: most_recent.date.clone(),
            });
        }
    }
    
    out
}

#[tauri::command]
pub fn build_forecast(state: State<DbState>, is_demo: bool) -> Result<Vec<MerchantForecast>, String> {
    let txns = crate::db::get_transactions(state.clone(), "1970-01-01".into(), "2099-12-31".into(), None, None, None, None).map_err(|e| e.to_string())?;
    let overrides = crate::db::get_merchant_overrides(state.clone()).map_err(|e| e.to_string())?;
    let categories = crate::db::get_categories(state.clone()).map_err(|e| e.to_string())?;

    let filtered_txns: Vec<Transaction> = txns.into_iter()
        .filter(|t| if is_demo { t.source == "demo" } else { t.source != "demo" })
        .collect();

    let recurrence_map = build_recurrence_map_internal(&filtered_txns, &overrides);
    Ok(build_forecast_internal(&filtered_txns, &recurrence_map, &categories))
}

#[tauri::command]
pub fn last_month_actual_spend(state: State<DbState>, is_demo: bool) -> Result<f64, String> {
    let txns = crate::db::get_transactions(state.clone(), "1970-01-01".into(), "2099-12-31".into(), None, None, None, None).map_err(|e| e.to_string())?;
    let categories = crate::db::get_categories(state.clone()).map_err(|e| e.to_string())?;

    let spend_category_names: HashSet<String> = categories.iter()
        .filter(|c| c.category_type == "spend")
        .map(|c| c.name.clone())
        .collect();

    let today = Local::now().naive_local().date();
    
    // Need prior month bounds. If month is Jan (1), prev is Dec (12) of prior year.
    let (prev_year, prev_month) = if today.month() == 1 {
        (today.year() - 1, 12)
    } else {
        (today.year(), today.month() - 1)
    };
    
    let start_date = NaiveDate::from_ymd_opt(prev_year, prev_month, 1).unwrap();
    
    // End date is last day of prev month.
    let next_month_after_prev = if prev_month == 12 { 1 } else { prev_month + 1 };
    let year_after_prev = if prev_month == 12 { prev_year + 1 } else { prev_year };
    
    let end_date = NaiveDate::from_ymd_opt(year_after_prev, next_month_after_prev, 1).unwrap() - Duration::days(1);
    
    let start_str = start_date.format("%Y-%m-%d").to_string();
    let end_str = end_date.format("%Y-%m-%d").to_string();

    let total: f64 = txns.iter()
        .filter(|t| {
            let correct_source = if is_demo { t.source == "demo" } else { t.source != "demo" };
            correct_source && t.amount < 0.0 && spend_category_names.contains(&t.category) && t.date >= start_str && t.date <= end_str
        })
        .map(|t| t.amount.abs())
        .sum();
        
    Ok(total)
}
