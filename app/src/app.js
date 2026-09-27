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


Object.assign(TRANSLATIONS.en, {
  'library.importJson': 'Import JSON',
  'library.create': 'Create character',
  'library.search': 'Search characters, tags, creators…',
  'library.sort': 'Sort',
  'library.sort.nameAsc': 'Name A–Z',
  'library.sort.nameDesc': 'Name Z–A',
  'library.sort.newest': 'Newest',
  'library.sort.oldest': 'Oldest',
  'library.sort.recent': 'Recently updated',
  'library.sort.chats': 'Most chats',
  'library.sort.favorites': 'Favorites first',
  'library.filters': 'Filters',
  'library.allCharacters': 'All characters',
  'library.favorites': 'Favorites',
  'library.tags': 'Tags',
  'library.clearFilters': 'Clear filters',
  'library.noTags': 'No tags yet',
  'library.results': 'characters',
  'library.noResults.title': 'No characters match these filters.',
  'library.noResults.body': 'Try clearing the search or filters.',
  'library.empty.title': 'Create your first character.',
  'library.empty.body': 'Build a personality, scenario and first message, then start a conversation.',
  'library.updated': 'Updated',
  'library.chats': 'Chats',
  'library.tokens': 'Approx. tokens',
  'library.duplicate': 'Duplicate',
  'library.export': 'Export JSON',
  'library.favorite': 'Favorite',
  'library.unfavorite': 'Remove favorite',
  'library.imported': 'Character imported.',
  'library.importInvalid': 'This JSON is not a recognized character card.',
  'library.importUnsupported': 'PNG and CHARX import will be added with the native Character Card parser.',
  'library.avatarTooLarge': 'Avatar must be smaller than 2 MB.',
  'library.exported': 'Character JSON exported.',
  'character.identity': 'Identity',
  'character.avatar': 'Choose avatar',
  'character.avatarHelp': 'PNG, JPG or WebP. Stored locally for this base.',
  'character.removeAvatar': 'Remove avatar',
  'character.personality': 'Personality',
  'character.altGreetings': 'Alternative greetings',
  'character.altGreetingsHelp': 'Separate greetings with a line containing only ---',
  'character.examples': 'Example messages',
  'character.prompting': 'Prompting',
  'character.postHistory': 'Post-history instructions',
  'character.metadata': 'Creator metadata',
  'character.creator': 'Creator',
  'character.version': 'Character version',
  'character.creatorNotes': 'Creator notes',
  'character.tags': 'Tags',
  'character.tagsHelp': 'Comma-separated',
  'character.favorite': 'Favorite character',
  'character.deleteConfirm': 'Delete this character and its local chat history?',
});
Object.assign(TRANSLATIONS.fr, {
  'library.importJson': 'Importer JSON',
  'library.create': 'Créer un personnage',
  'library.search': 'Rechercher personnages, tags, créateurs…',
  'library.sort': 'Trier',
  'library.sort.nameAsc': 'Nom A–Z',
  'library.sort.nameDesc': 'Nom Z–A',
  'library.sort.newest': 'Plus récents',
  'library.sort.oldest': 'Plus anciens',
  'library.sort.recent': 'Modifiés récemment',
  'library.sort.chats': 'Plus de discussions',
  'library.sort.favorites': 'Favoris en premier',
  'library.filters': 'Filtres',
  'library.allCharacters': 'Tous les personnages',
  'library.favorites': 'Favoris',
  'library.tags': 'Tags',
  'library.clearFilters': 'Effacer les filtres',
  'library.noTags': 'Aucun tag',
  'library.results': 'personnages',
  'library.noResults.title': 'Aucun personnage ne correspond aux filtres.',
  'library.noResults.body': 'Essayez de supprimer la recherche ou les filtres.',
  'library.empty.title': 'Créez votre premier personnage.',
  'library.empty.body': 'Définissez sa personnalité, son scénario et son premier message, puis lancez une discussion.',
  'library.updated': 'Modifié',
  'library.chats': 'Discussions',
  'library.tokens': 'Tokens approx.',
  'library.duplicate': 'Dupliquer',
  'library.export': 'Exporter JSON',
  'library.favorite': 'Favori',
  'library.unfavorite': 'Retirer des favoris',
  'library.imported': 'Personnage importé.',
  'library.importInvalid': 'Ce JSON n’est pas une carte de personnage reconnue.',
  'library.importUnsupported': 'L’import PNG et CHARX arrivera avec le parseur natif Character Card.',
  'library.avatarTooLarge': 'L’avatar doit faire moins de 2 Mo.',
  'library.exported': 'JSON du personnage exporté.',
  'character.identity': 'Identité',
  'character.avatar': 'Choisir un avatar',
  'character.avatarHelp': 'PNG, JPG ou WebP. Stocké localement pour cette base.',
  'character.removeAvatar': 'Retirer l’avatar',
  'character.personality': 'Personnalité',
  'character.altGreetings': 'Salutations alternatives',
  'character.altGreetingsHelp': 'Séparez les salutations par une ligne contenant uniquement ---',
  'character.examples': 'Messages d’exemple',
  'character.prompting': 'Prompting',
  'character.postHistory': 'Instructions post-historique',
  'character.metadata': 'Métadonnées créateur',
  'character.creator': 'Créateur',
  'character.version': 'Version du personnage',
  'character.creatorNotes': 'Notes du créateur',
  'character.tags': 'Tags',
  'character.tagsHelp': 'Séparés par des virgules',
  'character.favorite': 'Personnage favori',
  'character.deleteConfirm': 'Supprimer ce personnage et son historique local ?',
});

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
  if (character.personality?.trim()) blocks.push(`Personality:\n${character.personality.trim()}`);
  if (character.scenario?.trim()) blocks.push(`Scenario:\n${character.scenario.trim()}`);
  if (character.exampleMessages?.trim()) blocks.push(`Example messages:\n${character.exampleMessages.trim()}`);
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
    return new Intl.DateTimeFormat(state.locale === 'fr' ? 'fr-FR' : 'en-US', {
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
          <div><h3>${escapeHtml(character.name)}</h3>${character.creator ? `<span class="character-creator">by ${escapeHtml(character.creator)}</span>` : ''}</div>
          <button class="character-more" data-edit="${character.id}">•••</button>
        </div>
        <p class="character-summary">${escapeHtml(character.description || character.personality || 'No description yet.')}</p>
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
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <form class="modal character-editor-modal" id="character-form">
      <div class="modal-head character-editor-head">
        <div><span class="modal-kicker">NastyVerse Character</span><h2>${escapeHtml(t(existing ? 'character.edit' : 'character.new'))}</h2></div>
        <button type="button" class="modal-close" id="modal-close">×</button>
      </div>
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

        <div class="character-editor-fields">
          <section class="editor-section">
            <div class="editor-section-title">${escapeHtml(t('character.identity'))}</div>
            <div class="editor-grid-2">
              <label class="form-field"><span>${escapeHtml(t('character.name'))}</span><input name="name" maxlength="80" value="${escapeHtml(character.name)}" required></label>
              <label class="form-field"><span>${escapeHtml(t('character.tags'))}</span><input name="tags" value="${escapeHtml((character.tags || []).join(', '))}" placeholder="${escapeHtml(t('character.tagsHelp'))}"></label>
            </div>
            <label class="form-field"><span>${escapeHtml(t('character.description'))}</span><textarea name="description" rows="3">${escapeHtml(character.description)}</textarea></label>
            <label class="form-field"><span>${escapeHtml(t('character.personality'))}</span><textarea name="personality" rows="4">${escapeHtml(character.personality)}</textarea></label>
            <label class="form-field"><span>${escapeHtml(t('character.scenario'))}</span><textarea name="scenario" rows="3">${escapeHtml(character.scenario)}</textarea></label>
          </section>

          <section class="editor-section">
            <div class="editor-section-title">${escapeHtml(t('character.firstMessage'))}</div>
            <label class="form-field"><textarea name="firstMessage" rows="5">${escapeHtml(character.firstMessage)}</textarea></label>
            <label class="form-field"><span>${escapeHtml(t('character.altGreetings'))}</span><textarea name="alternateGreetings" rows="5" placeholder="${escapeHtml(t('character.altGreetingsHelp'))}">${escapeHtml((character.alternateGreetings || []).join('\n---\n'))}</textarea></label>
            <label class="form-field"><span>${escapeHtml(t('character.examples'))}</span><textarea name="exampleMessages" rows="6">${escapeHtml(character.exampleMessages)}</textarea></label>
          </section>

          <details class="editor-section editor-details">
            <summary>${escapeHtml(t('character.prompting'))}</summary>
            <label class="form-field"><span>${escapeHtml(t('character.systemPrompt'))}</span><textarea name="systemPrompt" rows="5">${escapeHtml(character.systemPrompt)}</textarea></label>
            <label class="form-field"><span>${escapeHtml(t('character.postHistory'))}</span><textarea name="postHistoryInstructions" rows="4">${escapeHtml(character.postHistoryInstructions)}</textarea></label>
          </details>

          <details class="editor-section editor-details">
            <summary>${escapeHtml(t('character.metadata'))}</summary>
            <div class="editor-grid-2">
              <label class="form-field"><span>${escapeHtml(t('character.creator'))}</span><input name="creator" value="${escapeHtml(character.creator)}"></label>
              <label class="form-field"><span>${escapeHtml(t('character.version'))}</span><input name="characterVersion" value="${escapeHtml(character.characterVersion)}"></label>
            </div>
            <label class="form-field"><span>${escapeHtml(t('character.creatorNotes'))}</span><textarea name="creatorNotes" rows="4">${escapeHtml(character.creatorNotes)}</textarea></label>
          </details>
        </div>
      </div>
      <input type="hidden" name="avatar" id="character-avatar-value" value="${escapeHtml(character.avatar)}">
      <div class="modal-actions character-editor-actions">
        ${existing ? `<div class="editor-actions-left">
          <button type="button" class="btn btn-ghost" id="character-duplicate">${escapeHtml(t('library.duplicate'))}</button>
          <button type="button" class="btn btn-ghost" id="character-export">${escapeHtml(t('library.export'))}</button>
          <button type="button" class="btn btn-danger" id="character-delete">${escapeHtml(t('library.delete'))}</button>
        </div>` : '<div></div>'}
        <div class="editor-actions-right">
          <button type="button" class="btn btn-ghost" id="modal-cancel">${escapeHtml(t('common.cancel'))}</button>
          <button class="btn btn-primary" type="submit">${escapeHtml(t('common.save'))}</button>
        </div>
      </div>
    </form>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('modal-close').addEventListener('click', close);
  document.getElementById('modal-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });

  const avatarInput = document.getElementById('character-avatar-file');
  const avatarValue = document.getElementById('character-avatar-value');
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { avatarInput.value = ''; toast(t('library.avatarTooLarge'), 'error'); return; }
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
      alternateGreetings: String(data.get('alternateGreetings') || '').split(/\n\s*---\s*\n/g).map(v => v.trim()).filter(Boolean),
      exampleMessages: String(data.get('exampleMessages') || '').trim(),
      systemPrompt: String(data.get('systemPrompt') || '').trim(),
      postHistoryInstructions: String(data.get('postHistoryInstructions') || '').trim(),
      creator: String(data.get('creator') || '').trim(),
      characterVersion: String(data.get('characterVersion') || '').trim(),
      creatorNotes: String(data.get('creatorNotes') || '').trim(),
      tags: String(data.get('tags') || '').split(',').map(v => v.trim()).filter(Boolean),
      favorite: data.get('favorite') === 'on',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    const index = characters.findIndex(item => item.id === record.id);
    if (index >= 0) characters[index] = record; else characters.push(record);
    saveCharacters(characters);
    close();
    renderCharacterLibrary();
  });

  document.getElementById('character-duplicate')?.addEventListener('click', () => { close(); duplicateCharacter(existing.id); });
  document.getElementById('character-export')?.addEventListener('click', () => exportCharacterJson(existing.id));
  document.getElementById('character-delete')?.addEventListener('click', () => {
    if (!confirm(t('character.deleteConfirm'))) return;
    close(); deleteCharacter(existing.id, true);
  });

  overlay.querySelector('input[name=name]').focus();
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
  characters.push(normalizeCharacter({ ...source, id: uid(), name: `${source.name} Copy`, favorite: false, createdAt: Date.now(), updatedAt: Date.now() }));
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
