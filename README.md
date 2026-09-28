# NastyVerse

NastyVerse now uses **one native executable**: `NastyVerse-Launcher.exe`.

The launcher is simultaneously:

- the public file a new user downloads;
- the Tauri/Rust host for NastyVerse;
- the silent bootstrapper that copies itself to the managed local location;
- the signed self-updater for the launcher itself;
- the installer/updater for the HTML/CSS/JS application payload.

The launcher UI also bundles its own looping theme (`launcher/src/assets/launcher-theme.mp3`). It starts with the launcher, stores the selected volume locally from **Options**, and stops when the main NastyVerse application is launched. The Home page is intentionally fitted to the launcher viewport with no vertical scrolling; other tabs retain independent scrolling.

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


## Remote Home carousel

The Home hero/carousel is driven by `launcher-content/home.json` on GitHub `main`. Updating that JSON (or images referenced by it) does **not** require rebuilding the launcher. The launcher uses the last successful JSON as a local cache and falls back to a bundled default when GitHub is unavailable.

Each slide supports `key`, `description_en`, `description_fr`, `image`, `button`, `button_text_fr`, `button_text_en`, and `action`. Relative image paths resolve under `launcher-content/`; absolute `http(s)` image URLs are also accepted. Actions support `tab:catalog`, `tab:changelog`, `tab:options`, or `url:https://...`. The slide array order is the carousel order.

## Remote News / Changelog feed

`launcher-content/news.json` on GitHub `main` is the single source for the Home **Latest news** panel, the **Changelog** tab and the **News / Actualités** tab. Updating the JSON or its referenced images does not require rebuilding the launcher.

Each entry supports `title`, `category`, `image`, `date`, `summary_fr`, `summary_en`, `description_fr`, and `description_en`. Use ISO dates (`YYYY-MM-DD`) so sorting is deterministic.

- Home shows the 4 newest entries across all categories.
- Changelog shows every entry whose category is `Update` (case-insensitive).
- News shows every non-`Update` entry.
- All three views sort newest to oldest.
- Home cards open Changelog for `Update` entries and News for every other category.

Relative image paths resolve under `launcher-content/`, e.g. `"image": "news/example.webp"` maps to `launcher-content/news/example.webp`.

## Launcher content & translations

The launcher reads its editable Home/News content from `launcher-content/` on the GitHub `main` branch. `home.json` and `news.json` contain structure and translation keys only. Visible strings live in `launcher-content/i18n/<locale>.json`. Locale files are discovered dynamically, so adding a new translation file does not require rebuilding the launcher. English (`en-en`) is the fallback language.

## Launcher remote content

`launcher-content/home.json` and `launcher-content/news.json` only describe structure.
Localized text lives in `launcher-content/i18n/<locale>.json` using nested keys such as
`slide.<key>.description`, `slide.<key>.button`, and `news.<key>.title|summary|description`.
Catalog translations keep their current format for now.



## Versioning

Launcher/native host and application payload use independent versions.

- Launcher/native host: **0.1.10**
- Application payload: **0.1.31** (`app/src/app-version.json`)

Changes limited to `app/src/**` advance only the application version and are synchronized from GitHub `main`; they do not require a new launcher Release. The application must remain tolerant of native commands that may be unavailable on older launchers. Native launcher changes use their own release cycle.

## Application base 0.1.31

Model analysis now uses extended chat-template recognition and, when metadata cannot identify a reliable Context/Instruct pair in Text Completion mode, a short behavioral fallback that probes several compatible preset pairs against the loaded model before making a recommendation.

> Backend connection commands are native Tauri commands and require Launcher 0.1.10 or newer. App runtime updates alone cannot add these commands to an older host EXE.

The replaceable `app/src/**` frontend currently provides the Character Library base: search/sort/filter/favorites/tags, rich character cards, avatar editing, personality/scenario/greetings/example messages, prompt overrides, creator metadata, duplication, JSON export, Character Card import from JSON/PNG/APNG/CHARX, and local conversation statistics. Characters and conversations are still persisted locally in the WebView profile for this first application version.

The native host now persists/tests backend configuration and exposes non-streaming Chat Completion and Text Completion commands for KoboldCpp, llama.cpp server, text-generation-webui, Ollama, OpenAI, OpenRouter, NanoGPT, Groq, DeepSeek, Mistral API, Together AI and Custom OpenAI-compatible endpoints. The application selects Chat/Text mode from the saved backend configuration, and Text Completion uses the Context/Instruction pipeline plus stop strings and response post-processing. The Instruction Template editor now ships the 38 presets from the supplied SillyTavern source set, preserves their exact sequence/flag values, supports ST-compatible JSON import/export, context binding, activation regexes, model-assisted selection, and applies Story String/user/assistant/system/first/last/filler/stop-sequence behavior to the actual Text Completion prompt. Context presets are now rebuilt directly from the 34 presets in the supplied SillyTavern source set, retaining only the established NastyVerse `loreBefore`/`loreAfter` placeholder names. The Context editor shows each Handlebars conditional on one readable line by displaying emitted line breaks as `\n`, then restores the canonical SillyTavern-compatible Story String before saving or rendering.

Application payload 0.1.31 keeps the existing context assembly behavior and aligns Text Completion context assembly with the supplied SillyTavern source for the features NastyVerse currently implements, including example budgeting behavior and final prompt ordering.

Model configuration now also includes a model-analysis panel. It inspects backend metadata/chat templates when available and recommends matching Context/Instruct presets using SillyTavern-compatible chat-template fingerprints and markers.

Backend/model connection is now presented as one compact manual Provider / Endpoint / API key / Model / Prompting panel. Local backends remain supported, while OpenAI, OpenRouter, NanoGPT, Groq, DeepSeek, Mistral API, Together AI and Custom OpenAI-compatible endpoints share the same flow. Model discovery now retains provider metadata instead of flattening it to IDs; NanoGPT Sub/Sub multiplier, context length, pricing and model capabilities are displayed in the model selector/summary when supplied, and OpenRouter context/pricing/capability metadata is preserved as well. KoboldCpp context is read from its config endpoints when available and llama.cpp enriches the current model from `/props`.
