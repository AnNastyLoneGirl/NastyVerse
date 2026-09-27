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
      if (cmd === 'get_model_status') return { loaded: false, backend: null, modelName: null, message: 'Browser preview' };
      if (cmd === 'load_backend_config') return null;
      if (cmd === 'test_backend_connection') return { ok: true, message: 'Preview connection successful.', models: ['preview-model'] };
      if (cmd === 'save_backend_config') return args?.config || null;
      if (cmd === 'chat_completion') return { content: 'This is a browser-preview reply. Run NastyVerse through the launcher to use a real backend.', model: 'preview-model' };
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

const TRANSLATIONS = {
  en: {
    'nav.chat': 'Chat', 'nav.library': 'Library',
    'status.none': 'No model loaded', 'status.connected': 'Connected',
    'chat.none.title': 'No conversation open',
    'chat.none.body': 'Pick a character from your library to start talking, or connect an inference backend first.',
    'chat.none.button': 'Open Library', 'chat.placeholder': 'Write a message…', 'chat.send': 'Send',
    'chat.clear': 'Clear conversation', 'chat.library': 'Library', 'chat.generating': 'Generating…',
    'library.eyebrow': 'The foundations of your stories', 'library.title': 'Your library.',
    'library.subtitle': 'Characters to meet, worlds to explore and identities to embody.',
    'library.import': 'Import', 'library.create': 'Create a character', 'library.search': 'Search…',
    'library.characters': 'Characters', 'library.lorebooks': 'Lorebooks', 'library.personas': 'Personas',
    'library.empty.title': 'Your first character starts here.',
    'library.empty.body': 'Define a personality, first message and context. Then open a chat from the character card.',
    'library.openChat': 'Start chat', 'library.edit': 'Edit', 'library.delete': 'Delete',
    'library.soon.title': 'This library section comes next.',
    'library.soon.body': 'The base is ready; real Lorebook and Persona storage will be added in the next passes.',
    'config.title': 'Configuration', 'config.general': 'General', 'config.models': 'Models',
    'config.params': 'Model parameters', 'config.ui': 'User Interface', 'config.save': 'Save',
    'general.language': 'Language', 'general.language.desc': 'Changes the application interface immediately.',
    'general.accent': 'Accent color', 'general.accent.desc': 'Overrides the primary accent used by interactive controls.',
    'models.title': 'Inference backend', 'models.desc': 'NastyVerse does not run a model itself. Connect an existing local server or compatible API.',
    'models.apiKey': 'API key', 'models.apiKey.desc': 'Optional. Required only by endpoints that use bearer authentication.',
    'models.model': 'Model', 'models.model.desc': 'Test the connection to discover available models, then choose the one used for chat.',
    'models.test': 'Test', 'models.testing': 'Testing…', 'models.save': 'Save backend',
    'models.saved': 'Backend configuration saved.', 'models.notTested': 'Not tested yet.',
    'params.temperature': 'Temperature', 'params.temperature.desc': 'Higher values make responses more varied.',
    'params.topP': 'Top P', 'params.topP.desc': 'Controls nucleus sampling diversity.',
    'params.maxTokens': 'Max response tokens', 'params.maxTokens.desc': 'Maximum number of tokens requested from the backend.',
    'ui.scale': 'Interface scale', 'ui.scale.desc': 'Adjusts the overall UI text size.',
    'ui.density': 'Compact messages', 'ui.density.desc': 'Reduces vertical spacing in conversations.',
    'common.cancel': 'Cancel', 'common.save': 'Save', 'common.close': 'Close',
    'character.new': 'Create a character', 'character.edit': 'Edit character', 'character.name': 'Name',
    'character.description': 'Description', 'character.scenario': 'Scenario', 'character.firstMessage': 'First message',
    'character.systemPrompt': 'System prompt', 'character.required': 'Character name is required.',
    'toast.importSoon': 'Character Card import will be added in the next Library pass.',
  },
  fr: {
    'nav.chat': 'Chat', 'nav.library': 'Bibliothèque',
    'status.none': 'Aucun modèle chargé', 'status.connected': 'Connecté',
    'chat.none.title': 'Aucune conversation ouverte',
    'chat.none.body': 'Choisissez un personnage dans votre bibliothèque pour commencer, ou connectez d’abord un backend d’inférence.',
    'chat.none.button': 'Ouvrir la bibliothèque', 'chat.placeholder': 'Écrire un message…', 'chat.send': 'Envoyer',
    'chat.clear': 'Effacer la conversation', 'chat.library': 'Bibliothèque', 'chat.generating': 'Génération…',
    'library.eyebrow': 'Les fondations de vos histoires', 'library.title': 'Votre bibliothèque.',
    'library.subtitle': 'Des personnages à rencontrer, des mondes à explorer et des identités à incarner.',
    'library.import': 'Importer', 'library.create': 'Créer un personnage', 'library.search': 'Rechercher…',
    'library.characters': 'Personnages', 'library.lorebooks': 'Lorebooks', 'library.personas': 'Personas',
    'library.empty.title': 'Votre premier personnage commence ici.',
    'library.empty.body': 'Définissez sa personnalité, son premier message et son contexte, puis lancez une discussion depuis sa carte.',
    'library.openChat': 'Discuter', 'library.edit': 'Modifier', 'library.delete': 'Supprimer',
    'library.soon.title': 'Cette section arrive ensuite.',
    'library.soon.body': 'La base est prête ; le stockage réel des Lorebooks et Personas sera ajouté lors des prochaines passes.',
    'config.title': 'Configuration', 'config.general': 'Général', 'config.models': 'Modèles',
    'config.params': 'Paramètres du modèle', 'config.ui': 'Interface', 'config.save': 'Enregistrer',
    'general.language': 'Langue', 'general.language.desc': 'Modifie immédiatement la langue de l’application.',
    'general.accent': 'Couleur d’accent', 'general.accent.desc': 'Remplace l’accent principal utilisé par les contrôles interactifs.',
    'models.title': 'Backend d’inférence', 'models.desc': 'NastyVerse n’exécute pas lui-même de modèle. Connectez un serveur local existant ou une API compatible.',
    'models.apiKey': 'Clé API', 'models.apiKey.desc': 'Optionnelle. Nécessaire uniquement pour les endpoints utilisant une authentification Bearer.',
    'models.model': 'Modèle', 'models.model.desc': 'Testez la connexion pour découvrir les modèles disponibles, puis choisissez celui utilisé pour le chat.',
    'models.test': 'Tester', 'models.testing': 'Test…', 'models.save': 'Enregistrer le backend',
    'models.saved': 'Configuration du backend enregistrée.', 'models.notTested': 'Pas encore testé.',
    'params.temperature': 'Température', 'params.temperature.desc': 'Une valeur élevée rend les réponses plus variées.',
    'params.topP': 'Top P', 'params.topP.desc': 'Contrôle la diversité de l’échantillonnage nucleus.',
    'params.maxTokens': 'Tokens max de réponse', 'params.maxTokens.desc': 'Nombre maximal de tokens demandé au backend.',
    'ui.scale': 'Échelle de l’interface', 'ui.scale.desc': 'Ajuste la taille générale des textes.',
    'ui.density': 'Messages compacts', 'ui.density.desc': 'Réduit l’espacement vertical des conversations.',
    'common.cancel': 'Annuler', 'common.save': 'Enregistrer', 'common.close': 'Fermer',
    'character.new': 'Créer un personnage', 'character.edit': 'Modifier le personnage', 'character.name': 'Nom',
    'character.description': 'Description', 'character.scenario': 'Scénario', 'character.firstMessage': 'Premier message',
    'character.systemPrompt': 'Prompt système', 'character.required': 'Le nom du personnage est obligatoire.',
    'toast.importSoon': 'L’import des Character Cards sera ajouté lors de la prochaine passe Library.',
  },
};

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
  locale: localStorage.getItem(STORAGE.locale) || 'en',
  currentPage: 'chat',
  libraryTab: 'characters',
  activeCharacterId: localStorage.getItem(STORAGE.activeCharacter) || null,
  sending: false,
  modelStatus: null,
};

const pageRoot = document.getElementById('page-root');
const sectionLabel = document.getElementById('section-label');
const navbar = document.getElementById('navbar');

function t(key) {
  return TRANSLATIONS[state.locale]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

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

document.querySelector('.titlebar').addEventListener('mousedown', event => {
  if (event.button !== 0) return;
  if (event.target.closest('button, a, input, select, textarea, [data-no-drag]')) return;
  invoke('window_start_dragging');
});

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
  if (character.scenario?.trim()) blocks.push(`Scenario:\n${character.scenario.trim()}`);
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
          <span>${escapeHtml(character.description || 'NastyVerse character')}</span>
        </div>
        <div class="chat-header-actions">
          <button class="btn btn-ghost btn-small" id="chat-library">${escapeHtml(t('chat.library'))}</button>
          <button class="btn btn-ghost btn-small" id="chat-clear">${escapeHtml(t('chat.clear'))}</button>
        </div>
      </header>
      <div class="messages" id="messages">
        ${messages.map(message => `
          <article class="message message-${message.role}">
            <div class="message-role">${message.role === 'user' ? 'You' : escapeHtml(character.name)}</div>
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

function renderLibrary(tab = 'characters') {
  state.currentPage = 'library';
  state.libraryTab = tab;
  sectionLabel.textContent = t('nav.library');
  renderNavbar();

  const characters = getCharacters();
  const searchValue = '';
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="lib-eyebrow">${escapeHtml(t('library.eyebrow'))}</div>
      <div class="lib-head">
        <div><h1 class="font-display">${escapeHtml(t('library.title'))}</h1><p>${escapeHtml(t('library.subtitle'))}</p></div>
        <div class="lib-actions">
          <button class="btn btn-ghost" id="library-import">${escapeHtml(t('library.import'))}</button>
          <button class="btn btn-primary" id="library-create">+ ${escapeHtml(t('library.create'))}</button>
        </div>
      </div>
      <div class="lib-toolbar">
        <div class="lib-tabs">
          <button class="lib-tab ${tab === 'characters' ? 'active' : ''}" data-tab="characters">${escapeHtml(t('library.characters'))} <span class="count">${characters.length}</span></button>
          <button class="lib-tab ${tab === 'lorebooks' ? 'active' : ''}" data-tab="lorebooks">${escapeHtml(t('library.lorebooks'))} <span class="count">0</span></button>
          <button class="lib-tab ${tab === 'personas' ? 'active' : ''}" data-tab="personas">${escapeHtml(t('library.personas'))} <span class="count">0</span></button>
        </div>
        ${tab === 'characters' ? `<input class="search" id="library-search" value="${escapeHtml(searchValue)}" placeholder="${escapeHtml(t('library.search'))}">` : ''}
      </div>
      <div id="library-content"></div>
    </div>`;

  pageRoot.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => renderLibrary(button.dataset.tab)));
  document.getElementById('library-create').addEventListener('click', () => openCharacterEditor());
  document.getElementById('library-import').addEventListener('click', () => toast(t('toast.importSoon')));

  if (tab === 'characters') {
    const search = document.getElementById('library-search');
    search.addEventListener('input', () => renderCharacterGrid(search.value));
    renderCharacterGrid('');
  } else {
    document.getElementById('library-content').innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>
        <h2>${escapeHtml(t('library.soon.title'))}</h2>
        <p>${escapeHtml(t('library.soon.body'))}</p>
      </div>`;
  }
}

function renderCharacterGrid(query) {
  const root = document.getElementById('library-content');
  const normalized = query.trim().toLowerCase();
  const characters = getCharacters().filter(character => {
    if (!normalized) return true;
    return `${character.name} ${character.description || ''}`.toLowerCase().includes(normalized);
  });

  if (!characters.length) {
    root.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
        <h2>${escapeHtml(t('library.empty.title'))}</h2>
        <p>${escapeHtml(t('library.empty.body'))}</p>
        <button class="btn btn-primary" id="empty-create">+ ${escapeHtml(t('library.create'))}</button>
      </div>`;
    document.getElementById('empty-create').addEventListener('click', () => openCharacterEditor());
    return;
  }

  root.innerHTML = `<div class="character-grid">${characters.map(character => `
    <article class="character-card">
      <div class="character-card-avatar">${escapeHtml(character.name.slice(0, 1).toUpperCase())}</div>
      <div class="character-card-body">
        <h3>${escapeHtml(character.name)}</h3>
        <p>${escapeHtml(character.description || 'No description yet.')}</p>
      </div>
      <div class="character-card-actions">
        <button class="btn btn-primary btn-small" data-chat="${character.id}">${escapeHtml(t('library.openChat'))}</button>
        <button class="icon-action" data-edit="${character.id}" title="${escapeHtml(t('library.edit'))}">✎</button>
        <button class="icon-action danger" data-delete="${character.id}" title="${escapeHtml(t('library.delete'))}">×</button>
      </div>
    </article>`).join('')}</div>`;

  root.querySelectorAll('[data-chat]').forEach(button => button.addEventListener('click', () => {
    state.activeCharacterId = button.dataset.chat;
    localStorage.setItem(STORAGE.activeCharacter, state.activeCharacterId);
    const character = activeCharacter();
    if (character) ensureConversation(character);
    goTo('chat');
  }));
  root.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openCharacterEditor(button.dataset.edit)));
  root.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteCharacter(button.dataset.delete)));
}

function openCharacterEditor(characterId = null) {
  const existing = characterId ? getCharacters().find(item => item.id === characterId) : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <form class="modal" id="character-form">
      <div class="modal-head"><div><span class="modal-kicker">NastyVerse</span><h2>${escapeHtml(t(existing ? 'character.edit' : 'character.new'))}</h2></div><button type="button" class="modal-close" id="modal-close">×</button></div>
      <label class="form-field"><span>${escapeHtml(t('character.name'))}</span><input name="name" maxlength="80" value="${escapeHtml(existing?.name || '')}" required></label>
      <label class="form-field"><span>${escapeHtml(t('character.description'))}</span><textarea name="description" rows="3">${escapeHtml(existing?.description || '')}</textarea></label>
      <label class="form-field"><span>${escapeHtml(t('character.scenario'))}</span><textarea name="scenario" rows="3">${escapeHtml(existing?.scenario || '')}</textarea></label>
      <label class="form-field"><span>${escapeHtml(t('character.firstMessage'))}</span><textarea name="firstMessage" rows="4">${escapeHtml(existing?.firstMessage || '')}</textarea></label>
      <label class="form-field"><span>${escapeHtml(t('character.systemPrompt'))}</span><textarea name="systemPrompt" rows="4">${escapeHtml(existing?.systemPrompt || '')}</textarea></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="modal-cancel">${escapeHtml(t('common.cancel'))}</button><button class="btn btn-primary" type="submit">${escapeHtml(t('common.save'))}</button></div>
    </form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById('modal-close').addEventListener('click', close);
  document.getElementById('modal-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
  document.getElementById('character-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    if (!name) return toast(t('character.required'), 'error');
    const characters = getCharacters();
    const record = {
      id: existing?.id || uid(),
      name,
      description: String(data.get('description') || '').trim(),
      scenario: String(data.get('scenario') || '').trim(),
      firstMessage: String(data.get('firstMessage') || '').trim(),
      systemPrompt: String(data.get('systemPrompt') || '').trim(),
      updatedAt: Date.now(),
    };
    if (existing) characters[characters.findIndex(item => item.id === existing.id)] = record;
    else characters.push(record);
    saveCharacters(characters);
    close();
    renderLibrary('characters');
  });
  overlay.querySelector('input[name=name]').focus();
}

function deleteCharacter(id) {
  const character = getCharacters().find(item => item.id === id);
  if (!character || !confirm(`${t('library.delete')} “${character.name}”?`)) return;
  saveCharacters(getCharacters().filter(item => item.id !== id));
  const conversations = getConversations();
  delete conversations[id];
  saveConversations(conversations);
  if (state.activeCharacterId === id) {
    state.activeCharacterId = null;
    localStorage.removeItem(STORAGE.activeCharacter);
  }
  renderLibrary('characters');
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
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.general'))}</h2><p>Application-level preferences.</p></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.language'))}</h4><p>${escapeHtml(t('general.language.desc'))}</p></div><div class="control"><select id="app-language"><option value="en" ${state.locale === 'en' ? 'selected' : ''}>English</option><option value="fr" ${state.locale === 'fr' ? 'selected' : ''}>Français</option></select></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.accent'))}</h4><p>${escapeHtml(t('general.accent.desc'))}</p></div><div class="control"><input id="accent-color" type="color" value="${escapeHtml(accent)}"><input id="accent-hex" class="hexinput" value="${escapeHtml(accent)}" maxlength="7"></div></div>`;

  document.getElementById('app-language').addEventListener('change', event => {
    state.locale = event.target.value;
    localStorage.setItem(STORAGE.locale, state.locale);
    renderConfiguration('general');
    refreshModelStatus();
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
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('models.model'))}</h4><p>${escapeHtml(t('models.model.desc'))}</p></div><div class="control model-control"><input id="backend-model" list="backend-model-list" value="${escapeHtml(saved?.model || '')}" placeholder="Model name"><datalist id="backend-model-list"></datalist></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('models.apiKey'))}</h4><p>${escapeHtml(t('models.apiKey.desc'))}</p></div><div class="control model-control"><input id="backend-api-key" type="password" value="${escapeHtml(saved?.apiKey || '')}" placeholder="Optional bearer token"></div></div>`;

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
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.params'))}</h2><p>Defaults sent with every generation request.</p></div><button class="btn btn-primary" id="save-params">${escapeHtml(t('config.save'))}</button></div>
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
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.ui'))}</h2><p>Local presentation preferences.</p></div><button class="btn btn-primary" id="save-ui">${escapeHtml(t('config.save'))}</button></div>
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
  text.textContent = 'Checking…';
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

applyAccent();
applyUiSettings();
renderNavbar();
goTo('chat');
refreshModelStatus();
