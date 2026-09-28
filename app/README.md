# NastyVerse application 0.2.23

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

Chat composer 0.2.2: the story header was removed, chat actions were folded into the toolbar, and the composer is now a single full-width row with tools, attachment, dictation, continue/stop and send controls.

Chat scroll 0.2.3: rerendering the active conversation now preserves the current viewport (or stays pinned to the bottom only when the user was already there), preventing the visible jump-to-top then smooth-scroll-to-bottom effect after messages and message actions.
Composer input 0.2.4: the message field now grows from one to three lines as text wraps or line breaks are added; from the fourth line onward only the textarea scrolls, keeping the surrounding composer compact.


Markdown personalization 0.2.5: chat messages now use a structured safe Markdown renderer for headings, emphasis, strikethrough, links, inline/fenced code, quotes, lists, separators and tables. A dedicated Personalization shortcut beside Configuration provides live per-element styling persisted in localStorage; these display settings never alter canonical message content or prompt assembly.

Markdown syntax examples 0.2.6: Personalization now shows a copyable usage example for every supported Markdown element.

Markdown RP semantics 0.2.7: Personalization renames generic Markdown labels around their chat/RP usage (Narration, Emphasis, Action) and adds a dedicated Dialogue style for quoted text (`"..."`) without changing the stored message content.

Dialogue normalization 0.2.8: Personalization can choose straight quotes (`"..."`) or French guillemets (`«...»`) as the preferred dialogue display. The renderer recognizes straight, curly, and French quote variants and normalizes them at display time only; stored/source messages remain unchanged for context assembly.
Dialogue nesting 0.2.9: nested quotations inside RP dialogue now alternate quote styles at display time. If the preferred outer dialogue style is French guillemets, inner citations render with double quotes; if double quotes are preferred, inner citations render with French guillemets. The stored/source message remains unchanged.
Chat translation 0.2.10: assistant translation no longer injects an English-language system instruction into the context prompt. When assistant translation is enabled, generated text is normalized to English after generation before being stored in the canonical conversation, then translated only for display. This removes the extra prompt tokens while preserving English context messages.


Message personalization 0.2.11: Personalization is split into Text and Messages. Message presentation now supports configurable maximum width, spacing, bubble padding/radius, role-name visibility, and Persona/Character avatar layout. Character replies use the speaking Character Card avatar; user messages keep the Persona identity used when the message was sent. Persona editing now supports avatar upload/removal, with the asset stored in the existing IndexedDB avatar store and included in portable backups.

Message personalization 0.2.12: Messages now have two scopes: global defaults and an optional override stored on the current conversation. Avatar framing adds independent X/Y anchors for Persona and Character images (object-position only; source assets are unchanged), and the same controls are available globally or per conversation.

Message personalization 0.2.13: Persona and Character avatar framing now includes an interactive crop preview. Drag the image inside the frame, adjust zoom from 100–400%, fine-tune X/Y framing, or recenter it. Framing remains display-only, preserves the original avatar asset, and works in both global defaults and current-conversation overrides.
Message personalization 0.2.14: Avatar framing is now applied directly to live preview and chat avatar images with inline object-position/transform styles, so X/Y/zoom settings cannot be lost through CSS variable scope or rerender timing. The crop editor, preview, and real chat use the same framing calculation.


Message personalization 0.2.15: Avatar framing now uses one shared focal-point renderer across the crop editor, live preview, and chat. X/Y are applied as the image object-position and zoom uses the same focal point as transform-origin. The live preview updates synchronously while dragging, and the Character/Persona framing controls are stacked into full-width cards for a clearer responsive layout.

Message personalization 0.2.16: avatar framing now uses explicit cover geometry from the source image natural size. The crop editor, live preview, and chat all share the same renderer, so X/Y/zoom expose the exact same image region at every avatar size.

Message personalization 0.2.17: avatar style now supports Square (1:1) and Portrait (2:3) frames. Avatar size is a free pixel width instead of a capped 88px slider; the exact crop renderer uses the selected frame ratio consistently in the crop editor, live preview, and chat.

Chat layout 0.2.18: the message stream now uses the full width available between the conversations sidebar and the right edge. The user-configured maximum message width is applied against that full usable width instead of a fixed centered 850px column.
Chat message actions 0.2.19: message actions are now rendered as a dedicated toolbar above the complete avatar + message row instead of below the bubble. This keeps controls visually attached to the whole message block, especially with large avatars and short messages.

Timeline navigation 0.2.20: the message action bar no longer exposes Branch or Bookmark, and the chat toolbar no longer exposes Bookmarks. A new Timeline button to the left of message search opens a native timeline navigator inspired by SillyTavern Timelines: all chats for the current target are merged into a branch graph, identical messages at the same depth share a node, realtime fragment search filters the graph, current-chat paths are highlighted, swipes can be expanded, nodes expose all chat occurrences, and users can jump to a message or create a branch from any message/swipe.

Timeline canvas navigation 0.2.21: the Timeline viewport is now a true pan/zoom surface. Drag empty space (or hold Space while dragging) to pan, use the mouse wheel to zoom around the cursor, and use the toolbar controls to fit or recenter the current chat. Pan/zoom state is preserved per target when reopening the Timeline.
Timeline viewport sizing 0.2.22: the Timeline dialog now fits entirely inside the available viewport without a dialog-level scrollbar. Its header and toolbar stay fixed, the pan/zoom canvas consumes the remaining space, and only the inspector/message detail area scrolls when its own content overflows.


Message variants 0.2.23: response variants are now controlled from the bottom-right corner inside each assistant message bubble. A single `›` creates a new variant; once variants exist the control becomes `‹ current/total ›`. Previous navigation is bounded, next advances through existing variants, and pressing next on the last variant generates a new alternative for that specific assistant message, including older messages. The former `Another reply` action was removed from the message action bar.
