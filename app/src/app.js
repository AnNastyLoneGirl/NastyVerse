/* ===================================================================
   Tauri bridge — falls back to a console-logging stub when opened in a
   plain browser (e.g. for design preview), so this file never throws
   outside of the real app shell.
=================================================================== */
const TAURI = window.__TAURI__;
const invoke = TAURI?.core?.invoke
  ? TAURI.core.invoke
  : async (cmd, args) => {
      console.log('[preview stub] invoke', cmd, args || '');
      if (cmd === 'get_model_status') return { loaded: false, backend: null, model_name: null };
    };

document.getElementById('btn-min').addEventListener('click', () => invoke('window_minimize'));
document.getElementById('btn-close').addEventListener('click', () => invoke('window_close'));
document.getElementById('btn-max').addEventListener('click', () => {
  invoke('window_toggle_maximize');
  document.body.classList.toggle('is-maximized'); // local preview only; the
  // real window-state icon swap should listen to appWindow.onResized instead.
});

const titlebar = document.querySelector('.titlebar');
titlebar.addEventListener('mousedown', event => {
  if (event.button !== 0) return;
  if (event.target.closest('button, a, input, select, textarea, [data-no-drag]')) return;
  invoke('window_start_dragging');
});

/* ===================================================================
   Nav bar — add an item here to get a new top-level section, no other
   wiring required as long as a matching `render<Id>()` function exists.
=================================================================== */
const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: '<path d="M4 5h16v10H8l-4 4V5z"/>' },
  { id: 'library', label: 'Library', icon: '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/>' },
];

const navbar = document.getElementById('navbar');
navbar.innerHTML = NAV_ITEMS.map(item => `
  <button class="nav-btn" data-nav="${item.id}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
    ${item.label}
  </button>`).join('');

navbar.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.nav));
});

/* ===================================================================
   Router — pages are plain functions that (re)build #page-root's HTML.
   `section` label shown in the titlebar is set per page.
=================================================================== */
const pageRoot = document.getElementById('page-root');
const sectionLabel = document.getElementById('section-label');

function setActiveNav(id) {
  navbar.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
}

function goTo(id, opts = {}) {
  setActiveNav(NAV_ITEMS.some(n => n.id === id) ? id : null);
  const renderers = { chat: renderChat, library: renderLibrary, configuration: () => renderConfiguration(opts.section || 'general') };
  (renderers[id] || renderChat)();
}

/* --- Chat (minimum placeholder — real chat UI comes once a backend can connect) --- */
function renderChat() {
  sectionLabel.textContent = 'Chat';
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="chat-empty">
        <svg viewBox="0 0 24 24"><path d="M4 5h16v10H8l-4 4V5z"/></svg>
        <h2>No conversation open</h2>
        <p>Pick a character from your library to start talking, or connect a local model first.</p>
        <button class="btn btn-primary" data-nav="library">Open Library</button>
      </div>
    </div>`;
  pageRoot.querySelector('[data-nav="library"]').addEventListener('click', () => goTo('library'));
}

/* --- Library --- */
function renderLibrary() {
  sectionLabel.textContent = 'Library';
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="lib-eyebrow">The foundations of your stories</div>
      <div class="lib-head">
        <div>
          <h1 class="font-display">Your library.</h1>
          <p>Characters to meet, worlds to explore and identities to embody.</p>
        </div>
        <div class="lib-actions">
          <button class="btn btn-ghost">Import</button>
          <button class="btn btn-primary">+ Create a character</button>
        </div>
      </div>
      <div class="lib-toolbar">
        <div class="lib-tabs">
          <button class="lib-tab active">Characters <span class="count">0</span></button>
          <button class="lib-tab">Lorebooks <span class="count">0</span></button>
          <button class="lib-tab">Personas <span class="count">0</span></button>
        </div>
        <input class="search" placeholder="Search…">
      </div>
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
        <h2>Your first character starts here.</h2>
        <p>Define a personality, first message and context. Then open a chat from the character card.</p>
        <button class="btn btn-primary">+ Create a character</button>
      </div>
    </div>`;
}

/* --- Configuration --- */
const CONFIG_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'model-params', label: 'Model parameters' },
  { id: 'ui', label: 'User Interface' },
];

const BACKENDS = [
  { id: 'koboldcpp', label: 'KoboldCpp', ph: 'http://localhost:5001', checked: true },
  { id: 'llamacpp', label: 'llama.cpp server', ph: 'http://localhost:8080' },
  { id: 'textgenwebui', label: 'text-generation-webui', ph: 'http://localhost:5000' },
  { id: 'ollama', label: 'Ollama', ph: 'http://localhost:11434' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', ph: 'https://…' },
];

function renderConfiguration(section) {
  sectionLabel.textContent = 'Configuration';
  setActiveNav(null); // Configuration is reached via the model-status pill, not the navbar
  pageRoot.innerHTML = `
    <div class="config-layout">
      <aside class="config-sidebar">
        <h3>Configuration</h3>
        ${CONFIG_SECTIONS.map(s => `<button class="config-item ${s.id === section ? 'active' : ''}" data-section="${s.id}">${s.label}</button>`).join('')}
      </aside>
      <div class="config-body" id="config-body"></div>
    </div>`;

  pageRoot.querySelectorAll('.config-item').forEach(b => {
    b.addEventListener('click', () => renderConfiguration(b.dataset.section));
  });

  const body = document.getElementById('config-body');
  if (section === 'general') {
    body.innerHTML = `
      <div class="config-topbar"><button class="btn btn-ghost">✓ Save</button></div>
      <div class="field-card">
        <div class="info"><h4>Language</h4><p>The interface updates immediately. Save to keep this choice for the next launch.</p></div>
        <div class="control"><select><option>English</option><option>Français</option></select></div>
      </div>
      <div class="field-card">
        <div class="info"><h4>Accent color</h4><p>Used for primary actions and other important interface elements.</p></div>
        <div class="control">
          <div class="swatch" style="background:var(--violet-2)"></div>
          <input class="hexinput" value="#B24BFF">
        </div>
      </div>`;
  } else if (section === 'models') {
    body.innerHTML = `
      <div class="field-card" style="flex-direction:column; align-items:stretch; gap:14px;">
        <div class="info"><h4>Local inference backend</h4><p>NastyVerse doesn't run models itself — connect it to any local server already running on your machine.</p></div>
        <div class="backend-list">
          ${BACKENDS.map(b => `
            <div class="backend-row">
              <input type="radio" name="backend" id="b_${b.id}" ${b.checked ? 'checked' : ''}>
              <label for="b_${b.id}">${b.label}</label>
              <input type="text" placeholder="${b.ph}" ${b.checked ? '' : 'disabled'}>
              <button class="test-btn">Test</button>
            </div>`).join('')}
        </div>
      </div>`;
    body.querySelectorAll('input[name=backend]').forEach(r => r.addEventListener('change', () => {
      body.querySelectorAll('.backend-row input[type=text]').forEach(t => t.disabled = true);
      r.closest('.backend-row').querySelector('input[type=text]').disabled = false;
    }));
  } else {
    body.innerHTML = `<div class="field-card"><div class="info"><h4>${CONFIG_SECTIONS.find(s => s.id === section).label}</h4><p>Not built yet — placeholder for the next pass.</p></div></div>`;
  }
}

/* ===================================================================
   Model status pill → jumps straight to Configuration ▸ Models.
=================================================================== */
document.getElementById('model-status').addEventListener('click', () => goTo('configuration', { section: 'models' }));

async function refreshModelStatus() {
  const status = await invoke('get_model_status');
  const dot = document.getElementById('model-status-dot');
  const text = document.getElementById('model-status-text');
  const pill = document.getElementById('model-status');
  pill.classList.remove('is-loaded', 'is-loading');
  if (status.loaded) {
    pill.classList.add('is-loaded');
    text.textContent = status.model_name || 'Model loaded';
  } else {
    text.textContent = 'No model loaded';
  }
}

/* ===================================================================
   Boot
=================================================================== */
refreshModelStatus();
goTo('chat');
