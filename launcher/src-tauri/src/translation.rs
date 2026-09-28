use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::AppHandle;

use crate::installer;

const LINGVA_DEFAULT: &str = "https://lingva.ml/api/v1";
const DEEPLX_DEFAULT: &str = "http://127.0.0.1:1188/translate";
const ONERING_DEFAULT: &str = "http://127.0.0.1:4990/translate";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default = "default_target_language")]
    pub target_language: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default = "default_deepl_endpoint")]
    pub deepl_endpoint: String,
}

impl Default for TranslationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: default_provider(),
            target_language: default_target_language(),
            mode: default_mode(),
            api_key: None,
            url: None,
            deepl_endpoint: default_deepl_endpoint(),
        }
    }
}

fn default_provider() -> String { "google".into() }
fn default_target_language() -> String { "en".into() }
fn default_mode() -> String { "both".into() }
fn default_deepl_endpoint() -> String { "free".into() }

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(installer::nastyverse_root(app)?.join("translation-config.json"))
}

fn normalized_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim().to_string();
        (!value.is_empty()).then_some(value)
    })
}

fn validate_config(mut config: TranslationConfig) -> Result<TranslationConfig, String> {
    config.provider = config.provider.trim().to_ascii_lowercase();
    if !matches!(config.provider.as_str(), "google" | "libre" | "lingva" | "deepl" | "deeplx" | "bing" | "oneringtranslator" | "yandex") {
        return Err(format!("Unsupported translation provider: {}", config.provider));
    }
    config.mode = config.mode.trim().to_ascii_lowercase();
    if !matches!(config.mode.as_str(), "responses" | "inputs" | "both") {
        return Err("Translation mode must be responses, inputs, or both.".into());
    }
    config.target_language = config.target_language.trim().to_string();
    if config.target_language.is_empty() || config.target_language.len() > 16 {
        return Err("Translation target language is invalid.".into());
    }
    config.api_key = normalized_optional(config.api_key);
    config.url = normalized_optional(config.url);
    config.deepl_endpoint = match config.deepl_endpoint.trim().to_ascii_lowercase().as_str() {
        "pro" => "pro".into(),
        _ => "free".into(),
    };
    if let Some(url) = &config.url {
        let parsed = reqwest::Url::parse(url).map_err(|error| format!("Invalid translation URL: {error}"))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("Translation URLs must use http:// or https://.".into());
        }
    }
    if config.enabled && config.provider == "deepl" && config.api_key.is_none() {
        return Err("DeepL requires an API key.".into());
    }
    if config.enabled && config.provider == "libre" && config.url.is_none() {
        return Err("LibreTranslate requires an endpoint URL.".into());
    }
    Ok(config)
}

pub fn load(app: &AppHandle) -> Result<TranslationConfig, String> {
    let path = config_path(app)?;
    if !path.is_file() { return Ok(TranslationConfig::default()); }
    let bytes = fs::read(&path).map_err(|error| format!("Unable to read translation configuration: {error}"))?;
    let config = serde_json::from_slice::<TranslationConfig>(&bytes)
        .map_err(|error| format!("Translation configuration is invalid: {error}"))?;
    validate_config(config)
}

pub fn save(app: &AppHandle, config: TranslationConfig) -> Result<TranslationConfig, String> {
    let config = validate_config(config)?;
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Unable to create the NastyVerse data directory: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(&config).map_err(|error| format!("Unable to serialize translation configuration: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("Unable to save translation configuration: {error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("Unable to replace translation configuration: {error}"))?;
    }
    fs::rename(&temp, &path).map_err(|error| format!("Unable to finalize translation configuration: {error}"))?;
    Ok(config)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NastyVerse/translation")
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("Unable to create translation client: {error}"))
}

fn normalized_language(provider: &str, language: &str) -> String {
    match provider {
        "libre" => match language { "zh-CN" => "zh", "zh-TW" => "zt", "pt-BR" | "pt-PT" => "pt", value => value }.into(),
        "lingva" | "oneringtranslator" => match language { "zh-CN" | "zh-TW" => "zh", "pt-BR" | "pt-PT" => "pt", value => value }.into(),
        "deepl" | "deeplx" => match language { "zh-CN" | "zh-TW" => "ZH", value => value }.into(),
        "bing" => match language { "zh-CN" => "zh-Hans", "zh-TW" => "zh-Hant", "pt-BR" => "pt", value => value }.into(),
        "yandex" => match language { "zh-CN" | "zh-TW" => "zh", "pt-PT" => "pt", value => value }.into(),
        "google" => match language { "pt-BR" => "pt", value => value }.into(),
        _ => language.into(),
    }
}

fn split_chunks(text: &str, max_chars: usize) -> Vec<String> {
    if text.chars().count() <= max_chars { return vec![text.to_string()]; }
    let mut chunks = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if current.chars().count() >= max_chars {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() { chunks.push(current); }
    chunks
}

async fn google(client: &Client, text: &str, language: &str) -> Result<String, String> {
    let mut output = String::new();
    for chunk in split_chunks(text, 4500) {
        let response = client.get("https://translate.googleapis.com/translate_a/single")
            .query(&[("client", "gtx"), ("sl", "auto"), ("tl", language), ("dt", "t"), ("q", chunk.as_str())])
            .send().await.map_err(|error| format!("Google translation request failed: {error}"))?
            .error_for_status().map_err(|error| format!("Google translation failed: {error}"))?;
        let value: Value = response.json().await.map_err(|error| format!("Google returned invalid translation data: {error}"))?;
        let rows = value.get(0).and_then(Value::as_array).ok_or("Google returned no translation")?;
        for row in rows {
            if let Some(part) = row.get(0).and_then(Value::as_str) { output.push_str(part); }
        }
    }
    Ok(output)
}

async fn libre(client: &Client, config: &TranslationConfig, text: &str, language: &str) -> Result<String, String> {
    let url = config.url.as_deref().ok_or("LibreTranslate endpoint is not configured")?;
    let response = client.post(url).json(&json!({
        "q": text,
        "source": "auto",
        "target": language,
        "format": "text",
        "api_key": config.api_key,
    })).send().await.map_err(|error| format!("LibreTranslate request failed: {error}"))?
      .error_for_status().map_err(|error| format!("LibreTranslate failed: {error}"))?;
    let value: Value = response.json().await.map_err(|error| format!("LibreTranslate returned invalid data: {error}"))?;
    value.get("translatedText").and_then(Value::as_str).map(str::to_string).ok_or("LibreTranslate returned no translation".into())
}

async fn lingva(client: &Client, config: &TranslationConfig, text: &str, language: &str) -> Result<String, String> {
    let base = config.url.as_deref().unwrap_or(LINGVA_DEFAULT).trim_end_matches('/');
    let encoded = utf8_percent_encode(text, NON_ALPHANUMERIC).to_string();
    let url = format!("{base}/auto/{language}/{encoded}");
    let response = client.get(url).send().await.map_err(|error| format!("Lingva request failed: {error}"))?
        .error_for_status().map_err(|error| format!("Lingva failed: {error}"))?;
    let value: Value = response.json().await.map_err(|error| format!("Lingva returned invalid data: {error}"))?;
    value.get("translation").and_then(Value::as_str).map(str::to_string).ok_or("Lingva returned no translation".into())
}

async fn deepl(client: &Client, config: &TranslationConfig, text: &str, language: &str) -> Result<String, String> {
    let key = config.api_key.as_deref().ok_or("DeepL API key is not configured")?;
    let endpoint = if config.deepl_endpoint == "pro" { "https://api.deepl.com/v2/translate" } else { "https://api-free.deepl.com/v2/translate" };
    let mut form = vec![("text", text.to_string()), ("target_lang", language.to_string())];
    if matches!(language.to_ascii_lowercase().as_str(), "de" | "fr" | "it" | "es" | "nl" | "ja" | "ru" | "pt-br" | "pt-pt") {
        form.push(("formality", "default".into()));
    }
    let response = client.post(endpoint)
        .header("Authorization", format!("DeepL-Auth-Key {key}"))
        .form(&form)
        .send().await.map_err(|error| format!("DeepL request failed: {error}"))?
        .error_for_status().map_err(|error| format!("DeepL failed: {error}"))?;
    let value: Value = response.json().await.map_err(|error| format!("DeepL returned invalid data: {error}"))?;
    value.pointer("/translations/0/text").and_then(Value::as_str).map(str::to_string).ok_or("DeepL returned no translation".into())
}

async fn deeplx(client: &Client, config: &TranslationConfig, text: &str, language: &str) -> Result<String, String> {
    let url = config.url.as_deref().unwrap_or(DEEPLX_DEFAULT);
    let mut output = String::new();
    for chunk in split_chunks(text, 1500) {
        let response = client.post(url).json(&json!({"text": chunk, "source_lang": "auto", "target_lang": language}))
            .send().await.map_err(|error| format!("DeepLX request failed: {error}"))?
            .error_for_status().map_err(|error| format!("DeepLX failed: {error}"))?;
        let value: Value = response.json().await.map_err(|error| format!("DeepLX returned invalid data: {error}"))?;
        let part = value.get("data").and_then(Value::as_str).ok_or("DeepLX returned no translation")?;
        output.push_str(part);
    }
    Ok(output)
}

async fn onering(client: &Client, config: &TranslationConfig, text: &str, source_language: Option<&str>, language: &str) -> Result<String, String> {
    let url = config.url.as_deref().unwrap_or(ONERING_DEFAULT);
    let from = source_language.unwrap_or("auto");
    let response = client.get(url).query(&[("text", text), ("from_lang", from), ("to_lang", language)])
        .send().await.map_err(|error| format!("OneRingTranslator request failed: {error}"))?
        .error_for_status().map_err(|error| format!("OneRingTranslator failed: {error}"))?;
    let value: Value = response.json().await.map_err(|error| format!("OneRingTranslator returned invalid data: {error}"))?;
    value.get("result").and_then(Value::as_str).map(str::to_string).ok_or("OneRingTranslator returned no translation".into())
}

async fn yandex(client: &Client, text: &str, language: &str) -> Result<String, String> {
    let ucid = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos().to_string();
    let url = format!("https://translate.yandex.net/api/v1/tr.json/translate?ucid={ucid}&srv=android&format=text");
    let mut output = String::new();
    for chunk in split_chunks(text, 5000) {
        let response = client.post(&url).form(&[("text", chunk.as_str()), ("lang", language)])
            .send().await.map_err(|error| format!("Yandex translation request failed: {error}"))?
            .error_for_status().map_err(|error| format!("Yandex translation failed: {error}"))?;
        let value: Value = response.json().await.map_err(|error| format!("Yandex returned invalid data: {error}"))?;
        let parts = value.get("text").and_then(Value::as_array).ok_or("Yandex returned no translation")?;
        for part in parts { if let Some(part) = part.as_str() { output.push_str(part); } }
    }
    Ok(output)
}

async fn bing(client: &Client, text: &str, language: &str) -> Result<String, String> {
    let token = client.get("https://edge.microsoft.com/translate/auth")
        .send().await.map_err(|error| format!("Bing translation authentication failed: {error}"))?
        .error_for_status().map_err(|error| format!("Bing translation authentication failed: {error}"))?
        .text().await.map_err(|error| format!("Bing translation authentication returned invalid data: {error}"))?;
    let mut output = String::new();
    for chunk in split_chunks(text, 1000) {
        let response = client.post("https://api-edge.cognitive.microsofttranslator.com/translate")
            .query(&[("api-version", "3.0"), ("to", language)])
            .bearer_auth(token.trim())
            .json(&json!([{"Text": chunk}]))
            .send().await.map_err(|error| format!("Bing translation request failed: {error}"))?
            .error_for_status().map_err(|error| format!("Bing translation failed: {error}"))?;
        let value: Value = response.json().await.map_err(|error| format!("Bing returned invalid data: {error}"))?;
        let part = value.pointer("/0/translations/0/text").and_then(Value::as_str).ok_or("Bing returned no translation")?;
        output.push_str(part);
    }
    Ok(output)
}

pub async fn translate(app: &AppHandle, text: String, target_language: String, source_language: Option<String>) -> Result<String, String> {
    if text.trim().is_empty() { return Ok(String::new()); }
    let config = load(app)?;
    if !config.enabled { return Err("Chat translation is disabled.".into()); }
    let provider = config.provider.as_str();
    let language = normalized_language(provider, target_language.trim());
    if language.is_empty() { return Err("Target language is required.".into()); }
    let source = source_language.as_deref().map(|value| normalized_language(provider, value));
    let client = client()?;
    match provider {
        "google" => google(&client, &text, &language).await,
        "libre" => libre(&client, &config, &text, &language).await,
        "lingva" => lingva(&client, &config, &text, &language).await,
        "deepl" => deepl(&client, &config, &text, &language).await,
        "deeplx" => deeplx(&client, &config, &text, &language).await,
        "bing" => bing(&client, &text, &language).await,
        "oneringtranslator" => onering(&client, &config, &text, source.as_deref(), &language).await,
        "yandex" => yandex(&client, &text, &language).await,
        _ => Err(format!("Unsupported translation provider: {provider}")),
    }
}
