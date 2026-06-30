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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<String>>,
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

#[derive(Deserialize, Debug)]
struct OpenAiChatChunk {
    choices: Option<Vec<OpenAiChoiceDelta>>,
}

#[derive(Deserialize, Debug)]
struct OpenAiChoiceDelta {
    delta: Option<OpenAiDelta>,
}

#[derive(Deserialize, Debug)]
struct OpenAiDelta {
    content: Option<String>,
    tool_calls: Option<Vec<Value>>,
}

#[derive(Deserialize, Debug)]
struct OpenAiFullResponse {
    choices: Option<Vec<OpenAiFullChoice>>,
}

#[derive(Deserialize, Debug)]
struct OpenAiFullChoice {
    message: Option<OpenAiFullMessage>,
}

#[derive(Deserialize, Debug)]
struct OpenAiFullMessage {
    content: Option<String>,
    tool_calls: Option<Vec<Value>>,
}

#[tauri::command]
pub async fn run_gemini_chat(
    app: AppHandle,
    model: String,
    messages: Vec<ChatMessage>,
    api_key: String,
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

    let mut req_body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": is_streaming,
    });

    if let Some(f) = format {
        req_body["response_format"] = f;
    }
    if let Some(t) = tools {
        req_body["tools"] = t;
    }
    
    // Extract temperature from options
    if let Some(temp) = options.get("temperature") {
        req_body["temperature"] = temp.clone();
    }

    let response = client
        .post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&req_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error: {}", err_text));
    }

    if !is_streaming {
        let full_resp = response.json::<OpenAiFullResponse>().await.map_err(|e| e.to_string())?;
        
        let mut content = String::new();
        let mut tool_calls = None;
        
        if let Some(choices) = full_resp.choices {
            if let Some(choice) = choices.into_iter().next() {
                if let Some(msg) = choice.message {
                    content = msg.content.unwrap_or_default();
                    tool_calls = msg.tool_calls;
                }
            }
        }
        
        return Ok(CopilotChatResult {
            content,
            tool_calls,
            thinking: None,
        });
    }

    let mut full_content = String::new();
    let mut collected_tool_calls: Option<Vec<Value>> = None;
    let mut stream_res = response.bytes_stream();

    while let Some(chunk_res) = stream_res.next().await {
        match chunk_res {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    let line = line.trim();
                    if line.starts_with("data: ") {
                        let json_str = &line[6..];
                        if json_str == "[DONE]" {
                            continue;
                        }
                        if let Ok(chunk) = serde_json::from_str::<OpenAiChatChunk>(json_str) {
                            if let Some(choices) = chunk.choices {
                                if let Some(choice) = choices.into_iter().next() {
                                    if let Some(delta) = choice.delta {
                                        if let Some(c) = delta.content {
                                            full_content.push_str(&c);
                                            let _ = app.emit("llm_chunk", c);
                                        }
                                        if let Some(tc) = delta.tool_calls {
                                            collected_tool_calls = Some(tc);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                return Err(e.to_string());
            }
        }
    }
    
    let _ = app.emit("llm_done", serde_json::json!({}));

    Ok(CopilotChatResult {
        content: full_content,
        tool_calls: collected_tool_calls,
        thinking: None,
    })
}
