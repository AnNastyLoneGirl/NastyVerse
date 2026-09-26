#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bootstrap;
mod installer;
mod launcher_updater;
mod protocol;

use serde::Serialize;
use std::process::Command;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const LAUNCHER_HOME_CONTENT_URL: &str =
    "https://raw.githubusercontent.com/AnNastyLoneGirl/NastyVerse/main/launcher-content/home.json";

#[tauri::command]
fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    let is_maximized = window.is_maximized().map_err(|error| error.to_string())?;
    if is_maximized {
        window.unmaximize().map_err(|error| error.to_string())
    } else {
        window.maximize().map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn window_start_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn window_close(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "app" {
        app.exit(0);
        Ok(())
    } else {
        window.close().map_err(|error| error.to_string())
    }
}

#[tauri::command]
async fn get_launcher_home_content() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("NastyVerse-Launcher")
        .build()
        .map_err(|error| format!("Unable to create the Home content client: {error}"))?;
    let response = client
        .get(LAUNCHER_HOME_CONTENT_URL)
        .send()
        .await
        .map_err(|error| format!("Unable to download launcher-content/home.json: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub returned an error for launcher-content/home.json: {error}"))?;
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| format!("launcher-content/home.json is not valid JSON: {error}"))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http:// and https:// URLs can be opened from launcher content.".into());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("rundll32");
        command.args(["url.dll,FileProtocolHandler", &url]);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&url);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&url);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open the external URL: {error}"))
}

#[tauri::command]
async fn check_installation(app: tauri::AppHandle) -> Result<installer::InstallStatus, String> {
    installer::check_installation(&app).await
}

#[tauri::command]
async fn sync_installation(app: tauri::AppHandle) -> Result<installer::InstallStatus, String> {
    installer::sync_installation(&app).await
}

#[tauri::command]
async fn launch_app(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("app") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        if let Some(launcher) = app.get_webview_window("main") {
            let _ = launcher.hide();
        }
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    if !installer::runtime_entry_exists(&app) {
        return Err("NastyVerse is not installed yet.".into());
    }

    let url = format!("{}://localhost/index.html", protocol::APP_PROTOCOL)
        .parse()
        .map_err(|error| format!("Unable to create the NastyVerse application URL: {error}"))?;

    let window = WebviewWindowBuilder::new(&app, "app", WebviewUrl::CustomProtocol(url))
        .title("NastyVerse")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .center()
        .build()
        .map_err(|error| format!("Unable to open NastyVerse: {error}"))?;

    if let Some(launcher) = app.get_webview_window("main") {
        launcher.hide().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Serialize)]
struct ModelStatus {
    loaded: bool,
    backend: Option<String>,
    model_name: Option<String>,
}

#[tauri::command]
fn get_model_status() -> ModelStatus {
    ModelStatus {
        loaded: false,
        backend: None,
        model_name: None,
    }
}

fn main() {
    match bootstrap::handle_early_startup() {
        Ok(bootstrap::StartupAction::Continue) => {}
        Ok(bootstrap::StartupAction::Exit) => return,
        Err(error) => {
            eprintln!("NastyVerse launcher bootstrap error: {error}");
        }
    }

    tauri::Builder::default()
        .register_uri_scheme_protocol(protocol::APP_PROTOCOL, |context, request| {
            protocol::response(context.app_handle(), request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_toggle_maximize,
            window_start_dragging,
            window_close,
            launcher_updater::check_launcher_update,
            launcher_updater::install_launcher_update,
            get_launcher_home_content,
            open_external_url,
            check_installation,
            sync_installation,
            launch_app,
            get_model_status
        ])
        .setup(|app| {
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "app" && matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running NastyVerse");
}
