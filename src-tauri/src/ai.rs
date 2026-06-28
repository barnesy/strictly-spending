use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Value>,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatResponseFull {
    pub model: String,
    pub message: ChatMessage,
    pub done: bool,
    pub prompt_eval_count: Option<usize>,
    pub eval_count: Option<usize>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CopilotChatResult {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
}

#[tauri::command]
pub async fn run_copilot_chat(
    app: AppHandle,
    model: String,
    messages: Vec<ChatMessage>,
    format: Option<Value>,
    tools: Option<Value>,
    options: Value,
    stream: Option<bool>,
) -> Result<CopilotChatResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let is_streaming = stream.unwrap_or(true);

    let req = ChatRequest {
        model,
        messages,
        stream: is_streaming,
        format,
        tools,
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

    if !is_streaming {
        let full_resp = response.json::<ChatResponseFull>().await.map_err(|e| e.to_string())?;
        
        return Ok(CopilotChatResult {
            content: full_resp.message.content,
            tool_calls: full_resp.message.tool_calls,
            thinking: full_resp.message.thinking,
        });
    }

    let mut full_content = String::new();
    let mut full_thinking = String::new();
    let mut collected_tool_calls: Option<Vec<Value>> = None;
    let mut stream_res = response.bytes_stream();
    let mut in_thinking = false;

    while let Some(chunk_res) = stream_res.next().await {
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
                            if let Some(t) = msg.thinking {
                                if !in_thinking {
                                    let _ = app.emit("llm_chunk", "<thinking>\n".to_string());
                                    in_thinking = true;
                                }
                                full_thinking.push_str(&t);
                                let _ = app.emit("llm_chunk", t);
                            } else {
                                if in_thinking {
                                    let _ = app.emit("llm_chunk", "\n</thinking>\n".to_string());
                                    in_thinking = false;
                                }
                                full_content.push_str(&msg.content);
                                let _ = app.emit("llm_chunk", msg.content);
                            }
                            if let Some(tc) = msg.tool_calls {
                                collected_tool_calls = Some(tc);
                            }
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
    
    if in_thinking {
        let _ = app.emit("llm_chunk", "\n</thinking>\n".to_string());
    }

    Ok(CopilotChatResult {
        content: full_content,
        tool_calls: collected_tool_calls,
        thinking: if full_thinking.is_empty() { None } else { Some(full_thinking) },
    })
}
