//! Image generation through an explicitly configured endpoint.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ImageConfig {
    pub provider: String,
    pub url: String,
    pub model: String,
    pub api_key: Option<String>,
    #[serde(default)] pub legacy_base64: bool,
}

fn validate(mut config:ImageConfig)->Result<ImageConfig,String>{
    if !matches!(config.provider.as_str(),"openai"|"automatic1111"){return Err("Unsupported image provider".into());}
    config.url=config.url.trim().trim_end_matches('/').into();
    let url=reqwest::Url::parse(&config.url).map_err(|_|"Invalid image service URL")?;
    if !matches!(url.scheme(),"http"|"https")||url.host_str().is_none()||!url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some(){return Err("Use an HTTP(S) service URL without credentials or query parameters".into());}
    if config.provider=="openai" && config.model.trim().is_empty(){return Err("Select an image model".into());}
    Ok(config)
}
pub fn load(app:&AppHandle)->Result<Option<ImageConfig>,String>{
    let path=installer::nastyverse_root(app)?.join("image-config.json");
    if !path.exists(){return Ok(None);}
    validate(serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?).map(Some)
}
pub fn save(app:&AppHandle,config:ImageConfig)->Result<ImageConfig,String>{
    let config=validate(config)?;let root=installer::nastyverse_root(app)?;
    fs::create_dir_all(&root).map_err(|e|e.to_string())?;
    fs::write(root.join("image-config.json"),serde_json::to_vec_pretty(&config).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    Ok(config)
}
fn payload(config:&ImageConfig,prompt:&str,size:&str)->Result<(String,Value),String>{
    let dimensions=match size{"512x512"=>(512,512),"1024x1024"=>(1024,1024),"1024x1536"=>(1024,1536),"1536x1024"=>(1536,1024),_=>return Err("Unsupported image size".into())};
    if prompt.trim().is_empty()||prompt.len()>32000{return Err("Image prompt must contain 1 to 32000 bytes".into());}
    if config.provider=="automatic1111"{
        Ok((endpoint(&config.url,"/sdapi/v1/txt2img"),json!({"prompt":prompt,"steps":20,"width":dimensions.0,"height":dimensions.1,"batch_size":1,"n_iter":1})))
    }else{
        let mut body=json!({"model":config.model,"prompt":prompt,"n":1,"size":size});
        if config.legacy_base64{body["response_format"]=json!("b64_json");}
        Ok((endpoint(&config.url,"/v1/images/generations"),body))
    }
}
fn data_url(encoded:&str)->Result<String,String>{
    let encoded=encoded.strip_prefix("data:image/png;base64,").unwrap_or(encoded);
    if encoded.len()>28_000_000{return Err("Generated image exceeds 20 MB".into());}
    let bytes=STANDARD.decode(encoded).map_err(|_|"Invalid image encoding")?;
    let mime=if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){"image/png"}else if bytes.starts_with(b"\xff\xd8\xff"){"image/jpeg"}else if bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP"){"image/webp"}else{return Err("The provider did not return a PNG, JPEG or WebP image".into());};
    Ok(format!("data:{mime};base64,{encoded}"))
}
pub async fn generate(app:&AppHandle,request_id:String,prompt:String,size:String)->Result<Value,String>{
    let config=load(app)?.ok_or("Configure an image service in Tools first")?;
    let (url,body)=payload(&config,&prompt,&size)?;
    if request_id.is_empty()||request_id.len()>128{return Err("Invalid request ID".into());}
    let(handle,registration)=AbortHandle::new_pair();
    {let mut registry=ACTIVE_REQUESTS.get_or_init(||Mutex::new(HashMap::new())).lock().map_err(|_|"Request registry unavailable")?;if registry.contains_key(&request_id){return Err("Duplicate request ID".into());}registry.insert(request_id.clone(),handle);}
    let result=Abortable::new(async{
        let response=authorize(client(600)?.post(url).json(&body),&config.api_key).send().await.map_err(|e|e.to_string())?;
        let status=response.status();let mut chunks=response.bytes_stream();let mut bytes=Vec::new();
        while let Some(chunk)=chunks.next().await{let chunk=chunk.map_err(|e|e.to_string())?;if bytes.len()+chunk.len()>30_000_000{return Err("Image response exceeds 30 MB".into());}bytes.extend_from_slice(&chunk);}
        if !status.is_success(){return Err(format!("Image service HTTP {status}: {}",String::from_utf8_lossy(&bytes).chars().take(800).collect::<String>()));}
        let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Invalid image service response")?;
        let encoded=value.pointer("/data/0/b64_json").or_else(||value.pointer("/images/0")).and_then(Value::as_str).ok_or("This service returned no inline image. Enable the legacy base64 option if your model requires it.")?;
        Ok(json!({"dataUrl":data_url(encoded)?,"revisedPrompt":value.pointer("/data/0/revised_prompt").and_then(Value::as_str),"model":config.model}))
    },registration).await.unwrap_or_else(|_|Err("Image generation cancelled".into()));
    if let Ok(mut registry)=ACTIVE_REQUESTS.get_or_init(||Mutex::new(HashMap::new())).lock(){registry.remove(&request_id);}
    result
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn image_request_and_response_validation(){let mut config=ImageConfig{provider:"openai".into(),url:"http://localhost:123/v1".into(),model:"gpt-image-fixture".into(),api_key:None,legacy_base64:false};let(url,body)=payload(&config,"scene","1024x1024").unwrap();assert!(url.ends_with("/v1/images/generations"));assert!(body.get("response_format").is_none());config.provider="automatic1111".into();assert_eq!(payload(&config,"scene","512x512").unwrap().1["width"],512);assert!(payload(&config,"","512x512").is_err());assert!(data_url("PHN2Zz4=").is_err());assert!(data_url("iVBORw0KGgo=").unwrap().starts_with("data:image/png;"));}
}
