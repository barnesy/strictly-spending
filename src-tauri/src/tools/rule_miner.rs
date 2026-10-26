use rusqlite::Result;
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::DbState;

#[derive(Debug, Serialize, Deserialize)]
pub struct RuleSuggestion {
    pub pattern: String,
    pub category: String,
    #[serde(rename = "overridesCount")]
    pub overrides_count: i64,
    #[serde(rename = "sampleDescription")]
    pub sample_description: String,
}

#[tauri::command]
pub fn mine_rule_suggestions(state: State<DbState>, demo_mode: Option<bool>) -> Result<Vec<RuleSuggestion>, String> {
    let is_demo = demo_mode.unwrap_or(false);
    let candidates = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;

        let query = "
            SELECT merchant_key, category, COUNT(*) as cnt, MAX(description) as sample_desc
            FROM transactions
            WHERE user_overridden = 1 
              AND category != 'Uncategorized' 
              AND merchant_key != ''
              AND ((?1 = 1 AND source = 'demo') OR (?1 = 0 AND source != 'demo'))
            GROUP BY merchant_key, category
            HAVING cnt >= 2
            ORDER BY cnt DESC
        ";

        let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
        let demo_flag = if is_demo { 1 } else { 0 };
        let candidate_iter = stmt.query_map([demo_flag], |row| {
            Ok(RuleSuggestion {
                pattern: row.get(0)?,
                category: row.get(1)?,
                overrides_count: row.get(2)?,
                sample_description: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for c in candidate_iter {
            list.push(c.map_err(|e| e.to_string())?);
        }
        list
    };

    // Now filter out those that already match existing rules (conn lock is released above)
    let rules = crate::db::get_rules(state.clone())?;
    let prepared_rules = crate::tools::prepare_rules(&rules);
    
    let suggestions: Vec<RuleSuggestion> = candidates.into_iter().filter(|candidate| {
        if let Some(matched) = crate::tools::match_best_prepared_rule(&candidate.sample_description, &candidate.pattern, &prepared_rules) {
            if matched.category == candidate.category {
                return false;
            }
        }
        let pattern_lower = candidate.pattern.to_lowercase();
        let has_matching = rules.iter().any(|rule| {
            let rule_pat_lower = rule.pattern.to_lowercase();
            rule_pat_lower == pattern_lower || (pattern_lower.contains(&rule_pat_lower) && rule.category == candidate.category)
        });
        !has_matching
    }).collect();

    Ok(suggestions)
}

