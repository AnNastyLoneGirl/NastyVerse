use reqwest::{Client, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::AppHandle;

use crate::installer;

const BACKEND_CONFIG_FILE: &str = "backend.json";
const TEST_TIMEOUT_SECS: u64 = 12;
const CHAT_TIMEOUT_SECS: u64 = 180;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
    pub backend_type: String,
    pub url: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationParams {
    pub temperature: f64,
    pub top_p: f64,
    pub max_tokens: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub models: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionResult {
    pub content: String,
    pub model: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub loaded: bool,
    pub backend: Option<String>,
    pub model_name: Option<String>,
    pub message: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(installer::nastyverse_root(app)?.join("config").join(BACKEND_CONFIG_FILE))
}

fn normalize_config(mut config: BackendConfig) -> Result<BackendConfig, String> {
    config.backend_type = config.backend_type.trim().to_ascii_lowercase();
    config.url = config.url.trim().trim_end_matches('/').to_string();
    config.model = config.model.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());
    config.api_key = config.api_key.map(|value| value.trim().to_string()).filter(|value| !value.is_empty());

    if config.url.is_empty() {
        return Err("Backend URL cannot be empty.".into());
    }
    let parsed = Url::parse(&config.url).map_err(|error| format!("Invalid backend URL: {error}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Backend URL must use http:// or https://.".into());
    }

    match config.backend_type.as_str() {
        "koboldcpp" | "llamacpp" | "textgenwebui" | "ollama" | "custom" => Ok(config),
        _ => Err(format!("Unsupported backend type: {}", config.backend_type)),
    }
}

fn client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("NastyVerse/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|error| format!("Unable to initialize the backend client: {error}"))
}

fn endpoint(base: &str, path: &str) -> Result<Url, String> {
    let base = base.trim_end_matches('/');
    let target = if path.starts_with("/v1/") && base.ends_with("/v1") {
        format!("{}{}", base, path.trim_start_matches("/v1"))
    } else {
        format!("{base}{path}")
    };
    Url::parse(&target).map_err(|error| format!("Invalid backend endpoint {target}: {error}"))
}

fn authorized(request: RequestBuilder, api_key: Option<&str>) -> RequestBuilder {
    if let Some(key) = api_key.filter(|value| !value.is_empty()) {
        request.bearer_auth(key)
    } else {
        request
    }
}

async fn parse_openai_models(config: &BackendConfig) -> Result<Vec<String>, String> {
    let url = endpoint(&config.url, "/v1/models")?;
    let response = authorized(client(TEST_TIMEOUT_SECS)?.get(url), config.api_key.as_deref())
        .send()
        .await
        .map_err(|error| format!("Unable to contact backend: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Backend returned an error: {error}"))?;
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Backend returned invalid model information: {error}"))?;

    let mut models = payload
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

async fn parse_ollama_models(config: &BackendConfig) -> Result<Vec<String>, String> {
    let url = endpoint(&config.url, "/api/tags")?;
    let response = client(TEST_TIMEOUT_SECS)?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Unable to contact Ollama: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Ollama returned an error: {error}"))?;
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Ollama returned invalid model information: {error}"))?;

    let mut models = payload
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            entry
                .get("name")
                .or_else(|| entry.get("model"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

async fn parse_kobold_native_model(config: &BackendConfig) -> Result<Vec<String>, String> {
    let url = endpoint(&config.url, "/api/v1/model")?;
    let response = client(TEST_TIMEOUT_SECS)?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Unable to contact KoboldCpp: {error}"))?
        .error_for_status()
        .map_err(|error| format!("KoboldCpp returned an error: {error}"))?;
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("KoboldCpp returned invalid model information: {error}"))?;

    let model = payload
        .get("result")
        .or_else(|| payload.get("model"))
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(model.into_iter().collect())
}

async fn probe(config: &BackendConfig) -> Result<Vec<String>, String> {
    match config.backend_type.as_str() {
        "ollama" => parse_ollama_models(config).await,
        "koboldcpp" => match parse_openai_models(config).await {
            Ok(models) => Ok(models),
            Err(openai_error) => parse_kobold_native_model(config)
                .await
                .map_err(|native_error| format!("{openai_error} Fallback check also failed: {native_error}")),
        },
        _ => parse_openai_models(config).await,
    }
}

fn default_model(config: &BackendConfig) -> String {
    if let Some(model) = &config.model {
        return model.clone();
    }
    match config.backend_type.as_str() {
        "koboldcpp" => "koboldcpp".into(),
        "llamacpp" => "default".into(),
        "textgenwebui" => "default".into(),
        _ => "default".into(),
    }
}

async fn openai_chat(
    config: &BackendConfig,
    messages: &[ChatMessage],
    params: &GenerationParams,
) -> Result<ChatCompletionResult, String> {
    let url = endpoint(&config.url, "/v1/chat/completions")?;
    let model = default_model(config);
    let payload = json!({
        "model": model.clone(),
        "messages": messages,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "max_tokens": params.max_tokens,
        "stream": false
    });

    let response = authorized(client(CHAT_TIMEOUT_SECS)?.post(url), config.api_key.as_deref())
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Generation request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Backend rejected the generation request: {error}"))?;
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("Backend returned an invalid generation response: {error}"))?;

    let content = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            choice
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(Value::as_str)
                .or_else(|| choice.get("text").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "Backend returned no assistant text.".to_string())?;

    Ok(ChatCompletionResult {
        content: content.to_string(),
        model: value.get("model").and_then(Value::as_str).map(str::to_string).or_else(|| Some(model)),
    })
}

async fn ollama_chat(
    config: &BackendConfig,
    messages: &[ChatMessage],
    params: &GenerationParams,
) -> Result<ChatCompletionResult, String> {
    let model = config
        .model
        .clone()
        .ok_or_else(|| "Choose an Ollama model in Configuration before chatting.".to_string())?;
    let url = endpoint(&config.url, "/api/chat")?;
    let payload = json!({
        "model": model.clone(),
        "messages": messages,
        "stream": false,
        "options": {
            "temperature": params.temperature,
            "top_p": params.top_p,
            "num_predict": params.max_tokens
        }
    });
    let response = client(CHAT_TIMEOUT_SECS)?
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Ollama generation request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Ollama rejected the generation request: {error}"))?;
    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("Ollama returned an invalid generation response: {error}"))?;
    let content = value
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| "Ollama returned no assistant text.".to_string())?;

    Ok(ChatCompletionResult {
        content: content.to_string(),
        model: Some(model),
    })
}

#[tauri::command]
pub fn load_backend_config(app: AppHandle) -> Result<Option<BackendConfig>, String> {
    let path = config_path(&app)?;
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Unable to read backend configuration: {error}")),
    };
    let config: BackendConfig = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Backend configuration is invalid: {error}"))?;
    Ok(Some(normalize_config(config)?))
}

#[tauri::command]
pub fn save_backend_config(app: AppHandle, config: BackendConfig) -> Result<BackendConfig, String> {
    let config = normalize_config(config)?;
    let path = config_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create NastyVerse config directory: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("Unable to serialize backend configuration: {error}"))?;
    fs::write(&path, bytes)
        .map_err(|error| format!("Unable to save backend configuration: {error}"))?;
    Ok(config)
}

#[tauri::command]
pub async fn test_backend_connection(
    backend_type: String,
    url: String,
    api_key: Option<String>,
) -> Result<ConnectionTestResult, String> {
    let config = normalize_config(BackendConfig {
        backend_type,
        url,
        model: None,
        api_key,
    })?;
    let models = probe(&config).await?;
    let message = if models.is_empty() {
        "Backend is reachable. No model name was reported.".to_string()
    } else if models.len() == 1 {
        format!("Backend is reachable. Model: {}", models[0])
    } else {
        format!("Backend is reachable. {} models reported.", models.len())
    };
    Ok(ConnectionTestResult { ok: true, message, models })
}

#[tauri::command]
pub async fn get_model_status(app: AppHandle) -> Result<ModelStatus, String> {
    let Some(config) = load_backend_config(app.clone())? else {
        return Ok(ModelStatus {
            loaded: false,
            backend: None,
            model_name: None,
            message: "No backend configured.".into(),
        });
    };

    match probe(&config).await {
        Ok(models) => {
            let model_name = config.model.clone().or_else(|| models.first().cloned());
            let loaded = model_name.is_some();
            Ok(ModelStatus {
                loaded,
                backend: Some(config.backend_type.clone()),
                model_name,
                message: if loaded {
                    "Backend connected and a model is available.".into()
                } else {
                    "Backend connected, but no model is selected or reported.".into()
                },
            })
        },
        Err(error) => Ok(ModelStatus {
            loaded: false,
            backend: Some(config.backend_type),
            model_name: config.model,
            message: error,
        }),
    }
}

#[tauri::command]
pub async fn chat_completion(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    params: GenerationParams,
) -> Result<ChatCompletionResult, String> {
    if messages.is_empty() {
        return Err("Cannot generate a response without messages.".into());
    }
    if !(0.0..=2.0).contains(&params.temperature) {
        return Err("Temperature must be between 0 and 2.".into());
    }
    if !(0.0..=1.0).contains(&params.top_p) || params.top_p == 0.0 {
        return Err("Top P must be greater than 0 and at most 1.".into());
    }
    if params.max_tokens == 0 || params.max_tokens > 32768 {
        return Err("Max tokens must be between 1 and 32768.".into());
    }

    let config = load_backend_config(app)?
        .ok_or_else(|| "No inference backend is configured. Open Configuration → Models first.".to_string())?;

    if config.backend_type == "ollama" {
        ollama_chat(&config, &messages, &params).await
    } else {
        openai_chat(&config, &messages, &params).await
    }
}
