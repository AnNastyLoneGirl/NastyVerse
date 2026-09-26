use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Manager};

const GITHUB_OWNER: &str = "AnNastyLoneGirl";
const GITHUB_REPO: &str = "NastyVerse";
const GITHUB_BRANCH: &str = "main";
const APP_SOURCE_PREFIX: &str = "app/src/";
const SHARED_TOKENS_SOURCE: &str = "shared/tokens.css";
const GITHUB_API_VERSION: &str = "2026-03-10";

#[derive(Debug, Deserialize)]
struct BranchResponse {
    commit: BranchCommit,
}

#[derive(Debug, Deserialize)]
struct BranchCommit {
    sha: String,
    commit: BranchCommitDetails,
}

#[derive(Debug, Deserialize)]
struct BranchCommitDetails {
    tree: BranchTree,
}

#[derive(Debug, Deserialize)]
struct BranchTree {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GitTreeResponse {
    tree: Vec<GitTreeEntry>,
    truncated: bool,
}

#[derive(Debug, Deserialize)]
struct GitTreeEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
    size: Option<u64>,
}

#[derive(Clone, Debug)]
struct RemoteFile {
    source_path: String,
    install_path: PathBuf,
    sha: String,
    size: u64,
}

#[derive(Debug)]
struct RemoteSnapshot {
    revision: String,
    files: Vec<RemoteFile>,
}

#[derive(Debug)]
struct Diff {
    changed: Vec<RemoteFile>,
    obsolete: Vec<PathBuf>,
}

#[derive(Serialize)]
pub struct InstallStatus {
    pub state: String,
    pub message: String,
    pub files_to_download: usize,
    pub files_to_remove: usize,
    pub bytes_to_download: u64,
    pub remote_revision: Option<String>,
    pub installed: bool,
    pub offline: bool,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    phase: String,
    current: usize,
    total: usize,
    bytes_done: u64,
    bytes_total: u64,
    path: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct RuntimeState {
    source: String,
    branch: String,
    revision: String,
    files: Vec<RuntimeStateFile>,
}

#[derive(Serialize, Deserialize)]
struct RuntimeStateFile {
    path: String,
    sha: String,
}

pub fn nastyverse_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .local_data_dir()
        .map(|path| path.join("NastyVerse"))
        .map_err(|error| format!("Unable to resolve the local application data directory: {error}"))
}

pub fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(nastyverse_root(app)?.join("runtime"))
}

pub fn runtime_entry_exists(app: &AppHandle) -> bool {
    runtime_dir(app)
        .map(|path| path.join("index.html").is_file())
        .unwrap_or(false)
}

fn state_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(nastyverse_root(app)?.join("runtime-state.json"))
}

fn update_staging_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(nastyverse_root(app)?.join("update-staging"))
}

fn update_backup_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(nastyverse_root(app)?.join("update-backup"))
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NastyVerse-Launcher")
        .build()
        .map_err(|error| format!("Unable to initialize the GitHub client: {error}"))
}

async fn fetch_snapshot() -> Result<RemoteSnapshot, String> {
    let client = github_client()?;
    let branch_url = format!(
        "https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/branches/{GITHUB_BRANCH}"
    );
    let branch: BranchResponse = client
        .get(branch_url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .await
        .map_err(|error| format!("Unable to contact GitHub: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub returned an error while checking NastyVerse: {error}"))?
        .json()
        .await
        .map_err(|error| format!("GitHub returned invalid branch information: {error}"))?;

    let tree_url = format!(
        "https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/git/trees/{}?recursive=1",
        branch.commit.commit.tree.sha
    );
    let tree: GitTreeResponse = client
        .get(tree_url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .send()
        .await
        .map_err(|error| format!("Unable to read the NastyVerse file tree from GitHub: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub returned an error while reading the NastyVerse file tree: {error}"))?
        .json()
        .await
        .map_err(|error| format!("GitHub returned an invalid file tree: {error}"))?;

    if tree.truncated {
        return Err("The GitHub file tree is too large to verify safely.".into());
    }

    let mut files = Vec::new();
    for entry in tree.tree {
        if entry.entry_type != "blob" {
            continue;
        }

        if let Some(relative) = entry.path.strip_prefix(APP_SOURCE_PREFIX) {
            if relative == "tokens.css" || relative.is_empty() {
                continue;
            }
            let install_path = safe_relative_path(relative)?;
            files.push(RemoteFile {
                source_path: entry.path,
                install_path,
                sha: entry.sha,
                size: entry.size.unwrap_or(0),
            });
            continue;
        }

        if entry.path == SHARED_TOKENS_SOURCE {
            files.push(RemoteFile {
                source_path: entry.path,
                install_path: PathBuf::from("tokens.css"),
                sha: entry.sha,
                size: entry.size.unwrap_or(0),
            });
        }
    }

    if !files.iter().any(|file| file.install_path == Path::new("index.html")) {
        return Err(format!(
            "No {APP_SOURCE_PREFIX}index.html was found on the {GITHUB_BRANCH} branch."
        ));
    }

    files.sort_by(|left, right| left.install_path.cmp(&right.install_path));

    Ok(RemoteSnapshot {
        revision: branch.commit.sha,
        files,
    })
}

fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return Err(format!("Unsafe absolute path received from GitHub: {path}"));
    }

    let mut clean = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            _ => return Err(format!("Unsafe path received from GitHub: {path}")),
        }
    }

    if clean.as_os_str().is_empty() {
        return Err("GitHub returned an empty application path.".into());
    }

    Ok(clean)
}

fn git_blob_sha(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn local_blob_sha(path: &Path) -> Result<Option<String>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Unable to inspect {}: {error}", path.display())),
    };

    if !metadata.file_type().is_file() {
        return Ok(None);
    }

    let bytes = fs::read(path).map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    Ok(Some(git_blob_sha(&bytes)))
}

fn collect_local_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    fn walk(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in fs::read_dir(current)
            .map_err(|error| format!("Unable to read {}: {error}", current.display()))?
        {
            let entry = entry.map_err(|error| format!("Unable to enumerate {}: {error}", current.display()))?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("Unable to inspect {}: {error}", path.display()))?;

            if metadata.file_type().is_dir() {
                walk(root, &path, out)?;
            } else {
                let relative = path
                    .strip_prefix(root)
                    .map_err(|error| format!("Unable to normalize {}: {error}", path.display()))?
                    .to_path_buf();
                out.push(relative);
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    walk(root, root, &mut files)?;
    Ok(files)
}

fn diff_snapshot(runtime: &Path, snapshot: &RemoteSnapshot) -> Result<Diff, String> {
    let desired: BTreeMap<PathBuf, &RemoteFile> = snapshot
        .files
        .iter()
        .map(|file| (file.install_path.clone(), file))
        .collect();

    let mut changed = Vec::new();
    for file in &snapshot.files {
        let local_path = runtime.join(&file.install_path);
        if local_blob_sha(&local_path)?.as_deref() != Some(file.sha.as_str()) {
            changed.push(file.clone());
        }
    }

    let mut obsolete = Vec::new();
    for local in collect_local_files(runtime)? {
        if !desired.contains_key(&local) {
            obsolete.push(local);
        }
    }

    obsolete.sort();
    Ok(Diff { changed, obsolete })
}

fn build_status(runtime: &Path, snapshot: &RemoteSnapshot, diff: &Diff) -> InstallStatus {
    let installed = runtime.join("index.html").is_file();
    let bytes_to_download = diff.changed.iter().map(|file| file.size).sum();

    let (state, message) = if !installed {
        (
            "install",
            format!(
                "NastyVerse is not installed. {} files are ready to download.",
                snapshot.files.len()
            ),
        )
    } else if !diff.changed.is_empty() || !diff.obsolete.is_empty() {
        (
            "update",
            format!(
                "{} file(s) need to be downloaded and {} obsolete file(s) removed.",
                diff.changed.len(),
                diff.obsolete.len()
            ),
        )
    } else {
        ("launch", "NastyVerse is installed and up to date.".to_string())
    };

    InstallStatus {
        state: state.into(),
        message,
        files_to_download: diff.changed.len(),
        files_to_remove: diff.obsolete.len(),
        bytes_to_download,
        remote_revision: Some(snapshot.revision.clone()),
        installed,
        offline: false,
    }
}

fn read_runtime_state(app: &AppHandle) -> Result<RuntimeState, String> {
    let path = state_file(app)?;
    let data = fs::read(&path)
        .map_err(|error| format!("Unable to read the saved NastyVerse runtime state: {error}"))?;
    serde_json::from_slice(&data)
        .map_err(|error| format!("The saved NastyVerse runtime state is invalid: {error}"))
}

fn verify_saved_runtime(app: &AppHandle, runtime: &Path) -> Result<String, String> {
    let state = read_runtime_state(app)?;
    if state.files.is_empty() {
        return Err("No saved file integrity information is available.".into());
    }

    for file in &state.files {
        let relative = safe_relative_path(&file.path)?;
        let actual = local_blob_sha(&runtime.join(relative))?;
        if actual.as_deref() != Some(file.sha.as_str()) {
            return Err(format!("The installed file {} is missing or corrupted.", file.path));
        }
    }

    Ok(state.revision)
}

pub async fn check_installation(app: &AppHandle) -> Result<InstallStatus, String> {
    let runtime = runtime_dir(app)?;
    match fetch_snapshot().await {
        Ok(snapshot) => {
            let diff = diff_snapshot(&runtime, &snapshot)?;
            Ok(build_status(&runtime, &snapshot, &diff))
        }
        Err(network_error) if runtime.join("index.html").is_file() => {
            match verify_saved_runtime(app, &runtime) {
                Ok(revision) => Ok(InstallStatus {
                    state: "launch".into(),
                    message: format!("GitHub could not be reached, but the installed files passed the last saved integrity check. {network_error}"),
                    files_to_download: 0,
                    files_to_remove: 0,
                    bytes_to_download: 0,
                    remote_revision: Some(revision),
                    installed: true,
                    offline: true,
                }),
                Err(local_error) => Err(format!(
                    "GitHub could not be reached and the local installation could not be verified. {local_error} Network error: {network_error}"
                )),
            }
        }
        Err(error) => Err(error),
    }
}

fn raw_file_url(source_path: &str, revision: &str) -> Result<Url, String> {
    let base = format!(
        "https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{revision}/"
    );
    let mut url = Url::parse(&base).map_err(|error| format!("Invalid GitHub download URL: {error}"))?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "Unable to construct the GitHub download URL.".to_string())?;
        for segment in source_path.split('/') {
            segments.push(segment);
        }
    }
    Ok(url)
}

async fn download_to_staging(
    app: &AppHandle,
    files: &[RemoteFile],
    revision: &str,
    staging: &Path,
) -> Result<(), String> {
    let client = github_client()?;
    let total = files.len();
    let bytes_total: u64 = files.iter().map(|file| file.size).sum();
    let mut bytes_done = 0u64;

    for (index, file) in files.iter().enumerate() {
        let _ = app.emit(
            "installation-progress",
            ProgressEvent {
                phase: "downloading".into(),
                current: index,
                total,
                bytes_done,
                bytes_total,
                path: Some(file.install_path.to_string_lossy().into_owned()),
            },
        );

        let response = client
            .get(raw_file_url(&file.source_path, revision)?)
            .send()
            .await
            .map_err(|error| format!("Unable to download {}: {error}", file.source_path))?
            .error_for_status()
            .map_err(|error| format!("GitHub could not provide {}: {error}", file.source_path))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Unable to read {}: {error}", file.source_path))?;

        let actual_sha = git_blob_sha(&bytes);
        if actual_sha != file.sha {
            return Err(format!(
                "Integrity check failed for {}. Expected {}, got {}.",
                file.source_path, file.sha, actual_sha
            ));
        }

        let target = staging.join(&file.install_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Unable to create {}: {error}", parent.display()))?;
        }
        fs::write(&target, &bytes)
            .map_err(|error| format!("Unable to stage {}: {error}", target.display()))?;

        bytes_done = bytes_done.saturating_add(bytes.len() as u64);
        let _ = app.emit(
            "installation-progress",
            ProgressEvent {
                phase: "downloading".into(),
                current: index + 1,
                total,
                bytes_done,
                bytes_total,
                path: Some(file.install_path.to_string_lossy().into_owned()),
            },
        );
    }

    Ok(())
}

fn remove_path(path: &Path) -> Result<(), String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Unable to inspect {}: {error}", path.display())),
    };

    if metadata.file_type().is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("Unable to remove {}: {error}", path.display()))
    } else {
        fs::remove_file(path).map_err(|error| format!("Unable to remove {}: {error}", path.display()))
    }
}

fn reset_dir(path: &Path) -> Result<(), String> {
    remove_path(path)?;
    fs::create_dir_all(path).map_err(|error| format!("Unable to create {}: {error}", path.display()))
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create {}: {error}", parent.display()))?;
    }
    Ok(())
}

fn move_path(source: &Path, destination: &Path) -> Result<(), String> {
    ensure_parent(destination)?;
    fs::rename(source, destination).map_err(|error| {
        format!(
            "Unable to move {} to {}: {error}",
            source.display(),
            destination.display()
        )
    })
}

fn prune_empty_directories(root: &Path) {
    fn prune(current: &Path, root: &Path) -> bool {
        let Ok(entries) = fs::read_dir(current) else {
            return false;
        };
        let children: Vec<PathBuf> = entries.filter_map(Result::ok).map(|entry| entry.path()).collect();
        for child in children {
            if child.is_dir() {
                prune(&child, root);
            }
        }
        if current != root {
            if fs::read_dir(current)
                .ok()
                .and_then(|mut entries| entries.next().map(|_| ()))
                .is_none()
            {
                let _ = fs::remove_dir(current);
                return true;
            }
        }
        false
    }

    if root.is_dir() {
        prune(root, root);
    }
}

fn apply_staged_update(
    runtime: &Path,
    staging: &Path,
    backup: &Path,
    changed: &[RemoteFile],
    obsolete: &[PathBuf],
) -> Result<(), String> {
    fs::create_dir_all(runtime)
        .map_err(|error| format!("Unable to create {}: {error}", runtime.display()))?;
    reset_dir(backup)?;

    let changed_paths: BTreeSet<PathBuf> = changed.iter().map(|file| file.install_path.clone()).collect();
    let mut backup_candidates: Vec<PathBuf> = changed_paths
        .iter()
        .cloned()
        .chain(obsolete.iter().cloned())
        .collect();
    backup_candidates.sort_by_key(|path| path.components().count());
    backup_candidates.dedup();

    let mut backed_up = Vec::new();
    for relative in backup_candidates {
        if backed_up.iter().any(|ancestor: &PathBuf| relative.starts_with(ancestor)) {
            continue;
        }
        let source = runtime.join(&relative);
        if fs::symlink_metadata(&source).is_ok() {
            move_path(&source, &backup.join(&relative))?;
            backed_up.push(relative);
        }
    }

    let mut installed_new = Vec::new();
    let apply_result: Result<(), String> = (|| {
        for file in changed {
            let source = staging.join(&file.install_path);
            let destination = runtime.join(&file.install_path);
            move_path(&source, &destination)?;
            installed_new.push(file.install_path.clone());
        }
        Ok(())
    })();

    if let Err(error) = apply_result {
        for relative in installed_new.iter().rev() {
            let _ = remove_path(&runtime.join(relative));
        }
        for relative in backed_up.iter().rev() {
            let source = backup.join(relative);
            let destination = runtime.join(relative);
            if source.exists() {
                let _ = move_path(&source, &destination);
            }
        }
        return Err(format!("The update could not be applied and was rolled back: {error}"));
    }

    let _ = remove_path(backup);
    prune_empty_directories(runtime);
    Ok(())
}

fn write_runtime_state(app: &AppHandle, snapshot: &RemoteSnapshot) -> Result<(), String> {
    let path = state_file(app)?;
    ensure_parent(&path)?;
    let state = RuntimeState {
        source: format!("https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}"),
        branch: GITHUB_BRANCH.into(),
        revision: snapshot.revision.clone(),
        files: snapshot
            .files
            .iter()
            .map(|file| RuntimeStateFile {
                path: file.install_path.to_string_lossy().replace('\\', "/"),
                sha: file.sha.clone(),
            })
            .collect(),
    };
    let data = serde_json::to_vec_pretty(&state)
        .map_err(|error| format!("Unable to serialize the installed runtime state: {error}"))?;
    fs::write(&path, data).map_err(|error| format!("Unable to write {}: {error}", path.display()))
}

pub async fn sync_installation(app: &AppHandle) -> Result<InstallStatus, String> {
    let snapshot = fetch_snapshot().await?;
    let runtime = runtime_dir(app)?;
    let diff = diff_snapshot(&runtime, &snapshot)?;

    if diff.changed.is_empty() && diff.obsolete.is_empty() {
        write_runtime_state(app, &snapshot)?;
        return Ok(build_status(&runtime, &snapshot, &diff));
    }

    let staging = update_staging_dir(app)?;
    let backup = update_backup_dir(app)?;
    reset_dir(&staging)?;

    let _ = app.emit(
        "installation-progress",
        ProgressEvent {
            phase: "preparing".into(),
            current: 0,
            total: diff.changed.len(),
            bytes_done: 0,
            bytes_total: diff.changed.iter().map(|file| file.size).sum(),
            path: None,
        },
    );

    let download_result = download_to_staging(app, &diff.changed, &snapshot.revision, &staging).await;
    if let Err(error) = download_result {
        let _ = remove_path(&staging);
        return Err(error);
    }

    let _ = app.emit(
        "installation-progress",
        ProgressEvent {
            phase: "applying".into(),
            current: diff.changed.len(),
            total: diff.changed.len(),
            bytes_done: diff.changed.iter().map(|file| file.size).sum(),
            bytes_total: diff.changed.iter().map(|file| file.size).sum(),
            path: None,
        },
    );

    let apply_result = apply_staged_update(&runtime, &staging, &backup, &diff.changed, &diff.obsolete);
    let _ = remove_path(&staging);
    let _ = remove_path(&backup);
    apply_result?;

    let verification = diff_snapshot(&runtime, &snapshot)?;
    if !verification.changed.is_empty() || !verification.obsolete.is_empty() {
        return Err("The update finished, but the final integrity verification did not match GitHub.".into());
    }

    write_runtime_state(app, &snapshot)?;

    let _ = app.emit(
        "installation-progress",
        ProgressEvent {
            phase: "complete".into(),
            current: diff.changed.len(),
            total: diff.changed.len(),
            bytes_done: diff.changed.iter().map(|file| file.size).sum(),
            bytes_total: diff.changed.iter().map(|file| file.size).sum(),
            path: None,
        },
    );

    Ok(build_status(&runtime, &snapshot, &verification))
}
