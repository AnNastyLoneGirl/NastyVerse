//! Native Anthropic and Gemini adapters. Credentials stay in native config.
use super::*;

pub(super) fn is_native(config: &BackendConfig) -> bool { matches!(config.backend_type.as_str(), "anthropic" | "google") }

fn google_root(config: &BackendConfig) -> String {
    let base = config.url.trim_end_matches('/');
    if base.ends_with("/v1beta") || base.ends_with("/v1") { base.into() } else { format!("{base}/v1beta") }
}

fn plain(content: &Value) -> String {
    content.as_str().map(str::to_string).unwrap_or_else(|| content.as_array().map(|parts| parts.iter().filter_map(|p|p.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n")).unwrap_or_default())
}

fn image_data(value: &Value) -> Result<(&str, &str), String> {
    let image = value.pointer("/image_url/url").and_then(Value::as_str).ok_or("Invalid image")?;
    let (header, data) = image.split_once(',').ok_or("Images must use inline data URLs")?;
    let mime = header.strip_prefix("data:").and_then(|s|s.strip_suffix(";base64")).ok_or("Invalid image data URL")?;
    if !matches!(mime,"image/png"|"image/jpeg"|"image/webp"|"image/gif") || data.len()>12_000_000 { return Err("Unsupported image format or size".into()); }
    Ok((mime,data))
}

fn parts(content: &Value, google: bool) -> Result<Vec<Value>, String> {
    if let Some(text) = content.as_str() { return Ok(vec![if google { json!({"text":text}) } else { json!({"type":"text","text":text}) }]); }
    let mut result = Vec::new();
    for part in content.as_array().ok_or("Message content must be text or an array")? {
        match part.get("type").and_then(Value::as_str) {
            Some("text") => result.push(if google {json!({"text":part.get("text").and_then(Value::as_str).unwrap_or("")})} else {part.clone()}),
            Some("image_url") => {
                let (mime,data) = image_data(part)?;
                result.push(if google {json!({"inlineData":{"mimeType":mime,"data":data}})} else {json!({"type":"image","source":{"type":"base64","media_type":mime,"data":data}})});
            },
            _ => return Err("Unsupported message content part".into()),
        }
    }
    Ok(result)
}

pub(super) fn ollama_messages(messages:&Value)->Result<Value,String>{
    let mut turns=Vec::new();
    for message in messages.as_array().ok_or("Invalid messages")?{
        let content=message.get("content").ok_or("Missing message content")?;
        let mut turn=json!({"role":message["role"],"content":plain(content)});
        if let Some(parts)=content.as_array(){
            let mut images=Vec::new();
            for part in parts{if part.get("type").and_then(Value::as_str)==Some("image_url"){images.push(image_data(part)?.1);}}
            if !images.is_empty(){turn["images"]=json!(images);}
        }
        turns.push(turn);
    }
    Ok(json!(turns))
}

pub(super) fn prepare(config: &BackendConfig, messages: &[ChatMessage], params: &GenerationParams, stream: bool) -> Result<(String, Value), String> {
    let google = config.backend_type == "google";
    let model = config.model.as_deref().ok_or("Select a model")?;
    if !model.chars().all(|c| c.is_ascii_alphanumeric() || "-._/".contains(c)) { return Err("Invalid model identifier".into()); }
    let mut system = Vec::new(); let mut turns: Vec<Value> = Vec::new();
    for message in messages {
        if message.role == "system" && turns.is_empty() { system.push(plain(&message.content)); continue; }
        let role = if message.role == "assistant" {if google {"model"} else {"assistant"}} else {"user"};
        let content = if message.role == "system" {json!(format!("[Instruction]\n{}",plain(&message.content)))} else {message.content.clone()};
        let mut content_parts = parts(&content,google)?;
        let key = if google {"parts"} else {"content"};
        if let Some(previous) = turns.last_mut().filter(|t|t.get("role").and_then(Value::as_str)==Some(role)) {
            previous.get_mut(key).and_then(Value::as_array_mut).ok_or("Invalid turn")?.append(&mut content_parts);
        } else { let mut turn=Map::new();turn.insert("role".into(),json!(role));turn.insert(key.into(),json!(content_parts));turns.push(Value::Object(turn)); }
    }
    if turns.is_empty() { turns.push(if google {json!({"role":"user","parts":[{"text":"Continue."}]})} else {json!({"role":"user","content":"Continue."})}); }
    if google {
        let method=if stream {"streamGenerateContent?alt=sse"} else {"generateContent"};
        let url=format!("{}/models/{}:{method}",google_root(config),model.trim_start_matches("models/"));
        let mut generation=json!({"temperature":params.temperature.clamp(0.0,2.0),"topP":params.top_p.clamp(0.0,1.0),"maxOutputTokens":params.max_tokens.clamp(1,131072)});
        if let Some(seed)=params.seed {generation["seed"]=json!(seed);}
        if let Some(top_k)=params.top_k {generation["topK"]=json!(top_k);}
        let mut payload=json!({"contents":turns,"generationConfig":generation});
        if !system.is_empty(){payload["systemInstruction"]=json!({"parts":[{"text":system.join("\n\n")}]});}
        Ok((url,payload))
    } else {
        let mut payload=json!({"model":model,"messages":turns,"max_tokens":params.max_tokens.clamp(1,131072),"stream":stream});
        if !system.is_empty(){payload["system"]=json!(system.join("\n\n"));}
        // New Claude models may reject sampling overrides. Keep native defaults.
        Ok((endpoint(&config.url,"/v1/messages"),payload))
    }
}

pub(super) async fn probe(config: &BackendConfig) -> Result<BackendProbe,String> {
    let google=config.backend_type=="google";let mut models=Vec::new();let mut token=String::new();
    for _ in 0..20 {
        let base=if google {format!("{}/models",google_root(config))} else {endpoint(&config.url,"/v1/models")};
        let mut url=reqwest::Url::parse(&base).map_err(|e|e.to_string())?;
        url.query_pairs_mut().append_pair(if google {"pageSize"} else {"limit"},if google {"1000"} else {"1000"});
        if !token.is_empty(){url.query_pairs_mut().append_pair(if google {"pageToken"} else {"after_id"},&token);}
        let response=request_for_provider(config,client(20)?.get(url)).send().await.map_err(|e|e.to_string())?;
        let data=response_json(response,"Native provider models").await?;
        for item in data.get(if google {"models"} else {"data"}).and_then(Value::as_array).into_iter().flatten(){
            if google && !array_contains(item.get("supportedGenerationMethods"),"generateContent"){continue;}
            let model_id=item.get(if google {"name"} else {"id"}).and_then(Value::as_str).unwrap_or("").trim_start_matches("models/");
            if model_id.is_empty(){continue;}
            let mut info=basic_model_info(model_id,value_u64(item.get(if google {"inputTokenLimit"} else {"max_input_tokens"})));
            info.name=item.get(if google {"displayName"} else {"display_name"}).and_then(Value::as_str).map(str::to_string);
            models.push(info);
        }
        let next=if google {data.get("nextPageToken").and_then(Value::as_str)} else if data.get("has_more").and_then(Value::as_bool)==Some(true){data.get("last_id").and_then(Value::as_str)}else{None};
        match next {Some(next) if !next.is_empty() && next!=token=>token=next.into(),_=>break}
    }
    models.sort_by(|a,b|a.id.cmp(&b.id));models.dedup_by(|a,b|a.id==b.id);
    let ids=models.iter().map(|m|m.id.clone()).collect::<Vec<_>>();
    let selected=config.model.clone().filter(|id|ids.contains(id)).or_else(||ids.first().cloned());
    Ok(BackendProbe{models:ids,model_name:selected,model_details:models})
}

pub(super) fn response_text(payload: &Value, google: bool) -> Option<String> {
    let parts=payload.pointer(if google {"/candidates/0/content/parts"} else {"/content"})?.as_array()?;
    let content=parts.iter().filter(|p|p.get("thought").and_then(Value::as_bool)!=Some(true)).filter_map(|p|p.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("");
    if content.is_empty(){None}else{Some(content)}
}

pub(super) async fn complete(config: &BackendConfig,messages: &[ChatMessage],params: &GenerationParams)->Result<CompletionResult,String>{
    let(url,payload)=prepare(config,messages,params,false)?;
    let response=request_for_provider(config,client(300)?.post(url).json(&payload)).send().await.map_err(|e|e.to_string())?;
    let value=response_json(response,"Native provider completion").await?;
    let content=response_text(&value,config.backend_type=="google").ok_or_else(||format!("Provider returned no text: {}",value.get("promptFeedback").unwrap_or(&Value::Null)))?;
    Ok(CompletionResult{content,model:config.model.clone()})
}

#[cfg(test)]
mod tests {
 use super::*;
 fn config(provider:&str)->BackendConfig{BackendConfig{backend_type:provider.into(),url:"https://example.test".into(),model:Some("test-model".into()),api_key:None,api_mode:"chat".into()}}
 #[test]fn native_payloads_preserve_turn_order(){
  let messages:Vec<ChatMessage>=serde_json::from_value(json!([{"role":"system","content":"Base"},{"role":"user","content":"Hello"},{"role":"system","content":"Note"},{"role":"assistant","content":"Hi"}])).unwrap();
  let params:GenerationParams=serde_json::from_value(json!({"temperature":0.8,"topP":0.9,"maxTokens":500})).unwrap();
  let(url,payload)=prepare(&config("anthropic"),&messages,&params,true).unwrap();assert!(url.ends_with("/v1/messages"));assert_eq!(payload["system"],"Base");assert_eq!(payload["messages"][0]["content"][1]["text"],"[Instruction]\nNote");
  let(url,payload)=prepare(&config("google"),&messages,&params,true).unwrap();assert!(url.ends_with(":streamGenerateContent?alt=sse"));assert_eq!(payload["contents"][1]["role"],"model");
 }
 #[test]fn native_images_convert_without_remote_fetch(){let content=json!([{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}}]);assert_eq!(parts(&content,true).unwrap()[0]["inlineData"]["mimeType"],"image/png");assert!(parts(&json!([{"type":"image_url","image_url":{"url":"https://example.test/image.png"}}]),false).is_err());}
 #[test]fn ollama_images_are_separate_from_text(){let result=ollama_messages(&json!([{"role":"user","content":[{"type":"text","text":"Look"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}}]}])).unwrap();assert_eq!(result[0]["content"],"Look");assert_eq!(result[0]["images"][0],"AAAA");}
}
