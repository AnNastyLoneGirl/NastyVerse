/* ===================================================================
   Tauri bridge — same fallback pattern as app/src/app.js, so this file
   can also be opened in a plain browser for quick design iteration.
=================================================================== */
const TAURI = window.__TAURI__;
const invoke = TAURI?.core?.invoke
  ? TAURI.core.invoke
  : async (cmd, args) => {
      console.log('[preview stub] invoke', cmd, args || '');
      if (cmd === 'check_launcher_update') {
        return { configured: false, available: false, current_version: 'preview', version: null, message: 'Browser preview — launcher updater disabled.' };
      }
      if (cmd === 'install_launcher_update') {
        return;
      }
      if (cmd === 'check_installation') {
        return { state: 'launch', message: 'Browser preview — updater disabled.', files_to_download: 0, files_to_remove: 0, bytes_to_download: 0, remote_revision: null, installed: true, offline: true };
      }
      if (cmd === 'sync_installation') {
        return { state: 'launch', message: 'Browser preview — updater disabled.', files_to_download: 0, files_to_remove: 0, bytes_to_download: 0, remote_revision: null, installed: true, offline: true };
      }
    };
const listen = TAURI?.event?.listen ? TAURI.event.listen : async () => () => {};

document.getElementById('btn-min').addEventListener('click', () => invoke('window_minimize'));
document.getElementById('btn-close').addEventListener('click', () => invoke('window_close'));
document.getElementById('btn-max').addEventListener('click', () => invoke('window_toggle_maximize'));

// `data-tauri-drag-region` stays in the HTML, but this explicit command also
// makes dragging reliable when the user grabs any non-interactive empty area
// of the custom chrome.
const chrome = document.querySelector('.chrome');
chrome.addEventListener('mousedown', event => {
  if (event.button !== 0) return;
  if (event.target.closest('button, a, input, select, textarea, [data-no-drag]')) return;
  invoke('window_start_dragging');
});

/* ===================================================================
   i18n — English is the default; add a language by adding a key below.
   A missing key in a non-English language falls back to English.
=================================================================== */
const TRANSLATIONS = {
  en: {
    "launcher": "Launcher", "launch.cta": "Launch",
    "nav.home": "Home", "nav.news": "News", "nav.catalog": "Catalog", "nav.changelog": "Changelog", "nav.options": "Options",
    "hero.eyebrow": "Your world. Your rules.",
    "hero.body": "NastyVerse is a universe of AI characters you can create, customize, and grow. Choose their world, shape their mind, and start your own story.",
    "hero.cta": "Discover",
    "home.news": "Latest news", "home.seeall": "See all →",
    "home.catalog": "Latest from the catalog", "home.opencatalog": "Open catalog →",
    "update.title": "Update available", "update.body": "One or more NastyVerse components changed on GitHub.", "update.cta": "Update now",
    "launcher.update.checking.title": "Checking the launcher…",
    "launcher.update.checking.detail": "Checking GitHub Releases for a newer signed portable launcher.",
    "launcher.update.available.title": "Launcher update available",
    "launcher.update.available.detail": "Launcher {current} → {version}. Update the launcher before checking the application files.",
    "launcher.update.button": "Update launcher",
    "launcher.update.downloading": "Downloading launcher update — {percent}%",
    "launcher.update.downloading.unknown": "Downloading launcher update…",
    "launcher.update.installing": "Applying launcher update…",
    "launcher.update.installing.detail": "The launcher will replace itself in the background, then reopen automatically.",
    "news.title": "News", "news.empty": "No news available yet.", "catalog.title": "Catalog", "changelog.title": "Changelog", "changelog.empty": "No updates available yet.",
    "options.title": "Options",
    "options.lang.title": "Language", "options.lang.hint": "Interface language. More translations can be added at any time.",
    "options.accent.title": "Accent color", "options.accent.hint": "Used for primary actions and other important interface elements.",
    "options.music.title": "Launcher music", "options.music.hint": "Volume of the launcher theme. Set it to 0% to mute it.",
    "options.models.note": "Connecting local backends (KoboldCpp, llama.cpp server, text-generation-webui, Ollama…) happens in the main app, under Configuration ▸ Models — not here.",
    "install.checking.title": "Checking NastyVerse…",
    "install.checking.detail": "Comparing local files with the current GitHub main branch.",
    "install.checking.button": "Checking…",
    "install.install.title": "NastyVerse is ready to install",
    "install.install.detail": "{files} file(s) • {size} to download",
    "install.install.button": "Install",
    "install.update.title": "Update available",
    "install.update.detail": "{files} changed file(s) • {size}{removal}",
    "install.update.removal": " • {files} obsolete file(s) removed",
    "install.update.button": "Update",
    "install.ready.title": "NastyVerse is up to date",
    "install.ready.detail": "All application files match the current GitHub main branch.",
    "install.offline.title": "Installed — verification unavailable",
    "install.error.title": "Verification failed",
    "install.error.detail": "Unable to verify NastyVerse.",
    "install.retry": "Retry",
    "install.installing": "Installing…",
    "install.updating": "Updating…",
    "install.installing.title": "Installing NastyVerse…",
    "install.updating.title": "Updating NastyVerse…",
    "install.preparing": "Preparing the required files…",
    "install.launch": "Launch →",
    "install.launching": "Launching…",
    "install.downloading": "Downloading {path} — {percent}%",
    "install.downloading.generic": "Downloading files — {percent}%",
    "install.applying": "Applying verified files…",
    "install.complete": "Final integrity check complete."
  },
  fr: {
    "launcher": "Launcher", "launch.cta": "Lancer",
    "nav.home": "Accueil", "nav.news": "Actualités", "nav.catalog": "Catalogue", "nav.changelog": "Changelog", "nav.options": "Options",
    "hero.eyebrow": "Votre univers. Vos règles.",
    "hero.body": "NastyVerse est un univers de personnages IA que vous pouvez créer, personnaliser et faire évoluer. Choisissez leur monde, façonnez leur esprit, commencez votre histoire.",
    "hero.cta": "Découvrir",
    "home.news": "Dernières actualités", "home.seeall": "Voir tout →", "home.catalog": "Derniers contenus du catalogue",
    "update.title": "Mise à jour disponible", "update.cta": "Mettre à jour",
    "launcher.update.checking.title": "Vérification du launcher…",
    "launcher.update.checking.detail": "Recherche d’une version portable plus récente et signée sur GitHub Releases.",
    "launcher.update.available.title": "Mise à jour du launcher disponible",
    "launcher.update.available.detail": "Launcher {current} → {version}. Le launcher doit être mis à jour avant de vérifier les fichiers de l’application.",
    "launcher.update.button": "Mettre à jour le launcher",
    "launcher.update.downloading": "Téléchargement de la mise à jour du launcher — {percent}%",
    "launcher.update.downloading.unknown": "Téléchargement de la mise à jour du launcher…",
    "launcher.update.installing": "Application de la mise à jour du launcher…",
    "launcher.update.installing.detail": "Le launcher va se remplacer en arrière-plan puis se rouvrir automatiquement.",
    "news.title": "Actualités", "news.empty": "Aucune actualité disponible pour le moment.", "catalog.title": "Catalogue", "changelog.title": "Changelog", "changelog.empty": "Aucune mise à jour disponible pour le moment.", "options.title": "Options",
    "options.lang.title": "Langue", "options.lang.hint": "Langue de l’interface. D’autres traductions pourront être ajoutées à tout moment.",
    "options.accent.title": "Couleur d’accent", "options.accent.hint": "Utilisée pour les actions principales et les éléments importants de l’interface.",
    "options.music.title": "Musique du launcher", "options.music.hint": "Volume du thème du launcher. Réglez-le à 0 % pour couper le son.",
    "options.models.note": "La connexion aux backends locaux (KoboldCpp, llama.cpp server, text-generation-webui, Ollama…) se fait dans l’application principale, Configuration ▸ Models — pas ici.",
    "install.checking.title": "Vérification de NastyVerse…",
    "install.checking.detail": "Comparaison des fichiers locaux avec la branche GitHub main actuelle.",
    "install.checking.button": "Vérification…",
    "install.install.title": "NastyVerse est prêt à être installé",
    "install.install.detail": "{files} fichier(s) • {size} à télécharger",
    "install.install.button": "Installer",
    "install.update.title": "Mise à jour disponible",
    "install.update.detail": "{files} fichier(s) modifié(s) • {size}{removal}",
    "install.update.removal": " • {files} fichier(s) obsolète(s) supprimé(s)",
    "install.update.button": "Mettre à jour",
    "install.ready.title": "NastyVerse est à jour",
    "install.ready.detail": "Tous les fichiers correspondent à la branche GitHub main actuelle.",
    "install.offline.title": "Installé — vérification indisponible",
    "install.error.title": "Échec de la vérification",
    "install.error.detail": "Impossible de vérifier NastyVerse.",
    "install.retry": "Réessayer",
    "install.installing": "Installation…",
    "install.updating": "Mise à jour…",
    "install.installing.title": "Installation de NastyVerse…",
    "install.updating.title": "Mise à jour de NastyVerse…",
    "install.preparing": "Préparation des fichiers nécessaires…",
    "install.launch": "Lancer →",
    "install.launching": "Lancement…",
    "install.downloading": "Téléchargement de {path} — {percent}%",
    "install.downloading.generic": "Téléchargement des fichiers — {percent}%",
    "install.applying": "Application des fichiers vérifiés…",
    "install.complete": "Vérification finale terminée."
  }
};
function t(key, lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
}
function tf(key, vars = {}) {
  return Object.entries(vars).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    t(key, currentLang)
  );
}
let currentLang = 'en';
try { currentLang = localStorage.getItem('nv_lang') || 'en'; } catch (e) {}

/* ===================================================================
   Remote Home carousel content
   `launcher-content/home.json` on GitHub main is the source of truth.
   Priority: remote JSON -> last successful cache -> built-in fallback.
=================================================================== */
const HOME_CONTENT_CACHE_KEY = 'nv_launcher_home_content_v1';
const LAUNCHER_CONTENT_BASE_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyVerse/main/launcher-content/';
const HOME_SLIDE_INTERVAL_MS = 8000;
const DEFAULT_HOME_CONTENT = {
  slogan_fr: 'Votre univers. Vos règles.',
  slogan_en: 'Your world. Your rules.',
  slides: [
    {
      key: 'welcome',
      description_en: 'NastyVerse is a universe of AI characters you can create, customize, and grow. Choose their world, shape their mind, and start your own story.',
      description_fr: 'NastyVerse est un univers de personnages IA que vous pouvez créer, personnaliser et faire évoluer. Choisissez leur monde, façonnez leur esprit, commencez votre histoire.',
      image: '',
      button: true,
      button_text_fr: 'Découvrir',
      button_text_en: 'Discover',
      action: 'tab:catalog'
    }
  ]
};

function normalizeHomeContent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const normalizedSlides = slides
    .filter(slide => slide && typeof slide === 'object' && typeof slide.key === 'string' && slide.key.trim())
    .map(slide => ({
      key: slide.key.trim(),
      description_en: typeof slide.description_en === 'string' ? slide.description_en : '',
      description_fr: typeof slide.description_fr === 'string' ? slide.description_fr : '',
      image: typeof slide.image === 'string' ? slide.image.trim() : '',
      button: slide.button === true,
      button_text_fr: typeof slide.button_text_fr === 'string' ? slide.button_text_fr : '',
      button_text_en: typeof slide.button_text_en === 'string' ? slide.button_text_en : '',
      action: typeof slide.action === 'string' ? slide.action.trim() : ''
    }));

  if (!normalizedSlides.length) return null;
  return {
    slogan_fr: typeof raw.slogan_fr === 'string' ? raw.slogan_fr : DEFAULT_HOME_CONTENT.slogan_fr,
    slogan_en: typeof raw.slogan_en === 'string' ? raw.slogan_en : DEFAULT_HOME_CONTENT.slogan_en,
    slides: normalizedSlides
  };
}

function readCachedHomeContent() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CONTENT_CACHE_KEY) || 'null');
    return normalizeHomeContent(cached);
  } catch (error) {
    return null;
  }
}

let homeContent = readCachedHomeContent() || DEFAULT_HOME_CONTENT;
let homeSlideIndex = 0;
let homeCarouselTimer = null;

function localizedHomeValue(source, field) {
  const preferred = source?.[`${field}_${currentLang}`];
  if (typeof preferred === 'string' && preferred) return preferred;
  const english = source?.[`${field}_en`];
  if (typeof english === 'string' && english) return english;
  const french = source?.[`${field}_fr`];
  return typeof french === 'string' ? french : '';
}

function resolveHomeImage(image) {
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  return `${LAUNCHER_CONTENT_BASE_URL}${image.replace(/^\/+/, '')}`;
}

async function refreshRemoteHomeContent() {
  try {
    const remote = normalizeHomeContent(await invoke('get_launcher_home_content'));
    if (!remote) throw new Error('Remote Home content has no valid slides.');
    homeContent = remote;
    try { localStorage.setItem(HOME_CONTENT_CACHE_KEY, JSON.stringify(remote)); } catch (error) {}
    if (document.querySelector('.tabs button.active')?.dataset.nav === 'home') renderHome();
  } catch (error) {
    console.warn('[home content] using cached/fallback content:', error);
  }
}

function stopHomeCarousel() {
  if (homeCarouselTimer) clearInterval(homeCarouselTimer);
  homeCarouselTimer = null;
}

function startHomeCarousel() {
  stopHomeCarousel();
  if (homeContent.slides.length <= 1) return;
  homeCarouselTimer = setInterval(() => {
    const next = (homeSlideIndex + 1) % homeContent.slides.length;
    applyHomeSlide(next);
  }, HOME_SLIDE_INTERVAL_MS);
}

/* ===================================================================
   Remote launcher news / changelog content
   `launcher-content/news.json` on GitHub main is the source of truth.
   One feed powers Home Latest News, Changelog and the News tab.
   Priority: remote JSON -> last successful cache -> built-in fallback.
=================================================================== */
const NEWS_CONTENT_CACHE_KEY = 'nv_launcher_news_content_v1';
const DEFAULT_NEWS_CONTENT = {
  entries: [
    {
      title: 'NastyVerse Launcher 0.1.5',
      category: 'Update',
      image: 'news/launcher-015.webp',
      date: '2026-09-26',
      summary_fr: 'Le launcher centralise désormais ses actualités et son changelog dans un fichier JSON externe.',
      summary_en: 'The launcher now manages its news and changelog from a single external JSON file.',
      description_fr: 'Le panneau Dernières actualités, le Changelog et le nouvel onglet Actualités utilisent la même source distante.',
      description_en: 'Latest News, Changelog, and the News tab use the same remote source.'
    }
  ]
};

function normalizeNewsContent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .filter(entry => entry && typeof entry === 'object' && typeof entry.title === 'string' && entry.title.trim())
    .map(entry => ({
      title: entry.title.trim(),
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : 'News',
      image: typeof entry.image === 'string' ? entry.image.trim() : '',
      date: typeof entry.date === 'string' ? entry.date.trim() : '',
      summary_fr: typeof entry.summary_fr === 'string' ? entry.summary_fr : '',
      summary_en: typeof entry.summary_en === 'string' ? entry.summary_en : '',
      description_fr: typeof entry.description_fr === 'string' ? entry.description_fr : '',
      description_en: typeof entry.description_en === 'string' ? entry.description_en : ''
    }));
  return entries.length ? { entries } : null;
}

function readCachedNewsContent() {
  try {
    return normalizeNewsContent(JSON.parse(localStorage.getItem(NEWS_CONTENT_CACHE_KEY) || 'null'));
  } catch (error) {
    return null;
  }
}

let newsContent = readCachedNewsContent() || DEFAULT_NEWS_CONTENT;

function localizedNewsValue(entry, field) {
  const preferred = entry?.[`${field}_${currentLang}`];
  if (typeof preferred === 'string' && preferred) return preferred;
  const english = entry?.[`${field}_en`];
  if (typeof english === 'string' && english) return english;
  const french = entry?.[`${field}_fr`];
  return typeof french === 'string' ? french : '';
}

function parseNewsDate(value) {
  if (!value) return 0;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortedNewsEntries() {
  return [...newsContent.entries].sort((a, b) => parseNewsDate(b.date) - parseNewsDate(a.date));
}

function isUpdateEntry(entry) {
  return String(entry?.category || '').trim().toLowerCase() === 'update';
}

function formatNewsDate(value) {
  const timestamp = parseNewsDate(value);
  if (!timestamp) return value || '';
  return new Intl.DateTimeFormat(currentLang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
  }).format(new Date(timestamp));
}

function resolveLauncherContentImage(image) {
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  return `${LAUNCHER_CONTENT_BASE_URL}${image.replace(/^\/+/, '')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function newsThumb(entry) {
  const image = resolveLauncherContentImage(entry.image);
  if (image) return `<div class="thumb news-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy"></div>`;
  return `<div class="thumb">${escapeHtml(entry.title.slice(0, 1).toUpperCase())}</div>`;
}

function categoryClass(category) {
  return String(category || 'news').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'news';
}

async function refreshRemoteNewsContent() {
  try {
    const remote = normalizeNewsContent(await invoke('get_launcher_news_content'));
    if (!remote) throw new Error('Remote news content has no valid entries.');
    newsContent = remote;
    try { localStorage.setItem(NEWS_CONTENT_CACHE_KEY, JSON.stringify(remote)); } catch (error) {}
    const active = document.querySelector('.tabs button.active')?.dataset.nav;
    if (active && ['home', 'news', 'changelog'].includes(active)) RENDERERS[active]();
  } catch (error) {
    console.warn('[news content] using cached/fallback content:', error);
  }
}

/* ===================================================================
   Launcher theme audio — bundled with the native launcher. The selected
   volume is launcher-only and persists independently from app settings.
=================================================================== */
const launcherTheme = document.getElementById('launcher-theme');
const DEFAULT_LAUNCHER_VOLUME = 40;
let launcherVolume = DEFAULT_LAUNCHER_VOLUME;
try {
  const savedVolume = Number(localStorage.getItem('nv_launcher_volume'));
  if (Number.isFinite(savedVolume)) launcherVolume = Math.min(100, Math.max(0, savedVolume));
} catch (e) {}

function applyLauncherVolume(value, persist = true) {
  launcherVolume = Math.min(100, Math.max(0, Number(value) || 0));
  launcherTheme.volume = launcherVolume / 100;
  if (persist) {
    try { localStorage.setItem('nv_launcher_volume', String(launcherVolume)); } catch (e) {}
  }
}

async function startLauncherMusic() {
  applyLauncherVolume(launcherVolume, false);
  try {
    await launcherTheme.play();
  } catch (error) {
    // WebView autoplay policies can vary by platform. If automatic playback is
    // refused, start on the first user interaction without showing extra UI.
    const resume = () => {
      launcherTheme.play().catch(() => {});
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  }
}

function pauseLauncherMusic() {
  launcherTheme.pause();
}

/* ===================================================================
   Nav — same NAV_ITEMS/goTo convention as app/src/app.js, for consistency
   across the two frontends. Add a tab here, add a renderer below.
=================================================================== */
const NAV_ITEMS = [
  { id: 'home', label: () => t('nav.home', currentLang), icon: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>' },
  { id: 'news', label: () => t('nav.news', currentLang), icon: '<path d="M4 5h16v14H4z"/><path d="M7 8h6M7 11h10M7 14h10M15 8h2"/>' },
  { id: 'catalog', label: () => t('nav.catalog', currentLang), icon: '<path d="M4 6h16M4 12h16M4 18h10"/>' },
  { id: 'changelog', label: () => t('nav.changelog', currentLang), icon: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6z"/><path d="M13 3v6h6"/>' },
  { id: 'options', label: () => t('nav.options', currentLang), icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.36.68.65.94"/>' },
];

const navbar = document.getElementById('navbar');
const pageRoot = document.getElementById('page-root');

function renderNav() {
  navbar.innerHTML = NAV_ITEMS.map(item => `
    <button data-nav="${item.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${item.icon}</svg>
      ${item.label()}
    </button>`).join('');
  navbar.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => goTo(btn.dataset.nav)));
}

function goTo(id) {
  const target = RENDERERS[id] ? id : 'home';
  if (target !== 'home') stopHomeCarousel();
  navbar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.nav === target));
  pageRoot.classList.toggle('is-home', target === 'home');
  RENDERERS[target]();
}

/* ===================================================================
   Content data — placeholder/demo values, matching the earlier
   HTML-only prototype. Replace with real data sources later
   (see knowledge/14-roadmap.md, priority 6, in the agent briefing).
=================================================================== */
const CATALOG_HOME = [
  { tag: "character", title: "Jade, Your New Roommate", desc: "A complice slice-of-life with conversations that evolve.", init: "J" },
  { tag: "character", title: "Astra, Night Operative", desc: "A calm, sharp cyberpunk guide for late-night talks.", init: "A" },
  { tag: "lorebook", title: "Neon District Archives", desc: "Notes on a high-tech world, its factions and secrets.", init: "N" },
  { tag: "persona", title: "Midnight Creator", desc: "A refined persona for stylish creative roleplay.", init: "M" },
];
const CATALOG_FULL = CATALOG_HOME.concat([
  { tag: "character", title: "Rook, Old Friend", desc: "Warm, dry humor, a decade of shared history.", init: "R" },
  { tag: "character", title: "Vex, Arena Champion", desc: "Competitive, sharp-tongued, loyal once earned.", init: "V" },
]);
function tagLabel(tag) { return { update: "Update", content: "Content", character: "Character", lorebook: "Lorebook", persona: "Persona" }[tag] || tag; }

/* ===================================================================
   Page renderers
=================================================================== */
function renderHome() {
  const slides = homeContent.slides;
  const latestEntries = sortedNewsEntries().slice(0, 4);
  homeSlideIndex = Math.min(homeSlideIndex, Math.max(0, slides.length - 1));
  pageRoot.innerHTML = `
    <div class="page home-page active">
      <div class="hero" id="home-hero">
        <div class="hero-eyebrow" id="home-slogan"></div>
        <h1>NASTYVERSE</h1>
        <p id="home-slide-description"></p>
        <button class="cta" id="home-slide-button" hidden></button>
        <div class="dots" id="home-slide-dots" aria-label="Home carousel">
          ${slides.map((slide, index) => `<button type="button" data-slide-index="${index}" data-slide-key="${slide.key.replace(/[^a-zA-Z0-9_-]/g, '')}" aria-label="Slide ${index + 1}"></button>`).join('')}
        </div>
      </div>
      <div class="grid2">
        <div>
          <div class="section-head"><h2>📋 ${t('home.news', currentLang)}</h2><a href="#" data-nav="news">${t('home.seeall', currentLang)}</a></div>
          <div>${latestEntries.map(entry => `
            <button class="list-item news-list-item" type="button" data-news-target="${isUpdateEntry(entry) ? 'changelog' : 'news'}">
              ${newsThumb(entry)}<div class="list-item-copy">
                <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag ${categoryClass(entry.category)}">${escapeHtml(entry.category)}</span></div>
                <div class="item-title">${escapeHtml(entry.title)}</div><div class="item-desc">${escapeHtml(localizedNewsValue(entry, 'summary'))}</div>
              </div>
            </button>`).join('')}</div>
        </div>
        <div>
          <div class="section-head"><h2>📖 ${t('home.catalog', currentLang)}</h2><a href="#" data-nav="catalog">${t('home.opencatalog', currentLang)}</a></div>
          <div>${CATALOG_HOME.map(c => `
            <div class="list-item"><div class="thumb">${c.init}</div><div>
              <div class="item-top"><span class="tag ${c.tag}">${tagLabel(c.tag)}</span></div>
              <div class="item-title">${c.title}</div><div class="item-desc">${c.desc}</div>
            </div></div>`).join('')}</div>
        </div>
      </div>
    </div>`;

  pageRoot.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault();
    goTo(el.dataset.nav);
  }));
  pageRoot.querySelectorAll('[data-news-target]').forEach(el => el.addEventListener('click', () => goTo(el.dataset.newsTarget)));
  pageRoot.querySelectorAll('[data-slide-index]').forEach(dot => dot.addEventListener('click', () => {
    applyHomeSlide(Number(dot.dataset.slideIndex));
    startHomeCarousel();
  }));
  applyHomeSlide(homeSlideIndex);
  startHomeCarousel();
}

function applyHomeSlide(index) {
  const slides = homeContent.slides;
  if (!slides.length) return;
  homeSlideIndex = ((Number(index) || 0) % slides.length + slides.length) % slides.length;
  const slide = slides[homeSlideIndex];
  const hero = document.getElementById('home-hero');
  const slogan = document.getElementById('home-slogan');
  const description = document.getElementById('home-slide-description');
  const button = document.getElementById('home-slide-button');
  if (!hero || !slogan || !description || !button) return;

  slogan.textContent = localizedHomeValue(homeContent, 'slogan');
  description.textContent = localizedHomeValue(slide, 'description');
  hero.dataset.slideKey = slide.key;

  const image = resolveHomeImage(slide.image);
  if (image) {
    const safeImage = image.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    hero.style.setProperty('--hero-image', `url("${safeImage}")`);
    hero.classList.add('has-image');
  } else {
    hero.style.removeProperty('--hero-image');
    hero.classList.remove('has-image');
  }

  button.hidden = !slide.button;
  if (slide.button) {
    button.textContent = localizedHomeValue(slide, 'button_text');
    button.onclick = () => executeHomeAction(slide.action);
  } else {
    button.textContent = '';
    button.onclick = null;
  }

  document.querySelectorAll('#home-slide-dots [data-slide-index]').forEach(dot => {
    const active = Number(dot.dataset.slideIndex) === homeSlideIndex;
    dot.classList.toggle('on', active);
    dot.setAttribute('aria-current', active ? 'true' : 'false');
  });
}

async function executeHomeAction(action) {
  if (!action) return;
  const value = String(action).trim();
  if (value.startsWith('tab:')) {
    goTo(value.slice(4));
    return;
  }
  if (RENDERERS[value]) {
    goTo(value);
    return;
  }
  const url = value.startsWith('url:') ? value.slice(4) : value;
  if (/^https?:\/\//i.test(url)) {
    try {
      await invoke('open_external_url', { url });
    } catch (error) {
      console.warn('[home carousel] unable to open URL', error);
    }
  }
}

function renderNews() {
  const entries = sortedNewsEntries().filter(entry => !isUpdateEntry(entry));
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="section-head"><h2>${t('news.title', currentLang)}</h2></div>
      <div class="remote-feed">
        ${entries.length ? entries.map(entry => `
          <article class="remote-entry">
            ${newsThumb(entry)}
            <div class="remote-entry-copy">
              <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag ${categoryClass(entry.category)}">${escapeHtml(entry.category)}</span></div>
              <h3>${escapeHtml(entry.title)}</h3>
              <p>${escapeHtml(localizedNewsValue(entry, 'description'))}</p>
            </div>
          </article>`).join('') : `<p class="remote-empty">${t('news.empty', currentLang)}</p>`}
      </div>
    </div>`;
}

function renderCatalog() {
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="section-head"><h2>${t('catalog.title', currentLang)}</h2></div>
      <div class="cat-grid">${CATALOG_FULL.map(c => `
        <div class="card"><div class="art"><span>${c.init}</span></div><div class="body">
          <span class="tag ${c.tag}">${tagLabel(c.tag)}</span><h3>${c.title}</h3><p>${c.desc}</p>
        </div></div>`).join('')}</div>
    </div>`;
}

function renderChangelog() {
  const entries = sortedNewsEntries().filter(isUpdateEntry);
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="section-head"><h2>${t('changelog.title', currentLang)}</h2></div>
      <div class="remote-feed update-feed">
        ${entries.length ? entries.map(entry => `
          <article class="remote-entry update-entry">
            ${newsThumb(entry)}
            <div class="remote-entry-copy">
              <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag update">${escapeHtml(entry.category)}</span></div>
              <h3>${escapeHtml(entry.title)}</h3>
              <p>${escapeHtml(localizedNewsValue(entry, 'description'))}</p>
            </div>
          </article>`).join('') : `<p class="remote-empty">${t('changelog.empty', currentLang)}</p>`}
      </div>
    </div>`;
}

function renderOptions() {
  pageRoot.innerHTML = `
    <div class="page active">
      <div class="section-head"><h2>${t('options.title', currentLang)}</h2></div>
      <div class="settings-grid">
        <div class="field-card">
          <div class="info"><h3>${t('options.lang.title', currentLang)}</h3><p>${t('options.lang.hint', currentLang)}</p></div>
          <div class="control"><select id="lang-select"><option value="en">English</option><option value="fr">Français (partial)</option></select></div>
        </div>
        <div class="field-card">
          <div class="info"><h3>${t('options.accent.title', currentLang)}</h3><p>${t('options.accent.hint', currentLang)}</p></div>
          <div class="control"><div class="swatch" style="background:var(--violet-2)"></div><input class="hexinput" value="#B24BFF"></div>
        </div>
        <div class="field-card">
          <div class="info"><h3>${t('options.music.title', currentLang)}</h3><p>${t('options.music.hint', currentLang)}</p></div>
          <div class="control volume-control">
            <input id="music-volume" class="volume-slider" type="range" min="0" max="100" step="1" value="${Math.round(launcherVolume)}" aria-label="${t('options.music.title', currentLang)}">
            <output id="music-volume-value" class="volume-value">${Math.round(launcherVolume)}%</output>
          </div>
        </div>
        <p class="note">${t('options.models.note', currentLang)}</p>
      </div>
    </div>`;
  const volumeSlider = document.getElementById('music-volume');
  const volumeValue = document.getElementById('music-volume-value');
  volumeSlider.addEventListener('input', event => {
    applyLauncherVolume(event.target.value);
    volumeValue.textContent = `${Math.round(launcherVolume)}%`;
    if (launcherTheme.paused) startLauncherMusic();
  });

  const sel = document.getElementById('lang-select');
  sel.value = currentLang;
  sel.addEventListener('change', e => {
    currentLang = e.target.value;
    try { localStorage.setItem('nv_lang', currentLang); } catch (e2) {}
    renderNav();
    goTo(document.querySelector('.tabs button.active')?.dataset.nav || 'options');
    if (launcherUpdateStatus?.available) renderLauncherUpdate(launcherUpdateStatus);
    else if (lastStatus) renderInstallStatus(lastStatus);
  });
}

const RENDERERS = { home: renderHome, news: renderNews, catalog: renderCatalog, changelog: renderChangelog, options: renderOptions };

/* ===================================================================
   Two-layer updater controller
   1) The portable host checks a signed raw launcher EXE from GitHub Releases first.
   2) GitHub main remains the source of truth for app/src runtime files;
      Rust compares Git blob SHAs and downloads only missing/changed files.
=================================================================== */
const actionButton = document.getElementById('primary-action');
const statusDot = document.getElementById('install-status-dot');
const statusTitle = document.getElementById('install-status-title');
const statusDetail = document.getElementById('install-status-detail');
const progressWrap = document.getElementById('install-progress');
const progressBar = document.getElementById('install-progress-bar');

let installState = 'checking';
let lastStatus = null;
let launcherUpdateStatus = null;
let actionBusy = false;

function humanBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function setStatusVisual(kind) {
  statusDot.className = `install-status-dot is-${kind}`;
}

function renderInstallStatus(status) {
  lastStatus = status;
  installState = status.state;
  actionButton.disabled = false;
  progressWrap.hidden = true;
  progressBar.style.width = '0%';

  if (status.state === 'install') {
    setStatusVisual('attention');
    statusTitle.textContent = t('install.install.title', currentLang);
    statusDetail.textContent = tf('install.install.detail', { files: status.files_to_download, size: humanBytes(status.bytes_to_download) });
    actionButton.textContent = t('install.install.button', currentLang);
    return;
  }

  if (status.state === 'update') {
    setStatusVisual('attention');
    statusTitle.textContent = t('install.update.title', currentLang);
    const removal = status.files_to_remove ? tf('install.update.removal', { files: status.files_to_remove }) : '';
    statusDetail.textContent = tf('install.update.detail', { files: status.files_to_download, size: humanBytes(status.bytes_to_download), removal });
    actionButton.textContent = t('install.update.button', currentLang);
    return;
  }

  setStatusVisual(status.offline ? 'offline' : 'ready');
  statusTitle.textContent = status.offline ? t('install.offline.title', currentLang) : t('install.ready.title', currentLang);
  statusDetail.textContent = status.offline ? status.message : t('install.ready.detail', currentLang);
  actionButton.textContent = t('install.launch', currentLang);
}

function renderCheckError(error) {
  installState = 'error';
  lastStatus = null;
  setStatusVisual('error');
  statusTitle.textContent = t('install.error.title', currentLang);
  statusDetail.textContent = String(error || t('install.error.detail', currentLang));
  actionButton.disabled = false;
  actionButton.textContent = t('install.retry', currentLang);
  progressWrap.hidden = true;
}

function renderLauncherUpdate(status) {
  launcherUpdateStatus = status;
  installState = 'launcher-update';
  lastStatus = null;
  setStatusVisual('attention');
  statusTitle.textContent = t('launcher.update.available.title', currentLang);
  statusDetail.textContent = tf('launcher.update.available.detail', {
    current: status.current_version,
    version: status.version || '?'
  });
  actionButton.disabled = false;
  actionButton.textContent = t('launcher.update.button', currentLang);
  progressWrap.hidden = true;
  progressBar.style.width = '0%';
}

async function verifyLauncherUpdate() {
  if (actionBusy) return false;
  installState = 'checking-launcher';
  setStatusVisual('checking');
  statusTitle.textContent = t('launcher.update.checking.title', currentLang);
  statusDetail.textContent = t('launcher.update.checking.detail', currentLang);
  actionButton.disabled = true;
  actionButton.textContent = t('install.checking.button', currentLang);
  progressWrap.hidden = true;

  try {
    const status = await invoke('check_launcher_update');
    launcherUpdateStatus = status;
    if (status?.available) {
      renderLauncherUpdate(status);
      return true;
    }
    if (status && !status.configured) {
      console.warn('[launcher updater]', status.message);
    }
    return false;
  } catch (error) {
    // A launcher-update check must not prevent an already installed app from
    // starting when GitHub is temporarily unavailable. The application file
    // verification below has its own offline integrity fallback.
    console.warn('[launcher updater] check failed', error);
    return false;
  }
}

async function installLauncherUpdate() {
  if (actionBusy) return;
  actionBusy = true;
  setStatusVisual('checking');
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  actionButton.disabled = true;
  actionButton.textContent = t('install.updating', currentLang);
  statusTitle.textContent = t('launcher.update.installing', currentLang);
  statusDetail.textContent = t('launcher.update.downloading.unknown', currentLang);

  try {
    await invoke('install_launcher_update');
    // The verified helper EXE closes this process, swaps the launcher file,
    // relaunches the managed copy, then cleans the temporary updater files.
    actionBusy = false;
    await verifyAll();
  } catch (error) {
    actionBusy = false;
    renderCheckError(error);
  }
}

async function verifyAll() {
  const launcherNeedsUpdate = await verifyLauncherUpdate();
  if (!launcherNeedsUpdate) {
    await verifyInstallation();
  }
}

async function verifyInstallation() {
  if (actionBusy) return;
  installState = 'checking';
  setStatusVisual('checking');
  statusTitle.textContent = t('install.checking.title', currentLang);
  statusDetail.textContent = t('install.checking.detail', currentLang);
  actionButton.disabled = true;
  actionButton.textContent = t('install.checking.button', currentLang);
  progressWrap.hidden = true;

  try {
    const status = await invoke('check_installation');
    renderInstallStatus(status);
  } catch (error) {
    renderCheckError(error);
  }
}

async function synchronizeInstallation() {
  if (actionBusy) return;
  actionBusy = true;
  setStatusVisual('checking');
  progressWrap.hidden = false;
  progressBar.style.width = '0%';
  actionButton.disabled = true;
  actionButton.textContent = installState === 'install' ? t('install.installing', currentLang) : t('install.updating', currentLang);
  statusTitle.textContent = installState === 'install' ? t('install.installing.title', currentLang) : t('install.updating.title', currentLang);
  statusDetail.textContent = t('install.preparing', currentLang);

  try {
    const status = await invoke('sync_installation');
    renderInstallStatus(status);
  } catch (error) {
    renderCheckError(error);
  } finally {
    actionBusy = false;
  }
}

async function launchInstalledApp() {
  if (actionBusy) return;
  actionBusy = true;
  actionButton.disabled = true;
  actionButton.textContent = t('install.launching', currentLang);
  const shouldResumeMusic = !launcherTheme.paused;
  pauseLauncherMusic();
  try {
    await invoke('launch_app');
  } catch (error) {
    if (shouldResumeMusic) startLauncherMusic();
    actionBusy = false;
    renderCheckError(error);
  }
}

actionButton.addEventListener('click', () => {
  if (installState === 'checking' || installState === 'checking-launcher') return;
  if (installState === 'error') {
    verifyAll();
    return;
  }
  if (installState === 'launcher-update') {
    installLauncherUpdate();
    return;
  }
  if (installState === 'install' || installState === 'update') {
    synchronizeInstallation();
    return;
  }
  launchInstalledApp();
});

listen('launcher-update-progress', event => {
  const payload = event.payload || {};
  progressWrap.hidden = false;

  if (payload.phase === 'installing') {
    progressBar.style.width = '100%';
    statusTitle.textContent = t('launcher.update.installing', currentLang);
    statusDetail.textContent = t('launcher.update.installing.detail', currentLang);
    return;
  }

  const total = Number(payload.total || 0);
  const downloaded = Number(payload.downloaded || 0);
  if (total > 0) {
    const percent = Math.min(100, Math.round((downloaded / total) * 100));
    progressBar.style.width = `${percent}%`;
    statusDetail.textContent = tf('launcher.update.downloading', { percent });
  } else {
    statusDetail.textContent = t('launcher.update.downloading.unknown', currentLang);
  }
});

listen('installation-progress', event => {
  const payload = event.payload || {};
  progressWrap.hidden = false;
  const total = Number(payload.bytes_total || 0);
  const done = Number(payload.bytes_done || 0);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (payload.phase === 'complete' ? 100 : 0);
  progressBar.style.width = `${percent}%`;

  if (payload.phase === 'downloading') {
    statusDetail.textContent = payload.path
      ? tf('install.downloading', { path: payload.path, percent })
      : tf('install.downloading.generic', { percent });
  } else if (payload.phase === 'applying') {
    statusDetail.textContent = t('install.applying', currentLang);
  } else if (payload.phase === 'complete') {
    statusDetail.textContent = t('install.complete', currentLang);
  }
});

/* ===================================================================
   Boot
=================================================================== */
renderNav();
goTo('home');
startLauncherMusic();
refreshRemoteHomeContent();
refreshRemoteNewsContent();
verifyAll();
