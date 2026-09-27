use reqwest::{Client, RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::AppHandle;

use crate::installer;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
    pub backend_type: String,
    pub url: String,
    pub model: Option<String>,
    pub api_key: Option<String>,
    #[serde(default = "default_api_mode")]
    pub api_mode: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationParams {
    pub temperature: f64,
    pub top_p: f64,
    pub max_tokens: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub content: String,
    pub model: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BackendTestResult {
    pub ok: bool,
    pub message: String,
    pub models: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub loaded: bool,
    pub backend: Option<String>,
    pub model_name: Option<String>,
    pub message: Option<String>,
    pub api_mode: Option<String>,
}

fn default_api_mode() -> String {
    "auto".into()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(installer::nastyverse_root(app)?.join("backend-config.json"))
}

fn supported_backend(value: &str) -> bool {
    matches!(value, "koboldcpp" | "llamacpp" | "textgenwebui" | "ollama" | "custom")
}

fn normalized_optional(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let text = text.trim().to_string();
        if text.is_empty() { None } else { Some(text) }
    })
}

fn validate_config(mut config: BackendConfig) -> Result<BackendConfig, String> {
    config.backend_type = config.backend_type.trim().to_ascii_lowercase();
    if !supported_backend(&config.backend_type) {
        return Err(format!("Unsupported inference backend: {}", config.backend_type));
    }

    let parsed = reqwest::Url::parse(config.url.trim())
        .map_err(|error| format!("Invalid backend URL: {error}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Backend URLs must use http:// or https://.".into());
    }
    config.url = config.url.trim().trim_end_matches('/').to_string();
    config.model = normalized_optional(config.model);
    config.api_key = normalized_optional(config.api_key);
    config.api_mode = match config.api_mode.trim().to_ascii_lowercase().as_str() {
        "auto" => "auto".into(),
        "chat" => "chat".into(),
        "text" => "text".into(),
        _ => return Err("API mode must be auto, chat, or text.".into()),
    };
    Ok(config)
}

pub fn effective_api_mode(config: &BackendConfig) -> &'static str {
    match config.api_mode.as_str() {
        "chat" => "chat",
        "text" => "text",
        _ => match config.backend_type.as_str() {
            // These integrations are traditionally text-completion oriented and are
            // where Context/Instruction templates are expected to apply by default.
            "koboldcpp" | "llamacpp" | "textgenwebui" => "text",
            "ollama" | "custom" => "chat",
            _ => "chat",
        },
    }
}

pub fn load_backend_config(app: &AppHandle) -> Result<Option<BackendConfig>, String> {
    let path = config_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path)
        .map_err(|error| format!("Unable to read backend configuration: {error}"))?;
    let config = serde_json::from_slice::<BackendConfig>(&bytes)
        .map_err(|error| format!("Backend configuration is invalid: {error}"))?;
    validate_config(config).map(Some)
}

pub fn save_backend_config(app: &AppHandle, config: BackendConfig) -> Result<BackendConfig, String> {
    let config = validate_config(config)?;
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create the NastyVerse data directory: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("Unable to serialize backend configuration: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes)
        .map_err(|error| format!("Unable to save backend configuration: {error}"))?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Unable to replace backend configuration: {error}"))?;
    }
    fs::rename(&temp, &path)
        .map_err(|error| format!("Unable to finalize backend configuration: {error}"))?;
    Ok(config)
}

fn client(timeout_seconds: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent("NastyVerse")
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|error| format!("Unable to initialize the inference client: {error}"))
}

fn endpoint(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.ends_with("/v1") && path.starts_with("/v1/") {
        format!("{base}{}", &path[3..])
    } else {
        format!("{base}{path}")
    }
}

fn authorize(builder: RequestBuilder, api_key: &Option<String>) -> RequestBuilder {
    match api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(key) => builder.bearer_auth(key),
        None => builder,
    }
}

async fn response_json(response: Response, label: &str) -> Result<Value, String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Unable to read {label} response: {error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|value| {
                value.pointer("/error/message").and_then(Value::as_str).map(str::to_string)
                    .or_else(|| value.get("error").and_then(Value::as_str).map(str::to_string))
                    .or_else(|| value.get("message").and_then(Value::as_str).map(str::to_string))
            })
            .unwrap_or_else(|| text.chars().take(600).collect());
        return Err(format!("{label} returned HTTP {}: {message}", status.as_u16()));
    }
    serde_json::from_str(&text)
        .map_err(|error| format!("{label} returned invalid JSON: {error}"))
}

fn collect_openai_models(payload: &Value) -> Vec<String> {
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
    models
}

async fn test_openai(config: &BackendConfig) -> Result<Vec<String>, String> {
    let client = client(12)?;
    let request = authorize(client.get(endpoint(&config.url, "/v1/models")), &config.api_key);
    let payload = response_json(
        request.send().await.map_err(|error| format!("Unable to contact backend: {error}"))?,
        "Backend model endpoint",
    ).await?;
    Ok(collect_openai_models(&payload))
}

async fn test_ollama(config: &BackendConfig) -> Result<Vec<String>, String> {
    let client = client(12)?;
    let request = authorize(client.get(endpoint(&config.url, "/api/tags")), &config.api_key);
    let payload = response_json(
        request.send().await.map_err(|error| format!("Unable to contact Ollama: {error}"))?,
        "Ollama",
    ).await?;
    let mut models = payload.get("models").and_then(Value::as_array)
        .into_iter().flatten()
        .filter_map(|entry| entry.get("name").or_else(|| entry.get("model")).and_then(Value::as_str))
        .map(str::to_string).collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

async fn test_koboldcpp(config: &BackendConfig) -> Result<Vec<String>, String> {
    let client = client(12)?;
    let native = authorize(client.get(endpoint(&config.url, "/api/v1/model")), &config.api_key).send().await;
    if let Ok(response) = native {
        if response.status().is_success() {
            let payload = response_json(response, "KoboldCpp").await?;
            if let Some(model) = payload.get("result").and_then(Value::as_str) {
                return Ok(vec![model.to_string()]);
            }
        }
    }
    test_openai(config).await
}

async fn test_llamacpp(config: &BackendConfig) -> Result<Vec<String>, String> {
    if let Ok(models) = test_openai(config).await {
        return Ok(models);
    }
    let client = client(12)?;
    let response = authorize(client.get(endpoint(&config.url, "/health")), &config.api_key)
        .send().await.map_err(|error| format!("Unable to contact llama.cpp server: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("llama.cpp health endpoint returned HTTP {}.", response.status().as_u16()));
    }
    Ok(config.model.clone().into_iter().collect())
}

async fn test_textgenwebui(config: &BackendConfig) -> Result<Vec<String>, String> {
    if let Ok(models) = test_openai(config).await {
        return Ok(models);
    }
    let client = client(12)?;
    let response = authorize(client.get(endpoint(&config.url, "/api/v1/model")), &config.api_key)
        .send().await.map_err(|error| format!("Unable to contact text-generation-webui: {error}"))?;
    let payload = response_json(response, "text-generation-webui").await?;
    let model = payload.get("result").or_else(|| payload.get("model_name")).and_then(Value::as_str);
    Ok(model.map(|value| vec![value.to_string()]).unwrap_or_default())
}

pub async fn test_backend_connection(config: BackendConfig) -> Result<BackendTestResult, String> {
    let config = validate_config(config)?;
    let models = match config.backend_type.as_str() {
        "ollama" => test_ollama(&config).await?,
        "koboldcpp" => test_koboldcpp(&config).await?,
        "llamacpp" => test_llamacpp(&config).await?,
        "textgenwebui" => test_textgenwebui(&config).await?,
        _ => test_openai(&config).await?,
    };
    let message = if models.is_empty() {
        "Connected successfully. The backend did not report a model list.".to_string()
    } else {
        format!("Connected successfully. {} model(s) available.", models.len())
    };
    Ok(BackendTestResult { ok: true, message, models })
}

fn openai_content(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let parts = value.as_array()?;
    let text = parts.iter().filter_map(|part| {
        part.get("text").and_then(Value::as_str)
            .or_else(|| part.pointer("/text/value").and_then(Value::as_str))
    }).collect::<Vec<_>>().join("");
    if text.is_empty() { None } else { Some(text) }
}

fn openai_model(config: &BackendConfig, payload: &Value) -> Option<String> {
    payload.get("model").and_then(Value::as_str).map(str::to_string)
        .or_else(|| config.model.clone())
}

fn add_model(payload: &mut Map<String, Value>, config: &BackendConfig) {
    if let Some(model) = config.model.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("model".into(), json!(model));
    }
}

async fn openai_chat_completion(
    config: &BackendConfig,
    messages: &[ChatMessage],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let client = client(300)?;
    let mut payload = Map::new();
    add_model(&mut payload, config);
    payload.insert("messages".into(), serde_json::to_value(messages).map_err(|error| error.to_string())?);
    payload.insert("temperature".into(), json!(params.temperature));
    payload.insert("top_p".into(), json!(params.top_p));
    payload.insert("max_tokens".into(), json!(params.max_tokens));
    payload.insert("stream".into(), json!(false));
    let request = authorize(
        client.post(endpoint(&config.url, "/v1/chat/completions")).json(&Value::Object(payload)),
        &config.api_key,
    );
    let response = request.send().await.map_err(|error| format!("Chat completion failed: {error}"))?;
    let payload = response_json(response, "Chat completion").await?;
    let content = payload.pointer("/choices/0/message/content")
        .and_then(openai_content)
        .or_else(|| payload.pointer("/choices/0/text").and_then(Value::as_str).map(str::to_string))
        .ok_or_else(|| "Chat completion returned no assistant content.".to_string())?;
    Ok(CompletionResult { content, model: openai_model(config, &payload) })
}

async fn ollama_chat_completion(
    config: &BackendConfig,
    messages: &[ChatMessage],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let model = config.model.as_deref().ok_or_else(|| "Select an Ollama model before chatting.".to_string())?;
    let client = client(300)?;
    let payload = json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "options": {
            "temperature": params.temperature,
            "top_p": params.top_p,
            "num_predict": params.max_tokens
        }
    });
    let response = authorize(client.post(endpoint(&config.url, "/api/chat")).json(&payload), &config.api_key)
        .send().await.map_err(|error| format!("Ollama chat request failed: {error}"))?;
    let payload = response_json(response, "Ollama chat").await?;
    let content = payload.pointer("/message/content").and_then(Value::as_str)
        .ok_or_else(|| "Ollama returned no assistant content.".to_string())?
        .to_string();
    Ok(CompletionResult { content, model: Some(model.to_string()) })
}

pub async fn chat_completion(
    app: &AppHandle,
    messages: Vec<ChatMessage>,
    params: GenerationParams,
) -> Result<CompletionResult, String> {
    let config = load_backend_config(app)?
        .ok_or_else(|| "Configure and save an inference backend first.".to_string())?;
    match config.backend_type.as_str() {
        "ollama" => ollama_chat_completion(&config, &messages, &params).await,
        _ => openai_chat_completion(&config, &messages, &params).await,
    }
}

fn build_openai_text_payload(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Value {
    let mut payload = Map::new();
    add_model(&mut payload, config);
    payload.insert("prompt".into(), json!(prompt));
    payload.insert("temperature".into(), json!(params.temperature));
    payload.insert("top_p".into(), json!(params.top_p));
    payload.insert("max_tokens".into(), json!(params.max_tokens));
    payload.insert("stream".into(), json!(false));
    if !stop_strings.is_empty() {
        payload.insert("stop".into(), json!(stop_strings));
    }
    Value::Object(payload)
}

async fn openai_text_completion(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let client = client(300)?;
    let request = authorize(
        client.post(endpoint(&config.url, "/v1/completions"))
            .json(&build_openai_text_payload(config, prompt, stop_strings, params)),
        &config.api_key,
    );
    let response = request.send().await.map_err(|error| format!("Text completion failed: {error}"))?;
    let payload = response_json(response, "Text completion").await?;
    let content = payload.pointer("/choices/0/text").and_then(Value::as_str)
        .or_else(|| payload.pointer("/choices/0/message/content").and_then(Value::as_str))
        .ok_or_else(|| "Text completion returned no generated text.".to_string())?
        .to_string();
    Ok(CompletionResult { content, model: openai_model(config, &payload) })
}

async fn llamacpp_native_text_completion(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let client = client(300)?;
    let payload = json!({
        "prompt": prompt,
        "n_predict": params.max_tokens,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "stop": stop_strings,
        "stream": false
    });
    let response = authorize(client.post(endpoint(&config.url, "/completion")).json(&payload), &config.api_key)
        .send().await.map_err(|error| format!("llama.cpp completion failed: {error}"))?;
    let payload = response_json(response, "llama.cpp completion").await?;
    let content = payload.get("content").and_then(Value::as_str)
        .ok_or_else(|| "llama.cpp returned no generated text.".to_string())?
        .to_string();
    Ok(CompletionResult { content, model: config.model.clone() })
}

async fn koboldcpp_text_completion(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let client = client(300)?;
    let payload = json!({
        "prompt": prompt,
        "max_length": params.max_tokens,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "stop_sequence": stop_strings
    });
    let response = authorize(client.post(endpoint(&config.url, "/api/v1/generate")).json(&payload), &config.api_key)
        .send().await.map_err(|error| format!("KoboldCpp generation failed: {error}"))?;
    if response.status().is_success() {
        let payload = response_json(response, "KoboldCpp generation").await?;
        let content = payload.pointer("/results/0/text").and_then(Value::as_str)
            .ok_or_else(|| "KoboldCpp returned no generated text.".to_string())?
            .to_string();
        return Ok(CompletionResult { content, model: config.model.clone() });
    }
    // Recent KoboldCpp builds also expose the OpenAI-compatible endpoint.
    openai_text_completion(config, prompt, stop_strings, params).await
}

async fn textgen_native_text_completion(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let client = client(300)?;
    let payload = json!({
        "prompt": prompt,
        "max_new_tokens": params.max_tokens,
        "temperature": params.temperature,
        "top_p": params.top_p,
        "stop": stop_strings
    });
    let response = authorize(client.post(endpoint(&config.url, "/api/v1/generate")).json(&payload), &config.api_key)
        .send().await.map_err(|error| format!("text-generation-webui generation failed: {error}"))?;
    let payload = response_json(response, "text-generation-webui generation").await?;
    let content = payload.pointer("/results/0/text").and_then(Value::as_str)
        .ok_or_else(|| "text-generation-webui returned no generated text.".to_string())?
        .to_string();
    Ok(CompletionResult { content, model: config.model.clone() })
}

async fn ollama_text_completion(
    config: &BackendConfig,
    prompt: &str,
    stop_strings: &[String],
    params: &GenerationParams,
) -> Result<CompletionResult, String> {
    let model = config.model.as_deref().ok_or_else(|| "Select an Ollama model before generating.".to_string())?;
    let client = client(300)?;
    let payload = json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": params.temperature,
            "top_p": params.top_p,
            "num_predict": params.max_tokens,
            "stop": stop_strings
        }
    });
    let response = authorize(client.post(endpoint(&config.url, "/api/generate")).json(&payload), &config.api_key)
        .send().await.map_err(|error| format!("Ollama generation failed: {error}"))?;
    let payload = response_json(response, "Ollama generation").await?;
    let content = payload.get("response").and_then(Value::as_str)
        .ok_or_else(|| "Ollama returned no generated text.".to_string())?
        .to_string();
    Ok(CompletionResult { content, model: Some(model.to_string()) })
}

pub async fn text_completion(
    app: &AppHandle,
    prompt: String,
    stop_strings: Vec<String>,
    params: GenerationParams,
) -> Result<CompletionResult, String> {
    let config = load_backend_config(app)?
        .ok_or_else(|| "Configure and save an inference backend first.".to_string())?;
    match config.backend_type.as_str() {
        "koboldcpp" => koboldcpp_text_completion(&config, &prompt, &stop_strings, &params).await,
        "ollama" => ollama_text_completion(&config, &prompt, &stop_strings, &params).await,
        "llamacpp" => match openai_text_completion(&config, &prompt, &stop_strings, &params).await {
            Ok(result) => Ok(result),
            Err(_) => llamacpp_native_text_completion(&config, &prompt, &stop_strings, &params).await,
        },
        "textgenwebui" => match openai_text_completion(&config, &prompt, &stop_strings, &params).await {
            Ok(result) => Ok(result),
            Err(_) => textgen_native_text_completion(&config, &prompt, &stop_strings, &params).await,
        },
        _ => openai_text_completion(&config, &prompt, &stop_strings, &params).await,
    }
}

pub async fn get_model_status(app: &AppHandle) -> ModelStatus {
    let config = match load_backend_config(app) {
        Ok(Some(config)) => config,
        Ok(None) => return ModelStatus {
            loaded: false,
            backend: None,
            model_name: None,
            message: Some("No inference backend is configured.".into()),
            api_mode: None,
        },
        Err(error) => return ModelStatus {
            loaded: false,
            backend: None,
            model_name: None,
            message: Some(error),
            api_mode: None,
        },
    };

    let mode = effective_api_mode(&config).to_string();
    match test_backend_connection(config.clone()).await {
        Ok(result) => ModelStatus {
            loaded: true,
            backend: Some(config.backend_type),
            model_name: config.model.or_else(|| result.models.first().cloned()),
            message: Some(result.message),
            api_mode: Some(mode),
        },
        Err(error) => ModelStatus {
            loaded: false,
            backend: Some(config.backend_type),
            model_name: config.model,
            message: Some(error),
            api_mode: Some(mode),
        },
    }
}
