use crate::database::connection::DbState;
use crate::repositories::settings::SettingsRepository;
use tauri::State;
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
struct GeminiPayload {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "systemInstruction")]
    system_instruction: Option<GeminiSystemInstruction>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[tauri::command]
pub async fn call_gemini(
    state: State<'_, DbState>,
    contents_json: String,
    system_instruction: Option<String>,
) -> Result<String, String> {
    let conn = state.pool.get().map_err(|e| e.to_string())?;
    
    // 1. Retrieve the Gemini API key from database settings
    let mut api_key = SettingsRepository::get(&conn, "gemini_api_key")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
        
    // 2. Fall back to environment variable if database key is empty
    if api_key.trim().is_empty() {
        api_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
    }
    
    if api_key.trim().is_empty() {
        return Err("API_KEY_MISSING".to_string());
    }

    // 3. Retrieve model from settings or default to gemini-2.5-flash-lite
    let mut model = SettingsRepository::get(&conn, "gemini_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini-2.5-flash-lite".to_string());
    
    if model.trim().is_empty() || model == "gemini-2.5-flash" {
        model = "gemini-2.5-flash-lite".to_string();
        // Automatically save the migrated model back to the DB
        let _ = SettingsRepository::set(&conn, "gemini_model", &model);
    }
    
    let model_name = model;

    // 4. Parse contents_json
    let contents: Vec<GeminiContent> = if contents_json.trim().starts_with('[') {
        serde_json::from_str(&contents_json)
            .map_err(|e| format!("Failed to parse contents JSON: {}", e))?
    } else {
        vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart { text: contents_json }],
        }]
    };

    let system_instruction_obj = system_instruction.map(|text| GeminiSystemInstruction {
        parts: vec![GeminiPart { text }],
    });

    let payload = GeminiPayload {
        contents,
        system_instruction: system_instruction_obj,
    };

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_name, api_key
    );

    let response = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Gemini API error ({}): {}", status, err_text));
    }

    let res_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    // Extract text from the response payload: candidates[0].content.parts[0].text
    let text = res_json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| format!("Invalid response format from Gemini API: {:?}", res_json))?
        .to_string();

    Ok(text)
}
