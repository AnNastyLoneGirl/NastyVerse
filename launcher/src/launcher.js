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
      if (cmd === 'get_launcher_locales') return ['en-en', 'fr-fr'];
      if (cmd === 'get_launcher_translation') return null;
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
   Remote i18n
   Translation files live in `launcher-content/i18n/*.json` on GitHub main.
   The launcher discovers locale files remotely, caches them, and falls back
   to English when a key is missing. Legacy `en`/`fr` preferences are migrated
   to `en-en`/`fr-fr` automatically.
=================================================================== */
const DEFAULT_LOCALE = 'en-en';
const I18N_CACHE_PREFIX = 'nv_launcher_i18n_v1:';
const LOCALES_CACHE_KEY = 'nv_launcher_locales_v1';
const BUILTIN_EN = {"_meta":{"locale":"en-en","name":"English"},"launcher":"Launcher","launch.cta":"Launch","nav.home":"Home","nav.news":"News","nav.catalog":"Catalog","nav.changelog":"Changelog","nav.options":"Options","home.news":"Latest news","home.seeall":"See all →","home.catalog":"Latest from the catalog","home.opencatalog":"Open catalog →","carousel.slide":"Slide {number}","launcher.update.checking.title":"Checking the launcher…","launcher.update.checking.detail":"Checking GitHub Releases for a newer signed portable launcher.","launcher.update.available.title":"Launcher update available","launcher.update.available.detail":"Launcher {current} → {version}. Update the launcher before checking the application files.","launcher.update.button":"Update launcher","launcher.update.downloading":"Downloading launcher update — {percent}%","launcher.update.downloading.unknown":"Downloading launcher update…","launcher.update.installing":"Applying launcher update…","launcher.update.installing.detail":"The launcher will replace itself in the background, then reopen automatically.","news.title":"News","news.empty":"No news available yet.","catalog.title":"Catalog","changelog.title":"Changelog","changelog.empty":"No updates available yet.","options.title":"Options","options.lang.title":"Language","options.lang.hint":"Translations are loaded from launcher-content/i18n. New language files are discovered automatically.","options.accent.title":"Accent color","options.accent.hint":"Used for primary actions and other important interface elements.","options.music.title":"Launcher music","options.music.hint":"Volume of the launcher theme. Set it to 0% to mute it.","options.models.note":"Connecting local backends (KoboldCpp, llama.cpp server, text-generation-webui, Ollama…) happens in the main app, under Configuration ▸ Models — not here.","install.checking.title":"Checking NastyVerse…","install.checking.detail":"Comparing local files with the current GitHub main branch.","install.checking.button":"Checking…","install.install.title":"NastyVerse is ready to install","install.install.detail":"{files} file(s) • {size} to download","install.install.button":"Install","install.update.title":"Update available","install.update.detail":"{files} changed file(s) • {size}{removal}","install.update.removal":" • {files} obsolete file(s) removed","install.update.button":"Update","install.ready.title":"NastyVerse is up to date","install.ready.detail":"All application files match the current GitHub main branch.","install.offline.title":"Installed — verification unavailable","install.error.title":"Verification failed","install.error.detail":"Unable to verify NastyVerse.","install.retry":"Retry","install.installing":"Installing…","install.updating":"Updating…","install.installing.title":"Installing NastyVerse…","install.updating.title":"Updating NastyVerse…","install.preparing":"Preparing the required files…","install.launch":"Launch →","install.launching":"Launching…","install.downloading":"Downloading {path} — {percent}%","install.downloading.generic":"Downloading files — {percent}%","install.applying":"Applying verified files…","install.complete":"Final integrity check complete.","category.update":"Update","category.news":"News","category.announcement":"Announcement","category.event":"Event","category.content":"Content","category.character":"Character","category.lorebook":"Lorebook","category.persona":"Persona","catalog.jade.title":"Jade, Your New Roommate","catalog.jade.description":"A complice slice-of-life with conversations that evolve.","catalog.astra.title":"Astra, Night Operative","catalog.astra.description":"A calm, sharp cyberpunk guide for late-night talks.","catalog.neon.title":"Neon District Archives","catalog.neon.description":"Notes on a high-tech world, its factions and secrets.","catalog.midnight.title":"Midnight Creator","catalog.midnight.description":"A refined persona for stylish creative roleplay.","catalog.rook.title":"Rook, Old Friend","catalog.rook.description":"Warm, dry humor, a decade of shared history.","catalog.vex.title":"Vex, Arena Champion","catalog.vex.description":"Competitive, sharp-tongued, loyal once earned.","slide":{"slogan":"Your universe. Your rules.","overview":{"description":"Welcome to NastyVerse. Create your universe, bring your characters to life, and build fully personalized chat experiences. Everything starts here.","button":""},"creator":{"description":"Build your universe. Create your characters, define your Persona, and expand their world with Lorebooks. Every element shapes the personality, context, and story of your conversations.","button":"Open catalog"},"models":{"description":"Choose the intelligence behind your universe. Connect NastyVerse to a locally hosted model through KoboldCpp, llama.cpp, Ollama, or text-generation-webui, or use a remote service through a compatible API.","button":"Configure models"},"portal":{"description":"Your character is ready, their universe is defined, and your model is connected. All that remains is to open the portal: start the conversation and let your story unfold.","button":"Start"}},"news":{"launcher-017":{"title":"NastyVerse Launcher 0.1.7","summary":"Launcher content and translations now use external JSON files.","description":"Home, News, Changelog, and the launcher interface now share a translation system based on language files in launcher-content/i18n."},"welcome":{"title":"Welcome to NastyVerse","summary":"Discover how NastyVerse organizes your AI character universe.","description":"NastyVerse brings characters, Personas, Lorebooks, models, and conversations together in a dedicated desktop experience."}}};
const translations = { [DEFAULT_LOCALE]: BUILTIN_EN };
const translationMeta = { [DEFAULT_LOCALE]: BUILTIN_EN._meta || { locale: DEFAULT_LOCALE, name: 'English' } };
let availableLocales = ['en-en', 'fr-fr'];

function normalizeLocale(value) {
  const locale = String(value || '').trim().toLowerCase().replaceAll('_', '-');
  if (locale === 'en') return 'en-en';
  if (locale === 'fr') return 'fr-fr';
  return /^[a-z0-9-]+$/.test(locale) ? locale : DEFAULT_LOCALE;
}

let currentLang = DEFAULT_LOCALE;
try { currentLang = normalizeLocale(localStorage.getItem('nv_lang') || DEFAULT_LOCALE); } catch (error) {}

function cloneTranslationTree(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const cloned = {};
  Object.entries(value).forEach(([key, child]) => {
    const normalized = cloneTranslationTree(child);
    if (normalized !== undefined) cloned[key] = normalized;
  });
  return cloned;
}

function normalizeTranslation(raw, locale) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (key === '_meta') return;
    const cloned = cloneTranslationTree(value);
    if (cloned !== undefined) normalized[key] = cloned;
  });
  const meta = raw._meta && typeof raw._meta === 'object' ? raw._meta : {};
  normalized._meta = {
    locale: normalizeLocale(meta.locale || locale),
    name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : normalizeLocale(locale)
  };
  return normalized;
}

function translationValue(dict, key) {
  if (!dict || typeof dict !== 'object') return null;
  if (typeof dict[key] === 'string') return dict[key];
  let value = dict;
  for (const part of String(key).split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return null;
    value = value[part];
  }
  return typeof value === 'string' ? value : null;
}

function readCachedTranslation(locale) {
  try {
    return normalizeTranslation(JSON.parse(localStorage.getItem(`${I18N_CACHE_PREFIX}${locale}`) || 'null'), locale);
  } catch (error) {
    return null;
  }
}

function cacheTranslation(locale, dict) {
  try { localStorage.setItem(`${I18N_CACHE_PREFIX}${locale}`, JSON.stringify(dict)); } catch (error) {}
}

function installTranslation(locale, raw, persist = true) {
  const normalized = normalizeTranslation(raw, locale);
  if (!normalized) return null;
  const key = normalizeLocale(locale);
  translations[key] = normalized;
  translationMeta[key] = normalized._meta;
  if (persist) cacheTranslation(key, normalized);
  return normalized;
}

function t(key, lang = currentLang) {
  const locale = normalizeLocale(lang);
  const preferred = translationValue(translations[locale], key);
  if (preferred) return preferred;
  const english = translationValue(translations[DEFAULT_LOCALE], key);
  if (english) return english;
  const builtin = translationValue(BUILTIN_EN, key);
  return builtin || key;
}

function tf(key, vars = {}) {
  return Object.entries(vars).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    t(key, currentLang)
  );
}

function contentText(value) {
  if (typeof value !== 'string' || !value) return '';
  return t(value, currentLang);
}

function localeDisplayName(locale) {
  return translationMeta[locale]?.name || locale;
}

function readCachedLocales() {
  try {
    const cached = JSON.parse(localStorage.getItem(LOCALES_CACHE_KEY) || 'null');
    if (!Array.isArray(cached)) return null;
    const locales = cached.map(normalizeLocale).filter(Boolean);
    return [...new Set(locales)];
  } catch (error) {
    return null;
  }
}

async function loadTranslation(locale, forceRemote = false) {
  const key = normalizeLocale(locale);
  if (!forceRemote && translations[key]) return translations[key];
  if (!forceRemote) {
    const cached = readCachedTranslation(key);
    if (cached) installTranslation(key, cached, false);
  }
  try {
    const remote = await invoke('get_launcher_translation', { locale: key });
    const installed = installTranslation(key, remote, true);
    if (installed) return installed;
  } catch (error) {
    console.warn(`[i18n] unable to refresh ${key}:`, error);
  }
  return translations[key] || (key === DEFAULT_LOCALE ? BUILTIN_EN : null);
}

async function refreshAvailableLocales() {
  try {
    const remote = await invoke('get_launcher_locales');
    if (Array.isArray(remote) && remote.length) {
      availableLocales = [...new Set(remote.map(normalizeLocale))].sort();
      if (!availableLocales.includes(DEFAULT_LOCALE)) availableLocales.unshift(DEFAULT_LOCALE);
      try { localStorage.setItem(LOCALES_CACHE_KEY, JSON.stringify(availableLocales)); } catch (error) {}
      return;
    }
  } catch (error) {
    console.warn('[i18n] locale discovery failed:', error);
  }
  availableLocales = readCachedLocales() || ['en-en', 'fr-fr'];
}

async function initializeI18n() {
  await refreshAvailableLocales();
  const cachedEnglish = readCachedTranslation(DEFAULT_LOCALE);
  if (cachedEnglish) installTranslation(DEFAULT_LOCALE, cachedEnglish, false);
  await loadTranslation(DEFAULT_LOCALE, true);
  if (!availableLocales.includes(currentLang)) currentLang = DEFAULT_LOCALE;
  if (currentLang !== DEFAULT_LOCALE) await loadTranslation(currentLang);
  try { localStorage.setItem('nv_lang', currentLang); } catch (error) {}
}

async function hydrateLocaleNames(select) {
  await Promise.all(availableLocales.map(locale => loadTranslation(locale)));
  if (!select?.isConnected) return;
  [...select.options].forEach(option => { option.textContent = localeDisplayName(option.value); });
}

/* ===================================================================
   Remote Home carousel content
   `launcher-content/home.json` defines structure only. Visible strings are
   inferred from slide.<key>.* in the current locale dictionary.
=================================================================== */
const HOME_CONTENT_CACHE_KEY = 'nv_launcher_home_content_v3';
const LAUNCHER_CONTENT_BASE_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyVerse/main/launcher-content/';
const HOME_SLIDE_INTERVAL_MS = 8000;
const DEFAULT_HOME_CONTENT = {
  slides: [
    { key: 'overview', image: '', button: false, action: '' }
  ]
};

function normalizeHomeContent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const normalizedSlides = slides
    .filter(slide => slide && typeof slide === 'object' && typeof slide.key === 'string' && slide.key.trim())
    .map(slide => ({
      key: slide.key.trim(),
      image: typeof slide.image === 'string' ? slide.image.trim() : '',
      button: slide.button === true || (slide.button && typeof slide.button === 'object'),
      action: typeof slide.action === 'string' ? slide.action.trim()
        : (slide.button && typeof slide.button === 'object' && typeof slide.button.action === 'string' ? slide.button.action.trim() : '')
    }));
  return normalizedSlides.length ? { slides: normalizedSlides } : null;
}

function readCachedHomeContent() {
  try { return normalizeHomeContent(JSON.parse(localStorage.getItem(HOME_CONTENT_CACHE_KEY) || 'null')); }
  catch (error) { return null; }
}

let homeContent = readCachedHomeContent() || DEFAULT_HOME_CONTENT;
let homeSlideIndex = 0;
let homeCarouselTimer = null;

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
    applyHomeSlide((homeSlideIndex + 1) % homeContent.slides.length);
  }, HOME_SLIDE_INTERVAL_MS);
}

/* ===================================================================
   Remote launcher news / changelog content
   `launcher-content/news.json` contains only structure. Visible strings are
   inferred from news.<key>.* in the current locale dictionary.
=================================================================== */
const NEWS_CONTENT_CACHE_KEY = 'nv_launcher_news_content_v3';
const DEFAULT_NEWS_CONTENT = {
  entries: [
    { key: 'launcher-017', category: 'Update', image: '', date: '2026-09-27' }
  ]
};

function normalizeNewsContent(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .filter(entry => entry && typeof entry === 'object' && typeof entry.key === 'string' && entry.key.trim())
    .map(entry => ({
      key: entry.key.trim(),
      category: typeof entry.category === 'string' && entry.category.trim() ? entry.category.trim() : 'News',
      image: typeof entry.image === 'string' ? entry.image.trim() : '',
      date: typeof entry.date === 'string' ? entry.date.trim() : ''
    }));
  return entries.length ? { entries } : null;
}

function newsText(entry, field) {
  return t(`news.${entry.key}.${field}`, currentLang);
}

function readCachedNewsContent() {
  try { return normalizeNewsContent(JSON.parse(localStorage.getItem(NEWS_CONTENT_CACHE_KEY) || 'null')); }
  catch (error) { return null; }
}

let newsContent = readCachedNewsContent() || DEFAULT_NEWS_CONTENT;

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

function browserLocale() {
  if (currentLang.startsWith('fr')) return 'fr-FR';
  if (currentLang.startsWith('en')) return 'en-US';
  return currentLang;
}

function formatNewsDate(value) {
  const timestamp = parseNewsDate(value);
  if (!timestamp) return value || '';
  try {
    return new Intl.DateTimeFormat(browserLocale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp));
  } catch (error) {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp));
  }
}

function resolveLauncherContentImage(image) {
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return image;
  return `${LAUNCHER_CONTENT_BASE_URL}${image.replace(/^\/+/, '')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function newsThumb(entry) {
  const image = resolveLauncherContentImage(entry.image);
  if (image) return `<div class="thumb news-thumb"><img src="${escapeHtml(image)}" alt="" loading="lazy"></div>`;
  const title = newsText(entry, 'title');
  return `<div class="thumb">${escapeHtml(title.slice(0, 1).toUpperCase())}</div>`;
}

function categoryClass(category) {
  return String(category || 'news').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'news';
}

function categoryLabel(category) {
  const raw = String(category || 'News').trim();
  const key = `category.${raw.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const translated = t(key, currentLang);
  return translated === key ? raw : translated;
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
  { tag: "character", title: "catalog.jade.title", desc: "catalog.jade.description", init: "J" },
  { tag: "character", title: "catalog.astra.title", desc: "catalog.astra.description", init: "A" },
  { tag: "lorebook", title: "catalog.neon.title", desc: "catalog.neon.description", init: "N" },
  { tag: "persona", title: "catalog.midnight.title", desc: "catalog.midnight.description", init: "M" },
];
const CATALOG_FULL = CATALOG_HOME.concat([
  { tag: "character", title: "catalog.rook.title", desc: "catalog.rook.description", init: "R" },
  { tag: "character", title: "catalog.vex.title", desc: "catalog.vex.description", init: "V" },
]);
function tagLabel(tag) {
  const key = `category.${tag}`;
  const translated = t(key, currentLang);
  return translated === key ? tag : translated;
}

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
          ${slides.map((slide, index) => `<button type="button" data-slide-index="${index}" data-slide-key="${slide.key.replace(/[^a-zA-Z0-9_-]/g, '')}" aria-label="${escapeHtml(tf('carousel.slide', { number: index + 1 }))}"></button>`).join('')}
        </div>
      </div>
      <div class="grid2">
        <div>
          <div class="section-head"><h2>📋 ${t('home.news', currentLang)}</h2><a href="#" data-nav="news">${t('home.seeall', currentLang)}</a></div>
          <div>${latestEntries.map(entry => `
            <button class="list-item news-list-item" type="button" data-news-target="${isUpdateEntry(entry) ? 'changelog' : 'news'}">
              ${newsThumb(entry)}<div class="list-item-copy">
                <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag ${categoryClass(entry.category)}">${escapeHtml(categoryLabel(entry.category))}</span></div>
                <div class="item-title">${escapeHtml(newsText(entry, 'title'))}</div><div class="item-desc">${escapeHtml(newsText(entry, 'summary'))}</div>
              </div>
            </button>`).join('')}</div>
        </div>
        <div>
          <div class="section-head"><h2>📖 ${t('home.catalog', currentLang)}</h2><a href="#" data-nav="catalog">${t('home.opencatalog', currentLang)}</a></div>
          <div>${CATALOG_HOME.map(c => `
            <div class="list-item"><div class="thumb">${c.init}</div><div>
              <div class="item-top"><span class="tag ${c.tag}">${tagLabel(c.tag)}</span></div>
              <div class="item-title">${escapeHtml(contentText(c.title))}</div><div class="item-desc">${escapeHtml(contentText(c.desc))}</div>
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

  slogan.textContent = t('slide.slogan', currentLang);
  description.textContent = t(`slide.${slide.key}.description`, currentLang);
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
    button.textContent = t(`slide.${slide.key}.button`, currentLang);
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
              <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag ${categoryClass(entry.category)}">${escapeHtml(categoryLabel(entry.category))}</span></div>
              <h3>${escapeHtml(newsText(entry, 'title'))}</h3>
              <p>${escapeHtml(newsText(entry, 'description'))}</p>
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
          <span class="tag ${c.tag}">${escapeHtml(tagLabel(c.tag))}</span><h3>${escapeHtml(contentText(c.title))}</h3><p>${escapeHtml(contentText(c.desc))}</p>
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
              <div class="item-top"><span class="date">${escapeHtml(formatNewsDate(entry.date))}</span><span class="tag update">${escapeHtml(categoryLabel(entry.category))}</span></div>
              <h3>${escapeHtml(newsText(entry, 'title'))}</h3>
              <p>${escapeHtml(newsText(entry, 'description'))}</p>
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
          <div class="control"><select id="lang-select">${availableLocales.map(locale => `<option value="${escapeHtml(locale)}">${escapeHtml(localeDisplayName(locale))}</option>`).join('')}</select></div>
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
  hydrateLocaleNames(sel);
  sel.addEventListener('change', async e => {
    const requested = normalizeLocale(e.target.value);
    await loadTranslation(requested);
    currentLang = translations[requested] ? requested : DEFAULT_LOCALE;
    try { localStorage.setItem('nv_lang', currentLang); } catch (error) {}
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
async function boot() {
  startLauncherMusic();
  await initializeI18n();
  renderNav();
  goTo('home');
  refreshRemoteHomeContent();
  refreshRemoteNewsContent();
  verifyAll();
}

boot();
