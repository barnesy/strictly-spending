use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;
use crate::db::DbState;

#[derive(Deserialize)]
pub struct QueryDataParams {
    pub start: String,
    pub end: String,
    pub resolved_cats: Vec<String>,
    pub resolved_accts: Vec<i64>,
    pub search_val: Option<String>,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub query_cats: Vec<String>,
}

#[derive(Serialize)]
pub struct MonthlyBreakdown {
    pub month: String, // e.g. "2024-01"
    pub amount: f64,
}

#[derive(Serialize)]
pub struct YearlyBreakdown {
    pub year: String, // e.g. "2024"
    pub amount: f64,
}

#[derive(Serialize)]
pub struct CategoryBreakdown {
    pub category: String,
    pub amount: f64,
}

#[derive(Serialize)]
pub struct RecentTransaction {
    pub date: String,
    pub description: String,
    pub category: String,
    pub amount: f64,
}

#[derive(Serialize)]
pub struct QueryDataResult {
    pub total_spend: f64,
    pub total_income: f64,
    pub spend_count: usize,
    pub income_count: usize,
    pub monthly_breakdown: Vec<MonthlyBreakdown>,
    pub yearly_breakdown: Vec<YearlyBreakdown>,
    pub category_breakdown: Vec<CategoryBreakdown>,
    pub recent_transactions: Vec<RecentTransaction>,
}

#[tauri::command]
pub fn ai_query_data(state: State<DbState>, params: QueryDataParams) -> Result<QueryDataResult, String> {
    let mut txns = crate::db::get_transactions(state.clone(), params.start.clone(), params.end.clone(), None, None, None, None)
        .map_err(|e| e.to_string())?;

    let categories = crate::db::get_categories(state.clone()).map_err(|e| e.to_string())?;
    let mut cat_types = HashMap::new();
    for c in categories {
        cat_types.insert(c.name.to_lowercase(), c.category_type);
    }

    let resolved_cats: HashSet<String> = params.resolved_cats.into_iter().map(|s| s.to_lowercase()).collect();
    let resolved_accts: HashSet<i64> = params.resolved_accts.into_iter().collect();
    let search_lower = params.search_val.as_ref().map(|s| s.to_lowercase());

    let is_cats_all = params.query_cats.contains(&"all".to_string()) || params.query_cats.is_empty();

    txns.retain(|t| {
        if t.date < params.start || t.date > params.end { return false; }
        if !resolved_accts.contains(&t.account_id) { return false; }

        if let Some(ref q) = search_lower {
            if !t.description.to_lowercase().contains(q) && !t.merchant_key.to_lowercase().contains(q) {
                return false;
            }
        }

        if let Some(min_p) = params.min_price {
            if t.amount.abs() < min_p { return false; }
        }
        if let Some(max_p) = params.max_price {
            if t.amount.abs() > max_p { return false; }
        }

        if !is_cats_all && !resolved_cats.contains(&t.category.to_lowercase()) {
            return false;
        }

        true
    });

    let mut total_spend = 0.0;
    let mut total_income = 0.0;
    let mut spend_count = 0;
    let mut income_count = 0;

    let mut cat_spend_map: HashMap<String, f64> = HashMap::new();
    let mut month_map: HashMap<String, f64> = HashMap::new();
    let mut year_map: HashMap<String, f64> = HashMap::new();

    for t in &txns {
        let is_income = t.category.to_lowercase() == "income" || t.amount > 0.0;
        
        if is_income {
            total_income += t.amount;
            income_count += 1;
        } else {
            total_spend += -t.amount;
            spend_count += 1;
        }

        let map_val = if is_income { t.amount } else { -t.amount };
        *cat_spend_map.entry(t.category.clone()).or_insert(0.0) += map_val;

        if !is_income {
            if t.date.len() >= 7 {
                let month_key = t.date[0..7].to_string();
                *month_map.entry(month_key).or_insert(0.0) += -t.amount;
            }
            if t.date.len() >= 4 {
                let year_key = t.date[0..4].to_string();
                *year_map.entry(year_key).or_insert(0.0) += -t.amount;
            }
        }
    }

    let mut monthly_breakdown: Vec<_> = month_map.into_iter().map(|(month, amount)| MonthlyBreakdown { month, amount }).collect();
    let mut yearly_breakdown: Vec<_> = year_map.into_iter().map(|(year, amount)| YearlyBreakdown { year, amount }).collect();
    let mut category_breakdown: Vec<_> = cat_spend_map.into_iter().map(|(category, amount)| CategoryBreakdown { category, amount }).collect();

    monthly_breakdown.sort_by(|a, b| a.month.cmp(&b.month));
    yearly_breakdown.sort_by(|a, b| b.year.cmp(&a.year));
    category_breakdown.sort_by(|a, b| b.amount.partial_cmp(&a.amount).unwrap_or(std::cmp::Ordering::Equal));

    txns.sort_by(|a, b| b.date.cmp(&a.date));
    let recent_transactions = txns.into_iter().take(10).map(|t| RecentTransaction {
        date: t.date,
        description: t.description,
        category: t.category,
        amount: t.amount,
    }).collect();

    Ok(QueryDataResult {
        total_spend,
        total_income,
        spend_count,
        income_count,
        monthly_breakdown,
        yearly_breakdown,
        category_breakdown,
        recent_transactions,
    })
}
