# NastyVerse application extension

`app/` is no longer a second Tauri binary.

The only desktop executable is `NastyVerse-Launcher.exe`. The launcher is also the native Tauri host for the main application window. Everything under `app/src/` is application frontend content that the launcher installs into the user's local NastyVerse runtime and serves through the internal `nastyverse-app://` protocol.

The launcher compares these files directly with the repository's `main` branch and downloads only files whose Git blob SHA differs locally. `shared/tokens.css` is installed as `tokens.css` beside `index.html` so the shared design tokens remain the single source of truth.

Do not add another `app/src-tauri/` crate unless the project owner explicitly reverses the single-host architecture decision.


## Application version

Current application payload version: **0.1.26**. The source of truth is `src/app-version.json`. This version is independent from the launcher/native host version.

## Current functional base

The frontend now includes a full Character Library management surface: search/sort/filter/favorites/tags, rich character cards, avatar editing, personality/scenario/greetings/example messages, prompt overrides, creator metadata, duplication, JSON export, Character Card import from JSON/PNG/APNG/CHARX, and local conversation statistics. Conversations and character records are still persisted locally in the frontend for this base. Structured content will move to SQLite later. Character Card import currently runs entirely in the replaceable frontend so it stays compatible with existing launcher versions; V1/V2/V3 cards are normalized into the current internal character model. The Global Prompt area also provides SillyTavern-style Context presets/options, Instruction formatting, System/Post-History prompts and a single backend-aware prompt preview; Text Completion requests use this pipeline when the saved backend mode resolves to Text Completion. Instruction formatting includes the complete 38-preset set from the supplied SillyTavern source tree, ST-compatible preset JSON import/export, activation regexes, Context binding, names behavior, Story String/user/assistant/system sequences, first/last sequences, user filler messages and stop-string generation. Context formatting is likewise sourced from the 34 supplied SillyTavern presets; the editor uses a compact one-condition-per-line view with `\n` for emitted line breaks while persisting the canonical Story String.

## Application i18n

The application UI translations live in `app/src/i18n/`. `languages.json` lists available languages; each language has its own JSON dictionary (for example `en-en.json` and `fr-fr.json`). Adding a language requires adding its dictionary and one entry to `languages.json`; English remains the fallback.

Context/Text Completion assembly now follows the supplied SillyTavern generation order more closely: Story String rendering and Instruct wrapping, in-chat Story String depth injection, Post-History as the final user instruction, newest-first history budgeting, Example Messages behavior (normal/keep/strip), Chat Start placement, final generation sequence, and SillyTavern-compatible stop-string selection. Unsupported SillyTavern subsystems such as World Info/Author's Note/group generation remain outside this frontend base.
