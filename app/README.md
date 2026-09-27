# NastyVerse application extension

`app/` is no longer a second Tauri binary.

The only desktop executable is `NastyVerse-Launcher.exe`. The launcher is also the native Tauri host for the main application window. Everything under `app/src/` is application frontend content that the launcher installs into the user's local NastyVerse runtime and serves through the internal `nastyverse-app://` protocol.

The launcher compares these files directly with the repository's `main` branch and downloads only files whose Git blob SHA differs locally. `shared/tokens.css` is installed as `tokens.css` beside `index.html` so the shared design tokens remain the single source of truth.

Do not add another `app/src-tauri/` crate unless the project owner explicitly reverses the single-host architecture decision.


## Application version

Current application payload version: **0.1.12**. The source of truth is `src/app-version.json`. This version is independent from the launcher/native host version.

## Current functional base

The frontend now includes a full Character Library management surface: search/sort/filter/favorites/tags, rich character cards, avatar editing, personality/scenario/greetings/example messages, prompt overrides, creator metadata, duplication, JSON export, Character Card import from JSON/PNG/APNG/CHARX, and local conversation statistics. Conversations and character records are still persisted locally in the frontend for this base. Structured content will move to SQLite later. Character Card import currently runs entirely in the replaceable frontend so it stays compatible with existing launcher versions; V1/V2/V3 cards are normalized into the current internal character model.

## Application i18n

The application UI translations live in `app/src/i18n/`. `languages.json` lists available languages; each language has its own JSON dictionary (for example `en-en.json` and `fr-fr.json`). Adding a language requires adding its dictionary and one entry to `languages.json`; English remains the fallback.
