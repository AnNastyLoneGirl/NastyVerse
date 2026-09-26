use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest::Client;
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, process::Command, time::Duration};
use tauri::{AppHandle, Emitter};

use crate::bootstrap;

const GITHUB_OWNER: &str = "AnNastyLoneGirl";
const GITHUB_REPO: &str = "NastyVerse";
const GITHUB_API_VERSION: &str = "2026-03-10";
const RELEASE_PREFIX: &str = "launcher-v";
const LAUNCHER_ASSET: &str = "NastyVerse-Launcher.exe";
const LAUNCHER_SIGNATURE_ASSET: &str = "NastyVerse-Launcher.exe.sig";
const PUBLIC_KEY_ENV: &str = "NASTYVERSE_UPDATER_PUBLIC_KEY";
const MAX_LAUNCHER_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Serialize)]
pub struct LauncherUpdateStatus {
    pub configured: bool,
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub message: String,
    pub bytes_to_download: u64,
}

#[derive(Clone, Serialize)]
pub struct LauncherUpdateProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    url: String,
    size: u64,
    digest: Option<String>,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GitHubAsset>,
}

#[derive(Clone)]
struct LauncherRelease {
    version: Version,
    executable: GitHubAsset,
    signature: GitHubAsset,
}

fn embedded_public_key() -> Option<&'static str> {
    option_env!("NASTYVERSE_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(concat!("NastyVerse-Launcher/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("Unable to initialize the launcher update client: {error}"))
}

fn github_asset_request(client: &Client, asset: &GitHubAsset) -> reqwest::RequestBuilder {
    client
        .get(&asset.url)
        .header("Accept", "application/octet-stream")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
}

fn current_version(app: &AppHandle) -> Result<Version, String> {
    Version::parse(&app.package_info().version.to_string())
        .map_err(|error| format!("The current launcher version is invalid: {error}"))
}

async fn latest_launcher_release() -> Result<Option<LauncherRelease>, String> {
    let url = format!(
        "https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases?per_page=30"
    );
    let releases: Vec<GitHubRelease> = github_client()?
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .await
        .map_err(|error| format!("Unable to contact GitHub for launcher updates: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub returned an error while checking launcher updates: {error}"))?
        .json()
        .await
        .map_err(|error| format!("GitHub returned invalid launcher release information: {error}"))?;

    let mut best: Option<LauncherRelease> = None;

    for release in releases {
        if release.draft || release.prerelease {
            continue;
        }
        let Some(version_text) = release.tag_name.strip_prefix(RELEASE_PREFIX) else {
            continue;
        };
        let Ok(version) = Version::parse(version_text) else {
            continue;
        };

        let executable = release
            .assets
            .iter()
            .find(|asset| asset.name == LAUNCHER_ASSET)
            .cloned();
        let signature = release
            .assets
            .iter()
            .find(|asset| asset.name == LAUNCHER_SIGNATURE_ASSET)
            .cloned();
        let (Some(executable), Some(signature)) = (executable, signature) else {
            continue;
        };

        let candidate = LauncherRelease {
            version,
            executable,
            signature,
        };
        if best
            .as_ref()
            .map(|current| candidate.version > current.version)
            .unwrap_or(true)
        {
            best = Some(candidate);
        }
    }

    Ok(best)
}

fn decode_tauri_wrapped_text(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if let Ok(decoded) = STANDARD.decode(trimmed) {
        if let Ok(text) = String::from_utf8(decoded) {
            return Ok(text);
        }
    }
    Ok(trimmed.to_string())
}

fn verify_signature(payload: &[u8], signature_text: &str, expected_version: &Version) -> Result<(), String> {
    let public_key_text = embedded_public_key().ok_or_else(|| {
        format!(
            "Launcher self-update is not configured. Build with {PUBLIC_KEY_ENV}."
        )
    })?;

    let public_key_decoded = decode_tauri_wrapped_text(public_key_text)?;
    let public_key = PublicKey::decode(public_key_decoded.trim())
        .or_else(|_| PublicKey::from_base64(public_key_decoded.trim()))
        .map_err(|error| format!("The embedded launcher update public key is invalid: {error}"))?;

    let signature_decoded = decode_tauri_wrapped_text(signature_text)?;
    let signature = Signature::decode(signature_decoded.trim())
        .map_err(|error| format!("The downloaded launcher signature is invalid: {error}"))?;

    public_key
        .verify(payload, &signature, true)
        .map_err(|error| format!("Launcher update signature verification failed: {error}"))?;

    let trusted_comment = signature_decoded
        .lines()
        .find_map(|line| line.strip_prefix("trusted comment: "))
        .ok_or_else(|| "The launcher signature has no trusted version comment.".to_string())?;
    let expected_field = format!("version:{expected_version}");
    if !trusted_comment.split_whitespace().any(|field| field == expected_field) {
        return Err(format!(
            "The signed launcher version does not match GitHub Release {expected_version}."
        ));
    }

    Ok(())
}

fn verify_github_digest(payload: &[u8], digest: Option<&str>) -> Result<(), String> {
    let Some(expected) = digest.and_then(|value| value.strip_prefix("sha256:")) else {
        return Ok(());
    };
    let actual = format!("{:x}", Sha256::digest(payload));
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err("GitHub SHA-256 verification failed for the launcher update.".into())
    }
}

async fn download_launcher(app: &AppHandle, asset: &GitHubAsset) -> Result<Vec<u8>, String> {
    if asset.size > MAX_LAUNCHER_BYTES {
        return Err(format!(
            "The launcher update is unexpectedly large ({} bytes).",
            asset.size
        ));
    }

    let client = github_client()?;
    let response = github_asset_request(&client, asset)
        .send()
        .await
        .map_err(|error| format!("Unable to download the launcher update: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub could not provide the launcher update: {error}"))?;

    let total = response.content_length().or(Some(asset.size)).filter(|value| *value > 0);
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::with_capacity(asset.size.min(MAX_LAUNCHER_BYTES) as usize);
    let mut downloaded = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Launcher download interrupted: {error}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_LAUNCHER_BYTES {
            return Err("The launcher update exceeded the maximum allowed size.".into());
        }
        bytes.extend_from_slice(&chunk);
        let _ = app.emit(
            "launcher-update-progress",
            LauncherUpdateProgress {
                phase: "downloading".into(),
                downloaded,
                total,
            },
        );
    }

    verify_github_digest(&bytes, asset.digest.as_deref())?;
    Ok(bytes)
}

async fn download_signature(asset: &GitHubAsset) -> Result<String, String> {
    let client = github_client()?;
    let bytes = github_asset_request(&client, asset)
        .send()
        .await
        .map_err(|error| format!("Unable to download the launcher signature: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub could not provide the launcher signature: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("Unable to read the launcher signature: {error}"))?;
    String::from_utf8(bytes.to_vec())
        .map_err(|error| format!("The launcher signature is not valid UTF-8: {error}"))
}

#[tauri::command]
pub async fn check_launcher_update(app: AppHandle) -> Result<LauncherUpdateStatus, String> {
    let current = current_version(&app)?;

    #[cfg(debug_assertions)]
    {
        return Ok(LauncherUpdateStatus {
            configured: embedded_public_key().is_some(),
            available: false,
            current_version: current.to_string(),
            version: None,
            message: "Launcher self-update is skipped in debug builds.".into(),
            bytes_to_download: 0,
        });
    }

    #[cfg(not(debug_assertions))]
    {
        if embedded_public_key().is_none() {
            return Ok(LauncherUpdateStatus {
                configured: false,
                available: false,
                current_version: current.to_string(),
                version: None,
                message: format!(
                    "Launcher self-update is disabled because {PUBLIC_KEY_ENV} was not embedded at build time."
                ),
                bytes_to_download: 0,
            });
        }

        let Some(release) = latest_launcher_release().await? else {
            return Ok(LauncherUpdateStatus {
                configured: true,
                available: false,
                current_version: current.to_string(),
                version: None,
                message: "No published NastyVerse Launcher release was found yet.".into(),
                bytes_to_download: 0,
            });
        };

        if release.version > current {
            return Ok(LauncherUpdateStatus {
                configured: true,
                available: true,
                current_version: current.to_string(),
                version: Some(release.version.to_string()),
                message: format!(
                    "NastyVerse Launcher {} is available (installed: {}).",
                    release.version, current
                ),
                bytes_to_download: release.executable.size,
            });
        }

        Ok(LauncherUpdateStatus {
            configured: true,
            available: false,
            current_version: current.to_string(),
            version: None,
            message: "NastyVerse Launcher is up to date.".into(),
            bytes_to_download: 0,
        })
    }
}

#[tauri::command]
pub async fn install_launcher_update(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        return Err("Launcher self-update is disabled in debug builds.".into());
    }

    #[cfg(not(debug_assertions))]
    {
        let current = current_version(&app)?;
        let Some(release) = latest_launcher_release().await? else {
            return Err("No launcher release is available.".into());
        };
        if release.version <= current {
            return Err("No newer launcher version is currently available.".into());
        }

        let executable = download_launcher(&app, &release.executable).await?;
        let signature = download_signature(&release.signature).await?;
        verify_signature(&executable, &signature, &release.version)?;

        let update_dir = bootstrap::launcher_update_dir()?;
        fs::create_dir_all(&update_dir)
            .map_err(|error| format!("Unable to create {}: {error}", update_dir.display()))?;
        let helper_path = update_dir.join(format!(
            "NastyVerse-Launcher-{}.exe",
            release.version
        ));
        fs::write(&helper_path, &executable)
            .map_err(|error| format!("Unable to stage {}: {error}", helper_path.display()))?;

        let target = std::env::current_exe()
            .map_err(|error| format!("Unable to determine the current launcher path: {error}"))?;

        let _ = app.emit(
            "launcher-update-progress",
            LauncherUpdateProgress {
                phase: "installing".into(),
                downloaded: executable.len() as u64,
                total: Some(executable.len() as u64),
            },
        );

        Command::new(&helper_path)
            .arg("--nv-apply-update")
            .arg(&target)
            .spawn()
            .map_err(|error| format!("Unable to start the verified launcher updater: {error}"))?;

        app.exit(0);
        Ok(())
    }
}
