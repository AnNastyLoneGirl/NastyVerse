use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};

const LAUNCHER_FILE_NAME: &str = "NastyVerse-Launcher.exe";

pub enum StartupAction {
    Continue,
    Exit,
}

pub fn nastyverse_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let local_app_data = env::var_os("LOCALAPPDATA")
            .ok_or_else(|| "LOCALAPPDATA is not available on this Windows account.".to_string())?;
        return Ok(PathBuf::from(local_app_data).join("NastyVerse"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = env::var_os("HOME")
            .ok_or_else(|| "HOME is not available on this account.".to_string())?;
        Ok(PathBuf::from(home).join(".local/share/NastyVerse"))
    }
}

pub fn managed_launcher_path() -> Result<PathBuf, String> {
    Ok(nastyverse_root()?.join("Launcher").join(LAUNCHER_FILE_NAME))
}

pub fn launcher_update_dir() -> Result<PathBuf, String> {
    Ok(nastyverse_root()?.join("launcher-update"))
}

fn same_file_path(left: &Path, right: &Path) -> bool {
    let normalize = |path: &Path| {
        fs::canonicalize(path)
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .replace('/', "\\")
            .to_ascii_lowercase()
    };
    normalize(left) == normalize(right)
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create {}: {error}", parent.display()))?;
    }
    Ok(())
}

fn remove_file_with_retry(path: &Path, attempts: usize) {
    if path.as_os_str().is_empty() {
        return;
    }
    for _ in 0..attempts {
        match fs::remove_file(path) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) => thread::sleep(Duration::from_millis(125)),
        }
    }
}

fn install_first_copy(source: &Path, target: &Path) -> Result<(), String> {
    ensure_parent(target)?;
    let staging = target.with_extension("bootstrap-new.exe");
    let _ = fs::remove_file(&staging);
    fs::copy(source, &staging).map_err(|error| {
        format!(
            "Unable to prepare the managed NastyVerse Launcher at {}: {error}",
            staging.display()
        )
    })?;
    fs::rename(&staging, target).map_err(|error| {
        format!(
            "Unable to install the managed NastyVerse Launcher at {}: {error}",
            target.display()
        )
    })?;
    Ok(())
}

fn launch_managed(target: &Path) -> Result<(), String> {
    Command::new(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to start {}: {error}", target.display()))
}

fn bootstrap_release_launcher() -> Result<StartupAction, String> {
    let current = env::current_exe()
        .map_err(|error| format!("Unable to determine the launcher path: {error}"))?;
    let managed = managed_launcher_path()?;

    if same_file_path(&current, &managed) {
        return Ok(StartupAction::Continue);
    }

    if !managed.is_file() {
        install_first_copy(&current, &managed)?;
    }

    // A launcher started from Downloads/Desktop is only a bootstrap entry point.
    // Once a managed copy exists, never overwrite it with this external copy:
    // the managed launcher may already have self-updated to a newer version.
    launch_managed(&managed).map_err(|error| {
        format!(
            "The managed NastyVerse Launcher could not be started at {}: {error}",
            managed.display()
        )
    })?;

    Ok(StartupAction::Exit)
}

fn wait_until_old_launcher_can_move(target: &Path, backup: &Path) -> Result<bool, String> {
    if !target.exists() {
        return Ok(false);
    }

    remove_file_with_retry(backup, 8);

    let mut last_error = None;
    for _ in 0..150 {
        match fs::rename(target, backup) {
            Ok(()) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => {
                last_error = Some(error);
                thread::sleep(Duration::from_millis(100));
            }
        }
    }

    Err(format!(
        "The previous launcher did not close in time: {}",
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "unknown Windows file lock".into())
    ))
}

fn apply_update(target: &Path) -> Result<(), String> {
    if target.file_name().and_then(|name| name.to_str()) != Some(LAUNCHER_FILE_NAME) {
        return Err("Refusing to replace an unexpected launcher filename.".into());
    }

    let helper = env::current_exe()
        .map_err(|error| format!("Unable to determine the updater helper path: {error}"))?;
    ensure_parent(target)?;

    let pid = std::process::id();
    let next = target.with_file_name(format!("NastyVerse-Launcher.update-new-{pid}.exe"));
    let backup = target.with_file_name(format!("NastyVerse-Launcher.update-old-{pid}.exe"));
    let _ = fs::remove_file(&next);
    fs::copy(&helper, &next)
        .map_err(|error| format!("Unable to stage the new launcher: {error}"))?;

    let had_previous = wait_until_old_launcher_can_move(target, &backup)?;

    if let Err(error) = fs::rename(&next, target) {
        if had_previous && backup.exists() {
            let _ = fs::rename(&backup, target);
        }
        return Err(format!("Unable to activate the new launcher: {error}"));
    }

    let spawn_result = Command::new(target)
        .arg("--nv-cleanup-update")
        .arg(&helper)
        .arg(&backup)
        .spawn();

    if let Err(error) = spawn_result {
        let _ = fs::remove_file(target);
        if had_previous && backup.exists() {
            let _ = fs::rename(&backup, target);
        }
        return Err(format!("The new launcher was installed but could not be started: {error}"));
    }

    Ok(())
}

fn cleanup_update(temp_helper: &Path, backup: &Path) {
    remove_file_with_retry(temp_helper, 50);
    remove_file_with_retry(backup, 20);
    if let Ok(dir) = launcher_update_dir() {
        let _ = fs::remove_dir(dir);
    }
}

pub fn handle_early_startup() -> Result<StartupAction, String> {
    let args: Vec<_> = env::args_os().collect();
    let flag = args.get(1).and_then(|value| value.to_str());

    if flag == Some("--nv-apply-update") {
        let target = args
            .get(2)
            .map(PathBuf::from)
            .ok_or_else(|| "The launcher updater did not receive its target path.".to_string())?;
        apply_update(&target)?;
        return Ok(StartupAction::Exit);
    }

    if flag == Some("--nv-cleanup-update") {
        let temp_helper = args.get(2).map(PathBuf::from).unwrap_or_default();
        let backup = args.get(3).map(PathBuf::from).unwrap_or_default();
        cleanup_update(&temp_helper, &backup);
    }

    #[cfg(debug_assertions)]
    {
        Ok(StartupAction::Continue)
    }

    #[cfg(not(debug_assertions))]
    {
        bootstrap_release_launcher()
    }
}
