use percent_encoding::percent_decode_str;
use std::{fs, path::{Component, Path, PathBuf}};
use tauri::{http::{header, Response, StatusCode}, AppHandle};

use crate::installer;

pub const APP_PROTOCOL: &str = "nastyverse-app";

fn safe_request_path(uri_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode_str(uri_path).decode_utf8().ok()?;
    let trimmed = decoded.trim_start_matches('/');
    let requested = if trimmed.is_empty() { "index.html" } else { trimmed };

    let mut clean = PathBuf::new();
    for component in Path::new(requested).components() {
        match component {
            Component::Normal(part) => clean.push(part),
            _ => return None,
        }
    }
    Some(clean)
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

#[cfg(debug_assertions)]
fn dev_source_file(relative: &Path) -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if relative == Path::new("tokens.css") {
        return Some(manifest_dir.join("../../shared/tokens.css"));
    }
    Some(manifest_dir.join("../../app/src").join(relative))
}

#[cfg(not(debug_assertions))]
fn dev_source_file(_relative: &Path) -> Option<PathBuf> {
    None
}

fn resolve_file(app: &AppHandle, relative: &Path) -> Option<PathBuf> {
    let installed = installer::runtime_dir(app).ok()?.join(relative);
    if installed.is_file() {
        return Some(installed);
    }

    let dev = dev_source_file(relative)?;
    if dev.is_file() {
        return Some(dev);
    }

    None
}

pub fn response(app: &AppHandle, uri_path: &str) -> Response<Vec<u8>> {
    let Some(relative) = safe_request_path(uri_path) else {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(b"Invalid NastyVerse application path.".to_vec())
            .unwrap();
    };

    let Some(path) = resolve_file(app, &relative) else {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(b"NastyVerse application file not found.".to_vec())
            .unwrap();
    };

    match fs::read(&path) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, content_type(&path))
            .header(header::CACHE_CONTROL, "no-cache")
            .body(bytes)
            .unwrap(),
        Err(error) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(format!("Unable to read the NastyVerse application file: {error}").into_bytes())
            .unwrap(),
    }
}
