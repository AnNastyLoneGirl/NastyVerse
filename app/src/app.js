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

function getConversations() {
  return readJson(STORAGE.conversations, {});
}

function saveConversations(conversations) {
  writeJson(STORAGE.conversations, conversations);
}

function getGenerationParams() {
  return { ...DEFAULT_PARAMS, ...readJson(STORAGE.params, {}) };
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
  if (character.systemPrompt?.trim()) return character.systemPrompt.trim();
  const blocks = [`You are ${character.name}. Stay in character and respond naturally.`];
  if (character.description?.trim()) blocks.push(`Character description:\n${character.description.trim()}`);
  if (character.personality?.trim()) blocks.push(`Personality:\n${character.personality.trim()}`);
  if (character.scenario?.trim()) blocks.push(`Scenario:\n${character.scenario.trim()}`);
  if (character.postHistoryInstructions?.trim()) blocks.push(`Post-history instructions:\n${character.postHistoryInstructions.trim()}`);
  return blocks.join('\n\n');
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
  const text = [
    character.description, character.personality, character.scenario, character.firstMessage,
    ...(character.alternateGreetings || []), character.exampleMessages, character.systemPrompt,
    character.postHistoryInstructions, character.creatorNotes
  ].filter(Boolean).join('\n');
  return Math.round(text.length / 4);
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
  if (character.avatar) return `<div class="${className}"><img src="${escapeHtml(character.avatar)}" alt=""></div>`;
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
            <input type="file" id="character-import-file" accept=".json,application/json" hidden>
            <button class="btn btn-ghost" id="library-import">${escapeHtml(t('library.importJson'))}</button>
            <button class="btn btn-primary" id="library-create">+ ${escapeHtml(t('library.create'))}</button>
          </div>` : ''}
      </div>
      <div id="library-content" class="library-content"></div>
    </div>`;

  pageRoot.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => renderLibrary(button.dataset.tab)));

  if (tab === 'characters') {
    document.getElementById('library-create').addEventListener('click', () => openCharacterEditor());
    document.getElementById('library-import').addEventListener('click', () => document.getElementById('character-import-file').click());
    document.getElementById('character-import-file').addEventListener('change', importCharacterJson);
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

function renderCharacterCards(characters, totalCount) {
  if (!characters.length) {
    const empty = totalCount === 0;
    return `<div class="empty-state library-empty-wide">
      <h2>${escapeHtml(t(empty ? 'library.empty.title' : 'library.noResults.title'))}</h2>
      <p>${escapeHtml(t(empty ? 'library.empty.body' : 'library.noResults.body'))}</p>
      ${empty ? `<button class="btn btn-primary" data-empty-create>+ ${escapeHtml(t('library.create'))}</button>` : ''}
    </div>`;
  }

  return `<div class="character-grid character-grid-rich">${characters.map(character => {
    const tags = (character.tags || []).slice(0, 3);
    return `<article class="character-card character-card-rich">
      <div class="character-card-visual">
        ${characterAvatar(character, 'character-card-avatar-rich')}
        <button class="favorite-button ${character.favorite ? 'active' : ''}" data-favorite="${character.id}" title="${escapeHtml(t(character.favorite ? 'library.unfavorite' : 'library.favorite'))}">★</button>
        <div class="character-card-overlay"><button class="btn btn-primary btn-small" data-chat="${character.id}">${escapeHtml(t('library.openChat'))}</button></div>
      </div>
      <div class="character-card-info">
        <div class="character-card-titleline">
          <div><h3>${escapeHtml(character.name)}</h3>${character.creator ? `<span class="character-creator">${escapeHtml(t('library.by'))} ${escapeHtml(character.creator)}</span>` : ''}</div>
          <button class="character-more" data-edit="${character.id}">•••</button>
        </div>
        <p class="character-summary">${escapeHtml(character.description || character.personality || t('library.noDescription'))}</p>
        <div class="character-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}${(character.tags || []).length > 3 ? `<span>+${character.tags.length - 3}</span>` : ''}</div>
        <div class="character-card-stats">
          <span><strong>${characterChatCount(character.id)}</strong> ${escapeHtml(t('library.chats'))}</span>
          <span><strong>${characterApproxTokens(character)}</strong> ${escapeHtml(t('library.tokens'))}</span>
        </div>
        <div class="character-card-footer">
          <span>${escapeHtml(t('library.updated'))} ${escapeHtml(characterDate(character.updatedAt))}</span>
          <div>
            <button class="card-mini-action" data-duplicate="${character.id}" title="${escapeHtml(t('library.duplicate'))}">⧉</button>
            <button class="card-mini-action" data-export="${character.id}" title="${escapeHtml(t('library.export'))}">⇩</button>
            <button class="card-mini-action" data-edit="${character.id}" title="${escapeHtml(t('library.edit'))}">✎</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function bindCharacterCardActions(root) {
  root.querySelector('[data-empty-create]')?.addEventListener('click', () => openCharacterEditor());
  root.querySelectorAll('[data-chat]').forEach(button => button.addEventListener('click', () => {
    state.activeCharacterId = button.dataset.chat;
    localStorage.setItem(STORAGE.activeCharacter, state.activeCharacterId);
    const character = activeCharacter();
    if (character) ensureConversation(character);
    goTo('chat');
  }));
  root.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openCharacterEditor(button.dataset.edit)));
  root.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', () => toggleCharacterFavorite(button.dataset.favorite)));
  root.querySelectorAll('[data-duplicate]').forEach(button => button.addEventListener('click', () => duplicateCharacter(button.dataset.duplicate)));
  root.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => exportCharacterJson(button.dataset.export)));
}

function openCharacterEditor(characterId = null) {
  const existing = characterId ? getNormalizedCharacters().find(item => item.id === characterId) : null;
  const character = existing || normalizeCharacter({ name: '' });

  state.currentPage = 'library';
  state.libraryTab = 'characters';
  sectionLabel.textContent = t('library.characters');
  renderNavbar();

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
      </div>

      <form class="character-editor-page-form" id="character-form">
        <div class="character-editor-layout">
          <aside class="character-editor-aside">
            <div id="character-avatar-preview">${characterAvatar(character, 'character-editor-avatar')}</div>
            <label class="avatar-upload-button"><input type="file" id="character-avatar-file" accept="image/png,image/jpeg,image/webp" hidden>${escapeHtml(t('character.avatar'))}</label>
            <button type="button" class="avatar-remove" id="character-avatar-remove">${escapeHtml(t('character.removeAvatar'))}</button>
            <p class="avatar-help">${escapeHtml(t('character.avatarHelp'))}</p>
            <div class="editor-mini-stats">
              <div><strong>${characterChatCount(character.id)}</strong><span>${escapeHtml(t('library.chats'))}</span></div>
              <div><strong>${characterApproxTokens(character)}</strong><span>${escapeHtml(t('library.tokens'))}</span></div>
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
                <label class="form-field"><span>${escapeHtml(t('character.systemPrompt'))}</span><textarea name="systemPrompt" rows="8">${escapeHtml(character.systemPrompt)}</textarea></label>
                <label class="form-field"><span>${escapeHtml(t('character.postHistory'))}</span><textarea name="postHistoryInstructions" rows="7">${escapeHtml(character.postHistoryInstructions)}</textarea></label>
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

  const avatarInput = document.getElementById('character-avatar-file');
  const avatarValue = document.getElementById('character-avatar-value');
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      avatarInput.value = '';
      toast(t('library.avatarTooLarge'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      avatarValue.value = String(reader.result || '');
      document.getElementById('character-avatar-preview').innerHTML = `<div class="character-editor-avatar"><img src="${escapeHtml(avatarValue.value)}" alt=""></div>`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('character-avatar-remove').addEventListener('click', () => {
    avatarValue.value = '';
    document.getElementById('character-avatar-preview').innerHTML = `<div class="character-editor-avatar character-avatar-fallback">${escapeHtml((character.name || '?').slice(0, 1).toUpperCase())}</div>`;
  });

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
    row.querySelector('textarea')?.focus();
  });

  document.getElementById('character-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    if (!name) return toast(t('character.required'), 'error');

    const characters = getNormalizedCharacters();
    const record = normalizeCharacter({
      ...character,
      id: existing?.id || character.id || uid(),
      name,
      avatar: String(data.get('avatar') || ''),
      description: String(data.get('description') || '').trim(),
      personality: String(data.get('personality') || '').trim(),
      scenario: String(data.get('scenario') || '').trim(),
      firstMessage: String(data.get('firstMessage') || '').trim(),
      alternateGreetings: data.getAll('alternateGreeting').map(value => String(value).trim()).filter(Boolean),
      exampleMessages: existing?.exampleMessages || character.exampleMessages || '',
      systemPrompt: String(data.get('systemPrompt') || '').trim(),
      postHistoryInstructions: String(data.get('postHistoryInstructions') || '').trim(),
      creator: String(data.get('creator') || '').trim(),
      characterVersion: String(data.get('characterVersion') || '').trim(),
      creatorNotes: String(data.get('creatorNotes') || '').trim(),
      tags: existing?.tags || character.tags || [],
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

function duplicateCharacter(id) {
  const source = getNormalizedCharacters().find(character => character.id === id);
  if (!source) return;
  const characters = getNormalizedCharacters();
  characters.push(normalizeCharacter({ ...source, id: uid(), name: `${source.name} ${t('character.duplicateSuffix')}`, favorite: false, createdAt: Date.now(), updatedAt: Date.now() }));
  saveCharacters(characters);
  renderCharacterLibrary();
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
      extensions: {},
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

async function importCharacterJson(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.json')) return toast(t('library.importUnsupported'), 'error');

  try {
    const payload = JSON.parse(await file.text());
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
    if (!data || typeof data !== 'object' || !String(data.name || '').trim()) throw new Error('invalid card');
    const character = normalizeCharacter({
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      firstMessage: data.first_mes ?? data.firstMessage,
      alternateGreetings: data.alternate_greetings ?? data.alternateGreetings,
      exampleMessages: data.mes_example ?? data.exampleMessages,
      systemPrompt: data.system_prompt ?? data.systemPrompt,
      postHistoryInstructions: data.post_history_instructions ?? data.postHistoryInstructions,
      creator: data.creator,
      characterVersion: data.character_version ?? data.characterVersion,
      creatorNotes: data.creator_notes ?? data.creatorNotes,
      tags: data.tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const characters = getNormalizedCharacters();
    characters.push(character);
    saveCharacters(characters);
    toast(t('library.imported'), 'success');
    renderCharacterLibrary();
  } catch (error) {
    console.error(error);
    toast(t('library.importInvalid'), 'error');
  }
}

function deleteCharacter(id, confirmed = false) {
  const character = getNormalizedCharacters().find(item => item.id === id);
  if (!character) return;
  if (!confirmed && !confirm(t('character.deleteConfirm'))) return;
  saveCharacters(getNormalizedCharacters().filter(item => item.id !== id));
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
