# NastyVerse application 0.2.1

The application is a replaceable HTML/CSS/JavaScript payload hosted by the single Tauri launcher (0.1.12). No second Tauri crate is introduced.

The original character library, connection management and Context/Instruct pipeline are retained. Studio adds IndexedDB conversations, groups, personas with conditional variations, lore, notes, memory, text documents, message operations, portable backups and utility dialogs. See `../LISEZ-MOI-STUDIO.md` and `../COMPATIBILITE-SILLYTAVERN.md` for exact capabilities and remaining gaps.

Files:
- `app.js`: original application with explicit Studio integration points.
- `studio-core.js`: data normalization, migration, lore, retrieval, JSONL and persona variation matching. Also importable from Node tests.
- `studio.js`: IndexedDB workspace, conversation UI, prompt assembly and generation.
- `studio-library.js`: guided editors, persona variations, utilities and backups.
- `studio-media.js`: image attachments, vision controls, image generation and SillyTavern-style chat display translation.
- `text-rules-worker.js`: isolated, time-limited regular expression processing.
- `studio.css`: workspace and dialog styling.

`index.html` loads the Studio functions before the original bootstrap. Native commands for streaming, cancellation and chat translation are additive. When an older launcher lacks streaming, the frontend falls back to its original completion commands without automatically retrying provider errors.

Studio conversations and metadata live in the `nastyverse-studio` IndexedDB database; avatars retain their existing asset database. Migration copies legacy localStorage conversations and keeps the original keys. Settings and characters retain their existing storage contracts. Full portable backups include both stores and the explicitly allowed setting keys; native connection credentials are excluded.

FR/EN text on new screens uses `nvText`; the existing interface retains its translation dictionaries. The native Windows evaluation package uses a separate `studio-data/webview` profile beside its executable.

Chat translation keeps English as the canonical message content used for prompt assembly. When enabled, user input is translated to English before storage while preserving the visible text separately; assistant replies remain English internally and store a translated display layer. Translation settings are persisted natively and support Google, LibreTranslate, Lingva, DeepL, DeepLX, Bing, OneRingTranslator and Yandex.
