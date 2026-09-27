use reqwest::{Client, RequestBuilder, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
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
#[serde(rename_all = "camelCase")]
pub struct BackendTestResult {
    pub ok: bool,
    pub message: String,
    pub models: Vec<String>,
    pub model_name: Option<String>,
    pub model_details: Vec<ModelInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: Option<String>,
    pub context_length: Option<u64>,
    pub tokenizer: Option<String>,
    pub instruct_type: Option<String>,
    pub modality: Option<String>,
    pub price_label: Option<String>,
    pub subscription_included: Option<bool>,
    pub subscription_input_multiplier: Option<f64>,
    pub subscription_note: Option<String>,
    pub vision: bool,
    pub reasoning: bool,
    pub tools: bool,
}

#[derive(Clone, Debug)]
struct BackendProbe {
    models: Vec<String>,
    model_name: Option<String>,
    model_details: Vec<ModelInfo>,
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelAnalysis {
    pub provider: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub architecture: Option<String>,
    pub tokenizer: Option<String>,
    pub instruct_type: Option<String>,
    pub modality: Option<String>,
    pub context_length: Option<u64>,
    pub price_label: Option<String>,
    pub subscription_included: Option<bool>,
    pub subscription_input_multiplier: Option<f64>,
    pub vision: bool,
    pub reasoning: bool,
    pub tools: bool,
    pub model_path: Option<String>,
    pub chat_template: Option<String>,
    pub chat_template_hash: Option<String>,
    pub detected_template: Option<String>,
    pub context_preset: Option<String>,
    pub instruction_preset: Option<String>,
    pub confidence: String,
    pub source: String,
    pub notes: Vec<String>,
}

fn default_api_mode() -> String {
    "auto".into()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(installer::nastyverse_root(app)?.join("backend-config.json"))
}

fn supported_backend(value: &str) -> bool {
    matches!(
        value,
        "koboldcpp"
            | "llamacpp"
            | "textgenwebui"
            | "ollama"
            | "openai"
            | "openrouter"
            | "nanogpt"
            | "groq"
            | "deepseek"
            | "mistralapi"
            | "together"
            | "custom"
    )
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

fn request_for_provider(config: &BackendConfig, builder: RequestBuilder) -> RequestBuilder {
    let builder = authorize(builder, &config.api_key);
    if config.backend_type == "openrouter" {
        builder
            .header("HTTP-Referer", "https://github.com/AnNastyLoneGirl/NastyVerse")
            .header("X-Title", "NastyVerse")
    } else {
        builder
    }
}

fn value_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(|value| {
        value
            .as_f64()
            .or_else(|| value.as_str().and_then(|text| text.parse::<f64>().ok()))
    })
}

fn value_u64(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
            .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
    })
}

fn array_contains(value: Option<&Value>, needle: &str) -> bool {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().any(|item| item.as_str() == Some(needle)))
        .unwrap_or(false)
}

fn compact_number(value: f64) -> String {
    if (value.fract()).abs() < f64::EPSILON {
        format!("{value:.0}")
    } else if value.abs() >= 10.0 {
        format!("{value:.1}").trim_end_matches('0').trim_end_matches('.').to_string()
    } else {
        format!("{value:.3}").trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn model_price_label(entry: &Value, backend_type: &str) -> Option<String> {
    let prompt = value_f64(entry.pointer("/pricing/prompt"))
        .or_else(|| value_f64(entry.pointer("/pricing/input")));
    let completion = value_f64(entry.pointer("/pricing/completion"))
        .or_else(|| value_f64(entry.pointer("/pricing/output")));

    match backend_type {
        "openrouter" => prompt.map(|price| {
            if price == 0.0 {
                "Free".to_string()
            } else {
                let thousands_per_dollar = 1.0 / (1000.0 * price);
                format!("{}k t/$", compact_number(thousands_per_dollar.round()))
            }
        }),
        "nanogpt" => match (prompt, completion) {
            (Some(input), Some(output)) if input == 0.0 && output == 0.0 => Some("Free".into()),
            (Some(input), Some(output)) => Some(format!(
                "${}/${} in/out Mtoken",
                compact_number(input),
                compact_number(output)
            )),
            _ => None,
        },
        _ => None,
    }
}

fn model_info_from_entry(entry: &Value, backend_type: &str) -> Option<ModelInfo> {
    let id = entry.get("id")
        .or_else(|| entry.get("name"))
        .and_then(Value::as_str)?
        .trim();
    if id.is_empty() {
        return None;
    }

    let name = entry.get("name")
        .or_else(|| entry.get("display_name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != id)
        .map(str::to_string);

    let context_length = value_u64(entry.get("context_length"))
        .or_else(|| value_u64(entry.get("max_model_len")))
        .or_else(|| value_u64(entry.get("max_context_length")))
        .or_else(|| value_u64(entry.pointer("/limits/context")));
    let tokenizer = clean_prop_string(entry.pointer("/architecture/tokenizer"))
        .or_else(|| clean_prop_string(entry.get("tokenizer")));
    let instruct_type = clean_prop_string(entry.pointer("/architecture/instruct_type"))
        .or_else(|| clean_prop_string(entry.get("instruct_type")));
    let modality = clean_prop_string(entry.pointer("/architecture/modality"))
        .or_else(|| clean_prop_string(entry.get("modality")));

    let subscription_included = entry.pointer("/subscription/included").and_then(Value::as_bool);
    let subscription_input_multiplier = value_f64(entry.pointer("/subscription/inputTokenMultiplier"));
    let subscription_note = entry.pointer("/subscription/note")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let vision = entry.pointer("/capabilities/vision").and_then(Value::as_bool).unwrap_or(false)
        || array_contains(entry.pointer("/architecture/input_modalities"), "image")
        || array_contains(entry.get("input_modalities"), "image");
    let reasoning = entry.pointer("/capabilities/reasoning").and_then(Value::as_bool).unwrap_or(false)
        || array_contains(entry.get("supported_features"), "reasoning")
        || array_contains(entry.get("supported_parameters"), "reasoning");
    let tools = entry.pointer("/capabilities/tool_calling").and_then(Value::as_bool).unwrap_or(false)
        || array_contains(entry.get("supported_features"), "structured_outputs")
        || array_contains(entry.get("supported_parameters"), "tools")
        || array_contains(entry.get("supported_parameters"), "tool_choice");

    Some(ModelInfo {
        id: id.to_string(),
        name,
        context_length,
        tokenizer,
        instruct_type,
        modality,
        price_label: model_price_label(entry, backend_type),
        subscription_included,
        subscription_input_multiplier,
        subscription_note,
        vision,
        reasoning,
        tools,
    })
}

fn basic_model_info(id: &str, context_length: Option<u64>) -> ModelInfo {
    ModelInfo {
        id: id.to_string(),
        name: None,
        context_length,
        tokenizer: None,
        instruct_type: None,
        modality: None,
        price_label: None,
        subscription_included: None,
        subscription_input_multiplier: None,
        subscription_note: None,
        vision: false,
        reasoning: false,
        tools: false,
    }
}

fn collect_model_infos(payload: &Value, backend_type: &str) -> Vec<ModelInfo> {
    let entries = payload
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| payload.as_array());
    let mut models = entries
        .into_iter()
        .flatten()
        .filter_map(|entry| model_info_from_entry(entry, backend_type))
        .collect::<Vec<_>>();
    models.sort_by(|a, b| a.id.to_lowercase().cmp(&b.id.to_lowercase()));
    models.dedup_by(|a, b| a.id == b.id);
    models
}

async fn test_openai_with_path(config: &BackendConfig, path: &str) -> Result<BackendProbe, String> {
    let client = client(12)?;
    let request = request_for_provider(config, client.get(endpoint(&config.url, path)));
    let payload = response_json(
        request.send().await.map_err(|error| format!("Unable to contact backend: {error}"))?,
        "Backend model endpoint",
    ).await?;
    let model_details = collect_model_infos(&payload, &config.backend_type);
    let models = model_details.iter().map(|model| model.id.clone()).collect::<Vec<_>>();
    let model_name = config
        .model
        .clone()
        .filter(|selected| models.iter().any(|model| model == selected))
        .or_else(|| models.first().cloned());
    Ok(BackendProbe { models, model_name, model_details })
}

async fn test_openai(config: &BackendConfig) -> Result<BackendProbe, String> {
    test_openai_with_path(config, "/v1/models").await
}

async fn test_nanogpt(config: &BackendConfig) -> Result<BackendProbe, String> {
    // SillyTavern requests NanoGPT's detailed model list so subscription, context,
    // pricing and capability metadata remain attached to each model.
    test_openai_with_path(config, "/v1/models?detailed=true").await
}

async fn test_ollama(config: &BackendConfig) -> Result<BackendProbe, String> {
    let client = client(12)?;
    let request = authorize(client.get(endpoint(&config.url, "/api/tags")), &config.api_key);
    let payload = response_json(
        request.send().await.map_err(|error| format!("Unable to contact Ollama: {error}"))?,
        "Ollama",
    ).await?;
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
    let model_name = config
        .model
        .clone()
        .filter(|name| models.iter().any(|item| item == name))
        .or_else(|| models.first().cloned());
    let model_details = models.iter().map(|model| basic_model_info(model, None)).collect();
    Ok(BackendProbe { models, model_name, model_details })
}

async fn kobold_model(config: &BackendConfig, path: &str) -> Result<Option<String>, String> {
    let client = client(12)?;
    let response = authorize(client.get(endpoint(&config.url, path)), &config.api_key)
        .send().await.map_err(|error| format!("Unable to contact KoboldCpp: {error}"))?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let payload = response_json(response, "KoboldCpp model endpoint").await?;
    Ok(payload
        .get("result")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && *value != "ReadOnly")
        .map(str::to_string))
}

async fn kobold_context_length(config: &BackendConfig) -> Option<u64> {
    for path in [
        "/api/extra/true_max_context_length",
        "/api/v1/config/max_context_length",
    ] {
        let Ok(client) = client(6) else { continue };
        let Ok(response) = authorize(client.get(endpoint(&config.url, path)), &config.api_key).send().await else { continue };
        if !response.status().is_success() {
            continue;
        }
        let Ok(payload) = response_json(response, "KoboldCpp context endpoint").await else { continue };
        if let Some(context) = value_u64(payload.get("value"))
            .or_else(|| value_u64(payload.get("result")))
            .or_else(|| value_u64(Some(&payload)))
        {
            return Some(context);
        }
    }
    None
}

async fn test_koboldcpp(config: &BackendConfig) -> Result<BackendProbe, String> {
    // SillyTavern's Kobold status path treats /v1/model as the source of truth.
    // Keep the older /api/v1/model spelling as a compatibility fallback.
    let model_name = match kobold_model(config, "/v1/model").await {
        Ok(Some(model)) => Some(model),
        _ => kobold_model(config, "/api/v1/model").await.ok().flatten(),
    };

    if let Some(model) = model_name {
        let context_length = kobold_context_length(config).await;
        return Ok(BackendProbe {
            models: vec![model.clone()],
            model_name: Some(model.clone()),
            model_details: vec![basic_model_info(&model, context_length)],
        });
    }

    Err("KoboldCpp connected without reporting a loaded model.".into())
}

async fn llamacpp_context_length(config: &BackendConfig) -> Option<u64> {
    let client = client(6).ok()?;
    let response = authorize(client.get(endpoint(&config.url, "/props")), &config.api_key)
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let payload = response_json(response, "llama.cpp properties").await.ok()?;
    value_u64(payload.pointer("/default_generation_settings/n_ctx"))
        .or_else(|| value_u64(payload.get("n_ctx")))
}

async fn test_llamacpp(config: &BackendConfig) -> Result<BackendProbe, String> {
    // Current SillyTavern discovers llama.cpp slots/models from the OpenAI-compatible list.
    // An empty or stale selection falls back to the first model reported by the server.
    let mut probe = test_openai(config).await?;
    if let Some(selected) = config.model.as_deref() {
        probe.model_name = probe
            .models
            .iter()
            .find(|model| model.as_str() == selected)
            .cloned()
            .or_else(|| probe.models.first().cloned());
    }
    if let Some(context_length) = llamacpp_context_length(config).await {
        if let Some(current) = probe.model_name.as_deref() {
            if let Some(info) = probe.model_details.iter_mut().find(|info| info.id.as_str() == current) {
                info.context_length = Some(context_length);
            }
        }
    }
    Ok(probe)
}

async fn test_custom(config: &BackendConfig) -> Result<BackendProbe, String> {
    let mut probe = test_openai(config).await?;
    if let Some(selected) = config.model.as_deref() {
        probe.model_name = Some(selected.to_string());
    }
    Ok(probe)
}

async fn test_textgenwebui(config: &BackendConfig) -> Result<BackendProbe, String> {
    let mut probe = test_openai(config).await?;
    let client = client(12)?;
    let request = authorize(
        client.get(endpoint(&config.url, "/v1/internal/model/info")),
        &config.api_key,
    );
    if let Ok(response) = request.send().await {
        if response.status().is_success() {
            if let Ok(payload) = response_json(response, "text-generation-webui model info").await {
                if let Some(model) = payload
                    .get("model_name")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                {
                    probe.model_name = Some(model.to_string());
                }
            }
        }
    }
    Ok(probe)
}

pub async fn test_backend_connection(config: BackendConfig) -> Result<BackendTestResult, String> {
    let config = validate_config(config)?;
    let probe = match config.backend_type.as_str() {
        "ollama" => test_ollama(&config).await?,
        "koboldcpp" => test_koboldcpp(&config).await?,
        "llamacpp" => test_llamacpp(&config).await?,
        "textgenwebui" => test_textgenwebui(&config).await?,
        "nanogpt" => test_nanogpt(&config).await?,
        "custom" => test_custom(&config).await?,
        _ => test_openai(&config).await?,
    };
    let message = if let Some(model) = probe.model_name.as_deref() {
        format!("Connected successfully. Model: {model}")
    } else if probe.models.is_empty() {
        "Connected successfully. The backend did not report a model list.".to_string()
    } else {
        format!("Connected successfully. {} model(s) available.", probe.models.len())
    };
    Ok(BackendTestResult {
        ok: true,
        message,
        models: probe.models,
        model_name: probe.model_name,
        model_details: probe.model_details,
    })
}

fn clean_prop_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(|text| text.trim_matches('\0').trim().to_string())
        .filter(|text| !text.is_empty())
}

fn nested_context_length(payload: &Value) -> Option<u64> {
    value_u64(payload.pointer("/default_generation_settings/n_ctx"))
        .or_else(|| value_u64(payload.get("n_ctx")))
        .or_else(|| value_u64(payload.get("context_length")))
        .or_else(|| value_u64(payload.get("max_context_length")))
        .or_else(|| {
            payload.get("model_info")?.as_object()?.iter().find_map(|(key, value)| {
                if key.ends_with(".context_length") || key == "context_length" {
                    value_u64(Some(value))
                } else {
                    None
                }
            })
        })
}

fn analysis_architecture(payload: &Value) -> Option<String> {
    clean_prop_string(payload.pointer("/model_info/general.architecture"))
        .or_else(|| clean_prop_string(payload.pointer("/details/family")))
        .or_else(|| clean_prop_string(payload.get("architecture")))
        .or_else(|| clean_prop_string(payload.get("model_type")))
}

fn analysis_model_path(payload: &Value) -> Option<String> {
    clean_prop_string(payload.get("model_path"))
        .or_else(|| clean_prop_string(payload.get("model")))
        .or_else(|| clean_prop_string(payload.get("name")))
}

fn analysis_chat_template(payload: &Value) -> Option<String> {
    payload
        .get("chat_template")
        .or_else(|| payload.get("template"))
        .and_then(Value::as_str)
        .map(|text| text.trim_matches('\0').to_string())
        .filter(|text| !text.trim().is_empty())
}

async fn analysis_properties(config: &BackendConfig) -> Option<Value> {
    match config.backend_type.as_str() {
        "koboldcpp" | "llamacpp" => {
            let client = client(10).ok()?;
            let mut url = reqwest::Url::parse(&endpoint(&config.url, "/props")).ok()?;
            if config.backend_type == "llamacpp" {
                if let Some(model) = config.model.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
                    url.query_pairs_mut().append_pair("model", model);
                }
            }
            let response = authorize(client.get(url), &config.api_key).send().await.ok()?;
            if !response.status().is_success() {
                return None;
            }
            response_json(response, "Model properties").await.ok()
        }
        "ollama" => {
            let model = config.model.as_deref().map(str::trim).filter(|value| !value.is_empty())?;
            let client = client(10).ok()?;
            let response = authorize(
                client.post(endpoint(&config.url, "/api/show")).json(&json!({ "model": model })),
                &config.api_key,
            )
            .send()
            .await
            .ok()?;
            if !response.status().is_success() {
                return None;
            }
            response_json(response, "Ollama model properties").await.ok()
        }
        _ => None,
    }
}

fn template_hash(chat_template: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(chat_template.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn template_from_hash(hash: &str) -> Option<&'static str> {
    match hash {
        // Matches SillyTavern's current chat-template derivation table.
        "e10ca381b1ccc5cf9db52e371f3b6651576caee0a630b452e2816b2d404d4b65"
        | "5816fce10444e03c2e9ee1ef8a4a1ea61ae7e69e438613f3b17b69d0426223a4"
        | "73e87b1667d87ab7d7b579107f01151b29ce7f3ccdd1018fdc397e78be76219d" => Some("Llama 3 Instruct"),
        "e16746b40344d6c5b5265988e0328a0bf7277be86f1c335156eae07e29c82826"
        | "26a59556925c987317ce5291811ba3b7f32ec4c647c400c6cc7e3a9993007ba7" => Some("Mistral V2 & V3"),
        "e4676cb56dffea7782fd3e2b577cfaf1e123537e6ef49b3ec7caa6c095c62272" => Some("Mistral V3-Tekken"),
        "3c4ad5fa60dd8c7ccdf82fa4225864c903e107728fcaf859fa6052cb80c92ee9"
        | "3934d199bfe5b6fab5cba1b5f8ee475e8d5738ac315f21cb09545b4e665cc005" => Some("Mistral V7"),
        "ecd6ae513fe103f0eb62e8ab5bfa8d0fe45c1074fa398b089c93a7e70c15cfd6"
        | "87fa45af6cdc3d6a9e4dd34a0a6848eceaa73a35dcfe976bd2946a5822a38bf3"
        | "7de1c58e208eda46e9c7f86397df37ec49883aeece39fb961e0a6b24088dd3c4" => Some("Gemma 2"),
        "3b54f5c219ae1caa5c0bb2cdc7c001863ca6807cf888e4240e8739fa7eb9e02e" => Some("Command R"),
        "ac7498a36a719da630e99d48e6ebc4409de85a77556c2b6159eeb735bcbd11df" => Some("Tulu"),
        "54d400beedcd17f464e10063e0577f6f798fa896266a912d8a366f8a2fcc0bca"
        | "b6835114b7303ddd78919a82e4d9f7d8c26ed0d7dfc36beeb12d524f6144eab1" => Some("DeepSeek-V2.5"),
        "854b703e44ca06bdb196cc471c728d15dbab61e744fe6cdce980086b61646ed1" => Some("GLM-4"),
        "aab20feb9bc6881f941ea649356130ffbc4943b3c2577c0991e1fba90de5a0fc" => Some("Moonshot AI"),
        "70da0d2348e40aaf8dad05f04a316835fd10547bd7e3392ce337e4c79ba91c01"
        | "a4c9919cbbd4acdd51ccffe22da049264b1b73e59055fa58811a99efbd7c8146" => Some("OpenAI Harmony"),
        _ => None,
    }
}

fn template_from_content(chat_template: &str) -> Option<&'static str> {
    let template = chat_template;
    if template.contains("<|im_user|>user<|im_middle|>")
        && template.contains("<|im_assistant|>assistant<|im_middle|>")
        && template.contains("<|im_end|>")
    {
        return Some("Moonshot AI");
    }
    if template.contains("<|start|>user<|message|>")
        && template.contains("<|start|>assistant<|channel|>final<|message|>")
        && template.contains("<|end|>")
    {
        return Some("OpenAI Harmony");
    }
    if template.contains("<|im_start|>user")
        && template.contains("<|im_start|>assistant")
        && template.contains("<|im_end|>")
    {
        return Some("ChatML");
    }
    None
}

fn template_from_model_name(model: &str) -> Option<&'static str> {
    let normalized = model.to_ascii_lowercase().replace('_', " ").replace('-', " ").replace('/', " ").replace('.', " ");
    let checks = [
        ("llama 4", "Llama 4 Instruct"),
        ("llama4", "Llama 4 Instruct"),
        ("llama 3", "Llama 3 Instruct"),
        ("llama3", "Llama 3 Instruct"),
        ("gemma 4", "Gemma 4"),
        ("gemma4", "Gemma 4"),
        ("gemma 2", "Gemma 2"),
        ("gemma2", "Gemma 2"),
        ("deepseek v2 5", "DeepSeek-V2.5"),
        ("command r", "Command R"),
        ("chatml", "ChatML"),
        ("mistral v7 tekken", "Mistral V7-Tekken"),
        ("mistral v3 tekken", "Mistral V3-Tekken"),
        ("mistral v7", "Mistral V7"),
        ("mistral v3", "Mistral V2 & V3"),
        ("mistral v2", "Mistral V2 & V3"),
    ];
    checks
        .iter()
        .find_map(|(needle, preset)| normalized.contains(needle).then_some(*preset))
}

fn derive_prompt_presets(
    model: Option<&str>,
    chat_template: Option<&str>,
    provider_hint: Option<&str>,
) -> (Option<String>, Option<String>, String, String, Option<String>) {
    if let Some(template) = chat_template.filter(|value| !value.trim().is_empty()) {
        let hash = template_hash(template);
        if let Some(preset) = template_from_hash(&hash) {
            return (
                Some(preset.into()),
                Some(preset.into()),
                "high".into(),
                "chat-template-hash".into(),
                Some(hash),
            );
        }
        if let Some(preset) = template_from_content(template) {
            return (
                Some(preset.into()),
                Some(preset.into()),
                "high".into(),
                "chat-template-pattern".into(),
                Some(hash),
            );
        }
        if let Some(preset) = provider_hint.and_then(template_from_model_name) {
            return (
                Some(preset.into()),
                Some(preset.into()),
                "medium".into(),
                "provider-instruct-type".into(),
                Some(hash),
            );
        }
        if let Some(preset) = model.and_then(template_from_model_name) {
            return (
                Some(preset.into()),
                Some(preset.into()),
                "medium".into(),
                "model-name".into(),
                Some(hash),
            );
        }
        return (None, None, "low".into(), "chat-template-unknown".into(), Some(hash));
    }

    if let Some(preset) = provider_hint.and_then(template_from_model_name) {
        return (
            Some(preset.into()),
            Some(preset.into()),
            "medium".into(),
            "provider-instruct-type".into(),
            None,
        );
    }

    if let Some(preset) = model.and_then(template_from_model_name) {
        return (
            Some(preset.into()),
            Some(preset.into()),
            "medium".into(),
            "model-name".into(),
            None,
        );
    }

    (None, None, "low".into(), "insufficient-metadata".into(), None)
}

pub async fn analyze_backend_model(config: BackendConfig) -> Result<ModelAnalysis, String> {
    let config = validate_config(config)?;
    let probe = match config.backend_type.as_str() {
        "ollama" => test_ollama(&config).await?,
        "koboldcpp" => test_koboldcpp(&config).await?,
        "llamacpp" => test_llamacpp(&config).await?,
        "textgenwebui" => test_textgenwebui(&config).await?,
        "nanogpt" => test_nanogpt(&config).await?,
        "custom" => test_custom(&config).await?,
        _ => test_openai(&config).await?,
    };

    let model_id = config
        .model
        .clone()
        .filter(|selected| probe.models.iter().any(|model| model == selected))
        .or_else(|| probe.model_name.clone())
        .or_else(|| config.model.clone())
        .or_else(|| probe.models.first().cloned());
    let info = model_id
        .as_deref()
        .and_then(|id| probe.model_details.iter().find(|entry| entry.id == id))
        .cloned();
    let props = analysis_properties(&BackendConfig { model: model_id.clone(), ..config.clone() }).await;
    let chat_template = props.as_ref().and_then(analysis_chat_template);
    let tokenizer = info.as_ref().and_then(|entry| entry.tokenizer.clone());
    let instruct_type = info.as_ref().and_then(|entry| entry.instruct_type.clone());
    let modality = info.as_ref().and_then(|entry| entry.modality.clone());
    let architecture = props.as_ref().and_then(analysis_architecture).or_else(|| tokenizer.clone());
    let model_path = props.as_ref().and_then(analysis_model_path);
    let props_context = props.as_ref().and_then(nested_context_length);
    let model_name = info.as_ref().and_then(|entry| entry.name.clone()).or_else(|| model_id.clone());
    let (context_preset, instruction_preset, confidence, source, chat_template_hash) =
        derive_prompt_presets(model_id.as_deref(), chat_template.as_deref(), instruct_type.as_deref());
    let detected_template = context_preset.clone().or_else(|| instruction_preset.clone());
    let mut notes = Vec::new();
    if chat_template.is_some() {
        notes.push("Backend exposed a model chat template; recommendations were derived from it when recognized.".into());
    } else {
        notes.push("Backend did not expose a chat template; recommendations can only use model/provider metadata.".into());
    }
    if context_preset.is_none() || instruction_preset.is_none() {
        notes.push("No known Context/Instruct preset can be selected confidently from the available metadata.".into());
    }

    Ok(ModelAnalysis {
        provider: config.backend_type,
        model_id,
        model_name,
        architecture,
        tokenizer,
        instruct_type,
        modality,
        context_length: props_context.or_else(|| info.as_ref().and_then(|entry| entry.context_length)),
        price_label: info.as_ref().and_then(|entry| entry.price_label.clone()),
        subscription_included: info.as_ref().and_then(|entry| entry.subscription_included),
        subscription_input_multiplier: info.as_ref().and_then(|entry| entry.subscription_input_multiplier),
        vision: info.as_ref().map(|entry| entry.vision).unwrap_or(false),
        reasoning: info.as_ref().map(|entry| entry.reasoning).unwrap_or(false),
        tools: info.as_ref().map(|entry| entry.tools).unwrap_or(false),
        model_path,
        chat_template,
        chat_template_hash,
        detected_template,
        context_preset,
        instruction_preset,
        confidence,
        source,
        notes,
    })
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
    let request = request_for_provider(
        config,
        client.post(endpoint(&config.url, "/v1/chat/completions")).json(&Value::Object(payload)),
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
    let request = request_for_provider(
        config,
        client.post(endpoint(&config.url, "/v1/completions"))
            .json(&build_openai_text_payload(config, prompt, stop_strings, params)),
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
    let mut payload = Map::new();
    add_model(&mut payload, config);
    payload.insert("prompt".into(), json!(prompt));
    payload.insert("n_predict".into(), json!(params.max_tokens));
    payload.insert("temperature".into(), json!(params.temperature));
    payload.insert("top_p".into(), json!(params.top_p));
    payload.insert("stop".into(), json!(stop_strings));
    payload.insert("stream".into(), json!(false));
    let payload = Value::Object(payload);
    let response = authorize(
        client.post(endpoint(&config.url, "/completion")).json(&payload),
        &config.api_key,
    )
    .send()
    .await
    .map_err(|error| format!("llama.cpp completion failed: {error}"))?;
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
            model_name: result
                .model_name
                .or(config.model)
                .or_else(|| result.models.first().cloned()),
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
