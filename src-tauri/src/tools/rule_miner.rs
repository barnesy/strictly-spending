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
pub fn mine_rule_suggestions(state: State<DbState>) -> Result<Vec<RuleSuggestion>, String> {
    let conn = state.conn.lock().unwrap();

    let query = "
        SELECT merchant_key, category, COUNT(*) as cnt, MAX(description) as sample_desc
        FROM transactions
        WHERE user_overridden = 1 
          AND category != 'Uncategorized' 
          AND merchant_key != ''
        GROUP BY merchant_key, category
        HAVING cnt >= 2
        ORDER BY cnt DESC
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let candidate_iter = stmt.query_map([], |row| {
        Ok(RuleSuggestion {
            pattern: row.get(0)?,
            category: row.get(1)?,
            overrides_count: row.get(2)?,
            sample_description: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut candidates = Vec::new();
    for c in candidate_iter {
        candidates.push(c.map_err(|e| e.to_string())?);
    }

    // Now filter out those that already match existing rules
    let rules = crate::db::get_rules(state.clone())?;
    
    let suggestions: Vec<RuleSuggestion> = candidates.into_iter().filter(|candidate| {
        let pattern_lower = candidate.pattern.to_lowercase();
        let has_matching = rules.iter().any(|rule| {
            let rule_pat_lower = rule.pattern.to_lowercase();
            rule_pat_lower == pattern_lower || (pattern_lower.contains(&rule_pat_lower) && rule.category == candidate.category)
        });
        !has_matching
    }).collect();

    Ok(suggestions)
}
