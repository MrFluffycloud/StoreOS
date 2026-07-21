use crate::database::connection::DbState;
use crate::repositories::settings::SettingsRepository;
use tauri::{State, Emitter};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIPayload {
    model: String,
    messages: Vec<OpenAIMessage>,
    stream: bool,
}

#[tauri::command]
pub async fn call_gemini(
    window: tauri::Window,
    state: State<'_, DbState>,
    contents_json: String,
    system_instruction: Option<String>,
) -> Result<String, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // Retrieve model from settings or default to gpt-4.1
    let mut model = SettingsRepository::get(&conn, "gemini_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gpt-4.1".to_string());
    
    if model.trim().is_empty() || model.starts_with("gemini") {
        model = "gpt-4.1".to_string();
    }

    // 1. Parse incoming Gemini contents JSON
    let contents: Vec<GeminiContent> = if contents_json.trim().starts_with('[') {
        serde_json::from_str(&contents_json)
            .map_err(|e| format!("Failed to parse contents JSON: {}", e))?
    } else {
        vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart { text: contents_json }],
        }]
    };

    // 2. Map payload structure to standard OpenAI format
    let mut messages = Vec::new();
    if let Some(sys) = system_instruction {
        if !sys.trim().is_empty() {
            messages.push(OpenAIMessage {
                role: "system".to_string(),
                content: sys,
            });
        }
    }

    for item in contents {
        let role = if item.role == "model" || item.role == "assistant" || item.role == "bot" { 
            "assistant" 
        } else { 
            "user" 
        };
        let content = item.parts.iter().map(|p| p.text.clone()).collect::<Vec<_>>().join("\n");
        messages.push(OpenAIMessage {
            role: role.to_string(),
            content,
        });
    }

    let payload = OpenAIPayload {
        model,
        messages,
        stream: true, // Enable streaming
    };

    // 3. Make POST request to g4f.space completions API with timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let url = "https://g4f.space/v1/chat/completions";

    let mut response = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("AI Advisor service request failed (Network or Host Offline): {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("AI Advisor service returned status {}: {}", status, err_text));
    }

    // 4. Stream response and emit chunks to frontend
    let mut full_text = String::new();
    let mut buffer = String::new();

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if let Ok(chunk_str) = std::str::from_utf8(&chunk) {
            buffer.push_str(chunk_str);
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();
                
                if line.starts_with("data: ") {
                    let data_str = line["data: ".len()..].trim();
                    if data_str == "[DONE]" {
                        break;
                    }
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str) {
                        if let Some(content) = val["choices"][0]["delta"]["content"].as_str() {
                            full_text.push_str(content);
                            // Emit the chunk to the frontend via event emitter
                            let _ = window.emit("ai-chunk", content);
                        }
                    }
                }
            }
        }
    }

    // If for some reason the stream yielded nothing, try to parse the buffer as standard JSON (fallback)
    if full_text.trim().is_empty() {
        if let Ok(res_json) = serde_json::from_str::<serde_json::Value>(&buffer) {
            if let Some(content) = res_json["choices"][0]["message"]["content"].as_str() {
                full_text = content.to_string();
            }
        }
    }

    Ok(full_text)
}

#[tauri::command]
pub async fn list_ai_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = "https://g4f.space/v1/models";
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request to list models failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(vec![
            "gpt-4.1".to_string(),
            "gpt-4.1-mini".to_string(),
            "deepseek-v3".to_string(),
        ]);
    }

    let res_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models JSON: {}", e))?;

    let mut model_names = Vec::new();
    if let Some(data) = res_json["data"].as_array() {
        for m in data {
            if let Some(id) = m["id"].as_str() {
                model_names.push(id.to_string());
            }
        }
    }

    if model_names.is_empty() {
        model_names = vec![
            "gpt-4.1".to_string(),
            "gpt-4.1-mini".to_string(),
            "deepseek-v3".to_string(),
        ];
    }

    Ok(model_names)
}
