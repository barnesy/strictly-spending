use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<Value>,
    pub options: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatResponseChunk {
    pub model: Option<String>,
    pub message: Option<ChatMessage>,
    pub done: Option<bool>,
    pub prompt_eval_count: Option<usize>,
    pub eval_count: Option<usize>,
}

#[tauri::command]
pub async fn run_copilot_chat(
    app: AppHandle,
    model: String,
    messages: Vec<ChatMessage>,
    format: Option<Value>,
    options: Value,
) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let req = ChatRequest {
        model,
        messages,
        stream: true,
        format,
        options,
    };

    let response = client
        .post("http://localhost:11434/api/chat")
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Ollama error: {}", response.status()));
    }

    let mut full_content = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        match chunk_res {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    if let Ok(chunk) = serde_json::from_str::<ChatResponseChunk>(line) {
                        if let Some(msg) = chunk.message {
                            full_content.push_str(&msg.content);
                            let _ = app.emit("llm_chunk", msg.content);
                        }
                        if let Some(true) = chunk.done {
                            let _ = app.emit("llm_done", serde_json::json!({
                                "prompt_eval_count": chunk.prompt_eval_count,
                                "eval_count": chunk.eval_count
                            }));
                        }
                    }
                }
            }
            Err(e) => {
                return Err(e.to_string());
            }
        }
    }

    Ok(full_content)
}
