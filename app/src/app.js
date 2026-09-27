/* ===================================================================
   NastyVerse application runtime — vanilla JS, no bundler.
   The launcher is the native Tauri host; this file remains replaceable
   independently through the app runtime synchronizer.
=================================================================== */

const TAURI = window.__TAURI__;
const invoke = TAURI?.core?.invoke
  ? TAURI.core.invoke
  : async (cmd, args) => {
      console.log('[preview stub] invoke', cmd, args || '');
      if (cmd === 'get_model_status') return { loaded: false, backend: null, modelName: null, message: t('preview.browser') };
      if (cmd === 'load_backend_config') return null;
      if (cmd === 'test_backend_connection') return { ok: true, message: t('preview.connection'), models: ['preview-model'] };
      if (cmd === 'save_backend_config') return args?.config || null;
      if (cmd === 'chat_completion') return { content: t('preview.reply'), model: 'preview-model' };
      return null;
    };

const STORAGE = {
  locale: 'nv_app_locale',
  accent: 'nv_app_accent',
  params: 'nv_app_generation_params',
  characters: 'nv_app_characters_v1',
  conversations: 'nv_app_conversations_v1',
  activeCharacter: 'nv_app_active_character',
  ui: 'nv_app_ui_settings',
  contextTemplate: 'nv_app_context_template',
  instructionTemplate: 'nv_app_instruction_template_v1',
  globalSystemPrompt: 'nv_app_global_system_prompt',
  globalPostHistory: 'nv_app_global_post_history',
  globalPromptTab: 'nv_app_global_prompt_tab',
};

const I18N_FALLBACK_MANIFEST = {
  default: 'en-en',
  languages: [
    { code: 'en-en', label: 'English', file: 'en-en.json' },
    { code: 'fr-fr', label: 'Français', file: 'fr-fr.json' },
  ],
};

let languageManifest = I18N_FALLBACK_MANIFEST;
let fallbackTranslations = {};
let currentTranslations = {};

function normalizeLocaleCode(value) {
  const raw = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  if (raw === 'en') return 'en-en';
  if (raw === 'fr') return 'fr-fr';
  return raw || 'en-en';
}

async function fetchJsonResource(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
  return response.json();
}

async function loadLanguageManifest() {
  try {
    const manifest = await fetchJsonResource('i18n/languages.json');
    if (!Array.isArray(manifest?.languages) || !manifest.languages.length) throw new Error('Invalid language manifest');
    languageManifest = manifest;
  } catch (error) {
    console.warn('[i18n] Falling back to bundled language manifest.', error);
    languageManifest = I18N_FALLBACK_MANIFEST;
  }
  languageManifest.default = normalizeLocaleCode(languageManifest.default || 'en-en');
}

function languageDefinition(code) {
  const normalized = normalizeLocaleCode(code);
  return languageManifest.languages.find(language => normalizeLocaleCode(language.code) === normalized) || null;
}

async function loadTranslationFile(code) {
  const language = languageDefinition(code);
  if (!language) throw new Error(`Unknown language: ${code}`);
  const file = language.file || `${normalizeLocaleCode(language.code)}.json`;
  const data = await fetchJsonResource(`i18n/${file}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Invalid translation file: ${file}`);
  return data;
}

async function initI18n() {
  await loadLanguageManifest();
  try {
    fallbackTranslations = await loadTranslationFile(languageManifest.default);
  } catch (error) {
    console.error('[i18n] Failed to load default language.', error);
    fallbackTranslations = {};
  }

  const requested = normalizeLocaleCode(localStorage.getItem(STORAGE.locale) || languageManifest.default);
  state.locale = languageDefinition(requested) ? requested : languageManifest.default;
  if (state.locale === languageManifest.default) {
    currentTranslations = fallbackTranslations;
  } else {
    try {
      currentTranslations = await loadTranslationFile(state.locale);
    } catch (error) {
      console.warn('[i18n] Failed to load selected language, using fallback.', error);
      state.locale = languageManifest.default;
      currentTranslations = fallbackTranslations;
    }
  }
  localStorage.setItem(STORAGE.locale, state.locale);
  applyDocumentLanguage();
  applyChromeI18n();
}

async function setLocale(code) {
  const normalized = normalizeLocaleCode(code);
  const target = languageDefinition(normalized) ? normalized : languageManifest.default;
  state.locale = target;
  if (target === languageManifest.default) {
    currentTranslations = fallbackTranslations;
  } else {
    currentTranslations = await loadTranslationFile(target);
  }
  localStorage.setItem(STORAGE.locale, state.locale);
  applyDocumentLanguage();
  applyChromeI18n();
}

function t(key, replacements = {}) {
  let value = currentTranslations[key] ?? fallbackTranslations[key] ?? key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = String(value).replaceAll(`{${name}}`, String(replacement));
  }
  return String(value);
}

function applyDocumentLanguage() {
  document.documentElement.lang = state.locale.split('-')[0] || 'en';
}

function applyChromeI18n() {
  const controls = [
    ['btn-min', 'window.minimize'],
    ['btn-max', 'window.maximize'],
    ['btn-close', 'window.close'],
  ];
  controls.forEach(([id, key]) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.title = t(key);
    element.setAttribute('aria-label', t(key));
  });
}

function intlLocale() {
  if (state.locale === 'en-en') return 'en-US';
  return state.locale;
}

const NAV_ITEMS = [
  { id: 'chat', labelKey: 'nav.chat', icon: '<path d="M4 5h16v10H8l-4 4V5z"/>' },
  { id: 'library', labelKey: 'nav.library', icon: '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/>' },
];

const CONFIG_SECTIONS = [
  { id: 'general', labelKey: 'config.general' },
  { id: 'models', labelKey: 'config.models' },
  { id: 'global-prompt', labelKey: 'config.globalPrompt' },
  { id: 'model-params', labelKey: 'config.params' },
  { id: 'ui', labelKey: 'config.ui' },
];

const BACKENDS = [
  { id: 'koboldcpp', label: 'KoboldCpp', url: 'http://localhost:5001' },
  { id: 'llamacpp', label: 'llama.cpp server', url: 'http://localhost:8080' },
  { id: 'textgenwebui', label: 'text-generation-webui', url: 'http://localhost:5000' },
  { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', url: 'https://' },
];

const DEFAULT_PARAMS = { temperature: 0.8, topP: 0.95, maxTokens: 512 };
const DEFAULT_UI = { scale: 100, compactMessages: false };
const DEFAULT_CONTEXT_TEMPLATE = `{{#if system}}{{system}}

{{/if}}{{#if description}}Description:
{{description}}

{{/if}}{{#if personality}}Personality:
{{personality}}

{{/if}}{{#if scenario}}Scenario:
{{scenario}}
{{/if}}{{#if persona}}
User persona:
{{persona}}
{{/if}}{{#if loreBefore}}
World information:
{{loreBefore}}
{{/if}}{{#if loreAfter}}
{{loreAfter}}
{{/if}}`;

const LEGACY_CONTEXT_TEMPLATE_015 = `You are {{char}}. Stay in character and respond naturally.

{{#if system}}{{system}}

{{/if}}{{#if description}}Description:
{{description}}

{{/if}}{{#if personality}}Personality:
{{personality}}

{{/if}}{{#if scenario}}Scenario:
{{scenario}}
{{/if}}{{#if persona}}
User persona:
{{persona}}
{{/if}}{{#if loreBefore}}
World information:
{{loreBefore}}
{{/if}}{{#if loreAfter}}
{{loreAfter}}
{{/if}}`;

const DEFAULT_GLOBAL_SYSTEM_PROMPT = `You are {{char}}. Stay in character and respond naturally.`;
const DEFAULT_GLOBAL_POST_HISTORY = ``;
const DEFAULT_INSTRUCTION_TEMPLATE = {
  wrapWithNewline: true,
  includeNames: 'never',
  storyPrefix: '',
  storySuffix: '\n',
  userPrefix: '{{user}}: ',
  userSuffix: '\n',
  assistantPrefix: '{{char}}: ',
  assistantSuffix: '\n',
  systemPrefix: '',
  systemSuffix: '\n',
  stopSequence: '',
};

const state = {
  locale: normalizeLocaleCode(localStorage.getItem(STORAGE.locale) || 'en-en'),
  currentPage: 'chat',
  libraryTab: 'characters',
  activeCharacterId: localStorage.getItem(STORAGE.activeCharacter) || null,
  sending: false,
  modelStatus: null,
};

const pageRoot = document.getElementById('page-root');
const sectionLabel = document.getElementById('section-label');
const navbar = document.getElementById('navbar');

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function uid() {
  return crypto.randomUUID?.() || `nv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getCharacters() {
  return readJson(STORAGE.characters, []);
}

function saveCharacters(characters) {
  writeJson(STORAGE.characters, characters);
}

const AVATAR_ASSET_DB = {
  name: 'nastyverse-app-assets',
  version: 1,
  store: 'avatars',
};
const avatarAssetCache = new Map();
let avatarDbPromise = null;

function openAvatarAssetDb() {
  if (avatarDbPromise) return avatarDbPromise;
  avatarDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(AVATAR_ASSET_DB.name, AVATAR_ASSET_DB.version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AVATAR_ASSET_DB.store)) {
        db.createObjectStore(AVATAR_ASSET_DB.store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open avatar storage.'));
  });
  return avatarDbPromise;
}

async function loadAvatarAssets() {
  const db = await openAvatarAssetDb();
  const records = await new Promise((resolve, reject) => {
    const transaction = db.transaction(AVATAR_ASSET_DB.store, 'readonly');
    const request = transaction.objectStore(AVATAR_ASSET_DB.store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Unable to read avatar storage.'));
  });
  avatarAssetCache.clear();
  records.forEach(record => {
    if (record?.id && record?.dataUrl) avatarAssetCache.set(record.id, record.dataUrl);
  });
}

async function putAvatarAsset(id, dataUrl) {
  const db = await openAvatarAssetDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(AVATAR_ASSET_DB.store, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Unable to save avatar.'));
    transaction.objectStore(AVATAR_ASSET_DB.store).put({ id, dataUrl });
  });
  avatarAssetCache.set(id, dataUrl);
}

async function deleteAvatarAsset(id) {
  avatarAssetCache.delete(id);
  const db = await openAvatarAssetDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(AVATAR_ASSET_DB.store, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Unable to delete avatar.'));
    transaction.objectStore(AVATAR_ASSET_DB.store).delete(id);
  });
}

function avatarAssetId(value) {
  const raw = String(value || '');
  return raw.startsWith('idb:') ? raw.slice(4) : null;
}

function resolvedAvatarSource(characterOrValue) {
  const value = typeof characterOrValue === 'object' && characterOrValue !== null
    ? characterOrValue.avatar
    : characterOrValue;
  const id = avatarAssetId(value);
  if (id) return avatarAssetCache.get(id) || '';
  return String(value || '');
}

async function persistAvatarValue(characterId, value) {
  const raw = String(value || '');
  if (!raw) {
    await deleteAvatarAsset(characterId).catch(() => {});
    return '';
  }

  const existingId = avatarAssetId(raw);
  if (existingId) {
    if (existingId === characterId) return raw;
    const existingData = avatarAssetCache.get(existingId);
    if (!existingData) return '';
    await putAvatarAsset(characterId, existingData);
    return `idb:${characterId}`;
  }

  if (raw.startsWith('data:image/')) {
    await putAvatarAsset(characterId, raw);
    return `idb:${characterId}`;
  }

  return raw;
}

async function migrateInlineCharacterAvatars() {
  const characters = getCharacters();
  let changed = false;
  for (const character of characters) {
    const rawAvatar = String(character?.avatar || '');
    if (!rawAvatar.startsWith('data:image/')) continue;
    const id = character.id || uid();
    character.id = id;
    await putAvatarAsset(id, rawAvatar);
    character.avatar = `idb:${id}`;
    changed = true;
  }
  if (changed) saveCharacters(characters);
}

function getConversations() {
  return readJson(STORAGE.conversations, {});
}

function saveConversations(conversations) {
  writeJson(STORAGE.conversations, conversations);
}

function getGenerationParams() {
  return { ...DEFAULT_PARAMS, ...readJson(STORAGE.params, {}) };
}

function getContextTemplate() {
  const saved = localStorage.getItem(STORAGE.contextTemplate);
  if (saved === null) return DEFAULT_CONTEXT_TEMPLATE;
  if (saved === LEGACY_CONTEXT_TEMPLATE_015) {
    localStorage.setItem(STORAGE.contextTemplate, DEFAULT_CONTEXT_TEMPLATE);
    return DEFAULT_CONTEXT_TEMPLATE;
  }
  return saved;
}

function getGlobalSystemPrompt() {
  const saved = localStorage.getItem(STORAGE.globalSystemPrompt);
  return saved === null ? DEFAULT_GLOBAL_SYSTEM_PROMPT : saved;
}

function getGlobalPostHistoryInstructions() {
  const saved = localStorage.getItem(STORAGE.globalPostHistory);
  return saved === null ? DEFAULT_GLOBAL_POST_HISTORY : saved;
}

function getInstructionTemplate() {
  return { ...DEFAULT_INSTRUCTION_TEMPLATE, ...readJson(STORAGE.instructionTemplate, {}) };
}

function baseContextTemplateValues(character) {
  const loreBefore = '';
  const loreAfter = '';
  return {
    anchorBefore: '',
    anchorAfter: '',
    description: character.description || '',
    scenario: character.scenario || '',
    personality: character.personality || '',
    persona: '',
    char: character.name || '',
    user: 'User',
    wiBefore: loreBefore,
    loreBefore,
    wiAfter: loreAfter,
    loreAfter,
    mesExamples: character.exampleMessages || '',
    mesExamplesRaw: character.exampleMessages || '',
  };
}

function renderPromptOverrideText(source, character) {
  const values = { ...baseContextTemplateValues(character), system: '' };
  return renderContextTemplate(String(source || ''), values);
}

function effectiveSystemPrompt(character) {
  const cardOverride = String(character.systemPrompt || '').trim();
  const source = cardOverride || getGlobalSystemPrompt();
  return renderPromptOverrideText(source, character);
}

function effectivePostHistoryInstructions(character) {
  const cardOverride = String(character.postHistoryInstructions || '').trim();
  const source = cardOverride || getGlobalPostHistoryInstructions();
  return renderPromptOverrideText(source, character);
}

function contextTemplateValues(character) {
  return {
    ...baseContextTemplateValues(character),
    system: effectiveSystemPrompt(character),
  };
}

function renderContextTemplate(template, values) {
  let output = String(template || '');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = output.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
      return String(values[key] || '').trim() ? block : '';
    });
    if (next === output) break;
    output = next;
  }
  output = output.replace(/\n?\s*\{\{trim\}\}\s*\n?/g, '');
  output = output.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(values[key] ?? ''));
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

function effectiveContextTemplate(character) {
  const cardOverride = String(character.contextTemplate || '').trim();
  return cardOverride || getContextTemplate();
}

function renderCharacterContext(character) {
  return renderContextTemplate(effectiveContextTemplate(character), contextTemplateValues(character));
}

function estimateTokens(text) {
  const content = String(text || '').trim();
  return content ? Math.ceil(content.length / 3.5) : 0;
}

function characterTokenCounts(character) {
  const context = renderCharacterContext(character);
  const postHistory = effectivePostHistoryInstructions(character);
  const permanentText = [context, postHistory].filter(Boolean).join('\n\n');
  const nonPermanentText = [
    character.firstMessage,
    ...(character.alternateGreetings || []),
    character.exampleMessages,
  ].filter(value => String(value || '').trim()).join('\n\n');
  const totalText = [permanentText, nonPermanentText].filter(Boolean).join('\n\n');
  return {
    permanent: estimateTokens(permanentText),
    total: estimateTokens(totalText),
  };
}

function applyUiSettings() {
  const settings = { ...DEFAULT_UI, ...readJson(STORAGE.ui, {}) };
  document.documentElement.style.fontSize = `${settings.scale}%`;
  document.body.classList.toggle('compact-messages', Boolean(settings.compactMessages));
}

function applyAccent() {
  const accent = localStorage.getItem(STORAGE.accent);
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    document.documentElement.style.setProperty('--violet-2', accent);
  }
}

function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.textContent = message;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 220);
  }, 3400);
}



let pngCrcTable = null;

function readUint32Be(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32Be(bytes, offset, value) {
  const v = value >>> 0;
  bytes[offset] = (v >>> 24) & 255;
  bytes[offset + 1] = (v >>> 16) & 255;
  bytes[offset + 2] = (v >>> 8) & 255;
  bytes[offset + 3] = v & 255;
}

function writeUint16Be(bytes, offset, value) {
  const v = Math.max(0, Math.min(65535, Math.round(value)));
  bytes[offset] = (v >>> 8) & 255;
  bytes[offset + 1] = v & 255;
}

function concatUint8Arrays(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(bytes) {
  if (!pngCrcTable) {
    pngCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      pngCrcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = pngCrcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = new Uint8Array()) {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32Be(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32Be(chunk, 8 + data.length, crc32(concatUint8Arrays([typeBytes, data])));
  return chunk;
}

function parsePngChunks(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || signature.some((value, index) => bytes[index] !== value)) return [];
  const decoder = new TextDecoder('ascii');
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) break;
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function getPngAnimationInfo(buffer) {
  const chunks = parsePngChunks(buffer);
  const animation = { animated: false, frameCount: 1, plays: 0, delays: [] };
  for (const chunk of chunks) {
    if (chunk.type === 'acTL' && chunk.data.length >= 8) {
      animation.animated = true;
      animation.frameCount = readUint32Be(chunk.data, 0) || 1;
      animation.plays = readUint32Be(chunk.data, 4);
    }
    if (chunk.type === 'fcTL' && chunk.data.length >= 26) {
      const numerator = (chunk.data[20] << 8) | chunk.data[21];
      const denominatorRaw = (chunk.data[22] << 8) | chunk.data[23];
      const denominator = denominatorRaw || 100;
      animation.delays.push(Math.max(1, Math.round((numerator || 1) * 1000 / denominator)));
    }
  }
  return animation;
}

function pngIdatData(buffer) {
  return concatUint8Arrays(parsePngChunks(buffer).filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data));
}

function apngDelayFields(milliseconds) {
  const ms = Math.max(1, Math.round(milliseconds || 100));
  if (ms <= 65535) return { numerator: ms, denominator: 1000 };
  const tenths = Math.min(65535, Math.round(ms / 10));
  return { numerator: tenths, denominator: 100 };
}

function buildApng(framePngBuffers, width, height, delays, plays = 0) {
  if (!framePngBuffers.length) throw new Error(t('character.apngEncodeError'));
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [signature];

  const ihdr = new Uint8Array(13);
  writeUint32Be(ihdr, 0, width);
  writeUint32Be(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(pngChunk('IHDR', ihdr));

  const actl = new Uint8Array(8);
  writeUint32Be(actl, 0, framePngBuffers.length);
  writeUint32Be(actl, 4, Number.isFinite(plays) ? Math.max(0, plays) : 0);
  chunks.push(pngChunk('acTL', actl));

  let sequence = 0;
  framePngBuffers.forEach((frameBuffer, index) => {
    const fctl = new Uint8Array(26);
    writeUint32Be(fctl, 0, sequence++);
    writeUint32Be(fctl, 4, width);
    writeUint32Be(fctl, 8, height);
    writeUint32Be(fctl, 12, 0);
    writeUint32Be(fctl, 16, 0);
    const delay = apngDelayFields(delays[index] ?? delays[delays.length - 1] ?? 100);
    writeUint16Be(fctl, 20, delay.numerator);
    writeUint16Be(fctl, 22, delay.denominator);
    fctl[24] = 0;
    fctl[25] = 0;
    chunks.push(pngChunk('fcTL', fctl));

    const idat = pngIdatData(frameBuffer);
    if (index === 0) {
      chunks.push(pngChunk('IDAT', idat));
    } else {
      const fdat = new Uint8Array(4 + idat.length);
      writeUint32Be(fdat, 0, sequence++);
      fdat.set(idat, 4);
      chunks.push(pngChunk('fdAT', fdat));
    }
  });

  chunks.push(pngChunk('IEND'));
  return concatUint8Arrays(chunks);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t('character.cropEncodeError'))), type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(t('character.cropEncodeError')));
    reader.readAsDataURL(blob);
  });
}

async function processAnimatedPng(fileBuffer, crop) {
  if (!('ImageDecoder' in window)) throw new Error(t('character.apngUnsupported'));

  const preferredTypes = ['image/apng', 'image/png'];
  let decoderType = null;
  for (const type of preferredTypes) {
    try {
      if (!ImageDecoder.isTypeSupported || await ImageDecoder.isTypeSupported(type)) {
        decoderType = type;
        break;
      }
    } catch (_) {}
  }
  if (!decoderType) throw new Error(t('character.apngUnsupported'));

  const decoder = new ImageDecoder({ data: fileBuffer.slice(0), type: decoderType, preferAnimation: true });
  try {
    if (decoder.tracks?.ready) await decoder.tracks.ready;
    const info = getPngAnimationInfo(fileBuffer);
    const firstResult = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    const track = decoder.tracks?.selectedTrack;
    const frameCount = Math.max(1, track?.frameCount || info.frameCount || 1);
    const framePngBuffers = [];
    const delays = [];
    const canvas = document.createElement('canvas');
    canvas.width = crop.targetWidth;
    canvas.height = crop.targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('character.cropEncodeError'));

    for (let index = 0; index < frameCount; index += 1) {
      const result = index === 0 ? firstResult : await decoder.decode({ frameIndex: index, completeFramesOnly: true });
      const frame = result.image;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight, 0, 0, canvas.width, canvas.height);
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      framePngBuffers.push(await pngBlob.arrayBuffer());
      const fallbackDelay = frame.duration ? Math.max(1, Math.round(frame.duration / 1000)) : 100;
      delays.push(info.delays[index] ?? fallbackDelay);
      frame.close?.();
    }

    const encoded = buildApng(framePngBuffers, canvas.width, canvas.height, delays, info.plays);
    return blobToDataUrl(new Blob([encoded], { type: 'image/apng' }));
  } finally {
    decoder.close?.();
  }
}

async function openAvatarCropper(file) {
  const objectUrl = URL.createObjectURL(file);
  const fileBuffer = await file.arrayBuffer();
  const animationInfo = getPngAnimationInfo(fileBuffer);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t('character.cropLoadError')));
      img.src = objectUrl;
    });

    return await new Promise(resolve => {
      const cropWidth = 280;
      const cropHeight = 420;
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop avatar-crop-backdrop';
      backdrop.innerHTML = `
        <div class="modal avatar-crop-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
          <div class="modal-head avatar-crop-head">
            <div>
              <div class="modal-kicker">${escapeHtml(t('character.avatar'))}</div>
              <h2 id="avatar-crop-title">${escapeHtml(t('character.cropTitle'))}</h2>
              <p class="avatar-crop-copy">${escapeHtml(t(animationInfo.animated ? 'character.cropHelpAnimated' : 'character.cropHelp'))}</p>
            </div>
            <button type="button" class="modal-close" data-avatar-crop-cancel aria-label="${escapeHtml(t('common.cancel'))}">×</button>
          </div>
          <div class="avatar-crop-stage-wrap">
            <div class="avatar-crop-stage" id="avatar-crop-stage">
              <img id="avatar-crop-image" alt="">
              <div class="avatar-crop-frame" aria-hidden="true"></div>
            </div>
          </div>
          <div class="avatar-crop-controls">
            <label class="form-field avatar-crop-zoom-field">
              <span>${escapeHtml(t('character.cropZoom'))}</span>
              <input type="range" id="avatar-crop-zoom" min="100" max="400" step="1" value="100">
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-avatar-crop-cancel>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" id="avatar-crop-confirm">${escapeHtml(t('character.cropApply'))}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const stage = backdrop.querySelector('#avatar-crop-stage');
      const cropImage = backdrop.querySelector('#avatar-crop-image');
      const zoomInput = backdrop.querySelector('#avatar-crop-zoom');
      const confirmButton = backdrop.querySelector('#avatar-crop-confirm');
      cropImage.src = objectUrl;

      let scale = Math.max(cropWidth / naturalWidth, cropHeight / naturalHeight);
      const minScale = scale;
      const maxScale = minScale * 4;
      let offsetX = (cropWidth - naturalWidth * scale) / 2;
      let offsetY = (cropHeight - naturalHeight * scale) / 2;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startOffsetX = 0;
      let startOffsetY = 0;
      let closed = false;

      const syncZoomInput = () => {
        const percentage = Math.max(100, Math.min(400, Math.round((scale / minScale) * 100)));
        zoomInput.value = String(percentage);
      };

      const clampOffsets = () => {
        const displayWidth = naturalWidth * scale;
        const displayHeight = naturalHeight * scale;
        const minX = Math.min(0, cropWidth - displayWidth);
        const minY = Math.min(0, cropHeight - displayHeight);
        offsetX = Math.min(0, Math.max(minX, offsetX));
        offsetY = Math.min(0, Math.max(minY, offsetY));
      };

      const render = () => {
        clampOffsets();
        cropImage.style.width = `${naturalWidth * scale}px`;
        cropImage.style.height = `${naturalHeight * scale}px`;
        cropImage.style.left = `${offsetX}px`;
        cropImage.style.top = `${offsetY}px`;
      };

      const applyScale = nextScale => {
        const previousScale = scale;
        const centerX = cropWidth / 2;
        const centerY = cropHeight / 2;
        const anchorX = (centerX - offsetX) / previousScale;
        const anchorY = (centerY - offsetY) / previousScale;
        scale = Math.max(minScale, Math.min(maxScale, nextScale));
        offsetX = centerX - anchorX * scale;
        offsetY = centerY - anchorY * scale;
        syncZoomInput();
        render();
      };

      const onKeyDown = event => {
        if (event.key === 'Escape') close(null);
      };

      const close = result => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeyDown);
        backdrop.remove();
        resolve(result);
      };

      document.addEventListener('keydown', onKeyDown);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close(null);
      });
      backdrop.querySelectorAll('[data-avatar-crop-cancel]').forEach(button => {
        button.addEventListener('click', () => close(null));
      });

      stage.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        stage.setPointerCapture?.(event.pointerId);
      });
      stage.addEventListener('pointermove', event => {
        if (!dragging) return;
        offsetX = startOffsetX + (event.clientX - startX);
        offsetY = startOffsetY + (event.clientY - startY);
        render();
      });
      const stopDragging = event => {
        dragging = false;
        try { stage.releasePointerCapture?.(event.pointerId); } catch (_) {}
      };
      stage.addEventListener('pointerup', stopDragging);
      stage.addEventListener('pointercancel', stopDragging);

      zoomInput.addEventListener('input', () => {
        const nextScale = minScale * (Number(zoomInput.value || 100) / 100);
        applyScale(nextScale);
      });
      stage.addEventListener('wheel', event => {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 1.08 : 0.92;
        applyScale(scale * delta);
      }, { passive: false });

      confirmButton.addEventListener('click', async () => {
        const sourceX = Math.max(0, -offsetX / scale);
        const sourceY = Math.max(0, -offsetY / scale);
        const sourceWidth = cropWidth / scale;
        const sourceHeight = cropHeight / scale;
        const targetWidth = Math.max(1, Math.min(512, Math.floor(sourceWidth)));
        const targetHeight = Math.max(1, Math.min(768, Math.floor(targetWidth * 1.5)));
        const crop = { sourceX, sourceY, sourceWidth, sourceHeight, targetWidth, targetHeight };

        confirmButton.disabled = true;
        confirmButton.textContent = t('character.cropProcessing');
        try {
          if (animationInfo.animated) {
            close(await processAnimatedPng(fileBuffer, crop));
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return close(null);
          ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          close(canvas.toDataURL('image/webp', 0.92));
        } catch (error) {
          console.error(error);
          toast(error?.message || String(error), 'error');
          confirmButton.disabled = false;
          confirmButton.textContent = t('character.cropApply');
        }
      });

      syncZoomInput();
      render();
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderNavbar() {
  navbar.innerHTML = NAV_ITEMS.map(item => `
    <button class="nav-btn ${state.currentPage === item.id ? 'active' : ''}" data-nav="${item.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
      ${escapeHtml(t(item.labelKey))}
    </button>`).join('');
  navbar.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', () => goTo(button.dataset.nav));
  });
}

function goTo(id, opts = {}) {
  state.currentPage = id;
  renderNavbar();
  if (id === 'library') renderLibrary(opts.tab || state.libraryTab);
  else if (id === 'configuration') renderConfiguration(opts.section || 'general');
  else renderChat();
}

/* ===================================================================
   Window chrome
=================================================================== */

document.getElementById('btn-min').addEventListener('click', () => invoke('window_minimize'));
document.getElementById('btn-close').addEventListener('click', () => invoke('window_close'));
document.getElementById('btn-max').addEventListener('click', () => invoke('window_toggle_maximize'));

document.getElementById('model-status').addEventListener('click', () => goTo('configuration', { section: 'models' }));

/* ===================================================================
   Chat
=================================================================== */

function activeCharacter() {
  return getCharacters().find(character => character.id === state.activeCharacterId) || null;
}

function ensureConversation(character) {
  const conversations = getConversations();
  if (!Array.isArray(conversations[character.id])) {
    conversations[character.id] = [];
    if (character.firstMessage?.trim()) {
      conversations[character.id].push({ id: uid(), role: 'assistant', content: character.firstMessage.trim(), createdAt: Date.now() });
    }
    saveConversations(conversations);
  }
  return conversations[character.id];
}

function chatSystemPrompt(character) {
  const context = renderCharacterContext(character);
  const postHistory = effectivePostHistoryInstructions(character);
  return [context, postHistory].filter(Boolean).join('\n\n');
}

function scrollChatToBottom() {
  requestAnimationFrame(() => {
    const scroller = document.querySelector('.messages');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
}

function renderChat() {
  state.currentPage = 'chat';
  sectionLabel.textContent = t('nav.chat');
  renderNavbar();
  const character = activeCharacter();

  if (!character) {
    pageRoot.innerHTML = `
      <div class="page page-chat active">
        <div class="chat-empty">
          <div class="empty-orb"><svg viewBox="0 0 24 24"><path d="M4 5h16v10H8l-4 4V5z"/></svg></div>
          <h2>${escapeHtml(t('chat.none.title'))}</h2>
          <p>${escapeHtml(t('chat.none.body'))}</p>
          <button class="btn btn-primary" id="open-library">${escapeHtml(t('chat.none.button'))}</button>
        </div>
      </div>`;
    document.getElementById('open-library').addEventListener('click', () => goTo('library'));
    return;
  }

  const messages = ensureConversation(character);
  pageRoot.innerHTML = `
    <div class="chat-shell">
      <header class="chat-header">
        <div class="chat-character-avatar">${escapeHtml(character.name.slice(0, 1).toUpperCase())}</div>
        <div class="chat-character-meta">
          <strong>${escapeHtml(character.name)}</strong>
          <span>${escapeHtml(character.description || t('chat.characterFallback'))}</span>
        </div>
        <div class="chat-header-actions">
          <button class="btn btn-ghost btn-small" id="chat-library">${escapeHtml(t('chat.library'))}</button>
          <button class="btn btn-ghost btn-small" id="chat-clear">${escapeHtml(t('chat.clear'))}</button>
        </div>
      </header>
      <div class="messages" id="messages">
        ${messages.map(message => `
          <article class="message message-${message.role}">
            <div class="message-role">${message.role === 'user' ? escapeHtml(t('chat.you')) : escapeHtml(character.name)}</div>
            <div class="message-bubble">${escapeHtml(message.content).replaceAll('\n', '<br>')}</div>
          </article>`).join('')}
        ${state.sending ? `<article class="message message-assistant"><div class="message-role">${escapeHtml(character.name)}</div><div class="message-bubble message-thinking"><span></span><span></span><span></span>${escapeHtml(t('chat.generating'))}</div></article>` : ''}
      </div>
      <form class="composer" id="composer">
        <textarea id="composer-input" rows="1" placeholder="${escapeHtml(t('chat.placeholder'))}" ${state.sending ? 'disabled' : ''}></textarea>
        <button class="composer-send" type="submit" ${state.sending ? 'disabled' : ''}>${escapeHtml(t('chat.send'))}</button>
      </form>
    </div>`;

  document.getElementById('chat-library').addEventListener('click', () => goTo('library'));
  document.getElementById('chat-clear').addEventListener('click', () => {
    const conversations = getConversations();
    delete conversations[character.id];
    saveConversations(conversations);
    renderChat();
  });
  const input = document.getElementById('composer-input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('composer').requestSubmit();
    }
  });
  document.getElementById('composer').addEventListener('submit', event => sendChatMessage(event, character));
  scrollChatToBottom();
}

async function sendChatMessage(event, character) {
  event.preventDefault();
  if (state.sending) return;
  const input = document.getElementById('composer-input');
  const content = input.value.trim();
  if (!content) return;

  const conversations = getConversations();
  const thread = ensureConversation(character);
  thread.push({ id: uid(), role: 'user', content, createdAt: Date.now() });
  conversations[character.id] = thread;
  saveConversations(conversations);
  state.sending = true;
  renderChat();

  try {
    const currentThread = getConversations()[character.id] || [];
    const messages = [
      { role: 'system', content: chatSystemPrompt(character) },
      ...currentThread.map(message => ({ role: message.role, content: message.content })),
    ];
    const params = getGenerationParams();
    const result = await invoke('chat_completion', { messages, params });
    const updated = getConversations();
    updated[character.id] = updated[character.id] || [];
    updated[character.id].push({ id: uid(), role: 'assistant', content: result.content, createdAt: Date.now() });
    saveConversations(updated);
  } catch (error) {
    toast(String(error), 'error');
  } finally {
    state.sending = false;
    renderChat();
    refreshModelStatus();
  }
}


/* ===================================================================
   Library
=================================================================== */

const LIBRARY_SORTS = [
  ['recent', 'library.sort.recent'],
  ['name-asc', 'library.sort.nameAsc'],
  ['name-desc', 'library.sort.nameDesc'],
  ['newest', 'library.sort.newest'],
  ['oldest', 'library.sort.oldest'],
  ['chats', 'library.sort.chats'],
  ['favorites', 'library.sort.favorites'],
];

const libraryState = { query: '', sort: 'recent', favoritesOnly: false, tag: '' };

function normalizeCharacter(record = {}) {
  return {
    id: record.id || uid(),
    name: String(record.name || '').trim(),
    avatar: record.avatar || '',
    description: record.description || '',
    personality: record.personality || '',
    scenario: record.scenario || '',
    firstMessage: record.firstMessage || record.first_mes || '',
    alternateGreetings: Array.isArray(record.alternateGreetings)
      ? record.alternateGreetings
      : Array.isArray(record.alternate_greetings) ? record.alternate_greetings : [],
    exampleMessages: record.exampleMessages || record.mes_example || '',
    contextTemplate: record.contextTemplate || record.context_template || record.extensions?.nastyverse?.context_template || '',
    systemPrompt: record.systemPrompt || record.system_prompt || '',
    postHistoryInstructions: record.postHistoryInstructions || record.post_history_instructions || '',
    creator: record.creator || '',
    characterVersion: record.characterVersion || record.character_version || '',
    creatorNotes: record.creatorNotes || record.creator_notes || '',
    tags: Array.isArray(record.tags) ? record.tags.filter(Boolean) : [],
    favorite: Boolean(record.favorite),
    createdAt: Number(record.createdAt || Date.now()),
    updatedAt: Number(record.updatedAt || record.createdAt || Date.now()),
  };
}

function getNormalizedCharacters() {
  const raw = getCharacters();
  const normalized = raw.map(normalizeCharacter);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) saveCharacters(normalized);
  return normalized;
}

function characterChatCount(id) {
  const thread = getConversations()[id];
  return Array.isArray(thread) ? thread.filter(message => message.role === 'user').length : 0;
}

function characterApproxTokens(character) {
  return characterTokenCounts(character).total;
}

function characterDate(timestamp) {
  try {
    return new Intl.DateTimeFormat(intlLocale(), {
      year: 'numeric', month: 'short', day: 'numeric'
    }).format(new Date(timestamp));
  } catch {
    return '—';
  }
}

function characterAvatar(character, className) {
  const avatarSource = resolvedAvatarSource(character);
  if (avatarSource) return `<div class="${className}"><img src="${escapeHtml(avatarSource)}" alt=""></div>`;
  return `<div class="${className} character-avatar-fallback">${escapeHtml((character.name || '?').slice(0, 1).toUpperCase())}</div>`;
}

function renderLibrary(tab = 'characters') {
  state.currentPage = 'library';
  state.libraryTab = tab;
  sectionLabel.textContent = t('nav.library');
  renderNavbar();
  const characters = getNormalizedCharacters();

  pageRoot.innerHTML = `
    <div class="page active library-page">
      <div class="library-commandbar">
        <div class="lib-tabs">
          <button class="lib-tab ${tab === 'characters' ? 'active' : ''}" data-tab="characters">${escapeHtml(t('library.characters'))} <span class="count">${characters.length}</span></button>
          <button class="lib-tab ${tab === 'lorebooks' ? 'active' : ''}" data-tab="lorebooks">${escapeHtml(t('library.lorebooks'))} <span class="count">0</span></button>
          <button class="lib-tab ${tab === 'personas' ? 'active' : ''}" data-tab="personas">${escapeHtml(t('library.personas'))} <span class="count">0</span></button>
        </div>
        ${tab === 'characters' ? `
          <div class="library-command-actions">
            <input type="file" id="character-import-file" accept=".json,.png,.apng,.charx,application/json,image/png,application/zip" multiple hidden>
            <button class="btn btn-ghost" id="library-import">${escapeHtml(t('library.import'))}</button>
            <button class="btn btn-primary" id="library-create">+ ${escapeHtml(t('library.create'))}</button>
          </div>` : ''}
      </div>
      <div id="library-content" class="library-content"></div>
    </div>`;

  pageRoot.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => renderLibrary(button.dataset.tab)));

  if (tab === 'characters') {
    document.getElementById('library-create').addEventListener('click', () => openCharacterEditor());
    document.getElementById('library-import').addEventListener('click', () => document.getElementById('character-import-file').click());
    document.getElementById('character-import-file').addEventListener('change', importCharacterCards);
    renderCharacterLibrary();
  } else {
    document.getElementById('library-content').innerHTML = `
      <div class="empty-state library-empty-wide">
        <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>
        <h2>${escapeHtml(t('library.soon.title'))}</h2>
        <p>${escapeHtml(t('library.soon.body'))}</p>
      </div>`;
  }
}

function renderCharacterLibrary() {
  const root = document.getElementById('library-content');
  if (!root) return;
  const allCharacters = getNormalizedCharacters();
  const allTags = [...new Set(allCharacters.flatMap(character => character.tags || []))].sort((a, b) => a.localeCompare(b));
  const q = libraryState.query.trim().toLowerCase();

  let characters = allCharacters.filter(character => {
    if (libraryState.favoritesOnly && !character.favorite) return false;
    if (libraryState.tag && !(character.tags || []).includes(libraryState.tag)) return false;
    if (!q) return true;
    return [character.name, character.description, character.personality, character.scenario, character.creator, ...(character.tags || [])]
      .join(' ').toLowerCase().includes(q);
  });

  characters.sort((a, b) => {
    if (libraryState.sort === 'name-asc') return a.name.localeCompare(b.name);
    if (libraryState.sort === 'name-desc') return b.name.localeCompare(a.name);
    if (libraryState.sort === 'newest') return b.createdAt - a.createdAt;
    if (libraryState.sort === 'oldest') return a.createdAt - b.createdAt;
    if (libraryState.sort === 'chats') return characterChatCount(b.id) - characterChatCount(a.id);
    if (libraryState.sort === 'favorites') return Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name);
    return b.updatedAt - a.updatedAt;
  });

  root.innerHTML = `
    <div class="character-library-layout">
      <aside class="character-filters">
        <div class="filter-heading">${escapeHtml(t('library.filters'))}</div>
        <button class="filter-choice ${!libraryState.favoritesOnly && !libraryState.tag ? 'active' : ''}" data-filter-all>
          <span>${escapeHtml(t('library.allCharacters'))}</span><strong>${allCharacters.length}</strong>
        </button>
        <button class="filter-choice ${libraryState.favoritesOnly ? 'active' : ''}" data-filter-favorites>
          <span>★ ${escapeHtml(t('library.favorites'))}</span><strong>${allCharacters.filter(character => character.favorite).length}</strong>
        </button>
        <div class="filter-heading filter-heading-spaced">${escapeHtml(t('library.tags'))}</div>
        <div class="tag-filter-list">
          ${allTags.length ? allTags.map(tag => `
            <button class="tag-filter ${libraryState.tag === tag ? 'active' : ''}" data-filter-tag="${escapeHtml(tag)}">
              <span>${escapeHtml(tag)}</span><strong>${allCharacters.filter(character => (character.tags || []).includes(tag)).length}</strong>
            </button>`).join('') : `<div class="filter-muted">${escapeHtml(t('library.noTags'))}</div>`}
        </div>
        ${(libraryState.query || libraryState.tag || libraryState.favoritesOnly) ? `<button class="filter-clear" data-clear-filters>${escapeHtml(t('library.clearFilters'))}</button>` : ''}
      </aside>

      <section class="character-browser">
        <div class="character-browser-toolbar">
          <div class="character-search-wrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
            <input id="character-search" value="${escapeHtml(libraryState.query)}" placeholder="${escapeHtml(t('library.search'))}">
          </div>
          <label class="sort-control">
            <span>${escapeHtml(t('library.sort'))}</span>
            <select id="character-sort">${LIBRARY_SORTS.map(([value, key]) => `<option value="${value}" ${libraryState.sort === value ? 'selected' : ''}>${escapeHtml(t(key))}</option>`).join('')}</select>
          </label>
          <div class="character-result-count">${characters.length} ${escapeHtml(t('library.results'))}</div>
        </div>
        <div id="character-grid-root">${renderCharacterCards(characters, allCharacters.length)}</div>
      </section>
    </div>`;

  document.getElementById('character-search')?.addEventListener('input', event => {
    libraryState.query = event.target.value;
    renderCharacterLibrary();
    requestAnimationFrame(() => {
      const next = document.getElementById('character-search');
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    });
  });
  document.getElementById('character-sort')?.addEventListener('change', event => { libraryState.sort = event.target.value; renderCharacterLibrary(); });
  root.querySelector('[data-filter-all]')?.addEventListener('click', () => { libraryState.favoritesOnly = false; libraryState.tag = ''; renderCharacterLibrary(); });
  root.querySelector('[data-filter-favorites]')?.addEventListener('click', () => { libraryState.favoritesOnly = !libraryState.favoritesOnly; libraryState.tag = ''; renderCharacterLibrary(); });
  root.querySelectorAll('[data-filter-tag]').forEach(button => button.addEventListener('click', () => {
    libraryState.tag = libraryState.tag === button.dataset.filterTag ? '' : button.dataset.filterTag;
    libraryState.favoritesOnly = false;
    renderCharacterLibrary();
  }));
  root.querySelector('[data-clear-filters]')?.addEventListener('click', () => { libraryState.query = ''; libraryState.tag = ''; libraryState.favoritesOnly = false; renderCharacterLibrary(); });
  bindCharacterCardActions(root);
}

function renderLibraryCoverCard({ id, name, image = '', kind, fallback = '' }) {
  const displayName = String(name || '').trim() || '?';
  const fallbackLabel = String(fallback || displayName.slice(0, 1) || '?').trim().slice(0, 2).toUpperCase();
  const media = image
    ? `<img class="library-cover-image" src="${escapeHtml(image)}" alt="">`
    : `<div class="library-cover-fallback" aria-hidden="true">${escapeHtml(fallbackLabel)}</div>`;

  return `<button
    type="button"
    class="library-cover-card"
    data-library-card
    data-library-kind="${escapeHtml(kind)}"
    data-library-id="${escapeHtml(id)}"
    aria-label="${escapeHtml(displayName)}">
      <span class="library-cover-media">${media}</span>
      <span class="library-cover-name">${escapeHtml(displayName)}</span>
    </button>`;
}

function renderLibraryCoverGrid(items) {
  return `<div class="library-cover-grid">${items.map(renderLibraryCoverCard).join('')}</div>`;
}

function bindLibraryCoverCards(root, handlers = {}) {
  root.querySelectorAll('[data-library-card]').forEach(card => {
    card.addEventListener('click', () => {
      const handler = handlers[card.dataset.libraryKind];
      if (typeof handler === 'function') handler(card.dataset.libraryId);
    });
  });
}

function renderCharacterCards(characters, totalCount) {
  if (!characters.length) {
    const empty = totalCount === 0;
    return `<div class="empty-state library-empty-wide">
      <h2>${escapeHtml(t(empty ? 'library.empty.title' : 'library.noResults.title'))}</h2>
      <p>${escapeHtml(t(empty ? 'library.empty.body' : 'library.noResults.body'))}</p>
      ${empty ? `<button class="btn btn-primary" data-empty-create>+ ${escapeHtml(t('library.create'))}</button>` : ''}
    </div>`;
  }

  const cards = characters.map(character => ({
    id: character.id,
    name: character.name,
    image: resolvedAvatarSource(character),
    kind: 'character',
    fallback: (character.name || '?').slice(0, 1),
  }));

  return renderLibraryCoverGrid(cards);
}

function bindCharacterCardActions(root) {
  root.querySelector('[data-empty-create]')?.addEventListener('click', () => openCharacterEditor());
  bindLibraryCoverCards(root, {
    character: id => openCharacterEditor(id),
  });
}

function openCharacterEditor(characterId = null) {
  const existing = characterId ? getNormalizedCharacters().find(item => item.id === characterId) : null;
  const character = existing || normalizeCharacter({ name: '' });

  state.currentPage = 'library';
  state.libraryTab = 'characters';
  sectionLabel.textContent = t('library.characters');
  renderNavbar();

  const initialTokenCounts = characterTokenCounts(character);

  const greetingRows = (character.alternateGreetings || []).map((greeting, index) => `
    <div class="alternate-greeting-row" data-greeting-row>
      <div class="alternate-greeting-head">
        <span>${escapeHtml(t('character.altGreetings'))} ${index + 1}</span>
        <button type="button" class="card-mini-action" data-remove-greeting title="${escapeHtml(t('character.removeGreeting'))}">×</button>
      </div>
      <textarea name="alternateGreeting" rows="4">${escapeHtml(greeting)}</textarea>
    </div>`).join('');

  pageRoot.innerHTML = `
    <div class="page active character-editor-page-shell">
      <div class="character-editor-topbar">
        <button type="button" class="character-editor-back" id="character-editor-back">← ${escapeHtml(t('character.back'))}</button>
        <div class="character-editor-token-stats" aria-live="polite">
          <div class="character-editor-token-stat"><span>${escapeHtml(t('character.tokens.permanent'))}</span><strong id="character-permanent-tokens">${initialTokenCounts.permanent}</strong></div>
          <div class="character-editor-token-stat"><span>${escapeHtml(t('character.tokens.total'))}</span><strong id="character-total-tokens">${initialTokenCounts.total}</strong></div>
        </div>
      </div>

      <form class="character-editor-page-form" id="character-form">
        <div class="character-editor-layout">
          <aside class="character-editor-aside">
            <div id="character-avatar-preview">${characterAvatar(character, 'character-editor-avatar')}</div>
            <label class="avatar-upload-button"><input type="file" id="character-avatar-file" accept="image/png,image/apng,image/jpeg,image/webp,.apng" hidden>${escapeHtml(t('character.avatar'))}</label>
            <button type="button" class="avatar-remove" id="character-avatar-remove">${escapeHtml(t('character.removeAvatar'))}</button>
            <div class="character-tag-editor">
              <label for="character-tag-input">${escapeHtml(t('character.tags'))}</label>
              <div class="character-tag-input-shell">
                <input type="text" id="character-tag-input" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(t('character.tagsPlaceholder'))}">
                <div class="character-tag-suggestions" id="character-tag-suggestions" hidden></div>
              </div>
              <div class="character-tag-list" id="character-tag-list"></div>
            </div>
            <label class="favorite-check"><input type="checkbox" name="favorite" ${character.favorite ? 'checked' : ''}><span>★ ${escapeHtml(t('character.favorite'))}</span></label>
          </aside>

          <div class="character-editor-main">
            <div class="character-editor-tabs" role="tablist">
              <button type="button" class="character-editor-tab active" data-editor-tab="identity">${escapeHtml(t('character.identity'))}</button>
              <button type="button" class="character-editor-tab" data-editor-tab="story">${escapeHtml(t('character.story'))}</button>
              <button type="button" class="character-editor-tab" data-editor-tab="prompting">${escapeHtml(t('character.prompting'))}</button>
              <button type="button" class="character-editor-tab" data-editor-tab="metadata">${escapeHtml(t('character.metadata'))}</button>
            </div>

            <div class="character-editor-fields">
              <section class="character-editor-panel active" data-editor-panel="identity">
                <label class="form-field"><span>${escapeHtml(t('character.name'))}</span><input name="name" maxlength="80" value="${escapeHtml(character.name)}" required></label>
                <label class="form-field"><span>${escapeHtml(t('character.description'))}</span><textarea name="description" rows="7">${escapeHtml(character.description)}</textarea></label>
                <label class="form-field"><span>${escapeHtml(t('character.personality'))}</span><textarea name="personality" rows="8">${escapeHtml(character.personality)}</textarea></label>
              </section>

              <section class="character-editor-panel" data-editor-panel="story">
                <label class="form-field"><span>${escapeHtml(t('character.scenario'))}</span><textarea name="scenario" rows="6">${escapeHtml(character.scenario)}</textarea></label>
                <label class="form-field"><span>${escapeHtml(t('character.firstMessage'))}</span><textarea name="firstMessage" rows="7">${escapeHtml(character.firstMessage)}</textarea></label>
                <div class="alternate-greetings-block">
                  <div class="alternate-greetings-title">
                    <div>
                      <strong>${escapeHtml(t('character.altGreetings'))}</strong>
                      <span>${escapeHtml(t('character.altGreetingsHelp'))}</span>
                    </div>
                    <button type="button" class="btn btn-ghost btn-small" id="add-alternate-greeting">+ ${escapeHtml(t('character.addGreeting'))}</button>
                  </div>
                  <div class="alternate-greetings-list" id="alternate-greetings-list">${greetingRows}</div>
                </div>
              </section>

              <section class="character-editor-panel" data-editor-panel="prompting">
                <label class="form-field"><span>${escapeHtml(t('character.contextTemplate'))}</span><textarea id="character-context-template" name="contextTemplate" class="context-template-editor prompt-editor-compact" rows="10" spellcheck="false">${escapeHtml(character.contextTemplate)}</textarea><small class="field-hint">${escapeHtml(t('character.contextTemplate.overrideHelp'))}</small></label>
                ${promptPlaceholderButtons(CONTEXT_TEMPLATE_PLACEHOLDERS, 'character-context-template')}
                <label class="form-field"><span>${escapeHtml(t('character.systemPrompt'))}</span><textarea name="systemPrompt" rows="8">${escapeHtml(character.systemPrompt)}</textarea><small class="field-hint">${escapeHtml(t('character.systemPrompt.overrideHelp'))}</small></label>
                <label class="form-field"><span>${escapeHtml(t('character.postHistory'))}</span><textarea name="postHistoryInstructions" rows="7">${escapeHtml(character.postHistoryInstructions)}</textarea><small class="field-hint">${escapeHtml(t('character.postHistory.overrideHelp'))}</small></label>
              </section>

              <section class="character-editor-panel" data-editor-panel="metadata">
                <div class="editor-grid-2">
                  <label class="form-field"><span>${escapeHtml(t('character.creator'))}</span><input name="creator" value="${escapeHtml(character.creator)}"></label>
                  <label class="form-field"><span>${escapeHtml(t('character.version'))}</span><input name="characterVersion" value="${escapeHtml(character.characterVersion)}"></label>
                </div>
                <label class="form-field"><span>${escapeHtml(t('character.creatorNotes'))}</span><textarea name="creatorNotes" rows="8">${escapeHtml(character.creatorNotes)}</textarea></label>
              </section>
            </div>
          </div>
        </div>
        <input type="hidden" name="avatar" id="character-avatar-value" value="${escapeHtml(character.avatar)}">
        <div class="character-editor-actions character-editor-page-actions">
          ${existing ? `
            <button type="button" class="btn btn-ghost" id="character-duplicate">${escapeHtml(t('library.duplicate'))}</button>
            <button type="button" class="btn btn-ghost" id="character-export">${escapeHtml(t('library.export'))}</button>
            <button type="button" class="btn btn-danger" id="character-delete">${escapeHtml(t('library.delete'))}</button>` : ''}
          <button class="btn btn-primary" type="submit">${escapeHtml(t(existing ? 'character.editor.save' : 'character.editor.create'))}</button>
        </div>
      </form>
    </div>`;

  const backToLibrary = () => renderLibrary('characters');
  document.getElementById('character-editor-back').addEventListener('click', backToLibrary);

  const editorTabs = [...pageRoot.querySelectorAll('[data-editor-tab]')];
  const editorPanels = [...pageRoot.querySelectorAll('[data-editor-panel]')];
  editorTabs.forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.editorTab;
    editorTabs.forEach(tab => tab.classList.toggle('active', tab === button));
    editorPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.editorPanel === target));
  }));
  bindPromptPlaceholderButtons(pageRoot);

  const characterForm = document.getElementById('character-form');
  const permanentTokenValue = document.getElementById('character-permanent-tokens');
  const totalTokenValue = document.getElementById('character-total-tokens');
  const characterDraftForTokens = () => {
    const data = new FormData(characterForm);
    return normalizeCharacter({
      ...character,
      name: String(data.get('name') || ''),
      description: String(data.get('description') || ''),
      personality: String(data.get('personality') || ''),
      scenario: String(data.get('scenario') || ''),
      firstMessage: String(data.get('firstMessage') || ''),
      alternateGreetings: data.getAll('alternateGreeting').map(value => String(value).trim()).filter(Boolean),
      contextTemplate: String(data.get('contextTemplate') || ''),
      systemPrompt: String(data.get('systemPrompt') || ''),
      postHistoryInstructions: String(data.get('postHistoryInstructions') || ''),
      exampleMessages: character.exampleMessages || '',
    });
  };
  const refreshCharacterTokenCounts = () => {
    const counts = characterTokenCounts(characterDraftForTokens());
    permanentTokenValue.textContent = String(counts.permanent);
    totalTokenValue.textContent = String(counts.total);
  };
  characterForm.addEventListener('input', refreshCharacterTokenCounts);

  const avatarInput = document.getElementById('character-avatar-file');
  const avatarValue = document.getElementById('character-avatar-value');
  const characterNameInput = pageRoot.querySelector('input[name="name"]');
  const refreshAvatarPreview = value => {
    const fallbackName = String(characterNameInput?.value || character.name || '?').trim() || '?';
    const source = resolvedAvatarSource(value);
    document.getElementById('character-avatar-preview').innerHTML = source
      ? `<div class="character-editor-avatar"><img src="${escapeHtml(source)}" alt=""></div>`
      : `<div class="character-editor-avatar character-avatar-fallback">${escapeHtml(fallbackName.slice(0, 1).toUpperCase())}</div>`;
  };

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    try {
      const croppedAvatar = await openAvatarCropper(file);
      if (croppedAvatar) {
        avatarValue.value = String(croppedAvatar || '');
        refreshAvatarPreview(avatarValue.value);
      }
    } catch (error) {
      console.error(error);
      toast(error?.message || String(error), 'error');
    } finally {
      avatarInput.value = '';
    }
  });

  characterNameInput?.addEventListener('input', () => {
    if (!avatarValue.value) refreshAvatarPreview('');
  });

  document.getElementById('character-avatar-remove').addEventListener('click', () => {
    avatarValue.value = '';
    refreshAvatarPreview('');
  });

  const tagInput = document.getElementById('character-tag-input');
  const tagList = document.getElementById('character-tag-list');
  const tagSuggestions = document.getElementById('character-tag-suggestions');
  const cleanTag = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 64);
  const tagKey = value => cleanTag(value).toLocaleLowerCase();
  const knownTagMap = new Map();
  getNormalizedCharacters().forEach(item => {
    (item.tags || []).forEach(tag => {
      const cleaned = cleanTag(tag);
      if (cleaned && !knownTagMap.has(tagKey(cleaned))) knownTagMap.set(tagKey(cleaned), cleaned);
    });
  });
  let selectedTags = [];
  (character.tags || []).forEach(tag => {
    const cleaned = cleanTag(tag);
    if (cleaned && !selectedTags.some(existingTag => tagKey(existingTag) === tagKey(cleaned))) selectedTags.push(cleaned);
  });
  let visibleTagSuggestions = [];
  let activeTagSuggestion = -1;

  const hideTagSuggestions = () => {
    visibleTagSuggestions = [];
    activeTagSuggestion = -1;
    tagSuggestions.hidden = true;
    tagSuggestions.innerHTML = '';
  };

  const renderSelectedTags = () => {
    tagList.innerHTML = selectedTags.length
      ? selectedTags.map((tag, index) => `
          <button type="button" class="character-tag-chip" data-remove-tag="${index}" title="${escapeHtml(t('character.removeTag'))}">
            <span>${escapeHtml(tag)}</span><b aria-hidden="true">×</b>
          </button>`).join('')
      : `<span class="character-tag-empty">${escapeHtml(t('character.noTags'))}</span>`;
    tagList.querySelectorAll('[data-remove-tag]').forEach(button => {
      button.addEventListener('click', () => {
        selectedTags.splice(Number(button.dataset.removeTag), 1);
        renderSelectedTags();
        renderTagSuggestions();
      });
    });
  };

  const renderTagSuggestions = () => {
    const query = cleanTag(tagInput.value);
    if (!query) return hideTagSuggestions();
    const queryKey = tagKey(query);
    const selectedKeys = new Set(selectedTags.map(tagKey));
    visibleTagSuggestions = [...knownTagMap.values()]
      .filter(tag => !selectedKeys.has(tagKey(tag)) && tagKey(tag).includes(queryKey))
      .sort((a, b) => {
        const aStarts = tagKey(a).startsWith(queryKey) ? 0 : 1;
        const bStarts = tagKey(b).startsWith(queryKey) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b, undefined, { sensitivity: 'base' });
      })
      .slice(0, 7);
    activeTagSuggestion = visibleTagSuggestions.length ? 0 : -1;
    if (!visibleTagSuggestions.length) return hideTagSuggestions();
    tagSuggestions.hidden = false;
    tagSuggestions.innerHTML = visibleTagSuggestions.map((tag, index) => `
      <button type="button" class="character-tag-suggestion ${index === activeTagSuggestion ? 'active' : ''}" data-tag-suggestion="${index}">
        ${escapeHtml(tag)}
      </button>`).join('');
    tagSuggestions.querySelectorAll('[data-tag-suggestion]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => addTag(visibleTagSuggestions[Number(button.dataset.tagSuggestion)]));
    });
  };

  const addTag = rawTag => {
    const cleaned = cleanTag(rawTag);
    if (!cleaned) return;
    const key = tagKey(cleaned);
    const canonical = knownTagMap.get(key) || cleaned;
    if (!selectedTags.some(tag => tagKey(tag) === key)) selectedTags.push(canonical);
    if (!knownTagMap.has(key)) knownTagMap.set(key, canonical);
    tagInput.value = '';
    hideTagSuggestions();
    renderSelectedTags();
  };

  tagInput.addEventListener('input', renderTagSuggestions);
  tagInput.addEventListener('focus', renderTagSuggestions);
  tagInput.addEventListener('blur', () => setTimeout(hideTagSuggestions, 120));
  tagInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && visibleTagSuggestions.length) {
      event.preventDefault();
      activeTagSuggestion = (activeTagSuggestion + 1) % visibleTagSuggestions.length;
      const buttons = [...tagSuggestions.querySelectorAll('[data-tag-suggestion]')];
      buttons.forEach((button, index) => button.classList.toggle('active', index === activeTagSuggestion));
      buttons[activeTagSuggestion]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'ArrowUp' && visibleTagSuggestions.length) {
      event.preventDefault();
      activeTagSuggestion = (activeTagSuggestion - 1 + visibleTagSuggestions.length) % visibleTagSuggestions.length;
      const buttons = [...tagSuggestions.querySelectorAll('[data-tag-suggestion]')];
      buttons.forEach((button, index) => button.classList.toggle('active', index === activeTagSuggestion));
      buttons[activeTagSuggestion]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (event.key === 'Escape') {
      hideTagSuggestions();
      return;
    }
    if (event.key === 'Backspace' && !tagInput.value && selectedTags.length) {
      selectedTags.pop();
      renderSelectedTags();
      return;
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const suggestion = visibleTagSuggestions[activeTagSuggestion >= 0 ? activeTagSuggestion : 0];
      addTag(suggestion || tagInput.value.replace(/,$/, ''));
    }
  });
  renderSelectedTags();

  const greetingsList = document.getElementById('alternate-greetings-list');
  const refreshGreetingNumbers = () => {
    [...greetingsList.querySelectorAll('[data-greeting-row]')].forEach((row, index) => {
      const label = row.querySelector('.alternate-greeting-head span');
      if (label) label.textContent = `${t('character.altGreetings')} ${index + 1}`;
    });
  };
  const bindGreetingRemove = row => {
    row.querySelector('[data-remove-greeting]')?.addEventListener('click', () => {
      row.remove();
      refreshGreetingNumbers();
      refreshCharacterTokenCounts();
    });
  };
  [...greetingsList.querySelectorAll('[data-greeting-row]')].forEach(bindGreetingRemove);
  document.getElementById('add-alternate-greeting').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'alternate-greeting-row';
    row.dataset.greetingRow = '';
    row.innerHTML = `
      <div class="alternate-greeting-head">
        <span></span>
        <button type="button" class="card-mini-action" data-remove-greeting title="${escapeHtml(t('character.removeGreeting'))}">×</button>
      </div>
      <textarea name="alternateGreeting" rows="4"></textarea>`;
    greetingsList.appendChild(row);
    bindGreetingRemove(row);
    refreshGreetingNumbers();
    refreshCharacterTokenCounts();
    row.querySelector('textarea')?.focus();
  });

  document.getElementById('character-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    if (!name) return toast(t('character.required'), 'error');

    const characters = getNormalizedCharacters();
    const recordId = existing?.id || character.id || uid();
    let persistedAvatar = '';
    try {
      persistedAvatar = await persistAvatarValue(recordId, String(data.get('avatar') || ''));
    } catch (error) {
      console.error(error);
      toast(t('character.avatarSaveError'), 'error');
      return;
    }
    const record = normalizeCharacter({
      ...character,
      id: recordId,
      name,
      avatar: persistedAvatar,
      description: String(data.get('description') || '').trim(),
      personality: String(data.get('personality') || '').trim(),
      scenario: String(data.get('scenario') || '').trim(),
      firstMessage: String(data.get('firstMessage') || '').trim(),
      alternateGreetings: data.getAll('alternateGreeting').map(value => String(value).trim()).filter(Boolean),
      exampleMessages: existing?.exampleMessages || character.exampleMessages || '',
      contextTemplate: String(data.get('contextTemplate') || '').trim(),
      systemPrompt: String(data.get('systemPrompt') || '').trim(),
      postHistoryInstructions: String(data.get('postHistoryInstructions') || '').trim(),
      creator: String(data.get('creator') || '').trim(),
      characterVersion: String(data.get('characterVersion') || '').trim(),
      creatorNotes: String(data.get('creatorNotes') || '').trim(),
      tags: selectedTags.slice(),
      favorite: data.get('favorite') === 'on',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    const index = characters.findIndex(item => item.id === record.id);
    if (index >= 0) characters[index] = record; else characters.push(record);
    saveCharacters(characters);
    renderLibrary('characters');
  });

  document.getElementById('character-duplicate')?.addEventListener('click', () => {
    duplicateCharacter(existing.id);
    renderLibrary('characters');
  });
  document.getElementById('character-export')?.addEventListener('click', () => exportCharacterJson(existing.id));
  document.getElementById('character-delete')?.addEventListener('click', () => {
    if (!confirm(t('character.deleteConfirm'))) return;
    deleteCharacter(existing.id, true);
    renderLibrary('characters');
  });

  pageRoot.querySelector('input[name=name]')?.focus();
}

function toggleCharacterFavorite(id) {
  const characters = getNormalizedCharacters();
  const index = characters.findIndex(character => character.id === id);
  if (index < 0) return;
  characters[index].favorite = !characters[index].favorite;
  characters[index].updatedAt = Date.now();
  saveCharacters(characters);
  renderCharacterLibrary();
}

async function duplicateCharacter(id) {
  const source = getNormalizedCharacters().find(character => character.id === id);
  if (!source) return;
  const characters = getNormalizedCharacters();
  const duplicateId = uid();
  let avatar = '';
  try {
    avatar = await persistAvatarValue(duplicateId, source.avatar);
  } catch (error) {
    console.error(error);
  }
  characters.push(normalizeCharacter({ ...source, id: duplicateId, avatar, name: `${source.name} ${t('character.duplicateSuffix')}`, favorite: false, createdAt: Date.now(), updatedAt: Date.now() }));
  saveCharacters(characters);
  renderCharacterLibrary();
}


function isPngSignature(bytes) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isZipSignature(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

function decodeUtf8Base64(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function parseCharacterCardJson(value) {
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid character card JSON.');
  const data = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : payload;
  if (!String(data?.name || '').trim()) throw new Error('Character card has no name.');
  return { payload, data };
}

function cardTimestamp(value, fallback = Date.now()) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number < 1_000_000_000_000 ? number * 1000 : number;
}

function characterFromCardPayload(payload) {
  const { data } = parseCharacterCardJson(payload);
  return normalizeCharacter({
    name: data.name,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMessage: data.first_mes ?? data.firstMessage,
    alternateGreetings: data.alternate_greetings ?? data.alternateGreetings,
    exampleMessages: data.mes_example ?? data.exampleMessages,
    contextTemplate: data.context_template ?? data.contextTemplate ?? data.extensions?.nastyverse?.context_template,
    systemPrompt: data.system_prompt ?? data.systemPrompt,
    postHistoryInstructions: data.post_history_instructions ?? data.postHistoryInstructions,
    creator: data.creator,
    characterVersion: data.character_version ?? data.characterVersion,
    creatorNotes: data.creator_notes ?? data.creatorNotes,
    tags: data.tags,
    createdAt: cardTimestamp(data.creation_date, Date.now()),
    updatedAt: cardTimestamp(data.modification_date, Date.now()),
  });
}

function cardIconAsset(payload) {
  const { data } = parseCharacterCardJson(payload);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const icons = assets.filter(asset => String(asset?.type || '').toLowerCase() === 'icon');
  return icons.find(asset => String(asset?.name || '').toLowerCase() === 'main') || icons[0] || null;
}

function extensionMime(pathOrExt) {
  const raw = String(pathOrExt || '').toLowerCase();
  const ext = raw.includes('.') ? raw.split('.').pop() : raw.replace(/^\./, '');
  const types = {
    png: 'image/png', apng: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp',
  };
  return types[ext] || 'application/octet-stream';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read imported asset.'));
    reader.readAsDataURL(blob);
  });
}

async function bytesToDataUrl(bytes, mime) {
  return blobToDataUrl(new Blob([bytes], { type: mime || 'application/octet-stream' }));
}

async function decompressBytes(bytes, format) {
  if (typeof DecompressionStream !== 'function') throw new Error('Compressed character cards are not supported by this WebView version.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pngChunkType(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

async function parsePngTextChunks(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!isPngSignature(bytes)) throw new Error('Not a PNG/APNG file.');
  const view = new DataView(arrayBuffer);
  const chunks = new Map();
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const end = dataOffset + length;
    if (end + 4 > bytes.length) throw new Error('Corrupted PNG/APNG chunk.');
    const type = pngChunkType(bytes, typeOffset);
    const data = bytes.slice(dataOffset, end);

    if (type === 'tEXt') {
      const separator = data.indexOf(0);
      if (separator > 0) {
        const key = new TextDecoder('latin1').decode(data.slice(0, separator));
        const value = new TextDecoder('latin1').decode(data.slice(separator + 1));
        chunks.set(key, value);
      }
    } else if (type === 'zTXt') {
      const separator = data.indexOf(0);
      if (separator > 0 && separator + 2 <= data.length && data[separator + 1] === 0) {
        const key = new TextDecoder('latin1').decode(data.slice(0, separator));
        const inflated = await decompressBytes(data.slice(separator + 2), 'deflate');
        chunks.set(key, new TextDecoder('latin1').decode(inflated));
      }
    } else if (type === 'iTXt') {
      const firstNull = data.indexOf(0);
      if (firstNull > 0 && firstNull + 3 <= data.length) {
        const key = new TextDecoder('latin1').decode(data.slice(0, firstNull));
        const compressionFlag = data[firstNull + 1];
        let cursor = firstNull + 3;
        const languageEnd = data.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          const translatedEnd = data.indexOf(0, cursor);
          if (translatedEnd >= 0) {
            cursor = translatedEnd + 1;
            let content = data.slice(cursor);
            if (compressionFlag === 1) content = await decompressBytes(content, 'deflate');
            chunks.set(key, new TextDecoder('utf-8', { fatal: false }).decode(content));
          }
        }
      }
    }

    offset = end + 4;
    if (type === 'IEND') break;
  }
  return chunks;
}

function parseEmbeddedCardText(value) {
  const raw = String(value || '').trim();
  try {
    return parseCharacterCardJson(decodeUtf8Base64(raw)).payload;
  } catch (base64Error) {
    return parseCharacterCardJson(raw).payload;
  }
}

function resolvePngEmbeddedAsset(icon, textChunks) {
  const uri = String(icon?.uri || '');
  if (!uri.startsWith('__asset:')) return '';
  const path = uri.slice('__asset:'.length).replace(/^\/+/, '');
  const encoded = textChunks.get(`chara-ext-asset_:${path}`);
  if (!encoded) return '';
  const ext = icon?.ext || path;
  return `data:${extensionMime(ext)};base64,${String(encoded).trim().replace(/\s+/g, '')}`;
}

async function importPngCharacterCard(file, arrayBuffer) {
  const chunks = await parsePngTextChunks(arrayBuffer);
  const embedded = chunks.get('ccv3') ?? chunks.get('chara');
  if (!embedded) throw new Error('PNG/APNG has no ccv3 or chara character card metadata.');
  const payload = parseEmbeddedCardText(embedded);
  const character = characterFromCardPayload(payload);
  const originalImage = await blobToDataUrl(file);
  const icon = cardIconAsset(payload);
  let avatar = originalImage;

  if (icon) {
    const uri = String(icon.uri || '');
    if (uri.startsWith('data:image/')) avatar = uri;
    else if (/^https:\/\//i.test(uri)) avatar = uri;
    else if (uri.startsWith('__asset:')) avatar = resolvePngEmbeddedAsset(icon, chunks) || originalImage;
    else if (uri === 'ccdefault:') avatar = originalImage;
  }

  return { character, avatar };
}

function findZipEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) return offset;
  }
  return -1;
}

function parseZipDirectory(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocd = findZipEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('Invalid CHARX ZIP directory.');

  const entriesCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entriesCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('ZIP64 CHARX files are not supported yet.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Corrupted CHARX central directory.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    const name = decoder.decode(nameBytes).replaceAll('\\', '/');
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function extractZipEntry(arrayBuffer, entry) {
  if (!entry) throw new Error('Missing CHARX entry.');
  if (entry.flags & 0x1) throw new Error('Encrypted CHARX files are not supported.');
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('Corrupted CHARX local header.');
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
  let result;
  if (entry.method === 0) result = compressed;
  else if (entry.method === 8) result = await decompressBytes(compressed, 'deflate-raw');
  else throw new Error(`Unsupported CHARX compression method: ${entry.method}`);
  if (entry.uncompressedSize && result.length !== entry.uncompressedSize) throw new Error('Corrupted CHARX entry size.');
  return result;
}

function normalizeEmbeddedAssetPath(uri) {
  return String(uri || '')
    .replace(/^embeded:\/\//i, '')
    .replace(/^embedded:\/\//i, '')
    .replace(/^\/+/, '');
}

async function resolveCharxAvatar(payload, arrayBuffer, entries) {
  const byName = new Map(entries.map(entry => [entry.name, entry]));
  const icon = cardIconAsset(payload);
  if (icon) {
    const uri = String(icon.uri || '');
    if (uri.startsWith('data:image/')) return uri;
    if (/^https:\/\//i.test(uri)) return uri;
    if (/^embed+ed:\/\//i.test(uri)) {
      const path = normalizeEmbeddedAssetPath(uri);
      const entry = byName.get(path);
      if (entry) return bytesToDataUrl(await extractZipEntry(arrayBuffer, entry), extensionMime(icon.ext || path));
    }
  }

  const fallback = entries.find(entry => /^assets\/icon\/images\//i.test(entry.name) && /\.(png|apng|jpe?g|webp|gif|avif)$/i.test(entry.name));
  if (fallback) return bytesToDataUrl(await extractZipEntry(arrayBuffer, fallback), extensionMime(fallback.name));
  return '';
}

async function importCharxCharacterCard(arrayBuffer) {
  const entries = parseZipDirectory(arrayBuffer);
  const cardEntry = entries.find(entry => entry.name === 'card.json');
  if (!cardEntry) throw new Error('CHARX is missing card.json at the archive root.');
  const cardBytes = await extractZipEntry(arrayBuffer, cardEntry);
  const payload = parseCharacterCardJson(new TextDecoder('utf-8', { fatal: false }).decode(cardBytes)).payload;
  const character = characterFromCardPayload(payload);
  const avatar = await resolveCharxAvatar(payload, arrayBuffer, entries);
  return { character, avatar };
}

async function importJsonCharacterCard(file) {
  const payload = parseCharacterCardJson(await file.text()).payload;
  const character = characterFromCardPayload(payload);
  const icon = cardIconAsset(payload);
  let avatar = '';
  if (icon) {
    const uri = String(icon.uri || '');
    if (uri.startsWith('data:image/') || /^https:\/\//i.test(uri)) avatar = uri;
  }
  return { character, avatar };
}

async function parseCharacterImportFile(file) {
  const prefix = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const lowerName = file.name.toLowerCase();
  if (isPngSignature(prefix)) return importPngCharacterCard(file, await file.arrayBuffer());
  if (isZipSignature(prefix) || lowerName.endsWith('.charx')) return importCharxCharacterCard(await file.arrayBuffer());
  if (lowerName.endsWith('.json') || String(file.type || '').includes('json')) return importJsonCharacterCard(file);
  throw new Error('Unsupported character card format.');
}

async function persistImportedCharacter(result) {
  const character = result.character;
  const avatar = String(result.avatar || '');
  if (avatar) character.avatar = await persistAvatarValue(character.id, avatar);
  const characters = getNormalizedCharacters();
  characters.push(character);
  saveCharacters(characters);
  return character;
}

function exportCharacterJson(id) {
  const character = getNormalizedCharacters().find(item => item.id === id);
  if (!character) return;
  const payload = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.firstMessage,
      mes_example: character.exampleMessages,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      alternate_greetings: character.alternateGreetings,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      creator_notes: character.creatorNotes,
      extensions: {
        nastyverse: {
          context_template: character.contextTemplate || ''
        }
      },
      group_only_greetings: [],
      creation_date: Math.floor((character.createdAt || Date.now()) / 1000),
      modification_date: Math.floor(Date.now() / 1000),
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${character.name.replace(/[^\w.-]+/g, '_') || 'character'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast(t('library.exported'), 'success');
}

async function importCharacterCards(event) {
  const input = event.currentTarget;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;

  let imported = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const result = await parseCharacterImportFile(file);
      await persistImportedCharacter(result);
      imported += 1;
    } catch (error) {
      failed += 1;
      console.error(`[character import] ${file.name}`, error);
    }
  }

  if (imported) {
    toast(t(imported > 1 ? 'library.importedMany' : 'library.imported', { count: imported }), 'success');
    renderCharacterLibrary();
  }
  if (failed) toast(t('library.importFailed', { count: failed }), 'error');
}

async function deleteCharacter(id, confirmed = false) {
  const character = getNormalizedCharacters().find(item => item.id === id);
  if (!character) return;
  if (!confirmed && !confirm(t('character.deleteConfirm'))) return;
  saveCharacters(getNormalizedCharacters().filter(item => item.id !== id));
  await deleteAvatarAsset(id).catch(error => console.warn('[avatar] Unable to delete avatar asset.', error));
  const conversations = getConversations();
  delete conversations[id];
  saveConversations(conversations);
  if (state.activeCharacterId === id) {
    state.activeCharacterId = null;
    localStorage.removeItem(STORAGE.activeCharacter);
  }
  renderCharacterLibrary();
}


/* ===================================================================
   Configuration
=================================================================== */

async function renderConfiguration(section = 'general') {
  state.currentPage = 'configuration';
  sectionLabel.textContent = t('config.title');
  renderNavbar();
  pageRoot.innerHTML = `
    <div class="config-layout">
      <aside class="config-sidebar">
        <h3>${escapeHtml(t('config.title'))}</h3>
        ${CONFIG_SECTIONS.map(item => `<button class="config-item ${item.id === section ? 'active' : ''}" data-section="${item.id}">${escapeHtml(t(item.labelKey))}</button>`).join('')}
      </aside>
      <div class="config-body" id="config-body"></div>
    </div>`;
  pageRoot.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => renderConfiguration(button.dataset.section)));

  if (section === 'general') renderGeneralConfig();
  else if (section === 'models') await renderModelsConfig();
  else if (section === 'global-prompt') renderGlobalPromptConfig();
  else if (section === 'model-params') renderParamsConfig();
  else renderUiConfig();
}

function renderGeneralConfig() {
  const body = document.getElementById('config-body');
  const accent = localStorage.getItem(STORAGE.accent) || '#B24BFF';
  body.innerHTML = `
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.general'))}</h2><p>${escapeHtml(t('config.general.desc'))}</p></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.language'))}</h4><p>${escapeHtml(t('general.language.desc'))}</p></div><div class="control"><select id="app-language">${languageManifest.languages.map(language => `<option value="${escapeHtml(normalizeLocaleCode(language.code))}" ${state.locale === normalizeLocaleCode(language.code) ? 'selected' : ''}>${escapeHtml(language.label || language.code)}</option>`).join('')}</select></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.accent'))}</h4><p>${escapeHtml(t('general.accent.desc'))}</p></div><div class="control"><input id="accent-color" type="color" value="${escapeHtml(accent)}"><input id="accent-hex" class="hexinput" value="${escapeHtml(accent)}" maxlength="7"></div></div>`;

  document.getElementById('app-language').addEventListener('change', async event => {
    try {
      await setLocale(event.target.value);
      renderConfiguration('general');
      await refreshModelStatus();
    } catch (error) {
      console.error(error);
      toast(String(error), 'error');
    }
  });
  const color = document.getElementById('accent-color');
  const hex = document.getElementById('accent-hex');
  const apply = value => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    color.value = value;
    hex.value = value.toUpperCase();
    localStorage.setItem(STORAGE.accent, value);
    applyAccent();
  };
  color.addEventListener('input', () => apply(color.value));
  hex.addEventListener('change', () => apply(hex.value.trim()));
}

async function renderModelsConfig() {
  const body = document.getElementById('config-body');
  let saved = null;
  try { saved = await invoke('load_backend_config'); } catch (error) { toast(String(error), 'error'); }
  const selected = saved?.backendType || 'koboldcpp';

  body.innerHTML = `
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.models'))}</h2><p>${escapeHtml(t('models.desc'))}</p></div><button class="btn btn-primary" id="save-backend">${escapeHtml(t('models.save'))}</button></div>
    <div class="field-card field-card-stack">
      <div class="info"><h4>${escapeHtml(t('models.title'))}</h4><p>${escapeHtml(t('models.desc'))}</p></div>
      <div class="backend-list">
        ${BACKENDS.map(backend => `
          <div class="backend-row ${backend.id === selected ? 'selected' : ''}" data-backend-row="${backend.id}">
            <input type="radio" name="backend" value="${backend.id}" id="backend-${backend.id}" ${backend.id === selected ? 'checked' : ''}>
            <label for="backend-${backend.id}">${escapeHtml(backend.label)}</label>
            <input class="backend-url" data-backend-url="${backend.id}" value="${escapeHtml(backend.id === selected && saved?.url ? saved.url : backend.url)}" ${backend.id === selected ? '' : 'disabled'}>
            <button class="test-btn" data-test="${backend.id}" ${backend.id === selected ? '' : 'disabled'}>${escapeHtml(t('models.test'))}</button>
          </div>`).join('')}
      </div>
      <div class="connection-result" id="connection-result">${escapeHtml(t('models.notTested'))}</div>
    </div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('models.model'))}</h4><p>${escapeHtml(t('models.model.desc'))}</p></div><div class="control model-control"><input id="backend-model" list="backend-model-list" value="${escapeHtml(saved?.model || '')}" placeholder="${escapeHtml(t('models.model.placeholder'))}"><datalist id="backend-model-list"></datalist></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('models.apiKey'))}</h4><p>${escapeHtml(t('models.apiKey.desc'))}</p></div><div class="control model-control"><input id="backend-api-key" type="password" value="${escapeHtml(saved?.apiKey || '')}" placeholder="${escapeHtml(t('models.apiKey.placeholder'))}"></div></div>`;

  const selectBackend = id => {
    body.querySelectorAll('[data-backend-row]').forEach(row => row.classList.toggle('selected', row.dataset.backendRow === id));
    body.querySelectorAll('input[name=backend]').forEach(radio => radio.checked = radio.value === id);
    body.querySelectorAll('.backend-url').forEach(input => input.disabled = input.dataset.backendUrl !== id);
    body.querySelectorAll('[data-test]').forEach(button => button.disabled = button.dataset.test !== id);
  };
  body.querySelectorAll('input[name=backend]').forEach(radio => radio.addEventListener('change', () => selectBackend(radio.value)));
  body.querySelectorAll('[data-backend-row]').forEach(row => row.addEventListener('click', event => {
    if (event.target.matches('input, button')) return;
    selectBackend(row.dataset.backendRow);
  }));
  body.querySelectorAll('[data-test]').forEach(button => button.addEventListener('click', () => testBackend(button.dataset.test)));
  document.getElementById('save-backend').addEventListener('click', saveBackendConfiguration);
}

function currentBackendDraft() {
  const backendType = document.querySelector('input[name=backend]:checked')?.value || 'koboldcpp';
  return {
    backendType,
    url: document.querySelector(`[data-backend-url="${backendType}"]`)?.value.trim() || '',
    model: document.getElementById('backend-model')?.value.trim() || null,
    apiKey: document.getElementById('backend-api-key')?.value.trim() || null,
  };
}

async function testBackend(backendType) {
  const button = document.querySelector(`[data-test="${backendType}"]`);
  const resultBox = document.getElementById('connection-result');
  const draft = currentBackendDraft();
  button.disabled = true;
  button.textContent = t('models.testing');
  resultBox.className = 'connection-result is-testing';
  resultBox.textContent = t('models.testing');
  try {
    const result = await invoke('test_backend_connection', { backendType: draft.backendType, url: draft.url, apiKey: draft.apiKey });
    resultBox.className = 'connection-result is-ok';
    resultBox.textContent = result.message;
    const list = document.getElementById('backend-model-list');
    list.innerHTML = (result.models || []).map(model => `<option value="${escapeHtml(model)}"></option>`).join('');
    const modelInput = document.getElementById('backend-model');
    if (!modelInput.value && result.models?.length) modelInput.value = result.models[0];
  } catch (error) {
    resultBox.className = 'connection-result is-error';
    resultBox.textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = t('models.test');
  }
}

async function saveBackendConfiguration() {
  try {
    const config = currentBackendDraft();
    await invoke('save_backend_config', { config });
    toast(t('models.saved'), 'success');
    await refreshModelStatus();
  } catch (error) {
    toast(String(error), 'error');
  }
}


const CONTEXT_TEMPLATE_PLACEHOLDERS = [
  { key: 'char', snippet: '{{char}}', descriptionKey: 'globalPrompt.placeholder.char' },
  { key: 'user', snippet: '{{user}}', descriptionKey: 'globalPrompt.placeholder.user' },
  { key: 'description', snippet: '{{#if description}}{{description}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.description' },
  { key: 'personality', snippet: '{{#if personality}}{{personality}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.personality' },
  { key: 'scenario', snippet: '{{#if scenario}}{{scenario}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.scenario' },
  { key: 'system', snippet: '{{#if system}}{{system}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.system' },
  { key: 'persona', snippet: '{{#if persona}}{{persona}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.persona' },
  { key: 'loreBefore', snippet: '{{#if loreBefore}}{{loreBefore}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.loreBefore' },
  { key: 'loreAfter', snippet: '{{#if loreAfter}}{{loreAfter}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.loreAfter' },
  { key: 'anchorBefore', snippet: '{{#if anchorBefore}}{{anchorBefore}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.anchorBefore' },
  { key: 'anchorAfter', snippet: '{{#if anchorAfter}}{{anchorAfter}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.anchorAfter' },
  { key: 'mesExamples', snippet: '{{#if mesExamples}}{{mesExamples}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.mesExamples' },
];

const SYSTEM_PROMPT_PLACEHOLDERS = CONTEXT_TEMPLATE_PLACEHOLDERS.filter(item => ['char', 'user', 'description', 'personality', 'scenario', 'persona'].includes(item.key));
const GLOBAL_PROMPT_TABS = ['context', 'instruction', 'system'];

function insertContextTemplateSnippet(editor, snippet) {
  const start = Number.isInteger(editor.selectionStart) ? editor.selectionStart : editor.value.length;
  const end = Number.isInteger(editor.selectionEnd) ? editor.selectionEnd : start;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  editor.value = `${before}${snippet}${after}`;
  const cursor = start + snippet.length;
  editor.focus();
  editor.setSelectionRange(cursor, cursor);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function globalPromptTabs(active) {
  return `<div class="global-prompt-tabs" role="tablist">
    ${GLOBAL_PROMPT_TABS.map(tab => `<button type="button" class="global-prompt-tab ${tab === active ? 'active' : ''}" data-global-prompt-tab="${tab}">${escapeHtml(t(`globalPrompt.tab.${tab}`))}</button>`).join('')}
  </div>`;
}

function promptPlaceholderButtons(items, targetId) {
  return `<div class="context-template-help">
    <strong>${escapeHtml(t('globalPrompt.available'))}</strong>
    <div class="context-template-macros">${items.map(item => `
      <button type="button" class="context-template-macro" data-prompt-placeholder="${escapeHtml(item.key)}" data-target-editor="${escapeHtml(targetId)}" data-tooltip="${escapeHtml(t(item.descriptionKey))}" aria-label="${escapeHtml(t(item.descriptionKey))}">{{${escapeHtml(item.key)}}}</button>`).join('')}</div>
    <span class="context-template-click-hint">${escapeHtml(t('globalPrompt.placeholder.clickHint'))}</span>
  </div>`;
}

function bindPromptPlaceholderButtons(root) {
  let tooltip = document.getElementById('context-placeholder-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'context-placeholder-tooltip';
    tooltip.className = 'context-placeholder-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
  }

  let activeButton = null;

  const hideTooltip = () => {
    activeButton = null;
    tooltip.classList.remove('visible');
  };

  const positionTooltip = button => {
    if (activeButton !== button) return;
    const rect = button.getBoundingClientRect();
    const margin = 10;
    const viewportPadding = 12;
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + (rect.width - tooltipRect.width) / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));

    let top = rect.top - tooltipRect.height - margin;
    if (top < viewportPadding) top = rect.bottom + margin;
    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding);
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  };

  const showTooltip = button => {
    const text = button.dataset.tooltip || '';
    if (!text) return;
    activeButton = button;
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    requestAnimationFrame(() => positionTooltip(button));
  };

  root.querySelectorAll('[data-prompt-placeholder]').forEach(button => {
    button.addEventListener('mouseenter', () => showTooltip(button));
    button.addEventListener('mouseleave', hideTooltip);
    button.addEventListener('focus', () => showTooltip(button));
    button.addEventListener('blur', hideTooltip);
    button.addEventListener('click', () => {
      hideTooltip();
      const definition = CONTEXT_TEMPLATE_PLACEHOLDERS.find(item => item.key === button.dataset.promptPlaceholder);
      const editor = document.getElementById(button.dataset.targetEditor);
      if (definition && editor) insertContextTemplateSnippet(editor, definition.snippet);
    });
  });

  root.addEventListener('scroll', hideTooltip, { passive: true });
}

function renderContextPromptTab(body) {
  const template = getContextTemplate();
  body.innerHTML = `${globalPromptTabs('context')}
    <div class="field-card field-card-stack global-prompt-card">
      <div class="info">
        <h4>${escapeHtml(t('globalPrompt.contextTemplate'))}</h4>
        <p>${escapeHtml(t('globalPrompt.contextTemplate.desc'))}</p>
      </div>
      <textarea id="context-template-editor" class="context-template-editor" spellcheck="false">${escapeHtml(template)}</textarea>
      ${promptPlaceholderButtons(CONTEXT_TEMPLATE_PLACEHOLDERS, 'context-template-editor')}
      <div class="global-prompt-actions">
        <button type="button" class="btn btn-ghost" id="reset-context-template">${escapeHtml(t('globalPrompt.reset'))}</button>
        <button type="button" class="btn btn-primary" id="save-context-template">${escapeHtml(t('config.save'))}</button>
      </div>
    </div>`;
  bindPromptPlaceholderButtons(body);
  const editor = document.getElementById('context-template-editor');
  document.getElementById('save-context-template').addEventListener('click', () => {
    localStorage.setItem(STORAGE.contextTemplate, editor.value);
    toast(t('globalPrompt.context.saved'), 'success');
  });
  document.getElementById('reset-context-template').addEventListener('click', () => {
    editor.value = DEFAULT_CONTEXT_TEMPLATE;
    localStorage.setItem(STORAGE.contextTemplate, DEFAULT_CONTEXT_TEMPLATE);
    toast(t('globalPrompt.context.resetDone'), 'success');
  });
}

function instructionField(id, labelKey, value, rows = 2) {
  return `<label class="form-field instruction-sequence-field"><span>${escapeHtml(t(labelKey))}</span><textarea id="${id}" rows="${rows}" spellcheck="false">${escapeHtml(value)}</textarea></label>`;
}

function renderInstructionPromptTab(body) {
  const template = getInstructionTemplate();
  body.innerHTML = `${globalPromptTabs('instruction')}
    <div class="field-card field-card-stack global-prompt-card">
      <div class="info"><h4>${escapeHtml(t('globalPrompt.instructionTemplate'))}</h4><p>${escapeHtml(t('globalPrompt.instructionTemplate.desc'))}</p></div>
      <div class="instruction-options-grid">
        <label class="toggle-row"><input type="checkbox" id="instruction-wrap-newline" ${template.wrapWithNewline ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.wrapNewline'))}</span></label>
        <label class="form-field"><span>${escapeHtml(t('globalPrompt.instruction.includeNames'))}</span><select id="instruction-include-names"><option value="never" ${template.includeNames === 'never' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.instruction.names.never'))}</option><option value="always" ${template.includeNames === 'always' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.instruction.names.always'))}</option></select></label>
      </div>
      <div class="instruction-sequence-grid">
        ${instructionField('instruction-story-prefix', 'globalPrompt.instruction.storyPrefix', template.storyPrefix)}
        ${instructionField('instruction-story-suffix', 'globalPrompt.instruction.storySuffix', template.storySuffix)}
        ${instructionField('instruction-user-prefix', 'globalPrompt.instruction.userPrefix', template.userPrefix)}
        ${instructionField('instruction-user-suffix', 'globalPrompt.instruction.userSuffix', template.userSuffix)}
        ${instructionField('instruction-assistant-prefix', 'globalPrompt.instruction.assistantPrefix', template.assistantPrefix)}
        ${instructionField('instruction-assistant-suffix', 'globalPrompt.instruction.assistantSuffix', template.assistantSuffix)}
        ${instructionField('instruction-system-prefix', 'globalPrompt.instruction.systemPrefix', template.systemPrefix)}
        ${instructionField('instruction-system-suffix', 'globalPrompt.instruction.systemSuffix', template.systemSuffix)}
      </div>
      ${instructionField('instruction-stop-sequence', 'globalPrompt.instruction.stopSequence', template.stopSequence, 2)}
      <div class="global-prompt-note">${escapeHtml(t('globalPrompt.instruction.chatCompletionNote'))}</div>
      <div class="global-prompt-actions"><button type="button" class="btn btn-ghost" id="reset-instruction-template">${escapeHtml(t('globalPrompt.reset'))}</button><button type="button" class="btn btn-primary" id="save-instruction-template">${escapeHtml(t('config.save'))}</button></div>
    </div>`;

  document.getElementById('save-instruction-template').addEventListener('click', () => {
    const next = {
      wrapWithNewline: document.getElementById('instruction-wrap-newline').checked,
      includeNames: document.getElementById('instruction-include-names').value,
      storyPrefix: document.getElementById('instruction-story-prefix').value,
      storySuffix: document.getElementById('instruction-story-suffix').value,
      userPrefix: document.getElementById('instruction-user-prefix').value,
      userSuffix: document.getElementById('instruction-user-suffix').value,
      assistantPrefix: document.getElementById('instruction-assistant-prefix').value,
      assistantSuffix: document.getElementById('instruction-assistant-suffix').value,
      systemPrefix: document.getElementById('instruction-system-prefix').value,
      systemSuffix: document.getElementById('instruction-system-suffix').value,
      stopSequence: document.getElementById('instruction-stop-sequence').value,
    };
    writeJson(STORAGE.instructionTemplate, next);
    toast(t('globalPrompt.instruction.saved'), 'success');
  });
  document.getElementById('reset-instruction-template').addEventListener('click', () => {
    writeJson(STORAGE.instructionTemplate, DEFAULT_INSTRUCTION_TEMPLATE);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.instruction.resetDone'), 'success');
  });
}

function renderSystemPromptTab(body) {
  body.innerHTML = `${globalPromptTabs('system')}
    <div class="field-card field-card-stack global-prompt-card">
      <div class="info"><h4>${escapeHtml(t('globalPrompt.systemPrompt'))}</h4><p>${escapeHtml(t('globalPrompt.systemPrompt.desc'))}</p></div>
      <label class="form-field"><span>${escapeHtml(t('globalPrompt.systemPrompt'))}</span><textarea id="global-system-prompt" class="context-template-editor prompt-editor-compact" rows="9" spellcheck="false">${escapeHtml(getGlobalSystemPrompt())}</textarea></label>
      ${promptPlaceholderButtons(SYSTEM_PROMPT_PLACEHOLDERS, 'global-system-prompt')}
      <label class="form-field"><span>${escapeHtml(t('globalPrompt.postHistory'))}</span><textarea id="global-post-history" class="context-template-editor prompt-editor-compact" rows="7" spellcheck="false">${escapeHtml(getGlobalPostHistoryInstructions())}</textarea><small class="field-hint">${escapeHtml(t('globalPrompt.postHistory.desc'))}</small></label>
      ${promptPlaceholderButtons(SYSTEM_PROMPT_PLACEHOLDERS, 'global-post-history')}
      <div class="global-prompt-override-note">${escapeHtml(t('globalPrompt.overrideRule'))}</div>
      <div class="global-prompt-actions"><button type="button" class="btn btn-ghost" id="reset-system-prompt">${escapeHtml(t('globalPrompt.reset'))}</button><button type="button" class="btn btn-primary" id="save-system-prompt">${escapeHtml(t('config.save'))}</button></div>
    </div>`;
  bindPromptPlaceholderButtons(body);
  document.getElementById('save-system-prompt').addEventListener('click', () => {
    localStorage.setItem(STORAGE.globalSystemPrompt, document.getElementById('global-system-prompt').value);
    localStorage.setItem(STORAGE.globalPostHistory, document.getElementById('global-post-history').value);
    toast(t('globalPrompt.system.saved'), 'success');
  });
  document.getElementById('reset-system-prompt').addEventListener('click', () => {
    localStorage.setItem(STORAGE.globalSystemPrompt, DEFAULT_GLOBAL_SYSTEM_PROMPT);
    localStorage.setItem(STORAGE.globalPostHistory, DEFAULT_GLOBAL_POST_HISTORY);
    renderGlobalPromptConfig('system');
    toast(t('globalPrompt.system.resetDone'), 'success');
  });
}

function renderGlobalPromptConfig(tab = null) {
  const body = document.getElementById('config-body');
  const savedTab = localStorage.getItem(STORAGE.globalPromptTab);
  const active = GLOBAL_PROMPT_TABS.includes(tab) ? tab : (GLOBAL_PROMPT_TABS.includes(savedTab) ? savedTab : 'context');
  localStorage.setItem(STORAGE.globalPromptTab, active);
  if (active === 'instruction') renderInstructionPromptTab(body);
  else if (active === 'system') renderSystemPromptTab(body);
  else renderContextPromptTab(body);
  body.querySelectorAll('[data-global-prompt-tab]').forEach(button => button.addEventListener('click', () => renderGlobalPromptConfig(button.dataset.globalPromptTab)));
}

function renderParamsConfig() {
  const body = document.getElementById('config-body');
  const params = getGenerationParams();
  body.innerHTML = `
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.params'))}</h2><p>${escapeHtml(t('params.page.desc'))}</p></div><button class="btn btn-primary" id="save-params">${escapeHtml(t('config.save'))}</button></div>
    ${numberField('temperature', t('params.temperature'), t('params.temperature.desc'), params.temperature, 0, 2, 0.05)}
    ${numberField('topP', t('params.topP'), t('params.topP.desc'), params.topP, 0.05, 1, 0.05)}
    ${numberField('maxTokens', t('params.maxTokens'), t('params.maxTokens.desc'), params.maxTokens, 16, 32768, 16)} `;
  document.getElementById('save-params').addEventListener('click', () => {
    const next = {
      temperature: Number(document.getElementById('param-temperature').value),
      topP: Number(document.getElementById('param-topP').value),
      maxTokens: Number(document.getElementById('param-maxTokens').value),
    };
    writeJson(STORAGE.params, next);
    toast(t('config.save'), 'success');
  });
}

function numberField(id, title, description, value, min, max, step) {
  return `<div class="field-card"><div class="info"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(description)}</p></div><div class="control"><input class="number-input" id="param-${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></div></div>`;
}

function renderUiConfig() {
  const body = document.getElementById('config-body');
  const settings = { ...DEFAULT_UI, ...readJson(STORAGE.ui, {}) };
  body.innerHTML = `
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.ui'))}</h2><p>${escapeHtml(t('ui.page.desc'))}</p></div><button class="btn btn-primary" id="save-ui">${escapeHtml(t('config.save'))}</button></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('ui.scale'))}</h4><p>${escapeHtml(t('ui.scale.desc'))}</p></div><div class="control range-control"><input id="ui-scale" type="range" min="85" max="120" value="${settings.scale}"><span id="ui-scale-value">${settings.scale}%</span></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('ui.density'))}</h4><p>${escapeHtml(t('ui.density.desc'))}</p></div><div class="control"><label class="switch"><input id="ui-compact" type="checkbox" ${settings.compactMessages ? 'checked' : ''}><span></span></label></div></div>`;
  const scale = document.getElementById('ui-scale');
  scale.addEventListener('input', () => document.getElementById('ui-scale-value').textContent = `${scale.value}%`);
  document.getElementById('save-ui').addEventListener('click', () => {
    writeJson(STORAGE.ui, { scale: Number(scale.value), compactMessages: document.getElementById('ui-compact').checked });
    applyUiSettings();
    toast(t('config.save'), 'success');
  });
}

/* ===================================================================
   Model status
=================================================================== */

async function refreshModelStatus() {
  const pill = document.getElementById('model-status');
  const text = document.getElementById('model-status-text');
  pill.classList.remove('is-loaded', 'is-loading');
  pill.classList.add('is-loading');
  text.textContent = t('status.checking');
  try {
    const status = await invoke('get_model_status');
    state.modelStatus = status;
    pill.classList.remove('is-loading');
    if (status.loaded) {
      pill.classList.add('is-loaded');
      text.textContent = status.modelName || status.backend || t('status.connected');
      pill.title = status.message || '';
    } else {
      text.textContent = t('status.none');
      pill.title = status.message || '';
    }
  } catch (error) {
    pill.classList.remove('is-loading');
    text.textContent = t('status.none');
    pill.title = String(error);
  }
}

/* ===================================================================
   Boot
=================================================================== */

async function bootstrap() {
  applyAccent();
  applyUiSettings();
  await initI18n();
  try {
    await loadAvatarAssets();
    await migrateInlineCharacterAvatars();
  } catch (error) {
    console.warn('[avatar] IndexedDB avatar storage unavailable.', error);
  }
  renderNavbar();
  goTo('chat');
  await refreshModelStatus();
}

bootstrap().catch(error => {
  console.error('[boot] NastyVerse failed to initialize.', error);
  fallbackTranslations = fallbackTranslations || {};
  currentTranslations = fallbackTranslations;
  renderNavbar();
  goTo('chat');
  refreshModelStatus();
});
