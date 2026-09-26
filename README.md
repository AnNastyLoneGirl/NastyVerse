# NastyVerse

NastyVerse now uses **one native executable**: `NastyVerse-Launcher.exe`.

The launcher is simultaneously:

- the public file a new user downloads;
- the Tauri/Rust host for NastyVerse;
- the silent bootstrapper that copies itself to the managed local location;
- the signed self-updater for the launcher itself;
- the installer/updater for the HTML/CSS/JS application payload.

There is no second NastyVerse application executable and no NSIS/MSI setup in the normal user flow.

## First launch

A release build downloaded by the user silently creates the managed copy at:

```text
%LOCALAPPDATA%\NastyVerse\Launcher\NastyVerse-Launcher.exe
```

It creates no Desktop or Start Menu shortcut. The downloaded `NastyVerse-Launcher.exe` remains the user's visible entry point. It starts the managed copy, then exits.

On later launches, that downloaded EXE simply forwards to the managed copy. It never overwrites an existing managed launcher, so an old downloaded bootstrap cannot downgrade a launcher that has already self-updated.

The managed launcher then checks the application files and offers **Install** if needed.

## Two update layers

### 1. Launcher / native host

GitHub Releases contain only:

```text
NastyVerse-Launcher.exe
NastyVerse-Launcher.exe.sig
```

The raw executable is signed with the existing Tauri/Minisign updater key. The installed launcher checks `launcher-v*` Releases, downloads a newer raw EXE only when necessary, verifies its signature, starts it as a temporary helper, closes the old launcher, swaps the executable, relaunches the managed copy, and removes the temporary/backup files.

No NSIS/MSI installer is involved in launcher updates.

### 2. Main application content

`app/src/**` and `shared/tokens.css` are synchronized directly from GitHub `main`.

Rust compares each local file with the current Git blob SHA. Only missing or changed files are downloaded. Files no longer present in the current application snapshot are removed.

There is no historical patch chain: a new user gets the current state immediately, while an existing user downloads only current differences.

## Development

```powershell
cd launcher
cargo tauri dev
```

Debug builds do not self-bootstrap or self-update, so development always runs from the source tree.

## Local portable release build

From the repository root on Windows:

```cmd
scripts\build-portable-launcher.cmd
```

The script reads the public updater key from:

```text
%USERPROFILE%\.tauri\nastyverse-updater.key.pub
```

and creates:

```text
dist\NastyVerse-Launcher.exe
```

No installer is generated.

For an official public release, push a matching `launcher-vX.Y.Z` tag. GitHub Actions builds the raw executable, signs it using the repository secrets, and publishes the EXE plus `.sig` to GitHub Releases.

See `START_HERE.md` for the full from-zero Git/GitHub/build/release procedure.
