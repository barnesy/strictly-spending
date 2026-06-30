use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use crate::db::DbState;
use crate::db::settings::AppSetting;

#[derive(Serialize, Deserialize)]
pub struct CategorizeResult {
    pub processed_count: usize,
    pub report_id: String,
    pub interrupted: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProposedItem {
    #[serde(rename = "transactionId")]
    pub transaction_id: i64,
    pub description: String,
    pub amount: f64,
    pub date: String,
    #[serde(rename = "originalCategory")]
    pub original_category: String,
    #[serde(rename = "proposedCategory")]
    pub proposed_category: String,
    pub approved: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PendingReport {
    pub id: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub items: Vec<ProposedItem>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    message: Option<OllamaMessage>,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct LlmParsedResult {
    results: Option<Vec<String>>,
}

fn parse_llm_content(content: &str) -> Option<Vec<String>> {
    // Attempt direct parse
    if let Ok(data) = serde_json::from_str::<LlmParsedResult>(content) {
        if let Some(res) = data.results {
            return Some(res);
        }
    }
    // Attempt extracting markdown JSON block
    if let Some(start) = content.find("```json") {
        let block = &content[start + 7..];
        if let Some(end) = block.find("```") {
            let json_str = &block[..end];
            if let Ok(data) = serde_json::from_str::<LlmParsedResult>(json_str) {
                if let Some(res) = data.results {
                    return Some(res);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn ai_categorize_transactions(
    state: State<'_, DbState>,
    demo_mode: bool,
    model_name: String,
) -> Result<CategorizeResult, String> {
    // Get all uncategorized transactions
    let mut txns = crate::db::get_transactions(
        state.clone(), 
        "1900-01-01".to_string(), 
        "2100-01-01".to_string(), 
        Some("Uncategorized".to_string()), 
        None, None, None
    ).map_err(|e| e.to_string())?;

    if demo_mode {
        txns.retain(|t| t.source == "demo");
    } else {
        txns.retain(|t| t.source != "demo");
    }

    if txns.is_empty() {
        return Ok(CategorizeResult {
            processed_count: 0,
            report_id: String::new(),
            interrupted: false,
        });
    }

    let categories = crate::db::get_categories(state.clone()).map_err(|e| e.to_string())?;
    let cat_names: Vec<String> = categories.into_iter().map(|c| c.name).collect();

    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let chunk_size = 12;
    let mut proposed_items = Vec::new();
    let report_id = format!("report-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis());
    let mut interrupted = false;

    for chunk in txns.chunks(chunk_size) {
        // Construct prompt
        let mut prompt = format!(
            "You are a financial categorization auditor running locally.\n\
            Review the following transaction descriptions and the category assigned to them by a simple rule engine.\n\
            Respond with a JSON object containing a \"results\" array of strings, where each string is the BEST category for the transaction at the exact same index.\n\
            You MUST choose from the following Available Categories EXACTLY (do not invent new ones):\n"
        );
        for c in &cat_names {
            prompt.push_str(&format!("- {}\n", c));
        }
        prompt.push_str("\nTransactions:\n");
        
        for (i, t) in chunk.iter().enumerate() {
            prompt.push_str(&format!("{}. Desc: \"{}\" | Rule Guessed: \"{}\"\n", i + 1, t.description, t.category));
        }

        prompt.push_str(
            "\nExample valid JSON output:\n\
            {\n  \"results\": [\"Dining\", \"Transportation\", \"Shopping\"]\n}\n"
        );

        let req_body = json!({
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "format": "json",
            "stream": false,
            "options": { "temperature": 0.1 }
        });

        let response = match client.post("http://localhost:11434/api/chat")
            .json(&req_body)
            .send()
            .await 
        {
            Ok(r) => r,
            Err(_) => {
                interrupted = true;
                break;
            }
        };

        if !response.status().is_success() {
            interrupted = true;
            break;
        }

        let text = response.text().await.unwrap_or_default();
        let parsed_resp: OllamaResponse = match serde_json::from_str(&text) {
            Ok(data) => data,
            Err(_) => {
                interrupted = true;
                break;
            }
        };

        let content = parsed_resp.message.and_then(|m| m.content).unwrap_or_else(|| "{\"results\":[]}".to_string());
        
        if let Some(results) = parse_llm_content(&content) {
            if results.len() == chunk.len() {
                for (i, res) in results.into_iter().enumerate() {
                    let val = res.trim().to_string();
                    if val != "Uncategorized" && cat_names.contains(&val) {
                        proposed_items.push(ProposedItem {
                            transaction_id: chunk[i].id.unwrap_or(0),
                            description: chunk[i].description.clone(),
                            amount: chunk[i].amount,
                            date: chunk[i].date.clone(),
                            original_category: chunk[i].category.clone(),
                            proposed_category: val,
                            approved: true,
                        });
                    }
                }
            }
        }

        // Save report progressively
        if !proposed_items.is_empty() {
            let report = PendingReport {
                id: report_id.clone(),
                created_at: format!("{:?}", SystemTime::now()),
                items: proposed_items.clone(),
            };
            
            let setting = AppSetting {
                key: "app:pendingCategorizationReport".to_string(),
                value: serde_json::to_value(&report).unwrap_or(json!({})),
            };

            let _ = crate::db::settings::put_setting(state.clone(), setting);
        }
    }

    Ok(CategorizeResult {
        processed_count: proposed_items.len(),
        report_id,
        interrupted,
    })
}
