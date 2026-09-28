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
      if (cmd === 'test_backend_connection') return { ok: true, message: t('preview.connection'), models: ['preview-model'], modelName: 'preview-model', modelDetails: [{ id: 'preview-model', name: 'Preview model', contextLength: 32768, priceLabel: null, subscriptionIncluded: true, subscriptionInputMultiplier: 2, vision: true, reasoning: true, tools: true }] };
      if (cmd === 'analyze_backend_model') return { provider: 'koboldcpp', modelId: 'preview-model', modelName: 'Preview model', architecture: 'llama', contextLength: 32768, priceLabel: null, subscriptionIncluded: true, subscriptionInputMultiplier: 2, vision: true, reasoning: true, tools: true, modelPath: '/models/preview-model.gguf', chatTemplate: "{% for message in messages %}<|im_start|>{{ message['role'] }}\n{{ message['content'] }}<|im_end|>{% endfor %}", chatTemplateHash: 'preview', detectedTemplate: 'ChatML', contextPreset: 'ChatML', instructionPreset: 'ChatML', confidence: 'high', source: 'chat-template-pattern', notes: [] };
      if (cmd === 'load_translation_config') return { enabled: false, provider: 'google', targetLanguage: 'en', mode: 'both', apiKey: null, url: null, deeplEndpoint: 'free' };
      if (cmd === 'save_translation_config') return args?.config || null;
      if (cmd === 'translate_text') return args?.text || '';
      if (cmd === 'save_backend_config') return args?.config || null;
      if (cmd === 'chat_completion') return { content: t('preview.reply'), model: 'preview-model' };
      if (cmd === 'text_completion') return { content: t('preview.reply'), model: 'preview-model' };
      return null;
    };


function friendlyNativeError(error) {
  const message = String(error ?? '');
  if (/command\s+(load_translation_config|save_translation_config|translate_text)\s+not found/i.test(message)) {
    return t('general.chatTranslation.launcherUpdateRequired');
  }
  if (/command\s+(test_backend_connection|analyze_backend_model|load_backend_config|save_backend_config|get_model_status|chat_completion|text_completion)\s+not found/i.test(message)) {
    return t('models.launcherUpdateRequired');
  }
  return message;
}

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
  instructionPresets: 'nv_app_instruction_presets_v2',
  globalSystemPrompt: 'nv_app_global_system_prompt',
  globalPostHistory: 'nv_app_global_post_history',
  globalPromptTab: 'nv_app_global_prompt_tab',
  contextPresets: 'nv_app_context_presets_v1',
  promptPreviewCharacter: 'nv_app_prompt_preview_character',
  promptPreviewMode: 'nv_app_prompt_preview_mode',
  contextFormatting: 'nv_app_context_formatting_v1',
  markdownStyles: 'nv_app_markdown_styles_v1',
  dialogueQuotes: 'nv_app_dialogue_quotes_v1',
  messageAppearance: 'nv_app_message_appearance_v1',
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

let contextPresetFactory = { default: 'Default', presets: [] };
let instructionPresetFactory = { default: 'Alpaca', presets: [] };

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

async function loadContextPresetFactory() {
  try {
    const data = await fetchJsonResource('presets/context-presets.json');
    if (!Array.isArray(data?.presets) || !data.presets.length) throw new Error('Invalid context preset library');
    contextPresetFactory = {
      default: String(data.default || 'Default'),
      presets: data.presets
        .filter(preset => preset && typeof preset.name === 'string' && typeof preset.story_string === 'string')
        .map(preset => normalizeContextPresetRecord(preset, preset.name)),
    };
  } catch (error) {
    console.warn('[prompt] Falling back to the built-in Default context preset.', error);
    contextPresetFactory = {
      default: 'Default',
      presets: [normalizeContextPresetRecord({
        name: 'Default',
        story_string: DEFAULT_CONTEXT_TEMPLATE,
        example_separator: '***',
        chat_start: '***',
      }, 'Default')],
    };
  }
}

async function loadInstructionPresetFactory() {
  try {
    const data = await fetchJsonResource('presets/instruct-presets.json');
    if (!Array.isArray(data?.presets) || !data.presets.length) throw new Error('Invalid instruction preset library');
    instructionPresetFactory = {
      default: String(data.default || 'Alpaca'),
      presets: data.presets
        .filter(preset => preset && typeof preset.name === 'string')
        .map(preset => normalizeInstructionPresetRecord(preset, preset.name)),
    };
  } catch (error) {
    console.warn('[prompt] Falling back to the built-in Alpaca instruction preset.', error);
    instructionPresetFactory = {
      default: 'Alpaca',
      presets: [normalizeInstructionPresetRecord({
        name: 'Alpaca',
        input_sequence: '### Instruction:',
        output_sequence: '### Response:',
        system_sequence: '### Input:',
        wrap: true,
        macro: true,
        names_behavior: 'force',
        output_suffix: '\n\n',
        input_suffix: '\n\n',
        system_suffix: '\n\n',
        sequences_as_stop_strings: true,
        story_string_suffix: '\n\n',
      }, 'Alpaca')],
    };
  }
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
  if (configurationShortcut) {
    configurationShortcut.textContent = t('config.title');
    configurationShortcut.title = t('config.title');
    configurationShortcut.setAttribute('aria-label', t('config.title'));
  }
  if (personalizationShortcut) {
    personalizationShortcut.textContent = t('personalization.title');
    personalizationShortcut.title = t('personalization.title');
    personalizationShortcut.setAttribute('aria-label', t('personalization.title'));
  }
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
  { id: 'studio', labelKey: 'config.studio' },
];

const BACKENDS = [
  { id: 'anthropic', label: 'Anthropic (Claude)', url: 'https://api.anthropic.com/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'google', label: 'Google (Gemini)', url: 'https://generativelanguage.googleapis.com/v1beta', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'koboldcpp', label: 'KoboldCpp', url: 'http://localhost:5001', kind: 'local', apiKey: 'none', modelMode: 'reported' },
  { id: 'llamacpp', label: 'llama.cpp server', url: 'http://localhost:8080', kind: 'local', apiKey: 'none', modelMode: 'optional-select' },
  { id: 'textgenwebui', label: 'text-generation-webui', url: 'http://localhost:5000', kind: 'local', apiKey: 'optional', modelMode: 'free-reported' },
  { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434', kind: 'local', apiKey: 'optional', modelMode: 'required-select' },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'nanogpt', label: 'NanoGPT', url: 'https://nano-gpt.com/api/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'mistralapi', label: 'Mistral API', url: 'https://api.mistral.ai/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'together', label: 'Together AI', url: 'https://api.together.xyz/v1', kind: 'api', apiKey: 'required', modelMode: 'required-select' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', url: 'https://', kind: 'api', apiKey: 'optional', modelMode: 'free-select' },
];

function backendDefinition(backendType) {
  return BACKENDS.find(backend => backend.id === backendType) || BACKENDS.find(backend => backend.id === 'koboldcpp');
}

function defaultBackendApiMode(backendType) {
  return ['koboldcpp', 'llamacpp', 'textgenwebui'].includes(String(backendType || '').toLowerCase()) ? 'text' : 'chat';
}

function effectiveBackendApiMode(config = state.backendConfig) {
  if (['anthropic','google'].includes(config?.backendType)) return 'chat';
  const explicit = String(config?.apiMode || 'auto').toLowerCase();
  if (explicit === 'chat' || explicit === 'text') return explicit;
  return defaultBackendApiMode(config?.backendType || 'custom');
}

const DEFAULT_PARAMS = { temperature: 0.8, topP: 0.95, maxTokens: 512, contextTokens: 8192 };
const DEFAULT_UI = { scale: 100, compactMessages: false };
const DEFAULT_CONTEXT_TEMPLATE = `{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if loreBefore}}{{loreBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if loreAfter}}{{loreAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`;

const DEFAULT_CONTEXT_PRESET_SETTINGS = {
  storyString: DEFAULT_CONTEXT_TEMPLATE,
  exampleSeparator: '',
  chatStart: '',
  useStopStrings: false,
  namesAsStopStrings: true,
  storyStringPosition: 0,
  storyStringDepth: 1,
  storyStringRole: 0,
  alwaysForceName2: true,
  trimSentences: false,
  singleLine: false,
};
const DEFAULT_CONTEXT_FORMATTING = {
  collapseNewlines: false,
  trimSpaces: true,
  exampleMessagesBehavior: 'normal',
};

function normalizeStoryStringAliases(value) {
  return String(value ?? DEFAULT_CONTEXT_TEMPLATE)
    .replaceAll('{{wiBefore}}', '{{loreBefore}}')
    .replaceAll('{{wiAfter}}', '{{loreAfter}}')
    .replaceAll('{{#if wiBefore}}', '{{#if loreBefore}}')
    .replaceAll('{{#if wiAfter}}', '{{#if loreAfter}}');
}

// Keep the stored/rendered Story String compatible with SillyTavern while showing
// each Handlebars conditional on one editor line. Newlines emitted inside an
// {{#if}} block are represented as \n in the textarea and restored before render/save.
function encodeContextEditorBlock(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t');
}

function decodeContextEditorBlock(value) {
  const sentinel = '\uE000';
  return String(value || '')
    .replaceAll('\\\\', sentinel)
    .replaceAll('\\r', '\r')
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '\t')
    .replaceAll(sentinel, '\\');
}

function contextTemplateToEditor(value) {
  const source = normalizeStoryStringAliases(value).replaceAll('\r\n', '\n');
  const compact = source.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
    return `{{#if ${key}}}${encodeContextEditorBlock(block)}{{/if}}`;
  });
  return compact.replace(/\{\{\/if\}\}(?=\{\{#if\b|\{\{trim\}\}|$)/g, '{{/if}}\n').replace(/\n$/, '');
}

function contextTemplateFromEditor(value) {
  let source = String(value || '').replaceAll('\r\n', '\n');
  // Remove only the visual line break that separates two compact conditional rows.
  source = source.replace(/\{\{\/if\}\}\n(?=\{\{#if\b|\{\{trim\}\}|$)/g, '{{/if}}');
  source = source.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
    return `{{#if ${key}}}${decodeContextEditorBlock(block)}{{/if}}`;
  });
  return normalizeStoryStringAliases(source);
}

function normalizeContextPresetRecord(preset = {}, fallbackName = 'Default') {
  const get = (camel, snake, fallback) => preset[camel] ?? preset[snake] ?? fallback;
  return {
    name: String(preset.name || fallbackName),
    storyString: normalizeStoryStringAliases(get('storyString', 'story_string', DEFAULT_CONTEXT_TEMPLATE)),
    exampleSeparator: String(get('exampleSeparator', 'example_separator', '')),
    chatStart: String(get('chatStart', 'chat_start', '')),
    useStopStrings: Boolean(get('useStopStrings', 'use_stop_strings', false)),
    namesAsStopStrings: Boolean(get('namesAsStopStrings', 'names_as_stop_strings', true)),
    storyStringPosition: Number(get('storyStringPosition', 'story_string_position', 0)) === 1 ? 1 : 0,
    storyStringDepth: Math.max(0, Number(get('storyStringDepth', 'story_string_depth', 1)) || 0),
    storyStringRole: Math.max(0, Math.min(2, Number(get('storyStringRole', 'story_string_role', 0)) || 0)),
    alwaysForceName2: Boolean(get('alwaysForceName2', 'always_force_name2', true)),
    trimSentences: Boolean(get('trimSentences', 'trim_sentences', false)),
    singleLine: Boolean(get('singleLine', 'single_line', false)),
  };
}

function normalizeContextPresetOverride(value) {
  if (typeof value === 'string') return { storyString: normalizeStoryStringAliases(value) };
  if (!value || typeof value !== 'object') return {};
  const aliases = {
    story_string: 'storyString',
    example_separator: 'exampleSeparator',
    chat_start: 'chatStart',
    use_stop_strings: 'useStopStrings',
    names_as_stop_strings: 'namesAsStopStrings',
    story_string_position: 'storyStringPosition',
    story_string_depth: 'storyStringDepth',
    story_string_role: 'storyStringRole',
    always_force_name2: 'alwaysForceName2',
    trim_sentences: 'trimSentences',
    single_line: 'singleLine',
  };
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const target = aliases[key] || key;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONTEXT_PRESET_SETTINGS, target)) continue;
    if (target === 'storyString') result[target] = normalizeStoryStringAliases(raw);
    else if (['useStopStrings', 'namesAsStopStrings', 'alwaysForceName2', 'trimSentences', 'singleLine'].includes(target)) result[target] = Boolean(raw);
    else if (target === 'storyStringDepth') result[target] = Math.max(0, Number(raw) || 0);
    else if (target === 'storyStringPosition') result[target] = Number(raw) === 1 ? 1 : 0;
    else if (target === 'storyStringRole') result[target] = Math.max(0, Math.min(2, Number(raw) || 0));
    else result[target] = String(raw ?? '');
  }
  return result;
}

function normalizeInstructionPresetRecord(preset = {}, fallbackName = 'Alpaca') {
  const get = (camel, snake, fallback) => preset[camel] ?? preset[snake] ?? fallback;
  const names = String(get('namesBehavior', 'names_behavior', 'force')).toLowerCase();
  return {
    name: String(preset.name || fallbackName),
    inputSequence: String(get('inputSequence', 'input_sequence', '')),
    outputSequence: String(get('outputSequence', 'output_sequence', '')),
    lastOutputSequence: String(get('lastOutputSequence', 'last_output_sequence', '')),
    systemSequence: String(get('systemSequence', 'system_sequence', '')),
    stopSequence: String(get('stopSequence', 'stop_sequence', '')),
    wrap: Boolean(get('wrap', 'wrap', false)),
    macro: Boolean(get('macro', 'macro', true)),
    namesBehavior: ['none', 'force', 'always'].includes(names) ? names : 'force',
    activationRegex: String(get('activationRegex', 'activation_regex', '')),
    firstOutputSequence: String(get('firstOutputSequence', 'first_output_sequence', '')),
    skipExamples: Boolean(get('skipExamples', 'skip_examples', false)),
    outputSuffix: String(get('outputSuffix', 'output_suffix', '')),
    inputSuffix: String(get('inputSuffix', 'input_suffix', '')),
    systemSuffix: String(get('systemSuffix', 'system_suffix', '')),
    userAlignmentMessage: String(get('userAlignmentMessage', 'user_alignment_message', '')),
    systemSameAsUser: Boolean(get('systemSameAsUser', 'system_same_as_user', false)),
    lastSystemSequence: String(get('lastSystemSequence', 'last_system_sequence', '')),
    firstInputSequence: String(get('firstInputSequence', 'first_input_sequence', '')),
    lastInputSequence: String(get('lastInputSequence', 'last_input_sequence', '')),
    sequencesAsStopStrings: Boolean(get('sequencesAsStopStrings', 'sequences_as_stop_strings', true)),
    storyStringPrefix: String(get('storyStringPrefix', 'story_string_prefix', '')),
    storyStringSuffix: String(get('storyStringSuffix', 'story_string_suffix', '')),
  };
}

function normalizeInstructionPresetOverride(value) {
  if (!value || typeof value !== 'object') return {};
  const aliases = {
    input_sequence: 'inputSequence', output_sequence: 'outputSequence', last_output_sequence: 'lastOutputSequence',
    system_sequence: 'systemSequence', stop_sequence: 'stopSequence', names_behavior: 'namesBehavior',
    activation_regex: 'activationRegex', first_output_sequence: 'firstOutputSequence', skip_examples: 'skipExamples',
    output_suffix: 'outputSuffix', input_suffix: 'inputSuffix', system_suffix: 'systemSuffix',
    user_alignment_message: 'userAlignmentMessage', system_same_as_user: 'systemSameAsUser',
    last_system_sequence: 'lastSystemSequence', first_input_sequence: 'firstInputSequence', last_input_sequence: 'lastInputSequence',
    sequences_as_stop_strings: 'sequencesAsStopStrings', story_string_prefix: 'storyStringPrefix', story_string_suffix: 'storyStringSuffix',
  };
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const target = aliases[key] || key;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_INSTRUCTION_PRESET_SETTINGS, target)) continue;
    if (['wrap', 'macro', 'skipExamples', 'systemSameAsUser', 'sequencesAsStopStrings'].includes(target)) result[target] = Boolean(raw);
    else if (target === 'namesBehavior') {
      const names = String(raw || 'force').toLowerCase();
      result[target] = ['none', 'force', 'always'].includes(names) ? names : 'force';
    } else result[target] = String(raw ?? '');
  }
  return result;
}

const LEGACY_CONTEXT_TEMPLATE_019 = `{{#if system}}{{system}}

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
const DEFAULT_INSTRUCTION_PRESET_SETTINGS = {
  inputSequence: '### Instruction:',
  outputSequence: '### Response:',
  lastOutputSequence: '',
  systemSequence: '### Input:',
  stopSequence: '',
  wrap: true,
  macro: true,
  namesBehavior: 'force',
  activationRegex: '',
  firstOutputSequence: '',
  skipExamples: false,
  outputSuffix: '\n\n',
  inputSuffix: '\n\n',
  systemSuffix: '\n\n',
  userAlignmentMessage: '',
  systemSameAsUser: false,
  lastSystemSequence: '',
  firstInputSequence: '',
  lastInputSequence: '',
  sequencesAsStopStrings: true,
  storyStringPrefix: '',
  storyStringSuffix: '\n\n',
};
const DEFAULT_INSTRUCTION_RUNTIME_SETTINGS = {
  enabled: false,
  bindToContext: false,
  deriveFromModel: false,
};
// Legacy shape retained only for one-time migration from app <= 0.1.23.
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
  backendConfig: null,
  backendDiscovery: null,
  modelAnalysis: null,
  translationConfig: null,
  markdownStyleType: 'paragraph',
  personalizationSection: 'text',
  messagePersonalizationScope: 'global',
};

const pageRoot = document.getElementById('page-root');
const configurationShortcut = document.getElementById('configuration-shortcut');
const personalizationShortcut = document.getElementById('personalization-shortcut');
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

function defaultContextPresetName() {
  return contextPresetFactory.presets.some(preset => preset.name === contextPresetFactory.default)
    ? contextPresetFactory.default
    : (contextPresetFactory.presets[0]?.name || 'Default');
}

function getContextPresetState() {
  const saved = readJson(STORAGE.contextPresets, null);
  if (saved && typeof saved === 'object' && Array.isArray(saved.custom) && saved.overrides && typeof saved.overrides === 'object') {
    const normalized = {
      active: String(saved.active || defaultContextPresetName()),
      custom: saved.custom
        .filter(preset => preset && typeof preset.name === 'string')
        .map(preset => normalizeContextPresetRecord(preset, preset.name)),
      overrides: Object.fromEntries(Object.entries(saved.overrides).map(([name, value]) => [name, normalizeContextPresetOverride(value)])),
    };
    const availableNames = new Set([
      ...contextPresetFactory.presets.map(preset => preset.name),
      ...normalized.custom.map(preset => preset.name),
    ]);
    if (!availableNames.has(normalized.active)) normalized.active = defaultContextPresetName();
    writeJson(STORAGE.contextPresets, normalized);
    return normalized;
  }

  const legacy = localStorage.getItem(STORAGE.contextTemplate);
  const state = { active: defaultContextPresetName(), custom: [], overrides: {} };
  if (legacy && legacy !== LEGACY_CONTEXT_TEMPLATE_015 && legacy !== LEGACY_CONTEXT_TEMPLATE_019 && legacy !== DEFAULT_CONTEXT_TEMPLATE) {
    state.overrides[state.active] = { storyString: normalizeStoryStringAliases(legacy) };
  }
  writeJson(STORAGE.contextPresets, state);
  localStorage.setItem(STORAGE.contextTemplate, resolveContextPresetTemplate(state.active, state));
  return state;
}

function saveContextPresetState(state) {
  writeJson(STORAGE.contextPresets, state);
}

function contextPresetFactoryEntry(name) {
  return contextPresetFactory.presets.find(preset => preset.name === name) || null;
}

function contextPresetCustomEntry(name, state = getContextPresetState()) {
  return state.custom.find(preset => preset.name === name) || null;
}

function resolveContextPreset(name, state = getContextPresetState()) {
  const custom = contextPresetCustomEntry(name, state);
  if (custom) return normalizeContextPresetRecord(custom, custom.name);
  const factory = contextPresetFactoryEntry(name);
  if (factory) return { ...factory, ...normalizeContextPresetOverride(state.overrides?.[name]), name: factory.name };
  const fallback = contextPresetFactoryEntry(defaultContextPresetName());
  return fallback ? { ...fallback } : normalizeContextPresetRecord({ name: 'Default', storyString: DEFAULT_CONTEXT_TEMPLATE }, 'Default');
}

function resolveContextPresetTemplate(name, state = getContextPresetState()) {
  return String(resolveContextPreset(name, state).storyString || DEFAULT_CONTEXT_TEMPLATE);
}

function allContextPresets(state = getContextPresetState()) {
  const builtIns = contextPresetFactory.presets.map(preset => ({
    ...resolveContextPreset(preset.name, state),
    builtIn: true,
    modified: Object.prototype.hasOwnProperty.call(state.overrides || {}, preset.name),
  }));
  const custom = state.custom.map(preset => ({ ...normalizeContextPresetRecord(preset, preset.name), builtIn: false, modified: true }));
  return [...builtIns, ...custom];
}

function setActiveContextPreset(name) {
  const state = getContextPresetState();
  const exists = allContextPresets(state).some(preset => preset.name === name);
  state.active = exists ? name : defaultContextPresetName();
  saveContextPresetState(state);
  const template = resolveContextPresetTemplate(state.active, state);
  localStorage.setItem(STORAGE.contextTemplate, template);
  syncInstructionPresetToContext(state.active);
  return resolveContextPreset(state.active, state);
}

function getActiveContextPreset() {
  const state = getContextPresetState();
  const preset = resolveContextPreset(state.active, state);
  localStorage.setItem(STORAGE.contextTemplate, preset.storyString);
  return preset;
}

function getContextTemplate() {
  return getActiveContextPreset().storyString;
}

function getContextFormatting() {
  return { ...DEFAULT_CONTEXT_FORMATTING, ...readJson(STORAGE.contextFormatting, {}) };
}

function saveContextFormatting(value) {
  writeJson(STORAGE.contextFormatting, { ...DEFAULT_CONTEXT_FORMATTING, ...value });
}

function defaultInstructionPresetName() {
  return instructionPresetFactory.presets.some(preset => preset.name === instructionPresetFactory.default)
    ? instructionPresetFactory.default
    : (instructionPresetFactory.presets[0]?.name || 'Alpaca');
}

function migrateLegacyInstructionTemplate(legacy) {
  if (!legacy || typeof legacy !== 'object') return null;
  const hasLegacyShape = ['wrapWithNewline', 'includeNames', 'storyPrefix', 'userPrefix', 'assistantPrefix'].some(key => Object.prototype.hasOwnProperty.call(legacy, key));
  if (!hasLegacyShape) return null;
  return normalizeInstructionPresetRecord({
    name: 'NastyVerse Legacy',
    wrap: legacy.wrapWithNewline ?? true,
    names_behavior: legacy.includeNames === 'always' ? 'always' : 'none',
    story_string_prefix: legacy.storyPrefix ?? '',
    story_string_suffix: legacy.storySuffix ?? '',
    input_sequence: legacy.userPrefix ?? '',
    input_suffix: legacy.userSuffix ?? '',
    output_sequence: legacy.assistantPrefix ?? '',
    output_suffix: legacy.assistantSuffix ?? '',
    system_sequence: legacy.systemPrefix ?? '',
    system_suffix: legacy.systemSuffix ?? '',
    stop_sequence: legacy.stopSequence ?? '',
    macro: true,
    sequences_as_stop_strings: true,
  }, 'NastyVerse Legacy');
}

function getInstructionPresetState() {
  const saved = readJson(STORAGE.instructionPresets, null);
  if (saved && typeof saved === 'object' && Array.isArray(saved.custom) && saved.overrides && typeof saved.overrides === 'object') {
    const normalized = {
      active: String(saved.active || defaultInstructionPresetName()),
      custom: saved.custom.filter(preset => preset && typeof preset.name === 'string').map(preset => normalizeInstructionPresetRecord(preset, preset.name)),
      overrides: Object.fromEntries(Object.entries(saved.overrides).map(([name, value]) => [name, normalizeInstructionPresetOverride(value)])),
      enabled: saved.enabled === undefined ? true : Boolean(saved.enabled),
      bindToContext: Boolean(saved.bindToContext),
      deriveFromModel: Boolean(saved.deriveFromModel),
    };
    const names = new Set([...instructionPresetFactory.presets.map(preset => preset.name), ...normalized.custom.map(preset => preset.name)]);
    if (!names.has(normalized.active)) normalized.active = defaultInstructionPresetName();
    writeJson(STORAGE.instructionPresets, normalized);
    return normalized;
  }

  const state = { active: defaultInstructionPresetName(), custom: [], overrides: {}, ...DEFAULT_INSTRUCTION_RUNTIME_SETTINGS };
  const legacy = migrateLegacyInstructionTemplate(readJson(STORAGE.instructionTemplate, null));
  if (legacy) {
    state.custom.push(legacy);
    state.active = legacy.name;
  }
  writeJson(STORAGE.instructionPresets, state);
  return state;
}

function saveInstructionPresetState(value) {
  writeJson(STORAGE.instructionPresets, value);
}

function instructionPresetFactoryEntry(name) {
  return instructionPresetFactory.presets.find(preset => preset.name === name) || null;
}

function instructionPresetCustomEntry(name, presetState = getInstructionPresetState()) {
  return presetState.custom.find(preset => preset.name === name) || null;
}

function resolveInstructionPreset(name, presetState = getInstructionPresetState()) {
  const custom = instructionPresetCustomEntry(name, presetState);
  if (custom) return normalizeInstructionPresetRecord(custom, custom.name);
  const factory = instructionPresetFactoryEntry(name);
  if (factory) return { ...factory, ...normalizeInstructionPresetOverride(presetState.overrides?.[name]), name: factory.name };
  const fallback = instructionPresetFactoryEntry(defaultInstructionPresetName());
  return fallback ? { ...fallback } : normalizeInstructionPresetRecord({ name: 'Alpaca', ...DEFAULT_INSTRUCTION_PRESET_SETTINGS }, 'Alpaca');
}

function allInstructionPresets(presetState = getInstructionPresetState()) {
  const builtIns = instructionPresetFactory.presets.map(preset => ({
    ...resolveInstructionPreset(preset.name, presetState),
    builtIn: true,
    modified: Object.prototype.hasOwnProperty.call(presetState.overrides || {}, preset.name),
  }));
  const custom = presetState.custom.map(preset => ({ ...normalizeInstructionPresetRecord(preset, preset.name), builtIn: false, modified: true }));
  return [...builtIns, ...custom];
}

function setActiveInstructionPreset(name) {
  const presetState = getInstructionPresetState();
  const exists = allInstructionPresets(presetState).some(preset => preset.name === name);
  presetState.active = exists ? name : defaultInstructionPresetName();
  saveInstructionPresetState(presetState);
  syncContextPresetToInstruction(presetState.active);
  return resolveInstructionPreset(presetState.active, presetState);
}

function syncInstructionPresetToContext(contextName = getContextPresetState().active) {
  const presetState = getInstructionPresetState();
  if (!presetState.bindToContext) return false;
  const match = allInstructionPresets(presetState).find(preset => preset.name === contextName);
  if (!match || presetState.active === match.name) return false;
  presetState.active = match.name;
  saveInstructionPresetState(presetState);
  return true;
}

function syncContextPresetToInstruction(instructionName = getInstructionPresetState().active) {
  const presetState = getInstructionPresetState();
  if (!presetState.bindToContext) return false;
  const contextState = getContextPresetState();
  const match = allContextPresets(contextState).find(preset => preset.name === instructionName);
  if (!match || contextState.active === match.name) return false;
  contextState.active = match.name;
  saveContextPresetState(contextState);
  localStorage.setItem(STORAGE.contextTemplate, resolveContextPresetTemplate(contextState.active, contextState));
  return true;
}

function instructionActivationRegex(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const literal = raw.match(/^\/(.*)\/([dgimsuvy]*)$/);
  if (literal) return new RegExp(literal[1], literal[2]);
  return new RegExp(raw, 'i');
}

function instructionPresetNameMatchForModel(modelName, presets) {
  const normalized = String(modelName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized) return null;
  const aliases = [
    ['llama 4', 'Llama 4 Instruct'], ['llama4', 'Llama 4 Instruct'],
    ['llama 3', 'Llama 3 Instruct'], ['llama3', 'Llama 3 Instruct'],
    ['gemma 4', 'Gemma 4'], ['gemma4', 'Gemma 4'], ['gemma 2', 'Gemma 2'], ['gemma2', 'Gemma 2'],
    ['deepseek v2 5', 'DeepSeek-V2.5'], ['command r', 'Command R'], ['chatml', 'ChatML'],
    ['mistral v7 tekken', 'Mistral V7-Tekken'], ['mistral v3 tekken', 'Mistral V3-Tekken'],
    ['mistral v7', 'Mistral V7'], ['mistral v3', 'Mistral V2 & V3'], ['mistral v2', 'Mistral V2 & V3'],
  ];
  for (const [needle, presetName] of aliases) {
    if (normalized.includes(needle) && presets.some(preset => preset.name === presetName)) return presetName;
  }
  return presets.find(preset => {
    const candidate = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return candidate.length >= 4 && normalized.includes(candidate);
  })?.name || null;
}

function autoSelectInstructionPresetForModel(modelName) {
  const name = String(modelName || '').trim();
  const presetState = getInstructionPresetState();
  if (!presetState.enabled) return false;
  const presets = allInstructionPresets(presetState);
  if (name) {
    for (const preset of presets) {
      const pattern = String(preset.activationRegex || '').trim();
      if (!pattern) continue;
      try {
        if (instructionActivationRegex(pattern)?.test(name)) {
          if (presetState.active !== preset.name) {
            setActiveInstructionPreset(preset.name);
            return true;
          }
          if (presetState.bindToContext) syncContextPresetToInstruction(preset.name);
          return false;
        }
      } catch (_) { /* Invalid custom regex is ignored, as in SillyTavern auto-select. */ }
    }
    if (presetState.deriveFromModel) {
      const derived = instructionPresetNameMatchForModel(name, presets);
      if (derived && derived !== presetState.active) {
        setActiveInstructionPreset(derived);
        return true;
      }
    }
  }
  return syncInstructionPresetToContext();
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
  const presetState = getInstructionPresetState();
  return {
    ...resolveInstructionPreset(presetState.active, presetState),
    enabled: presetState.enabled,
    bindToContext: presetState.bindToContext,
    deriveFromModel: presetState.deriveFromModel,
  };
}

function baseContextTemplateValues(character) {
  const studio = nvPromptData(character);
  const loreBefore = studio.before;
  const loreAfter = studio.after;
  return {
    anchorBefore: '',
    anchorAfter: '',
    description: character.description || '',
    scenario: nvContextSession(character)?.scenario || character.scenario || '',
    personality: character.personality || '',
    persona: studio.persona.description || '',
    char: character.name || '',
    user: studio.persona.name || 'User',
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
  return renderTemplateMacros(String(source || ''), values).trim();
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

function contextTemplateValues(character, overrides = {}) {
  const base = baseContextTemplateValues(character);
  const system = effectiveSystemPrompt(character);
  const preset = overrides.preset || getActiveContextPreset();
  const rawExamples = overrides.mesExamplesRaw !== undefined
    ? String(overrides.mesExamplesRaw || '')
    : String(character.exampleMessages || '');
  let formattedExamples;
  if (overrides.mesExamples !== undefined) {
    formattedExamples = String(overrides.mesExamples || '');
  } else {
    const separator = renderTemplateMacros(String(preset.exampleSeparator || ''), { ...base, system });
    formattedExamples = rawExamples;
    if (formattedExamples.trim()) {
      formattedExamples = formattedExamples.replace(/<START>/gi, separator);
      formattedExamples = renderTemplateMacros(formattedExamples, { ...base, system });
    }
  }
  const instruct = overrides.instruction || getInstructionTemplate();
  const instructEnabled = Boolean(instruct.enabled);
  const instructValue = value => instructEnabled ? String(value || '') : '';
  return {
    ...base,
    system,
    mesExamples: formattedExamples,
    mesExamplesRaw: rawExamples,
    instructStoryStringPrefix: instructValue(instruct.storyStringPrefix),
    instructStoryStringSuffix: instructValue(instruct.storyStringSuffix),
    instructInput: instructValue(instruct.inputSequence),
    instructUserPrefix: instructValue(instruct.inputSequence),
    instructUserSuffix: instructValue(instruct.inputSuffix),
    instructOutput: instructValue(instruct.outputSequence),
    instructAssistantPrefix: instructValue(instruct.outputSequence),
    instructSeparator: instructValue(instruct.outputSuffix),
    instructAssistantSuffix: instructValue(instruct.outputSuffix),
    instructSystemPrefix: instructValue(instruct.systemSequence),
    instructSystemSuffix: instructValue(instruct.systemSuffix),
    instructFirstOutput: instructValue(instruct.firstOutputSequence || instruct.outputSequence),
    instructFirstAssistantPrefix: instructValue(instruct.firstOutputSequence || instruct.outputSequence),
    instructLastOutput: instructValue(instruct.lastOutputSequence || instruct.outputSequence),
    instructLastAssistantPrefix: instructValue(instruct.lastOutputSequence || instruct.outputSequence),
    instructStop: instructValue(instruct.stopSequence),
    instructUserFiller: instructValue(instruct.userAlignmentMessage),
    instructSystemInstructionPrefix: instructValue(instruct.lastSystemSequence),
    instructFirstInput: instructValue(instruct.firstInputSequence || instruct.inputSequence),
    instructFirstUserPrefix: instructValue(instruct.firstInputSequence || instruct.inputSequence),
    instructLastInput: instructValue(instruct.lastInputSequence || instruct.inputSequence),
    instructLastUserPrefix: instructValue(instruct.lastInputSequence || instruct.inputSequence),
    systemPrompt: system,
    defaultSystemPrompt: getGlobalSystemPrompt(),
    instructSystem: getGlobalSystemPrompt(),
    instructSystemPrompt: getGlobalSystemPrompt(),
    chatSeparator: String(preset.exampleSeparator || ''),
    chatStart: String(preset.chatStart || ''),
  };
}

function renderTemplateMacros(template, values) {
  let output = String(template || '');
  for (let pass = 0; pass < 8; pass += 1) {
    const next = output.replace(/\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
      return String(values[key] || '').trim() ? block : '';
    });
    if (next === output) break;
    output = next;
  }
  // SillyTavern's {{trim}} removes the line break at the marker, not arbitrary spaces.
  output = output.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, '');
  output = output.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(values[key] ?? ''));
  return output.replaceAll('\r\n', '\n');
}

function renderContextTemplate(template, values, settings = getActiveContextPreset(), instruction = getInstructionTemplate()) {
  // SillyTavern renders the Story String first, strips only leading line breaks,
  // then conditionally supplies the trailing newline before Instruct wrapping.
  let output = renderTemplateMacros(template, values).replace(/^\n+/, '');
  const inChat = Number(settings.storyStringPosition) === 1;
  if (output && !output.endsWith('\n') && !inChat) {
    if (!instruction.enabled || (instruction.wrap && !instruction.storyStringSuffix)) output += '\n';
  }
  return output;
}

function effectiveContextTemplate(character) {
  const cardOverride = String(character.contextTemplate || '').trim();
  return cardOverride || getContextTemplate();
}

function renderCharacterContext(character, options = {}) {
  const settings = options.preset || getActiveContextPreset();
  const instruction = options.instruction || getInstructionTemplate();
  const values = contextTemplateValues(character, {
    ...options,
    preset: settings,
    instruction,
  });
  return renderContextTemplate(effectiveContextTemplate(character), values, settings, instruction);
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
  else if (id === 'personalization') renderPersonalization(opts.type || state.markdownStyleType || 'paragraph', opts.section || state.personalizationSection || 'text');
  else {
    NV.chatView = opts.view || 'library';
    renderChat();
  }
}

/* ===================================================================
   Window chrome
=================================================================== */

document.getElementById('btn-min').addEventListener('click', () => invoke('window_minimize'));
document.getElementById('btn-close').addEventListener('click', () => invoke('window_close'));
document.getElementById('btn-max').addEventListener('click', () => invoke('window_toggle_maximize'));

document.getElementById('model-status').addEventListener('click', () => goTo('configuration', { section: 'models' }));
configurationShortcut?.addEventListener('click', () => goTo('configuration', { section: 'general' }));
personalizationShortcut?.addEventListener('click', () => goTo('personalization')); 

/* ===================================================================
   Chat
=================================================================== */

function activeCharacter() {
  return getCharacters().find(character => character.id === state.activeCharacterId) || null;
}

function ensureConversation(character) {
  return nvEnsureSession(character)?.messages || [];
}

function estimateChatMessagesTokens(messages) {
  return messages.reduce((total, message) => total + (Array.isArray(message.content) ? message.content.reduce((n,p) => n + (p.type === 'image_url' ? 1536 : estimateTokens(p.text || '')),0) : estimateTokens(message.content)) + 4, 2);
}

function buildChatCompletionMessages(character, history = [], params = getGenerationParams()) {
  return nvBuildChat(character, history, params);
}

function renderChat() {
  const scrollState = typeof nvCaptureChatScroll === 'function' ? nvCaptureChatScroll() : null;
  state.currentPage = 'chat';
  renderNavbar();
  nvRenderChat(scrollState);
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
    characterBook: record.characterBook || record.character_book || null,
    extensions: record.extensions && typeof record.extensions === 'object' ? record.extensions : {},
    groupOnlyGreetings: record.groupOnlyGreetings || record.group_only_greetings || [],
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
  return NV.data.sessions.filter(s => s.targetId === id).reduce((total,s) => total + s.messages.filter(m => m.role === 'user').length,0);
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
  renderNavbar();
  const characters = getNormalizedCharacters();

  pageRoot.innerHTML = `
    <div class="page active library-page">
      <div class="library-commandbar">
        <div class="lib-tabs">
          <button class="lib-tab ${tab === 'characters' ? 'active' : ''}" data-tab="characters">${escapeHtml(t('library.characters'))} <span class="count">${characters.length}</span></button>
          <button class="lib-tab ${tab === 'lorebooks' ? 'active' : ''}" data-tab="lorebooks">${escapeHtml(t('library.lorebooks'))} <span class="count">${NV.data.books.length}</span></button>
          <button class="lib-tab ${tab === 'personas' ? 'active' : ''}" data-tab="personas">${escapeHtml(t('library.personas'))} <span class="count">${NV.data.personas.length}</span></button>
          <button class="lib-tab ${tab === 'groups' ? 'active' : ''}" data-tab="groups">${nvText('Groupes','Groups')} <span class="count">${NV.data.groups.length}</span></button>
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
    nvRenderLibrary(tab);
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
                <label class="form-field"><span>${escapeHtml(t('character.contextTemplate'))}</span><textarea id="character-context-template" name="contextTemplate" class="context-template-editor prompt-editor-compact" rows="10" spellcheck="false">${escapeHtml(contextTemplateToEditor(character.contextTemplate))}</textarea><small class="field-hint">${escapeHtml(t('character.contextTemplate.overrideHelp'))} ${escapeHtml(t('globalPrompt.context.compactSyntaxHint'))}</small></label>
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
      contextTemplate: contextTemplateFromEditor(String(data.get('contextTemplate') || '')),
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
      contextTemplate: contextTemplateFromEditor(String(data.get('contextTemplate') || '')).trim(),
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

  if (existing) {
    const start = document.createElement('button'); start.type = 'button'; start.className = 'btn btn-primary'; start.textContent = nvText('Discuter','Chat');
    start.onclick = () => { NV.groupId = ''; state.activeCharacterId = existing.id; localStorage.setItem(STORAGE.activeCharacter,existing.id); nvEnsureSession(existing); goTo('chat',{view:'conversation'}); };
    pageRoot.querySelector('.editor-actions-right')?.prepend(start);
  }
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
    characterBook: data.character_book ?? data.characterBook,
    extensions: data.extensions,
    groupOnlyGreetings: data.group_only_greetings,
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
      character_book: character.characterBook || undefined,
      extensions: {
        ...character.extensions,
        nastyverse: {
          ...character.extensions?.nastyverse,
          context_template: character.contextTemplate || ''
        }
      },
      group_only_greetings: character.groupOnlyGreetings || [],
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
  else if (section === 'studio') nvRenderTools();
  else renderUiConfig();
}

function renderGeneralConfig() {
  const body = document.getElementById('config-body');
  const accent = localStorage.getItem(STORAGE.accent) || '#B24BFF';
  const translation = { enabled: false, provider: 'google', targetLanguage: 'en', mode: 'both', ...(state.translationConfig || {}) };
  const translationLanguage = CHAT_TRANSLATION_LANGUAGES.find(language => language.value === translation.targetLanguage)?.label || String(translation.targetLanguage || '').toUpperCase();
  const translationProvider = CHAT_TRANSLATION_PROVIDERS.find(provider => provider.value === translation.provider)?.label || translation.provider;
  const translationSummary = translation.enabled
    ? t('general.chatTranslation.summaryEnabled', { provider: translationProvider, language: translationLanguage })
    : t('general.chatTranslation.summaryDisabled');
  body.innerHTML = `
    <div class="config-page-head"><div><h2>${escapeHtml(t('config.general'))}</h2><p>${escapeHtml(t('config.general.desc'))}</p></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.language'))}</h4><p>${escapeHtml(t('general.language.desc'))}</p></div><div class="control"><select id="app-language">${languageManifest.languages.map(language => `<option value="${escapeHtml(normalizeLocaleCode(language.code))}" ${state.locale === normalizeLocaleCode(language.code) ? 'selected' : ''}>${escapeHtml(language.label || language.code)}</option>`).join('')}</select></div></div>
    <div class="field-card"><div class="info"><h4>${escapeHtml(t('general.chatTranslation'))}</h4><p>${escapeHtml(t('general.chatTranslation.desc'))}</p></div><div class="control chat-translation-control"><span class="translation-summary ${translation.enabled ? 'is-enabled' : ''}">${escapeHtml(translationSummary)}</span><button class="btn btn-ghost" id="chat-translation-configure">${escapeHtml(t('general.chatTranslation.configure'))}</button></div></div>
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
  document.getElementById('chat-translation-configure').addEventListener('click', async () => {
    try { await openChatTranslationSettings(); }
    catch (error) { toast(friendlyNativeError(error), 'error'); }
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

function backendModelMode(backendType) {
  return backendDefinition(backendType).modelMode || 'free-select';
}

function backendDiscoveryFor(backendType) {
  return state.backendDiscovery?.backendType === backendType ? state.backendDiscovery : null;
}

function backendSavedModelFor(backendType) {
  return state.backendConfig?.backendType === backendType ? String(state.backendConfig?.model || '') : '';
}

function backendReportedModelFor(backendType) {
  const discovery = backendDiscoveryFor(backendType);
  if (discovery?.modelName) return String(discovery.modelName);
  if (state.modelStatus?.backend === backendType && state.modelStatus?.modelName) return String(state.modelStatus.modelName);
  return '';
}

function formatContextLength(value) {
  const tokens = Number(value);
  if (!Number.isFinite(tokens) || tokens <= 0) return '';
  let compact = '';
  if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) compact = `${tokens / 1_000_000}M`;
  else if (tokens >= 1_048_576 && tokens % 1_048_576 === 0) compact = `${tokens / 1_048_576}M`;
  else if (tokens >= 1_000 && tokens % 1_000 === 0) compact = `${tokens / 1_000}K`;
  else if (tokens >= 1_024 && tokens % 1_024 === 0) compact = `${tokens / 1_024}K`;
  else compact = new Intl.NumberFormat(intlLocale()).format(tokens);
  return t('models.meta.context', { value: compact });
}

function modelDetailsFor(backendType) {
  const details = backendDiscoveryFor(backendType)?.modelDetails || [];
  return Array.isArray(details) ? details : [];
}

function modelInfoFor(backendType, modelId) {
  if (!modelId) return null;
  return modelDetailsFor(backendType).find(info => String(info?.id || '') === String(modelId)) || null;
}

function modelMetaParts(info) {
  if (!info) return [];
  const parts = [];
  const context = formatContextLength(info.contextLength);
  if (context) parts.push(context);
  if (info.subscriptionIncluded === true) {
    const multiplier = Number(info.subscriptionInputMultiplier || 1);
    parts.push(multiplier !== 1 ? t('models.meta.subMultiplier', { multiplier }) : t('models.meta.sub'));
  } else if (info.subscriptionIncluded === false && info.subscriptionNote) {
    parts.push(t('models.meta.notSub'));
  }
  if (info.priceLabel) parts.push(String(info.priceLabel));
  if (info.vision) parts.push(t('models.meta.vision'));
  if (info.reasoning) parts.push(t('models.meta.reasoning'));
  if (info.tools) parts.push(t('models.meta.tools'));
  return parts;
}

function modelOptionLabel(backendType, modelId) {
  const info = modelInfoFor(backendType, modelId);
  const name = String(info?.name || modelId);
  const meta = modelMetaParts(info);
  return meta.length ? `${name} — ${meta.join(' · ')}` : name;
}

function renderSelectedModelSummary(backendType) {
  const summary = document.getElementById('backend-model-summary');
  if (!summary) return;
  const model = document.getElementById('backend-model')?.value?.trim() || backendReportedModelFor(backendType);
  if (!model) {
    summary.hidden = true;
    summary.innerHTML = '';
    return;
  }
  const info = modelInfoFor(backendType, model);
  const title = String(info?.name || model);
  const meta = modelMetaParts(info);
  const idLine = info?.name && info.name !== model ? `<span class="model-summary-id">${escapeHtml(model)}</span>` : '';
  const chips = meta.length
    ? `<div class="model-meta-chips">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';
  summary.hidden = false;
  summary.innerHTML = `<div class="model-summary-title"><strong>${escapeHtml(title)}</strong>${idLine}</div>${chips}`;
}

function bindModelSelection(backendType) {
  document.getElementById('backend-model')?.addEventListener('change', async () => {
    state.modelAnalysis = null;
    renderModelAnalysisResult();
    renderSelectedModelSummary(backendType);
    try {
      await saveBackendConfiguration({ quiet: true, refresh: false });
    } catch (error) {
      console.error(error);
    }
  });
}

function renderBackendModelControl(backendType) {
  const host = document.getElementById('backend-model-control');
  if (!host) return;
  const mode = backendModelMode(backendType);
  const discovery = backendDiscoveryFor(backendType);
  const models = [...new Set((discovery?.models || []).map(String).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const savedModel = backendSavedModelFor(backendType);
  const reportedModel = backendReportedModelFor(backendType);

  if (mode === 'reported') {
    host.innerHTML = `
      <label class="connection-field">
        <span>${escapeHtml(t('models.model'))}</span>
        <input id="backend-model" value="${escapeHtml(reportedModel)}" placeholder="${escapeHtml(t('models.model.connectFirst'))}" readonly>
      </label>
      <div class="model-summary" id="backend-model-summary" hidden></div>`;
    renderSelectedModelSummary(backendType);
    return;
  }

  if (mode === 'optional-select') {
    const selected = models.length ? (models.includes(savedModel) ? savedModel : '') : savedModel;
    const extra = savedModel && !models.includes(savedModel) ? `<option value="${escapeHtml(savedModel)}" selected>${escapeHtml(savedModel)}</option>` : '';
    host.innerHTML = `
      <label class="connection-field">
        <span>${escapeHtml(t('models.model'))}</span>
        <select id="backend-model">
          <option value="" ${selected ? '' : 'selected'}>${escapeHtml(t('models.model.currentlyLoaded'))}</option>
          ${extra}
          ${models.map(model => `<option value="${escapeHtml(model)}" ${selected === model ? 'selected' : ''}>${escapeHtml(modelOptionLabel(backendType, model))}</option>`).join('')}
        </select>
      </label>
      <div class="model-summary" id="backend-model-summary" hidden></div>`;
    bindModelSelection(backendType);
    renderSelectedModelSummary(backendType);
    return;
  }

  if (mode === 'required-select') {
    const selected = models.includes(savedModel) ? savedModel : (models[0] || savedModel || '');
    const options = models.length ? models : (savedModel ? [savedModel] : []);
    host.innerHTML = `
      <label class="connection-field">
        <span>${escapeHtml(t('models.model'))}</span>
        <select id="backend-model" ${options.length ? '' : 'disabled'}>
          ${options.length
            ? options.map(model => `<option value="${escapeHtml(model)}" ${selected === model ? 'selected' : ''}>${escapeHtml(modelOptionLabel(backendType, model))}</option>`).join('')
            : `<option value="">${escapeHtml(t('models.model.connectFirst'))}</option>`}
        </select>
      </label>
      <div class="model-summary" id="backend-model-summary" hidden></div>`;
    bindModelSelection(backendType);
    renderSelectedModelSummary(backendType);
    return;
  }

  if (mode === 'free-reported') {
    host.innerHTML = `
      <label class="connection-field">
        <span>${escapeHtml(t('models.model'))}</span>
        <input id="backend-model" value="${escapeHtml(savedModel)}" placeholder="${escapeHtml(reportedModel || t('models.model.manual'))}">
      </label>
      <small class="field-hint">${escapeHtml(reportedModel ? t('models.model.reported', { model: reportedModel }) : t('models.model.connectFirst'))}</small>
      <div class="model-summary" id="backend-model-summary" hidden></div>`;
    bindModelSelection(backendType);
    renderSelectedModelSummary(backendType);
    return;
  }

  const manualValue = savedModel;
  host.innerHTML = `
    <label class="connection-field">
      <span>${escapeHtml(t('models.model'))}</span>
      <input id="backend-model" value="${escapeHtml(manualValue)}" placeholder="${escapeHtml(t('models.model.manual'))}" list="backend-model-options">
      <datalist id="backend-model-options">
        ${models.map(model => `<option value="${escapeHtml(model)}">${escapeHtml(modelOptionLabel(backendType, model))}</option>`).join('')}
      </datalist>
    </label>
    <div class="model-summary" id="backend-model-summary" hidden></div>`;
  bindModelSelection(backendType);
  document.getElementById('backend-model')?.addEventListener('input', () => {
    state.modelAnalysis = null;
    renderModelAnalysisResult();
    renderSelectedModelSummary(backendType);
  });
  renderSelectedModelSummary(backendType);
}

function modelAnalysisSourceLabel(source) {
  const key = `models.analysis.source.${String(source || 'insufficient-metadata')}`;
  return t(key);
}

function modelAnalysisConfidenceLabel(confidence) {
  return t(`models.analysis.confidence.${String(confidence || 'low')}`);
}

function analysisCapabilityChips(analysis) {
  const parts = [];
  if (analysis.vision) parts.push(t('models.meta.vision'));
  if (analysis.reasoning) parts.push(t('models.meta.reasoning'));
  if (analysis.tools) parts.push(t('models.meta.tools'));
  return parts;
}

function analysisSubscriptionLabel(analysis) {
  if (analysis.subscriptionIncluded !== true) return analysis.subscriptionIncluded === false ? t('models.meta.notSub') : '';
  const multiplier = Number(analysis.subscriptionInputMultiplier || 1);
  return multiplier !== 1 ? t('models.meta.subMultiplier', { multiplier }) : t('models.meta.sub');
}

function modelAnalysisInfoRow(label, value) {
  if (!value) return '';
  return `<div class="analysis-info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function availableModelAnalysisPresetPair(name) {
  return allContextPresets().some(preset => preset.name === name)
    && allInstructionPresets().some(preset => preset.name === name);
}

function extendedPromptTemplatePreset(analysis) {
  const template = String(analysis?.chatTemplate || '').trim();
  if (!template) return null;
  const lower = template.toLowerCase();
  const hints = [analysis?.modelId, analysis?.modelName, analysis?.architecture, analysis?.tokenizer, analysis?.instructType]
    .filter(Boolean).join(' ').toLowerCase();

  // Unlike SillyTavern's conservative substring table, accept Jinja templates
  // that render the role dynamically (e.g. <|im_start|>{{ message['role'] }}).
  if (lower.includes('<|im_start|>') && lower.includes('<|im_end|>') && availableModelAnalysisPresetPair('ChatML')) {
    return 'ChatML';
  }
  if (lower.includes('<|start_header_id|>') && lower.includes('<|end_header_id|>') && lower.includes('<|eot_id|>')
      && availableModelAnalysisPresetPair('Llama 3 Instruct')) {
    return 'Llama 3 Instruct';
  }
  if (lower.includes('<start_of_turn>') && lower.includes('<end_of_turn>') && availableModelAnalysisPresetPair('Gemma 2')) {
    return 'Gemma 2';
  }
  if (lower.includes('<|start_of_turn_token|>') && lower.includes('<|end_of_turn_token|>') && availableModelAnalysisPresetPair('Command R')) {
    return 'Command R';
  }
  if (lower.includes('[inst]') && lower.includes('[/inst]')) {
    const tekken = /(?:nemo|tekken)/.test(hints);
    const preferred = tekken ? 'Mistral V3-Tekken' : 'Mistral V2 & V3';
    if (availableModelAnalysisPresetPair(preferred)) return preferred;
    if (availableModelAnalysisPresetPair('Mistral V2 & V3')) return 'Mistral V2 & V3';
  }
  return null;
}

function enrichModelAnalysisFromTemplate(analysis) {
  if (!analysis || (analysis.contextPreset && analysis.instructionPreset)) return analysis;
  const preset = extendedPromptTemplatePreset(analysis);
  if (!preset) return analysis;
  return {
    ...analysis,
    detectedTemplate: analysis.detectedTemplate || preset,
    contextPreset: analysis.contextPreset || preset,
    instructionPreset: analysis.instructionPreset || preset,
    confidence: 'high',
    source: 'chat-template-extended-pattern',
    notes: [...(analysis.notes || []), `Extended template inspection matched ${preset}.`],
  };
}

function modelAnalysisProbeCandidates(analysis) {
  const hint = [analysis?.modelId, analysis?.modelName, analysis?.architecture, analysis?.tokenizer, analysis?.instructType, analysis?.chatTemplate]
    .filter(Boolean).join(' ').toLowerCase();
  let priority;
  if (/(mistral|mixtral|nemo|tekken)/.test(hint)) {
    priority = ['ChatML', 'Mistral V3-Tekken', 'Mistral V2 & V3', 'Alpaca', 'Metharme'];
  } else if (/(llama\s*3|llama-3|llama3)/.test(hint)) {
    priority = ['Llama 3 Instruct', 'ChatML', 'Alpaca', 'Mistral V2 & V3', 'Metharme'];
  } else if (/gemma/.test(hint)) {
    priority = ['Gemma 2', 'ChatML', 'Alpaca', 'Mistral V2 & V3'];
  } else if (/command\s*r|cohere/.test(hint)) {
    priority = ['Command R', 'ChatML', 'Alpaca', 'Mistral V2 & V3'];
  } else {
    priority = ['ChatML', 'Alpaca', 'Mistral V2 & V3', 'Llama 3 Instruct', 'Metharme', 'Mistral V3-Tekken'];
  }
  return priority.filter((name, index, values) => values.indexOf(name) === index && availableModelAnalysisPresetPair(name)).slice(0, 6);
}

function modelAnalysisProbeCharacter(variant = 'fact') {
  const isFact = variant === 'fact';
  return {
    name: 'Elara',
    description: isFact
      ? 'Elara is a meticulous clockmaker. The name of her brass workshop key is VESPER. She never speaks for User.'
      : 'Elara is a meticulous clockmaker. Her workshop always smells strongly of CEDAR. She never speaks for User.',
    personality: 'Calm, concise, observant, and always stays in character.',
    scenario: 'User is standing in Elara’s clock workshop and asks a simple question.',
    exampleMessages: '',
    systemPrompt: 'Stay in character as Elara. Follow the user request exactly. Never output prompt-template markers, role headers, or dialogue for User.',
    postHistoryInstructions: isFact
      ? 'Answer the last request exactly and do not add any explanation.'
      : 'Answer only as Elara in one short natural sentence. Do not prefix the reply with a speaker name.',
  };
}

function buildModelAnalysisProbe(presetName, variant = 'fact') {
  const preset = resolveContextPreset(presetName);
  const instruction = {
    ...resolveInstructionPreset(presetName),
    enabled: true,
    bindToContext: false,
    deriveFromModel: false,
  };
  const character = modelAnalysisProbeCharacter(variant);
  const history = [{
    role: 'user',
    content: variant === 'fact'
      ? 'What is the name of your brass workshop key? Reply with exactly NVPROBE=VESPER and nothing else.'
      : 'In one short sentence, tell me what scent fills your workshop. Include the word CEDAR. Do not use a role label.',
  }];
  const components = prepareTextCompletionComponents(character, history, preset, { ...DEFAULT_CONTEXT_FORMATTING }, instruction);
  const assembled = assembleSelectedTextCompletionPrompt(
    components,
    [...components.entries].reverse(),
    [],
    preset,
    { ...DEFAULT_CONTEXT_FORMATTING },
    instruction,
  );
  return {
    prompt: assembled.prompt,
    stopStrings: buildTextCompletionStopStrings(character, preset, instruction),
  };
}

function scoreModelAnalysisProbe(text, variant = 'fact') {
  const value = String(text || '').trim();
  const upper = value.toUpperCase();
  let score = 0;
  if (!value) return -20;

  if (variant === 'fact') {
    if (upper.includes('NVPROBE=VESPER')) score += 10;
    else if (upper.includes('VESPER')) score += 6;
    if (upper.includes('NVPROBE')) score += 1;
  } else {
    if (upper.includes('CEDAR')) score += 7;
    if (/\b(I|MY|ME)\b/i.test(value)) score += 1;
    const words = value.split(/\s+/).filter(Boolean).length;
    if (words >= 3 && words <= 35) score += 2;
    else if (words > 80) score -= 2;
  }

  const leakedMarkers = [
    '<|im_start|>', '<|im_end|>', '<|start_header_id|>', '<|eot_id|>',
    '[inst]', '[/inst]', '<start_of_turn>', '<end_of_turn>', '<|user|>', '<|model|>',
    '### instruction:', '### response:', '### input:',
  ];
  for (const marker of leakedMarkers) {
    if (value.toLowerCase().includes(marker)) score -= 4;
  }
  if (/^\s*(user|human|assistant|system|elara)\s*:/i.test(value)) score -= 3;
  if (/\n\s*(user|human)\s*:/i.test(value)) score -= 4;
  if (/\b(as an ai|i cannot comply|i can't comply)\b/i.test(value)) score -= 3;
  if (value.length <= 320) score += 1;
  return score;
}

async function runModelAnalysisProbe(analysis, draft, onProgress = () => {}) {
  // In Chat Completions mode the remote/backend chat template owns instruction
  // formatting, so a Text Completion preset benchmark would be misleading.
  if (effectiveBackendApiMode(draft) !== 'text') return analysis;

  const candidates = modelAnalysisProbeCandidates(analysis);
  if (candidates.length < 2) return analysis;

  const saved = await invoke('save_backend_config', { config: draft });
  state.backendConfig = saved || draft;
  const params = { temperature: 0.05, topP: 0.9, maxTokens: 48 };
  const phaseOne = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const preset = candidates[index];
    onProgress(preset, index + 1, candidates.length);
    try {
      const probe = buildModelAnalysisProbe(preset, 'fact');
      const result = await invoke('text_completion', {
        prompt: probe.prompt,
        stopStrings: probe.stopStrings,
        params,
      });
      const response = String(result?.content || '').trim();
      phaseOne.push({ preset, score: scoreModelAnalysisProbe(response, 'fact'), response });
    } catch (error) {
      phaseOne.push({ preset, score: -20, response: '', error: friendlyNativeError(error) });
    }
  }

  phaseOne.sort((a, b) => b.score - a.score);
  const finalists = phaseOne.slice(0, 2);
  const phaseTwo = [];
  if (finalists.length === 2 && finalists[0].score - finalists[1].score < 3) {
    for (let index = 0; index < finalists.length; index += 1) {
      const preset = finalists[index].preset;
      onProgress(preset, candidates.length + index + 1, candidates.length + finalists.length);
      try {
        const probe = buildModelAnalysisProbe(preset, 'roleplay');
        const result = await invoke('text_completion', {
          prompt: probe.prompt,
          stopStrings: probe.stopStrings,
          params,
        });
        const response = String(result?.content || '').trim();
        phaseTwo.push({ preset, score: scoreModelAnalysisProbe(response, 'roleplay'), response });
      } catch (error) {
        phaseTwo.push({ preset, score: -20, response: '', error: friendlyNativeError(error) });
      }
    }
  }

  const combined = phaseOne.map(item => {
    const tieBreak = phaseTwo.find(entry => entry.preset === item.preset);
    return {
      ...item,
      factScore: item.score,
      roleplayScore: tieBreak?.score ?? null,
      score: item.score + (tieBreak?.score ?? 0),
      roleplayResponse: tieBreak?.response || '',
    };
  }).sort((a, b) => b.score - a.score);

  const winnerPool = phaseTwo.length ? combined.filter(item => item.roleplayScore !== null) : combined;
  winnerPool.sort((a, b) => b.score - a.score);
  const best = winnerPool[0];
  const second = winnerPool[1];
  const margin = best && second ? best.score - second.score : 0;
  const minimum = phaseTwo.length ? 14 : 9;
  const decisive = Boolean(best && best.score >= minimum && (!second || margin >= 2));

  if (!decisive) {
    return {
      ...analysis,
      source: 'runtime-probe-ambiguous',
      confidence: 'low',
      deepTestUsed: true,
      probeResults: combined,
      notes: [...(analysis.notes || []), 'Runtime preset probes did not produce a decisive winner.'],
    };
  }

  const confidence = margin >= 5 ? 'high' : 'medium';
  return {
    ...analysis,
    detectedTemplate: best.preset,
    contextPreset: best.preset,
    instructionPreset: best.preset,
    confidence,
    source: 'runtime-behavioral-probe',
    deepTestUsed: true,
    probeResults: combined,
    notes: [...(analysis.notes || []), `Runtime behavioral probe selected ${best.preset} with a margin of ${margin}.`],
  };
}

function modelAnalysisProbeDetails(analysis) {
  const results = Array.isArray(analysis?.probeResults) ? analysis.probeResults : [];
  if (!results.length) return '';
  return `
    <details class="analysis-template-details analysis-probe-details">
      <summary>${escapeHtml(t('models.analysis.deepProbeTitle'))}</summary>
      <p>${escapeHtml(t('models.analysis.deepProbeHint'))}</p>
      <div class="analysis-probe-list">
        ${results.map((result, index) => `
          <div class="analysis-probe-row ${index === 0 ? 'is-best' : ''}">
            <strong>${escapeHtml(result.preset)}</strong>
            <span>${escapeHtml(t('models.analysis.deepProbeScore', { score: result.score }))}</span>
          </div>`).join('')}
      </div>
    </details>`;
}

function renderModelAnalysisResult(analysis = state.modelAnalysis) {
  const host = document.getElementById('model-analysis-result');
  if (!host) return;
  if (!analysis) {
    host.innerHTML = `<div class="model-analysis-empty">${escapeHtml(t('models.analysis.empty'))}</div>`;
    return;
  }

  const provider = backendDefinition(analysis.provider || state.backendConfig?.backendType || 'custom').label;
  const modelTitle = analysis.modelName || analysis.modelId || t('models.analysis.unknownModel');
  const context = formatContextLength(analysis.contextLength) || t('models.analysis.unknown');
  const capabilities = analysisCapabilityChips(analysis);
  const subscription = analysisSubscriptionLabel(analysis);
  const commercial = [subscription, analysis.priceLabel].filter(Boolean).join(' · ');
  const recommendationAvailable = Boolean(analysis.contextPreset || analysis.instructionPreset);
  const templateSummary = analysis.detectedTemplate || t('models.analysis.unknown');
  const source = modelAnalysisSourceLabel(analysis.source);
  const confidence = modelAnalysisConfidenceLabel(analysis.confidence);
  const chatTemplate = String(analysis.chatTemplate || '').trim();
  const recommendationHintKey = analysis.deepTestUsed
    ? (recommendationAvailable ? 'models.analysis.runtimeRecommendationHint' : 'models.analysis.runtimeNoRecommendationHint')
    : (recommendationAvailable ? 'models.analysis.recommendationHint' : 'models.analysis.noRecommendationHint');

  host.innerHTML = `
    <div class="analysis-overview">
      <div class="analysis-model-title">
        <strong>${escapeHtml(modelTitle)}</strong>
        ${analysis.modelId && analysis.modelId !== modelTitle ? `<span>${escapeHtml(analysis.modelId)}</span>` : ''}
      </div>
      <span class="analysis-confidence analysis-confidence-${escapeHtml(analysis.confidence || 'low')}">${escapeHtml(t('models.analysis.confidence', { value: confidence }))}</span>
    </div>
    <div class="analysis-grid">
      <div class="analysis-panel">
        <h5>${escapeHtml(t('models.analysis.information'))}</h5>
        ${modelAnalysisInfoRow(t('models.provider'), provider)}
        ${modelAnalysisInfoRow(t('models.analysis.architecture'), analysis.architecture || t('models.analysis.unknown'))}
        ${analysis.tokenizer ? modelAnalysisInfoRow(t('models.analysis.tokenizer'), analysis.tokenizer) : ''}
        ${analysis.instructType ? modelAnalysisInfoRow(t('models.analysis.instructType'), analysis.instructType) : ''}
        ${analysis.modality ? modelAnalysisInfoRow(t('models.analysis.modality'), analysis.modality) : ''}
        ${modelAnalysisInfoRow(t('models.analysis.context'), context)}
        ${modelAnalysisInfoRow(t('models.analysis.template'), templateSummary)}
        ${modelAnalysisInfoRow(t('models.analysis.source'), source)}
        ${commercial ? modelAnalysisInfoRow(t('models.analysis.planPricing'), commercial) : ''}
        ${analysis.modelPath ? modelAnalysisInfoRow(t('models.analysis.modelPath'), analysis.modelPath) : ''}
        ${analysis.chatTemplateHash ? modelAnalysisInfoRow(t('models.analysis.templateHash'), analysis.chatTemplateHash) : ''}
        ${capabilities.length ? `<div class="analysis-capabilities">${capabilities.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="analysis-panel analysis-recommendations">
        <h5>${escapeHtml(t('models.analysis.recommendations'))}</h5>
        <div class="analysis-recommendation">
          <span>${escapeHtml(t('models.analysis.contextPreset'))}</span>
          <strong>${escapeHtml(analysis.contextPreset || t('models.analysis.notDetermined'))}</strong>
        </div>
        <div class="analysis-recommendation">
          <span>${escapeHtml(t('models.analysis.instructionPreset'))}</span>
          <strong>${escapeHtml(analysis.instructionPreset || t('models.analysis.notDetermined'))}</strong>
        </div>
        <p>${escapeHtml(t(recommendationHintKey))}</p>
        <button class="btn btn-ghost" id="apply-model-analysis" ${recommendationAvailable ? '' : 'disabled'}>${escapeHtml(t('models.analysis.apply'))}</button>
      </div>
    </div>
    ${chatTemplate ? `
      <details class="analysis-template-details">
        <summary>${escapeHtml(t('models.analysis.rawTemplate'))}</summary>
        <pre>${escapeHtml(chatTemplate)}</pre>
      </details>` : ''}
    ${modelAnalysisProbeDetails(analysis)}`;

  document.getElementById('apply-model-analysis')?.addEventListener('click', () => applyModelAnalysisRecommendations(analysis));
}

function applyModelAnalysisRecommendations(analysis) {
  let applied = 0;
  if (analysis.contextPreset && allContextPresets().some(preset => preset.name === analysis.contextPreset)) {
    setActiveContextPreset(analysis.contextPreset);
    applied += 1;
  }
  if (analysis.instructionPreset && allInstructionPresets().some(preset => preset.name === analysis.instructionPreset)) {
    const presetState = getInstructionPresetState();
    presetState.active = analysis.instructionPreset;
    if (effectiveBackendApiMode(currentBackendDraft()) === 'text') presetState.enabled = true;
    saveInstructionPresetState(presetState);
    applied += 1;
  }
  if (applied) toast(t('models.analysis.applied'), 'success');
}

async function analyzeCurrentModel() {
  const button = document.getElementById('analyze-model');
  const host = document.getElementById('model-analysis-result');
  const draft = currentBackendDraft();
  if (button) {
    button.disabled = true;
    button.textContent = t('models.analysis.analyzing');
  }
  if (host) host.innerHTML = `<div class="model-analysis-empty">${escapeHtml(t('models.analysis.analyzing'))}</div>`;
  try {
    let analysis = await invoke('analyze_backend_model', { config: draft });
    analysis = enrichModelAnalysisFromTemplate(analysis);
    if (!analysis.contextPreset || !analysis.instructionPreset) {
      analysis = await runModelAnalysisProbe(analysis, draft, (preset, current, total) => {
        if (host) host.innerHTML = `<div class="model-analysis-empty">${escapeHtml(t('models.analysis.deepTesting', { preset, current, total }))}</div>`;
      });
    }
    state.modelAnalysis = analysis;
    renderModelAnalysisResult(analysis);
  } catch (error) {
    state.modelAnalysis = null;
    if (host) host.innerHTML = `<div class="model-analysis-empty is-error">${escapeHtml(friendlyNativeError(error))}</div>`;
    toast(friendlyNativeError(error), 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = t('models.analysis.analyze');
    }
  }
}

function updateProviderFields(backendType, { resetUrl = false } = {}) {
  const provider = backendDefinition(backendType);
  const endpointInput = document.getElementById('backend-url');
  const apiKeyField = document.getElementById('backend-api-key-field');
  const apiKeyInput = document.getElementById('backend-api-key');
  if (endpointInput && resetUrl) endpointInput.value = provider.url;
  if (apiKeyField) apiKeyField.hidden = provider.apiKey === 'none';
  if (apiKeyInput) {
    apiKeyInput.required = provider.apiKey === 'required';
    apiKeyInput.placeholder = provider.apiKey === 'required'
      ? t('models.apiKey.requiredPlaceholder')
      : t('models.apiKey.placeholder');
  }
  const modeSelect = document.getElementById('backend-api-mode');
  if(modeSelect){modeSelect.disabled=['anthropic','google'].includes(backendType);if(modeSelect.disabled)modeSelect.value='chat';}
  const selectedMode = modeSelect?.value || 'auto';
  const effective = selectedMode === 'auto' ? defaultBackendApiMode(backendType) : selectedMode;
  const hint = document.getElementById('backend-api-mode-hint');
  if (hint) hint.textContent = t('models.prompting.effective', { mode: t(`models.apiMode.${effective}`) }) + (backendType === 'anthropic' ? nvText(' · Échantillonnage : réglages natifs de Claude.',' · Sampling: native Claude defaults.') : '');
  renderBackendModelControl(backendType);
}

async function renderModelsConfig() {
  const body = document.getElementById('config-body');
  let saved = null;
  try { saved = await invoke('load_backend_config'); } catch (error) { toast(friendlyNativeError(error), 'error'); }
  state.backendConfig = saved;
  const selected = saved?.backendType || 'koboldcpp';
  const selectedProvider = backendDefinition(selected);

  body.innerHTML = `
    <div class="field-card field-card-stack model-connection-card">
      <div class="info"><h4>${escapeHtml(t('models.connection'))}</h4><p>${escapeHtml(t('models.connection.desc'))}</p></div>
      <div class="model-connection-form">
        <label class="connection-field">
          <span>${escapeHtml(t('models.provider'))}</span>
          <select id="backend-provider">
            ${BACKENDS.map(backend => `<option value="${escapeHtml(backend.id)}" ${backend.id === selected ? 'selected' : ''}>${escapeHtml(backend.label)}</option>`).join('')}
          </select>
        </label>
        <label class="connection-field">
          <span>${escapeHtml(t('models.endpoint'))}</span>
          <input id="backend-url" value="${escapeHtml(saved?.url || selectedProvider.url)}" placeholder="${escapeHtml(selectedProvider.url)}">
        </label>
        <label class="connection-field" id="backend-api-key-field" ${selectedProvider.apiKey === 'none' ? 'hidden' : ''}>
          <span>${escapeHtml(t('models.apiKey'))}</span>
          <input id="backend-api-key" type="password" value="${escapeHtml(saved?.apiKey || '')}" autocomplete="off" placeholder="${escapeHtml(selectedProvider.apiKey === 'required' ? t('models.apiKey.requiredPlaceholder') : t('models.apiKey.placeholder'))}">
        </label>
        <div class="model-control-stack" id="backend-model-control"></div>
        <label class="connection-field">
          <span>${escapeHtml(t('models.prompting'))}</span>
          <select id="backend-api-mode">
            <option value="auto" ${(saved?.apiMode || 'auto') === 'auto' ? 'selected' : ''}>${escapeHtml(t('models.prompting.auto'))}</option>
            <option value="chat" ${saved?.apiMode === 'chat' ? 'selected' : ''}>${escapeHtml(t('models.apiMode.chat'))}</option>
            <option value="text" ${saved?.apiMode === 'text' ? 'selected' : ''}>${escapeHtml(t('models.apiMode.text'))}</option>
          </select>
          <small class="field-hint" id="backend-api-mode-hint"></small>
        </label>
        <div class="connection-actions">
          <button class="btn btn-primary" id="connect-backend">${escapeHtml(t('models.connect'))}</button>
          <div class="connection-result" id="connection-result">${escapeHtml(t('models.notTested'))}</div>
        </div>
      </div>
    </div>
    <div class="field-card field-card-stack model-analysis-card">
      <div class="model-analysis-heading">
        <div class="info"><h4>${escapeHtml(t('models.analysis.title'))}</h4><p>${escapeHtml(t('models.analysis.desc'))}</p></div>
        <button class="btn btn-ghost" id="analyze-model">${escapeHtml(t('models.analysis.analyze'))}</button>
      </div>
      <div class="model-analysis-result" id="model-analysis-result"></div>
    </div>`;

  const providerSelect = document.getElementById('backend-provider');
  providerSelect.addEventListener('change', () => {
    const previous = state.backendDiscovery?.backendType;
    const backendType = providerSelect.value;
    if (previous !== backendType) { state.backendDiscovery = null; state.modelAnalysis = null; renderModelAnalysisResult(); }
    const apiKeyInput = document.getElementById('backend-api-key');
    const apiModeSelect = document.getElementById('backend-api-mode');
    if (apiKeyInput) apiKeyInput.value = '';
    if (apiModeSelect) apiModeSelect.value = 'auto';
    updateProviderFields(backendType, { resetUrl: true });
  });
  document.getElementById('backend-api-mode').addEventListener('change', () => updateProviderFields(providerSelect.value));
  document.getElementById('connect-backend').addEventListener('click', () => testBackend(providerSelect.value));
  document.getElementById('analyze-model').addEventListener('click', analyzeCurrentModel);
  updateProviderFields(selected);
  renderModelAnalysisResult();
}

function currentBackendDraft() {
  const backendType = document.getElementById('backend-provider')?.value || 'koboldcpp';
  const mode = backendModelMode(backendType);
  const model = mode === 'reported' ? null : (document.getElementById('backend-model')?.value.trim() || null);
  return {
    backendType,
    url: document.getElementById('backend-url')?.value.trim() || backendDefinition(backendType).url,
    model,
    apiKey: document.getElementById('backend-api-key')?.value.trim() || null,
    apiMode: document.getElementById('backend-api-mode')?.value || 'auto',
  };
}

async function testBackend(backendType, { quiet = false } = {}) {
  const button = document.getElementById('connect-backend');
  const resultBox = document.getElementById('connection-result');
  const draft = currentBackendDraft();
  const provider = backendDefinition(draft.backendType);
  if (provider.apiKey === 'required' && !draft.apiKey) {
    if (resultBox) {
      resultBox.className = 'connection-result is-error';
      resultBox.textContent = t('models.apiKey.missing');
    }
    if (!quiet) toast(t('models.apiKey.missing'), 'error');
    return null;
  }
  if (button) {
    button.disabled = true;
    button.textContent = t('models.connecting');
  }
  if (resultBox) {
    resultBox.className = 'connection-result is-testing';
    resultBox.textContent = t('models.connecting');
  }
  try {
    const result = await invoke('test_backend_connection', {
      backendType: draft.backendType,
      url: draft.url,
      apiKey: draft.apiKey,
    });
    state.backendDiscovery = {
      backendType,
      models: result.models || [],
      modelName: result.modelName || result.models?.[0] || null,
      modelDetails: result.modelDetails || [],
    };
    state.backendConfig = draft;
    renderBackendModelControl(backendType);
    const connectedDraft = currentBackendDraft();
    const saved = await invoke('save_backend_config', { config: connectedDraft });
    state.backendConfig = saved || connectedDraft;
    const selectedWins = backendModelMode(backendType) !== 'reported' && connectedDraft.model;
    const displayModel = selectedWins ? connectedDraft.model : (result.modelName || result.models?.[0] || null);
    if (resultBox) {
      resultBox.className = 'connection-result is-ok';
      resultBox.textContent = displayModel
        ? t('models.connectedModel', { model: displayModel })
        : result.models?.length
          ? t('models.connectedModels', { count: result.models.length })
          : t('models.connectedNoModels');
    }
    renderSelectedModelSummary(backendType);
    state.modelAnalysis = null;
    renderModelAnalysisResult();
    if (!quiet) toast(t('models.connected'), 'success');
    await refreshModelStatus();
    return result;
  } catch (error) {
    if (resultBox) {
      resultBox.className = 'connection-result is-error';
      resultBox.textContent = friendlyNativeError(error);
    }
    if (!quiet) toast(friendlyNativeError(error), 'error');
    return null;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = t('models.connect');
    }
  }
}

async function saveBackendConfiguration({ quiet = false, refresh = true } = {}) {
  const config = currentBackendDraft();
  const saved = await invoke('save_backend_config', { config });
  state.backendConfig = saved || config;
  if (!quiet) toast(t('models.saved'), 'success');
  if (refresh) await refreshModelStatus();
  return state.backendConfig;
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
  { key: 'mesExamplesRaw', snippet: '{{#if mesExamplesRaw}}{{mesExamplesRaw}}{{/if}}', descriptionKey: 'globalPrompt.placeholder.mesExamplesRaw' },
  { key: 'trim', snippet: '{{trim}}', descriptionKey: 'globalPrompt.placeholder.trim' },
];

const SYSTEM_PROMPT_PLACEHOLDERS = CONTEXT_TEMPLATE_PLACEHOLDERS.filter(item => ['char', 'user', 'description', 'personality', 'scenario', 'persona'].includes(item.key));
const GLOBAL_PROMPT_TABS = ['context', 'instruction', 'system', 'preview'];

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

function contextPresetToolbar(state) {
  const presets = allContextPresets(state);
  const activePreset = presets.find(preset => preset.name === state.active) || presets[0];
  return `<div class="context-preset-toolbar">
    <label class="form-field context-preset-select-field">
      <span>${escapeHtml(t('globalPrompt.presets.label'))}</span>
      <select id="context-preset-select">
        ${presets.map(preset => `<option value="${escapeHtml(preset.name)}" ${preset.name === activePreset?.name ? 'selected' : ''}>${escapeHtml(preset.name)}${preset.modified ? ' •' : ''}</option>`).join('')}
      </select>
    </label>
    <div class="context-preset-actions">
      <button type="button" class="btn btn-ghost btn-small" id="context-preset-save">${escapeHtml(t('globalPrompt.presets.save'))}</button>
      <button type="button" class="btn btn-ghost btn-small" id="context-preset-new">${escapeHtml(t('globalPrompt.presets.new'))}</button>
      <button type="button" class="btn btn-ghost btn-small" id="context-preset-rename">${escapeHtml(t('globalPrompt.presets.rename'))}</button>
      <button type="button" class="btn btn-ghost btn-small" id="context-preset-restore" ${activePreset?.builtIn ? '' : 'disabled'}>${escapeHtml(t('globalPrompt.presets.restore'))}</button>
      <button type="button" class="btn btn-danger btn-small" id="context-preset-delete" ${activePreset?.builtIn ? 'disabled' : ''}>${escapeHtml(t('globalPrompt.presets.delete'))}</button>
    </div>
  </div>`;
}

function promptForContextPresetName(messageKey, current = '') {
  const value = window.prompt(t(messageKey), current);
  return value === null ? null : String(value).trim();
}

function contextPresetNameExists(name, state = getContextPresetState(), exceptName = null) {
  const lower = String(name || '').toLocaleLowerCase();
  return allContextPresets(state).some(preset => preset.name !== exceptName && preset.name.toLocaleLowerCase() === lower);
}

function contextPresetEditorValues() {
  return {
    storyString: contextTemplateFromEditor(document.getElementById('context-template-editor').value),
    exampleSeparator: document.getElementById('context-example-separator').value,
    chatStart: document.getElementById('context-chat-start').value,
    storyStringPosition: Number(document.getElementById('context-story-position').value) || 0,
    storyStringDepth: Math.max(0, Number(document.getElementById('context-story-depth').value) || 0),
    storyStringRole: Number(document.getElementById('context-story-role').value) || 0,
    alwaysForceName2: document.getElementById('context-always-force-name').checked,
    singleLine: document.getElementById('context-single-line').checked,
    trimSentences: document.getElementById('context-trim-sentences').checked,
    useStopStrings: document.getElementById('context-separators-stop').checked,
    namesAsStopStrings: document.getElementById('context-names-stop').checked,
  };
}

function contextFormattingEditorValues() {
  return {
    collapseNewlines: document.getElementById('context-collapse-newlines').checked,
    trimSpaces: document.getElementById('context-trim-spaces').checked,
    exampleMessagesBehavior: document.getElementById('context-example-behavior')?.value || 'normal',
  };
}

function renderContextPromptTab(body) {
  const presetState = getContextPresetState();
  const preset = resolveContextPreset(presetState.active, presetState);
  const formatting = getContextFormatting();
  body.innerHTML = `${globalPromptTabs('context')}
    <div class="field-card field-card-stack global-prompt-card">
      <div class="info">
        <h4>${escapeHtml(t('globalPrompt.contextTemplate'))}</h4>
        <p>${escapeHtml(t('globalPrompt.contextTemplate.desc'))}</p>
      </div>
      ${contextPresetToolbar(presetState)}
      <label class="form-field context-story-field">
        <span>${escapeHtml(t('globalPrompt.context.storyString'))}</span>
        <textarea id="context-template-editor" class="context-template-editor" spellcheck="false">${escapeHtml(contextTemplateToEditor(preset.storyString))}</textarea><small class="field-hint">${escapeHtml(t('globalPrompt.context.compactSyntaxHint'))}</small>
      </label>
      ${promptPlaceholderButtons(CONTEXT_TEMPLATE_PLACEHOLDERS, 'context-template-editor')}
      <div class="context-settings-grid">
        <label class="form-field">
          <span>${escapeHtml(t('globalPrompt.context.position'))}</span>
          <select id="context-story-position">
            <option value="0" ${preset.storyStringPosition === 0 ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.position.top'))}</option>
            <option value="1" ${preset.storyStringPosition === 1 ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.position.chat'))}</option>
          </select>
        </label>
        <label class="form-field context-depth-field" ${preset.storyStringPosition === 1 ? '' : 'hidden'}>
          <span>${escapeHtml(t('globalPrompt.context.depth'))}</span>
          <input id="context-story-depth" type="number" min="0" max="10000" step="1" value="${preset.storyStringDepth}">
        </label>
        <label class="form-field context-role-field" ${preset.storyStringPosition === 1 ? '' : 'hidden'}>
          <span>${escapeHtml(t('globalPrompt.context.role'))}</span>
          <select id="context-story-role">
            <option value="0" ${preset.storyStringRole === 0 ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.role.system'))}</option>
            <option value="1" ${preset.storyStringRole === 1 ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.role.user'))}</option>
            <option value="2" ${preset.storyStringRole === 2 ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.role.assistant'))}</option>
          </select>
        </label>
      </div>
      <div class="context-separator-grid">
        <label class="form-field"><span>${escapeHtml(t('globalPrompt.context.exampleSeparator'))}</span><textarea id="context-example-separator" rows="3" spellcheck="false">${escapeHtml(preset.exampleSeparator)}</textarea></label>
        <label class="form-field"><span>${escapeHtml(t('globalPrompt.context.chatStart'))}</span><textarea id="context-chat-start" rows="3" spellcheck="false">${escapeHtml(preset.chatStart)}</textarea></label>
      </div>
      <div class="context-formatting-panel">
        <h5>${escapeHtml(t('globalPrompt.context.formatting'))}</h5>
        <label class="form-field context-example-behavior">
          <span>${escapeHtml(t('globalPrompt.context.exampleBehavior'))}</span>
          <select id="context-example-behavior">
            <option value="normal" ${formatting.exampleMessagesBehavior === 'normal' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.exampleBehavior.normal'))}</option>
            <option value="keep" ${formatting.exampleMessagesBehavior === 'keep' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.exampleBehavior.keep'))}</option>
            <option value="strip" ${formatting.exampleMessagesBehavior === 'strip' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.context.exampleBehavior.strip'))}</option>
          </select>
        </label>
        <div class="context-formatting-options">
          <label class="toggle-row"><input type="checkbox" id="context-always-force-name" ${preset.alwaysForceName2 ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.alwaysForceName'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-single-line" ${preset.singleLine ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.singleLine'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-collapse-newlines" ${formatting.collapseNewlines ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.collapseNewlines'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-trim-spaces" ${formatting.trimSpaces ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.trimSpaces'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-trim-sentences" ${preset.trimSentences ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.trimSentences'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-separators-stop" ${preset.useStopStrings ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.separatorsStop'))}</span></label>
          <label class="toggle-row"><input type="checkbox" id="context-names-stop" ${preset.namesAsStopStrings ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.context.namesStop'))}</span></label>
        </div>
        <p class="field-hint">${escapeHtml(t('globalPrompt.context.formattingHint'))}</p>
      </div>
    </div>`;
  bindPromptPlaceholderButtons(body);
  const editor = document.getElementById('context-template-editor');
  const select = document.getElementById('context-preset-select');
  const position = document.getElementById('context-story-position');

  const syncPositionFields = () => {
    const inChat = Number(position.value) === 1;
    document.querySelector('.context-depth-field').hidden = !inChat;
    document.querySelector('.context-role-field').hidden = !inChat;
  };
  position.addEventListener('change', syncPositionFields);
  ['context-collapse-newlines', 'context-trim-spaces', 'context-example-behavior'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => saveContextFormatting(contextFormattingEditorValues()));
  });

  select.addEventListener('change', () => {
    setActiveContextPreset(select.value);
    renderGlobalPromptConfig('context');
  });

  document.getElementById('context-preset-save').addEventListener('click', () => {
    const current = getContextPresetState();
    const values = contextPresetEditorValues();
    const custom = contextPresetCustomEntry(current.active, current);
    if (custom) Object.assign(custom, values);
    else current.overrides[current.active] = values;
    saveContextPresetState(current);
    saveContextFormatting(contextFormattingEditorValues());
    localStorage.setItem(STORAGE.contextTemplate, values.storyString);
    renderGlobalPromptConfig('context');
    toast(t('globalPrompt.presets.saved'), 'success');
  });

  document.getElementById('context-preset-new').addEventListener('click', () => {
    const current = getContextPresetState();
    const name = promptForContextPresetName('globalPrompt.presets.newPrompt');
    if (!name) return;
    if (contextPresetNameExists(name, current)) return toast(t('globalPrompt.presets.nameExists'), 'error');
    const values = contextPresetEditorValues();
    current.custom.push(normalizeContextPresetRecord({ name, ...values }, name));
    current.active = name;
    saveContextPresetState(current);
    saveContextFormatting(contextFormattingEditorValues());
    localStorage.setItem(STORAGE.contextTemplate, values.storyString);
    renderGlobalPromptConfig('context');
    toast(t('globalPrompt.presets.created'), 'success');
  });

  document.getElementById('context-preset-rename').addEventListener('click', () => {
    const current = getContextPresetState();
    const oldName = current.active;
    const name = promptForContextPresetName('globalPrompt.presets.renamePrompt', oldName);
    if (!name || name === oldName) return;
    if (contextPresetNameExists(name, current, oldName)) return toast(t('globalPrompt.presets.nameExists'), 'error');
    const custom = contextPresetCustomEntry(oldName, current);
    const values = contextPresetEditorValues();
    if (custom) {
      Object.assign(custom, values, { name });
      current.active = name;
    } else {
      current.custom.push(normalizeContextPresetRecord({ name, ...values }, name));
      current.active = name;
    }
    saveContextPresetState(current);
    saveContextFormatting(contextFormattingEditorValues());
    localStorage.setItem(STORAGE.contextTemplate, values.storyString);
    renderGlobalPromptConfig('context');
    toast(t('globalPrompt.presets.renamed'), 'success');
  });

  document.getElementById('context-preset-restore').addEventListener('click', () => {
    const current = getContextPresetState();
    const factory = contextPresetFactoryEntry(current.active);
    if (!factory) return;
    if (!window.confirm(t('globalPrompt.presets.restoreConfirm', { name: current.active }))) return;
    delete current.overrides[current.active];
    saveContextPresetState(current);
    localStorage.setItem(STORAGE.contextTemplate, factory.storyString);
    renderGlobalPromptConfig('context');
    toast(t('globalPrompt.presets.restored'), 'success');
  });

  document.getElementById('context-preset-delete').addEventListener('click', () => {
    const current = getContextPresetState();
    const custom = contextPresetCustomEntry(current.active, current);
    if (!custom) return;
    if (!window.confirm(t('globalPrompt.presets.deleteConfirm', { name: current.active }))) return;
    current.custom = current.custom.filter(item => item.name !== current.active);
    current.active = defaultContextPresetName();
    saveContextPresetState(current);
    localStorage.setItem(STORAGE.contextTemplate, resolveContextPresetTemplate(current.active, current));
    renderGlobalPromptConfig('context');
    toast(t('globalPrompt.presets.deleted'), 'success');
  });
}

function renderInstructionSequence(value, character, template, name = '') {
  let text = String(value || '');
  if (!template.macro) return text;
  const values = { ...contextTemplateValues(character), name: String(name || '') };
  text = text.replace(/\{\{name\}\}/gi, String(name || ''));
  return renderTemplateMacros(text, values);
}

function instructionRoleName(role, character) {
  if (role === 'user') return nvPersona(nvContextSession(character)).name;
  if (role === 'assistant') return String(character.name || 'Assistant');
  return 'System';
}

function instructionNamesEnabled(template, forceName = false) {
  if (template.namesBehavior === 'always') return true;
  if (template.namesBehavior === 'force') return Boolean(forceName);
  return false;
}

function instructionMessageParts(role, template, options = {}) {
  if (role === 'user' || (role === 'system' && template.systemSameAsUser)) {
    const sequence = options.isLastUser && template.lastInputSequence
      ? template.lastInputSequence
      : options.isFirst && template.firstInputSequence
        ? template.firstInputSequence
        : template.inputSequence;
    return { sequence, suffix: template.inputSuffix };
  }
  if (role === 'assistant') {
    const sequence = options.isFirst && template.firstOutputSequence
      ? template.firstOutputSequence
      : options.isLastAssistant && template.lastOutputSequence
        ? template.lastOutputSequence
        : template.outputSequence;
    return { sequence, suffix: template.outputSuffix };
  }
  return {
    sequence: options.isLastSystem && template.lastSystemSequence ? template.lastSystemSequence : template.systemSequence,
    suffix: template.systemSuffix,
  };
}

function formatInstructionMessage(role, content, character, template, options = {}) {
  const body = String(content || '');
  if (!body.trim()) return '';
  if (!template.enabled) {
    if (role === 'user') return `${nvPersona(nvContextSession(character)).name}: ${body}\n`;
    if (role === 'assistant') return `${character.name || 'Assistant'}: ${body}\n`;
    return `${body}${body.endsWith('\n') ? '' : '\n'}`;
  }
  const roleName = instructionRoleName(role, character);
  const parts = instructionMessageParts(role, template, options);
  const prefix = renderInstructionSequence(parts.sequence, character, template, roleName);
  let suffix = renderInstructionSequence(parts.suffix, character, template, roleName);
  if (!suffix && template.wrap) suffix = '\n';
  const separator = template.wrap ? '\n' : '';
  const includeName = role !== 'system' && instructionNamesEnabled(template, options.forceName);
  const namedBody = includeName ? `${roleName}: ${body}` : body;
  return [prefix, namedBody + suffix].filter(Boolean).join(separator);
}

function renderContextPresetText(value, character) {
  return renderTemplateMacros(String(value || ''), contextTemplateValues(character));
}

function parseSillyTavernExamples(value, character, preset, isInstruct) {
  let raw = String(value || '');
  if (!raw || raw === '<START>') return [];
  if (!raw.startsWith('<START>')) raw = `<START>\n${raw.trim()}`;
  const separator = preset.exampleSeparator ? `${renderContextPresetText(preset.exampleSeparator, character)}\n` : '';
  const blockHeading = isInstruct ? '<START>\n' : separator;
  return raw.split(/<START>/gi).slice(1).map(block => `${blockHeading}${block.trim()}\n`);
}

function parseExampleDialogueBlock(block, character) {
  const rendered = renderContextPresetText(String(block || '').replace(/<START>/i, '{Example Dialogue:}'), character).replaceAll('\r\n', '\n');
  const userName = String(baseContextTemplateValues(character).user || 'User');
  const charName = String(character.name || '');
  const lines = rendered.split('\n');
  const entries = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    current.content = current.lines.join('\n').replace(`${current.speaker}:`, '').trim();
    delete current.lines;
    delete current.speaker;
    entries.push(current);
    current = null;
  };

  // ST skips the first heading line and switches speakers on exact "Name:" prefixes.
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith(`${userName}:`)) {
      flush();
      current = { role: 'user', name: 'example_user', speaker: userName, lines: [line] };
      continue;
    }
    if (charName && line.startsWith(`${charName}:`)) {
      flush();
      current = { role: 'assistant', name: 'example_assistant', speaker: charName, lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return entries;
}

function formatInstructionExampleMessage(role, content, character, template, forceName = false) {
  const roleName = instructionRoleName(role, character);
  let prefix = role === 'user' ? template.inputSequence : template.outputSequence;
  let suffix = role === 'user' ? template.inputSuffix : template.outputSuffix;
  if (template.macro) {
    prefix = renderInstructionSequence(prefix, character, template, roleName);
    suffix = renderInstructionSequence(suffix, character, template, roleName);
    if (!suffix && template.wrap) suffix = '\n';
  }
  const includeName = instructionNamesEnabled(template, forceName);
  const messageContent = includeName ? `${roleName}: ${content}` : content;
  const separator = template.wrap ? '\n' : '';
  return [prefix, messageContent + suffix].filter(Boolean).join(separator);
}

function formatSillyTavernExamples(parsedBlocks, character, preset, template) {
  const blockHeading = preset.exampleSeparator ? `${renderContextPresetText(preset.exampleSeparator, character)}\n` : '';
  if (!template.enabled || template.skipExamples) {
    return parsedBlocks.map(block => renderContextPresetText(block.replace(/<START>\n/i, blockHeading), character));
  }

  const formatted = [];
  for (const block of parsedBlocks) {
    const cleaned = String(block || '').replace(/<START>/i, '{Example Dialogue:}').replace(/\r/g, '');
    const entries = parseExampleDialogueBlock(cleaned, character);
    if (!entries.length) continue;
    if (blockHeading) formatted.push(blockHeading);
    for (const entry of entries) {
      const forceName = template.namesBehavior === 'force' && entry.name === 'example_user';
      formatted.push(formatInstructionExampleMessage(entry.role, entry.content, character, template, forceName));
    }
  }

  if (!formatted.length) {
    return parsedBlocks.map(block => renderContextPresetText(block.replace(/<START>\n/i, blockHeading), character));
  }
  return formatted;
}

function buildTextCompletionStopStrings(character, preset, instruction) {
  const result = [];
  const push = value => {
    const text = String(value || '');
    if (text && text.trim() && !result.includes(text)) result.push(text);
  };

  if (instruction.enabled) {
    const names = {
      input: nvPersona(nvContextSession(character)).name,
      output: String(character.name || 'Assistant'),
      system: 'System',
    };
    const combined = [String(instruction.stopSequence || '')];
    if (instruction.sequencesAsStopStrings) {
      combined.push(
        String(instruction.inputSequence || '').replace(/{{name}}/gi, names.input),
        String(instruction.outputSequence || '').replace(/{{name}}/gi, names.output),
        String(instruction.firstOutputSequence || '').replace(/{{name}}/gi, names.output),
        String(instruction.lastOutputSequence || '').replace(/{{name}}/gi, names.output),
        String(instruction.systemSequence || '').replace(/{{name}}/gi, names.system),
        String(instruction.lastSystemSequence || '').replace(/{{name}}/gi, names.system),
      );
    }
    const unique = [];
    for (const line of combined.join('\n').split('\n')) {
      if (unique.includes(line)) continue;
      unique.push(line);
      if (!line || !line.trim()) continue;
      const wrapped = instruction.wrap ? `\n${line}` : line;
      push(instruction.macro ? renderTemplateMacros(wrapped, contextTemplateValues(character, { instruction })) : wrapped);
    }
  }

  if (preset.useStopStrings) {
    if (preset.chatStart) push(`\n${renderContextPresetText(preset.chatStart, character)}`);
    if (preset.exampleSeparator) push(`\n${renderContextPresetText(preset.exampleSeparator, character)}`);
  }

  // Normal SillyTavern generation stops on the user name. It does not also add
  // the active character name unless continuing a user message / impersonating.
  if (preset.namesAsStopStrings) push(`\n${nvPersona(nvContextSession(character)).name}:`);
  if (preset.singleLine) result.unshift('\n');
  return result.filter((value, index, all) => value && all.indexOf(value) === index);
}

function formatInstructionStoryString(story, character, preset, template) {
  if (!story) return '';
  if (!template.enabled || Number(preset.storyStringPosition) === 1) return story;
  const separator = template.wrap ? '\n' : '';
  const values = contextTemplateValues(character, { preset, instruction: template });
  let output = story;
  if (template.storyStringPrefix) {
    const prefix = renderTemplateMacros(String(template.storyStringPrefix), { ...values, name: 'System' }).replace(/{{name}}/gi, 'System');
    output = `${prefix}${separator}${output}`;
  }
  if (template.storyStringSuffix) {
    output += renderTemplateMacros(String(template.storyStringSuffix), values);
  }
  return output;
}

function textCompletionGenerationPrefix(character, preset, instruction) {
  if (!instruction.enabled) return preset.alwaysForceName2 && character.name ? `${character.name}:` : '';
  const roleName = String(character.name || 'Assistant');
  const rawSequence = instruction.lastOutputSequence || instruction.outputSequence || '';
  let sequence = rawSequence;
  if (instruction.macro) sequence = renderInstructionSequence(sequence, character, instruction, roleName);
  const separator = instruction.wrap ? '\n' : '';
  const includeName = instruction.namesBehavior === 'always';
  let nameFiller = '';
  if (
    includeName && instruction.lastOutputSequence && instruction.outputSequence &&
    rawSequence === instruction.lastOutputSequence && /\s$/.test(instruction.outputSequence) && !/\s$/.test(instruction.lastOutputSequence)
  ) {
    nameFiller = instruction.outputSequence.slice(-1);
  }
  let text = includeName
    ? `${separator}${sequence}${separator}${nameFiller}${roleName}:`
    : `${separator}${sequence}`;
  return (instruction.wrap ? text.trimEnd() : text) + (includeName ? '' : separator);
}

function collapsePromptNewlines(value) {
  return String(value || '').replace(/\n+/g, '\n');
}

function contextPresetRoleName(value) {
  if (Number(value) === 1) return 'user';
  if (Number(value) === 2) return 'assistant';
  return 'system';
}

function injectStoryStringAtDepth(entries, story, preset) {
  if (!String(story || '').trim()) return [...entries];
  const depth = Math.max(0, Number(preset.storyStringDepth) || 0);
  const index = Math.max(0, entries.length - depth);
  const next = [...entries];
  next.splice(index, 0, {
    role: contextPresetRoleName(preset.storyStringRole),
    content: String(story).replace(/\n+$/, ''),
    injectedStory: true,
  });
  return next;
}

function markInstructionMessagePositions(entries) {
  const lastUserIndex = entries.findLastIndex(entry => entry.role === 'user');
  return entries.map((entry, index) => ({
    ...entry,
    isFirst: index === 0,
    isLastUser: entry.role === 'user' && index === lastUserIndex,
  }));
}

function prepareTextCompletionComponents(character, history, preset, formatting, instruction) {
  // ST parses examples before rendering the Story String because {{mesExamples}}
  // receives the already-Instruct-formatted representation.
  const parsedExamples = parseSillyTavernExamples(character.exampleMessages, character, preset, instruction.enabled);
  const rawExamples = [...parsedExamples];
  const formattedExamples = instruction.enabled
    ? formatSillyTavernExamples(parsedExamples, character, preset, instruction)
    : parsedExamples.map(item => renderContextPresetText(item, character));

  const story = renderCharacterContext(character, {
    preset,
    instruction,
    mesExamples: formattedExamples.join(''),
    mesExamplesRaw: rawExamples.join(''),
  });
  const combinedStory = formatInstructionStoryString(story, character, preset, instruction);
  const postHistory = effectivePostHistoryInstructions(character);

  let entries = nvPreparedHistory(character, history)
    .filter(entry => entry && ['system', 'user', 'assistant'].includes(entry.role) && String(entry.content || '').trim())
    .map(entry => ({ role: entry.role, content: String(entry.content), injectedStory: !!entry.injectedStory }));

  if (Number(preset.storyStringPosition) === 1) {
    entries = injectStoryStringAtDepth(entries, story, preset);
  }
  if (postHistory) entries.push({ role: 'user', content: postHistory, postHistory: true });
  entries = markInstructionMessagePositions(entries);

  const formattedEntries = entries.map(entry => ({
    ...entry,
    formatted: formatInstructionMessage(entry.role, entry.content, character, instruction, {
      isFirst: entry.isFirst,
      isLastUser: entry.isLastUser,
    }),
  }));

  const alignment = instruction.enabled && instruction.userAlignmentMessage
    ? formatInstructionMessage('user', renderContextPresetText(instruction.userAlignmentMessage, character), character, instruction, { isFirst: true })
    : '';

  return {
    story,
    combinedStory: Number(preset.storyStringPosition) === 1 ? '' : combinedStory,
    formattedExamples,
    rawExamples,
    entries: formattedEntries,
    alignment,
    chatStart: renderContextPresetText(preset.chatStart, character),
    postHistory,
    generationPrefix: textCompletionGenerationPrefix(character, preset, instruction),
  };
}

function assembleSelectedTextCompletionPrompt(components, selectedNewestFirst, selectedExamples, preset, formatting, instruction) {
  // SillyTavern stores selected chat entries newest-first while budgeting, then
  // reverses them back to chronological order before the final concatenation.
  const chronological = [...selectedNewestFirst].reverse();
  const oldestSelected = chronological[0] || null;
  const addAlignment = Boolean(components.alignment) && (!oldestSelected || oldestSelected.role !== 'user');
  const messages = chronological.map(entry => entry.formatted);
  if (addAlignment) messages.unshift(components.alignment);

  // Before appending the final generation line ST removes one terminal newline
  // from the newest history item (when regular wrapping is active).
  if (messages.length) {
    const last = messages.length - 1;
    if (!instruction.enabled || instruction.wrap) messages[last] = messages[last].replace(/\n?$/, '');
    messages[last] += components.generationPrefix;
  } else {
    messages.push(components.generationPrefix);
  }

  let chat = messages.join('');
  if (components.chatStart) chat = `${components.chatStart}\n${chat}`;

  let prompt = `${components.combinedStory}${selectedExamples.join('')}${chat}`.replace(/\r/g, '');
  if (formatting.collapseNewlines) prompt = collapsePromptNewlines(prompt);
  return { prompt, chat, addAlignment };
}

function buildTextCompletionRequest(character, history = [], params = getGenerationParams()) {
  const preset = getActiveContextPreset();
  const formatting = getContextFormatting();
  const instruction = getInstructionTemplate();
  const contextTokens = Math.max(512, Number(params.contextTokens) || DEFAULT_PARAMS.contextTokens);
  const generationReserve = Math.max(1, Number(params.maxTokens) || DEFAULT_PARAMS.maxTokens);
  const promptBudget = Math.max(128, contextTokens - generationReserve);
  const components = prepareTextCompletionComponents(character, history, preset, formatting, instruction);
  const behavior = ['normal', 'keep', 'strip'].includes(formatting.exampleMessagesBehavior)
    ? formatting.exampleMessagesBehavior
    : 'normal';
  const availableExamples = behavior === 'strip' ? [] : [...components.formattedExamples];

  // ST budgets formatted history from newest to oldest. In-chat injections are
  // preallocated first, then ordinary messages are collected newest-first.
  const newestFirst = [...components.entries].reverse();
  const selectedNewestFirst = [];
  const selectedSet = new Set();
  const pinnedExamples = behavior === 'keep' ? availableExamples : [];
  const orderSelected = messages => [...messages].sort((a, b) => newestFirst.indexOf(a) - newestFirst.indexOf(b));
  const candidateResult = (messages, examples) => assembleSelectedTextCompletionPrompt(
    components,
    orderSelected(messages),
    examples,
    preset,
    formatting,
    instruction,
  );
  const fits = (messages, examples) => {
    const candidate = candidateResult(messages, examples);
    // getMessagesTokenCount() in SillyTavern reserves the user-alignment
    // message even when the oldest retained chat line is already a user line.
    const alignmentReserve = components.alignment && !candidate.addAlignment ? estimateTokens(components.alignment) : 0;
    return estimateTokens(candidate.prompt) + alignmentReserve < promptBudget;
  };

  for (let index = 0; index < newestFirst.length; index += 1) {
    const entry = newestFirst[index];
    if (!entry.injectedStory) continue;
    const next = orderSelected([...selectedNewestFirst, entry]);
    if (fits(next, pinnedExamples)) {
      selectedNewestFirst.splice(0, selectedNewestFirst.length, ...next);
      selectedSet.add(index);
    } else {
      break;
    }
  }

  for (let index = 0; index < newestFirst.length; index += 1) {
    if (selectedSet.has(index)) continue;
    const entry = newestFirst[index];
    const next = orderSelected([...selectedNewestFirst, entry]);
    if (fits(next, pinnedExamples)) {
      selectedNewestFirst.splice(0, selectedNewestFirst.length, ...next);
      selectedSet.add(index);
    } else {
      break;
    }
  }

  let selectedExamples = behavior === 'keep' ? [...availableExamples] : [];
  if (behavior === 'normal') {
    for (const example of availableExamples) {
      const next = [...selectedExamples, example];
      if (fits(selectedNewestFirst, next)) selectedExamples.push(example);
      else break;
    }
  }

  // Keep ST's final safety pass: if formatting the final line tips the prompt
  // over budget, discard examples first and then the oldest retained messages.
  let assembled = assembleSelectedTextCompletionPrompt(components, selectedNewestFirst, selectedExamples, preset, formatting, instruction);
  while (estimateTokens(assembled.prompt) > promptBudget && behavior !== 'keep' && selectedExamples.length) {
    selectedExamples = selectedExamples.slice(0, -1);
    assembled = assembleSelectedTextCompletionPrompt(components, selectedNewestFirst, selectedExamples, preset, formatting, instruction);
  }
  while (estimateTokens(assembled.prompt) > promptBudget && selectedNewestFirst.length) {
    // newestFirst ends with the oldest retained message
    selectedNewestFirst.pop();
    assembled = assembleSelectedTextCompletionPrompt(components, selectedNewestFirst, selectedExamples, preset, formatting, instruction);
  }

  const finalPrompt = typeof nvVariableExecute === 'function'
    ? nvVariableExecute(assembled.prompt, typeof nvContextSession === 'function' ? nvContextSession(character) : null).text
    : assembled.prompt;

  return {
    mode: 'text',
    prompt: finalPrompt,
    story: components.story,
    examples: selectedExamples.join(''),
    chat: assembled.chat,
    chatStart: components.chatStart,
    postHistory: components.postHistory,
    stopStrings: buildTextCompletionStopStrings(character, preset, instruction),
    preset,
    instruction,
    formatting,
    promptTokens: estimateTokens(finalPrompt),
    promptBudget,
    overBudget: estimateTokens(finalPrompt) > promptBudget,
    droppedExamples: components.formattedExamples.length - selectedExamples.length,
    droppedMessages: components.entries.length - selectedNewestFirst.length,
    exampleMessagesBehavior: behavior,
  };
}

function trimIncompleteSentence(value) {
  const text = String(value || '').trimEnd();
  if (!text || /[.!?…](?:["'”’\)\]\}*_~]+)?$/.test(text)) return text;
  const matches = [...text.matchAll(/[.!?…](?:["'”’\)\]\}*_~]+)?(?=\s|$)/g)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return text.slice(0, last.index + last[0].length).trimEnd();
}

function truncateAtStopStrings(value, stopStrings = []) {
  const text = String(value || '');
  let cut = text.length;
  for (const stop of stopStrings) {
    const marker = String(stop || '');
    if (!marker) continue;
    const index = text.indexOf(marker);
    if (index >= 0 && index < cut) cut = index;
  }
  return text.slice(0, cut);
}

function postProcessTextCompletionResponse(value, preset = getActiveContextPreset(), formatting = getContextFormatting(), stopStrings = []) {
  let output = truncateAtStopStrings(value, stopStrings).replaceAll('\r\n', '\n').replace(/^\n+/, '');
  if (preset.singleLine) output = output.split('\n', 1)[0];
  if (preset.trimSentences) output = trimIncompleteSentence(output);
  if (formatting.trimSpaces) {
    output = output.split('\n').map(line => line.trim()).join('\n').trim();
  }
  return output;
}

function promptPreviewHistory(character) {
  const saved = NV.promptHistory || nvContextSession(character)?.messages;
  if (Array.isArray(saved) && saved.length) {
    return saved.map(message => ({ ...message }));
  }
  const fallback = [];
  if (character.firstMessage?.trim()) fallback.push({ role: 'assistant', content: character.firstMessage.trim() });
  fallback.push({ role: 'user', content: t('globalPrompt.preview.sampleUser') });
  return fallback;
}

function buildTextCompletionPreview(character) {
  return buildTextCompletionRequest(character, promptPreviewHistory(character), getGenerationParams());
}

function buildChatCompletionPreview(character) {
  return {
    mode: 'chat',
    messages: buildChatCompletionMessages(character, promptPreviewHistory(character)),
  };
}

function buildPromptPreview(character, mode = 'chat') {
  const result = mode === 'text' ? buildTextCompletionPreview(character) : buildChatCompletionPreview(character);
  return {
    ...result,
    tokenCounts: characterTokenCounts(character),
    contextSource: String(character.contextTemplate || '').trim() ? 'character' : 'global',
    systemSource: String(character.systemPrompt || '').trim() ? 'character' : 'global',
    postHistorySource: String(character.postHistoryInstructions || '').trim() ? 'character' : 'global',
  };
}

function promptPreviewSourceLabel(source) {
  return t(source === 'character' ? 'globalPrompt.preview.source.character' : 'globalPrompt.preview.source.global');
}

function renderPromptPreviewTab(body) {
  const characters = getNormalizedCharacters();
  const saved = localStorage.getItem(STORAGE.promptPreviewCharacter);
  const selected = characters.find(character => character.id === saved)
    || characters.find(character => character.id === state.activeCharacterId)
    || characters[0]
    || null;
  const savedMode = localStorage.getItem(STORAGE.promptPreviewMode);
  const mode = ['auto', 'chat', 'text'].includes(savedMode) ? savedMode : 'auto';

  body.innerHTML = `${globalPromptTabs('preview')}
    <div class="field-card field-card-stack global-prompt-card prompt-preview-card">
      <div class="info"><h4>${escapeHtml(t('globalPrompt.preview.title'))}</h4><p>${escapeHtml(t('globalPrompt.preview.desc'))}</p></div>
      <div class="prompt-preview-controls">
        ${characters.length ? `<label class="form-field prompt-preview-character"><span>${escapeHtml(t('globalPrompt.preview.character'))}</span><select id="prompt-preview-character">${characters.map(character => `<option value="${escapeHtml(character.id)}" ${character.id === selected?.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>`).join('')}</select></label>` : ''}
        <label class="form-field prompt-preview-mode"><span>${escapeHtml(t('globalPrompt.preview.mode'))}</span><select id="prompt-preview-mode"><option value="auto" ${mode === 'auto' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.preview.mode.auto'))}</option><option value="chat" ${mode === 'chat' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.preview.mode.chat'))}</option><option value="text" ${mode === 'text' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.preview.mode.text'))}</option></select></label>
      </div>
      <div id="prompt-preview-content"></div>
    </div>`;

  const content = document.getElementById('prompt-preview-content');
  const draw = (character, selectedMode) => {
    const previewMode = selectedMode === 'auto' ? effectiveBackendApiMode(state.backendConfig) : selectedMode;
    if (!character) {
      content.innerHTML = `<div class="empty-state prompt-preview-empty"><h3>${escapeHtml(t('globalPrompt.preview.emptyTitle'))}</h3><p>${escapeHtml(t('globalPrompt.preview.emptyBody'))}</p></div>`;
      return;
    }
    const preview = buildPromptPreview(character, previewMode);
    const commonMeta = `
      <div class="prompt-preview-meta">
        <span>${escapeHtml(t('globalPrompt.preview.systemSource'))}: <strong>${escapeHtml(promptPreviewSourceLabel(preview.systemSource))}</strong></span>
        <span>${escapeHtml(t('globalPrompt.preview.postHistorySource'))}: <strong>${escapeHtml(promptPreviewSourceLabel(preview.postHistorySource))}</strong></span>
        <span>${escapeHtml(t('character.tokens.permanent'))}: <strong>${preview.tokenCounts.permanent}</strong></span>
        <span>${escapeHtml(t('character.tokens.total'))}: <strong>${preview.tokenCounts.total}</strong></span>
      </div>`;
    if (previewMode === 'chat') {
      content.innerHTML = `${commonMeta}
        <div class="global-prompt-note">${escapeHtml(t('globalPrompt.preview.chatNote'))}</div>
        <section class="prompt-preview-section">
          <h5>${escapeHtml(t('globalPrompt.preview.finalChat'))}</h5>
          <pre>${escapeHtml(JSON.stringify(preview.messages.map(m => ({...m,content:nvReadableContent(m.content)})), null, 2))}</pre>
        </section>`;
      return;
    }

    content.innerHTML = `${commonMeta}
      <div class="prompt-preview-meta"><span>${escapeHtml(t('globalPrompt.preview.contextSource'))}: <strong>${escapeHtml(promptPreviewSourceLabel(preview.contextSource))}</strong></span><span>${escapeHtml(t('globalPrompt.preview.contextPreset'))}: <strong>${escapeHtml(preview.preset.name)}</strong></span><span>${escapeHtml(t('globalPrompt.preview.instructionPreset'))}: <strong>${escapeHtml(preview.instruction?.enabled ? preview.instruction.name : t('globalPrompt.preview.disabled'))}</strong></span><span>${escapeHtml(t('globalPrompt.preview.budget'))}: <strong>${preview.promptTokens}/${preview.promptBudget}</strong></span></div>
      ${preview.droppedExamples || preview.droppedMessages || preview.overBudget ? `<div class="global-prompt-note ${preview.overBudget ? 'is-warning' : ''}">${escapeHtml(t('globalPrompt.preview.contextTrimmed', { examples: preview.droppedExamples, messages: preview.droppedMessages }))}${preview.overBudget ? ` ${escapeHtml(t('globalPrompt.preview.overBudget'))}` : ''}</div>` : ''}
      <div class="global-prompt-note">${escapeHtml(t('globalPrompt.preview.textNote'))}</div>
      <section class="prompt-preview-section">
        <h5>${escapeHtml(t('globalPrompt.preview.finalText'))}</h5>
        <pre>${escapeHtml(preview.prompt)}</pre>
      </section>
      <details class="prompt-preview-breakdown">
        <summary>${escapeHtml(t('globalPrompt.preview.breakdown'))}</summary>
        <div class="prompt-preview-breakdown-body">
          <section class="prompt-preview-section"><h5>${escapeHtml(t('globalPrompt.preview.storyString'))}</h5><pre>${escapeHtml(preview.story)}</pre></section>
          <section class="prompt-preview-section"><h5>${escapeHtml(t('globalPrompt.preview.examples'))}</h5><pre>${escapeHtml(preview.examples || t('globalPrompt.preview.none'))}</pre></section>
          <section class="prompt-preview-section"><h5>${escapeHtml(t('globalPrompt.preview.chatBlock'))}</h5><pre>${escapeHtml(preview.chat || t('globalPrompt.preview.none'))}</pre></section>
          <section class="prompt-preview-section"><h5>${escapeHtml(t('globalPrompt.preview.stopStrings'))}</h5><pre>${escapeHtml(preview.stopStrings.length ? JSON.stringify(preview.stopStrings, null, 2) : t('globalPrompt.preview.none'))}</pre></section>
          <section class="prompt-preview-section"><h5>${escapeHtml(t('globalPrompt.preview.instructionSequences'))}</h5><pre>${escapeHtml(preview.instruction?.enabled ? JSON.stringify(instructionPresetToSillyTavernJson(preview.instruction), null, 2) : t('globalPrompt.preview.disabled'))}</pre></section>
          <div class="prompt-preview-behavior">
            <span>${escapeHtml(t('globalPrompt.context.singleLine'))}: <strong>${preview.preset.singleLine ? '✓' : '—'}</strong></span>
            <span>${escapeHtml(t('globalPrompt.context.trimSentences'))}: <strong>${preview.preset.trimSentences ? '✓' : '—'}</strong></span>
            <span>${escapeHtml(t('globalPrompt.context.trimSpaces'))}: <strong>${preview.formatting.trimSpaces ? '✓' : '—'}</strong></span>
            <span>${escapeHtml(t('globalPrompt.context.collapseNewlines'))}: <strong>${preview.formatting.collapseNewlines ? '✓' : '—'}</strong></span>
            <span>${escapeHtml(t('globalPrompt.context.exampleBehavior'))}: <strong>${escapeHtml(t(`globalPrompt.context.exampleBehavior.${preview.exampleMessagesBehavior}`))}</strong></span>
          </div>
        </div>
      </details>`;
  };

  draw(selected, mode);
  document.getElementById('prompt-preview-character')?.addEventListener('change', event => {
    const character = characters.find(item => item.id === event.target.value) || null;
    if (character) localStorage.setItem(STORAGE.promptPreviewCharacter, character.id);
    draw(character, document.getElementById('prompt-preview-mode').value);
  });
  document.getElementById('prompt-preview-mode')?.addEventListener('change', event => {
    localStorage.setItem(STORAGE.promptPreviewMode, event.target.value);
    const characterId = document.getElementById('prompt-preview-character')?.value;
    const character = characters.find(item => item.id === characterId) || selected;
    draw(character, event.target.value);
  });
}

function instructionField(id, labelKey, value, rows = 2, hintKey = '') {
  return `<label class="form-field instruction-sequence-field"><span>${escapeHtml(t(labelKey))}</span><textarea id="${id}" rows="${rows}" spellcheck="false">${escapeHtml(value)}</textarea>${hintKey ? `<small class="field-hint">${escapeHtml(t(hintKey))}</small>` : ''}</label>`;
}

function instructionPresetToSillyTavernJson(preset) {
  return {
    input_sequence: preset.inputSequence,
    output_sequence: preset.outputSequence,
    last_output_sequence: preset.lastOutputSequence,
    system_sequence: preset.systemSequence,
    stop_sequence: preset.stopSequence,
    wrap: Boolean(preset.wrap),
    macro: Boolean(preset.macro),
    names_behavior: preset.namesBehavior,
    activation_regex: preset.activationRegex,
    first_output_sequence: preset.firstOutputSequence,
    skip_examples: Boolean(preset.skipExamples),
    output_suffix: preset.outputSuffix,
    input_suffix: preset.inputSuffix,
    system_suffix: preset.systemSuffix,
    user_alignment_message: preset.userAlignmentMessage,
    system_same_as_user: Boolean(preset.systemSameAsUser),
    last_system_sequence: preset.lastSystemSequence,
    first_input_sequence: preset.firstInputSequence,
    last_input_sequence: preset.lastInputSequence,
    sequences_as_stop_strings: Boolean(preset.sequencesAsStopStrings),
    story_string_prefix: preset.storyStringPrefix,
    story_string_suffix: preset.storyStringSuffix,
    name: preset.name,
  };
}

function downloadJsonFile(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function instructionPresetToolbar(presetState) {
  const presets = allInstructionPresets(presetState);
  const active = resolveInstructionPreset(presetState.active, presetState);
  const builtIn = Boolean(instructionPresetFactoryEntry(active.name));
  const custom = Boolean(instructionPresetCustomEntry(active.name, presetState));
  return `<div class="context-preset-toolbar instruction-preset-toolbar">
    <label class="form-field context-preset-select-field"><span>${escapeHtml(t('globalPrompt.instruction.preset'))}</span>
      <select id="instruction-preset-select">${presets.map(preset => `<option value="${escapeHtml(preset.name)}" ${preset.name === active.name ? 'selected' : ''}>${escapeHtml(preset.name)}${preset.modified && preset.builtIn ? ' *' : ''}</option>`).join('')}</select>
    </label>
    <div class="context-preset-actions">
      <button type="button" class="btn btn-ghost" id="instruction-preset-save">${escapeHtml(t('globalPrompt.presets.save'))}</button>
      <button type="button" class="btn btn-ghost" id="instruction-preset-new">${escapeHtml(t('globalPrompt.presets.new'))}</button>
      <button type="button" class="btn btn-ghost" id="instruction-preset-rename">${escapeHtml(t('globalPrompt.presets.rename'))}</button>
      <button type="button" class="btn btn-ghost" id="instruction-preset-import">${escapeHtml(t('globalPrompt.presets.import'))}</button>
      <button type="button" class="btn btn-ghost" id="instruction-preset-export">${escapeHtml(t('globalPrompt.presets.export'))}</button>
      <input type="file" id="instruction-preset-import-file" accept=".json,.settings,application/json" hidden>
      <button type="button" class="btn btn-ghost" id="instruction-preset-restore" ${builtIn && presetState.overrides?.[active.name] ? '' : 'disabled'}>${escapeHtml(t('globalPrompt.presets.restore'))}</button>
      <button type="button" class="btn btn-ghost" id="instruction-preset-delete" ${custom ? '' : 'disabled'}>${escapeHtml(t('globalPrompt.presets.delete'))}</button>
    </div>
  </div>`;
}

function instructionPresetEditorValues() {
  return normalizeInstructionPresetRecord({
    name: getInstructionPresetState().active,
    activation_regex: document.getElementById('instruction-activation-regex').value,
    wrap: document.getElementById('instruction-wrap-newline').checked,
    macro: document.getElementById('instruction-macro').checked,
    sequences_as_stop_strings: document.getElementById('instruction-sequences-stop').checked,
    skip_examples: document.getElementById('instruction-skip-examples').checked,
    names_behavior: document.getElementById('instruction-names-behavior').value,
    story_string_prefix: document.getElementById('instruction-story-prefix').value,
    story_string_suffix: document.getElementById('instruction-story-suffix').value,
    input_sequence: document.getElementById('instruction-user-prefix').value,
    input_suffix: document.getElementById('instruction-user-suffix').value,
    first_input_sequence: document.getElementById('instruction-first-user-prefix').value,
    last_input_sequence: document.getElementById('instruction-last-user-prefix').value,
    output_sequence: document.getElementById('instruction-assistant-prefix').value,
    output_suffix: document.getElementById('instruction-assistant-suffix').value,
    first_output_sequence: document.getElementById('instruction-first-assistant-prefix').value,
    last_output_sequence: document.getElementById('instruction-last-assistant-prefix').value,
    system_sequence: document.getElementById('instruction-system-prefix').value,
    system_suffix: document.getElementById('instruction-system-suffix').value,
    last_system_sequence: document.getElementById('instruction-last-system-prefix').value,
    system_same_as_user: document.getElementById('instruction-system-same-user').checked,
    stop_sequence: document.getElementById('instruction-stop-sequence').value,
    user_alignment_message: document.getElementById('instruction-user-alignment').value,
  }, getInstructionPresetState().active);
}

function instructionPresetNameExists(name, presetState = getInstructionPresetState(), exceptName = null) {
  const normalized = String(name || '').trim().toLocaleLowerCase();
  return allInstructionPresets(presetState).some(preset => preset.name !== exceptName && preset.name.toLocaleLowerCase() === normalized);
}

function renderInstructionPromptTab(body) {
  const presetState = getInstructionPresetState();
  const template = resolveInstructionPreset(presetState.active, presetState);
  body.innerHTML = `${globalPromptTabs('instruction')}
    <div class="field-card field-card-stack global-prompt-card">
      <div class="info"><h4>${escapeHtml(t('globalPrompt.instructionTemplate'))}</h4><p>${escapeHtml(t('globalPrompt.instructionTemplate.desc'))}</p></div>
      ${instructionPresetToolbar(presetState)}
      <div class="instruction-runtime-bar">
        <label class="toggle-row"><input type="checkbox" id="instruction-enabled" ${presetState.enabled ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.enabled'))}</span></label>
        <label class="toggle-row"><input type="checkbox" id="instruction-bind-context" ${presetState.bindToContext ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.bindContext'))}</span></label>
        <label class="toggle-row" title="${escapeHtml(t('globalPrompt.instruction.deriveModel.hint'))}"><input type="checkbox" id="instruction-derive-model" ${presetState.deriveFromModel ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.deriveModel'))}</span></label>
      </div>
      <label class="form-field"><span>${escapeHtml(t('globalPrompt.instruction.activationRegex'))}</span><input id="instruction-activation-regex" type="text" value="${escapeHtml(template.activationRegex)}" placeholder="${escapeHtml(t('globalPrompt.instruction.activationRegex.placeholder'))}"><small class="field-hint">${escapeHtml(t('globalPrompt.instruction.activationRegex.hint'))}</small></label>
      <div class="instruction-options-grid instruction-options-grid-wide">
        <label class="toggle-row"><input type="checkbox" id="instruction-wrap-newline" ${template.wrap ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.wrapNewline'))}</span></label>
        <label class="toggle-row"><input type="checkbox" id="instruction-macro" ${template.macro ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.macro'))}</span></label>
        <label class="toggle-row"><input type="checkbox" id="instruction-sequences-stop" ${template.sequencesAsStopStrings ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.sequencesStop'))}</span></label>
        <label class="toggle-row"><input type="checkbox" id="instruction-skip-examples" ${template.skipExamples ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.skipExamples'))}</span></label>
        <label class="form-field instruction-name-select"><span>${escapeHtml(t('globalPrompt.instruction.includeNames'))}</span><select id="instruction-names-behavior"><option value="none" ${template.namesBehavior === 'none' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.instruction.names.never'))}</option><option value="force" ${template.namesBehavior === 'force' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.instruction.names.force'))}</option><option value="always" ${template.namesBehavior === 'always' ? 'selected' : ''}>${escapeHtml(t('globalPrompt.instruction.names.always'))}</option></select></label>
      </div>

      <details class="instruction-sequence-section" open><summary>${escapeHtml(t('globalPrompt.instruction.section.story'))}</summary><div class="instruction-sequence-grid">
        ${instructionField('instruction-story-prefix', 'globalPrompt.instruction.storyPrefix', template.storyStringPrefix, 3)}
        ${instructionField('instruction-story-suffix', 'globalPrompt.instruction.storySuffix', template.storyStringSuffix, 3)}
      </div></details>
      <details class="instruction-sequence-section" open><summary>${escapeHtml(t('globalPrompt.instruction.section.user'))}</summary><div class="instruction-sequence-grid">
        ${instructionField('instruction-user-prefix', 'globalPrompt.instruction.userPrefix', template.inputSequence, 3)}
        ${instructionField('instruction-user-suffix', 'globalPrompt.instruction.userSuffix', template.inputSuffix, 3)}
      </div></details>
      <details class="instruction-sequence-section" open><summary>${escapeHtml(t('globalPrompt.instruction.section.assistant'))}</summary><div class="instruction-sequence-grid">
        ${instructionField('instruction-assistant-prefix', 'globalPrompt.instruction.assistantPrefix', template.outputSequence, 3)}
        ${instructionField('instruction-assistant-suffix', 'globalPrompt.instruction.assistantSuffix', template.outputSuffix, 3)}
      </div></details>
      <details class="instruction-sequence-section" open><summary>${escapeHtml(t('globalPrompt.instruction.section.system'))}</summary><div class="instruction-sequence-grid">
        ${instructionField('instruction-system-prefix', 'globalPrompt.instruction.systemPrefix', template.systemSequence, 3)}
        ${instructionField('instruction-system-suffix', 'globalPrompt.instruction.systemSuffix', template.systemSuffix, 3)}
        <label class="toggle-row instruction-system-same"><input type="checkbox" id="instruction-system-same-user" ${template.systemSameAsUser ? 'checked' : ''}><span>${escapeHtml(t('globalPrompt.instruction.systemSameUser'))}</span></label>
      </div></details>
      <details class="instruction-sequence-section" open><summary>${escapeHtml(t('globalPrompt.instruction.section.misc'))}</summary><div class="instruction-sequence-grid">
        ${instructionField('instruction-first-assistant-prefix', 'globalPrompt.instruction.firstAssistantPrefix', template.firstOutputSequence, 2)}
        ${instructionField('instruction-last-assistant-prefix', 'globalPrompt.instruction.lastAssistantPrefix', template.lastOutputSequence, 2)}
        ${instructionField('instruction-first-user-prefix', 'globalPrompt.instruction.firstUserPrefix', template.firstInputSequence, 2)}
        ${instructionField('instruction-last-user-prefix', 'globalPrompt.instruction.lastUserPrefix', template.lastInputSequence, 2)}
        ${instructionField('instruction-last-system-prefix', 'globalPrompt.instruction.lastSystemPrefix', template.lastSystemSequence, 2)}
        ${instructionField('instruction-stop-sequence', 'globalPrompt.instruction.stopSequence', template.stopSequence, 2)}
        ${instructionField('instruction-user-alignment', 'globalPrompt.instruction.userAlignment', template.userAlignmentMessage, 3, 'globalPrompt.instruction.userAlignment.hint')}
      </div></details>
      <div class="global-prompt-note">${escapeHtml(t('globalPrompt.instruction.chatCompletionNote'))}</div>
    </div>`;

  const select = document.getElementById('instruction-preset-select');
  const systemSame = document.getElementById('instruction-system-same-user');
  const syncSystemFields = () => {
    const disabled = systemSame.checked;
    ['instruction-system-prefix', 'instruction-system-suffix'].forEach(id => {
      const field = document.getElementById(id);
      if (!field) return;
      field.readOnly = disabled;
      field.closest('.form-field')?.classList.toggle('is-disabled', disabled);
    });
  };
  systemSame.addEventListener('change', syncSystemFields);
  syncSystemFields();
  select.addEventListener('change', () => { setActiveInstructionPreset(select.value); renderGlobalPromptConfig('instruction'); });

  const saveRuntime = () => {
    const current = getInstructionPresetState();
    current.enabled = document.getElementById('instruction-enabled').checked;
    current.bindToContext = document.getElementById('instruction-bind-context').checked;
    current.deriveFromModel = document.getElementById('instruction-derive-model').checked;
    saveInstructionPresetState(current);
    if (current.enabled && current.bindToContext) syncContextPresetToInstruction(current.active);
  };
  document.getElementById('instruction-enabled').addEventListener('change', () => { saveRuntime(); renderGlobalPromptConfig('instruction'); });
  document.getElementById('instruction-bind-context').addEventListener('change', () => { saveRuntime(); renderGlobalPromptConfig('instruction'); });
  document.getElementById('instruction-derive-model').addEventListener('change', () => { saveRuntime(); refreshModelStatus(); });

  document.getElementById('instruction-preset-save').addEventListener('click', () => {
    const current = getInstructionPresetState();
    const values = instructionPresetEditorValues();
    const custom = instructionPresetCustomEntry(current.active, current);
    if (custom) Object.assign(custom, values, { name: current.active });
    else current.overrides[current.active] = normalizeInstructionPresetOverride(values);
    current.enabled = document.getElementById('instruction-enabled').checked;
    current.bindToContext = document.getElementById('instruction-bind-context').checked;
    current.deriveFromModel = document.getElementById('instruction-derive-model').checked;
    saveInstructionPresetState(current);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.instruction.saved'), 'success');
  });

  document.getElementById('instruction-preset-new').addEventListener('click', () => {
    const current = getInstructionPresetState();
    const name = String(window.prompt(t('globalPrompt.presets.newPrompt'), '') || '').trim();
    if (!name) return;
    if (instructionPresetNameExists(name, current)) return toast(t('globalPrompt.presets.nameExists'), 'error');
    current.custom.push(normalizeInstructionPresetRecord({ ...instructionPresetEditorValues(), name }, name));
    current.active = name;
    saveInstructionPresetState(current);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.presets.created'), 'success');
  });

  document.getElementById('instruction-preset-rename').addEventListener('click', () => {
    const current = getInstructionPresetState();
    const oldName = current.active;
    const name = String(window.prompt(t('globalPrompt.presets.renamePrompt', { name: oldName }), oldName) || '').trim();
    if (!name || name === oldName) return;
    if (instructionPresetNameExists(name, current, oldName)) return toast(t('globalPrompt.presets.nameExists'), 'error');
    const values = instructionPresetEditorValues();
    const custom = instructionPresetCustomEntry(oldName, current);
    if (custom) Object.assign(custom, values, { name });
    else current.custom.push(normalizeInstructionPresetRecord({ ...values, name }, name));
    current.active = name;
    saveInstructionPresetState(current);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.presets.renamed'), 'success');
  });

  document.getElementById('instruction-preset-export').addEventListener('click', () => {
    const current = getInstructionPresetState();
    const preset = resolveInstructionPreset(current.active, current);
    const filename = `${preset.name.replace(/[^a-z0-9._-]+/gi, '_') || 'instruct-preset'}.json`;
    downloadJsonFile(filename, instructionPresetToSillyTavernJson(preset));
  });

  const importFile = document.getElementById('instruction-preset-import-file');
  document.getElementById('instruction-preset-import').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const current = getInstructionPresetState();
      let name = String(raw?.name || file.name.replace(/\.(?:json|settings)$/i, '') || '').trim();
      if (!name) throw new Error(t('globalPrompt.instruction.importInvalid'));
      if (instructionPresetNameExists(name, current)) {
        name = String(window.prompt(t('globalPrompt.presets.renamePrompt', { name }), `${name} (Imported)`) || '').trim();
        if (!name) return;
        if (instructionPresetNameExists(name, current)) return toast(t('globalPrompt.presets.nameExists'), 'error');
      }
      const preset = normalizeInstructionPresetRecord({ ...raw, name }, name);
      current.custom.push(preset);
      current.active = name;
      saveInstructionPresetState(current);
      renderGlobalPromptConfig('instruction');
      toast(t('globalPrompt.instruction.imported'), 'success');
    } catch (error) {
      console.error('[prompt] Unable to import instruction preset.', error);
      toast(error?.message || t('globalPrompt.instruction.importInvalid'), 'error');
    }
  });

  document.getElementById('instruction-preset-restore').addEventListener('click', () => {
    const current = getInstructionPresetState();
    if (!instructionPresetFactoryEntry(current.active)) return;
    if (!window.confirm(t('globalPrompt.presets.restoreConfirm', { name: current.active }))) return;
    delete current.overrides[current.active];
    saveInstructionPresetState(current);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.presets.restored'), 'success');
  });

  document.getElementById('instruction-preset-delete').addEventListener('click', () => {
    const current = getInstructionPresetState();
    if (!instructionPresetCustomEntry(current.active, current)) return;
    if (!window.confirm(t('globalPrompt.presets.deleteConfirm', { name: current.active }))) return;
    current.custom = current.custom.filter(item => item.name !== current.active);
    current.active = defaultInstructionPresetName();
    saveInstructionPresetState(current);
    renderGlobalPromptConfig('instruction');
    toast(t('globalPrompt.presets.deleted'), 'success');
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
  else if (active === 'preview') renderPromptPreviewTab(body);
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
    ${numberField('maxTokens', t('params.maxTokens'), t('params.maxTokens.desc'), params.maxTokens, 16, 32768, 16)}
    ${numberField('contextTokens', t('params.contextTokens'), t('params.contextTokens.desc'), params.contextTokens, 512, 1048576, 256)} `;
  document.getElementById('save-params').addEventListener('click', () => {
    const next = {
      temperature: Number(document.getElementById('param-temperature').value),
      topP: Number(document.getElementById('param-topP').value),
      maxTokens: Number(document.getElementById('param-maxTokens').value),
      contextTokens: Number(document.getElementById('param-contextTokens').value),
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
   Markdown personalization
=================================================================== */

const MARKDOWN_STYLE_TOKENS = [
  'text', 'text-dim', 'text-faint', 'magenta', 'violet', 'violet-2',
  'line', 'panel', 'panel-2', 'void', 'ok', 'danger',
];
const MARKDOWN_NONE = 'none';
const MARKDOWN_STYLE_TYPES = [
  { id:'paragraph', labelKey:'personalization.markdown.paragraph', selector:'.nv-markdown-surface p', example:'...' },
  { id:'h1', labelKey:'personalization.markdown.h1', selector:'.nv-markdown-surface h1', example:'# ...' },
  { id:'h2', labelKey:'personalization.markdown.h2', selector:'.nv-markdown-surface h2', example:'## ...' },
  { id:'h3', labelKey:'personalization.markdown.h3', selector:'.nv-markdown-surface h3', example:'### ...' },
  { id:'h4', labelKey:'personalization.markdown.h4', selector:'.nv-markdown-surface h4', example:'#### ...' },
  { id:'h5', labelKey:'personalization.markdown.h5', selector:'.nv-markdown-surface h5', example:'##### ...' },
  { id:'h6', labelKey:'personalization.markdown.h6', selector:'.nv-markdown-surface h6', example:'###### ...' },
  { id:'strong', labelKey:'personalization.markdown.bold', selector:'.nv-markdown-surface strong', example:'**...**' },
  { id:'emphasis', labelKey:'personalization.markdown.italic', selector:'.nv-markdown-surface em', example:'*...*' },
  { id:'dialogue', labelKey:'personalization.markdown.dialogue', selector:'.nv-markdown-surface .nv-md-dialogue', example:'"..." / «...»' },
  { id:'strike', labelKey:'personalization.markdown.strike', selector:'.nv-markdown-surface del', example:'~~...~~' },
  { id:'link', labelKey:'personalization.markdown.link', selector:'.nv-markdown-surface a', example:'[...](https://example.com)' },
  { id:'inlineCode', labelKey:'personalization.markdown.inlineCode', selector:'.nv-markdown-surface :not(pre) > code', example:'`...`' },
  { id:'codeBlock', labelKey:'personalization.markdown.codeBlock', selector:'.nv-markdown-surface pre', example:'```\n...\n```' },
  { id:'quote', labelKey:'personalization.markdown.quote', selector:'.nv-markdown-surface blockquote', example:'> ...' },
  { id:'unorderedList', labelKey:'personalization.markdown.unorderedList', selector:'.nv-markdown-surface ul', example:'- ...\n- ...' },
  { id:'orderedList', labelKey:'personalization.markdown.orderedList', selector:'.nv-markdown-surface ol', example:'1. ...\n2. ...' },
  { id:'listItem', labelKey:'personalization.markdown.listItem', selector:'.nv-markdown-surface li', example:'- ...' },
  { id:'rule', labelKey:'personalization.markdown.rule', selector:'.nv-markdown-surface hr', example:'---' },
  { id:'table', labelKey:'personalization.markdown.table', selector:'.nv-markdown-surface table', example:'| A | B |\n| --- | --- |\n| ... | ... |' },
  { id:'tableHeader', labelKey:'personalization.markdown.tableHeader', selector:'.nv-markdown-surface th', example:'| A | B |\n| --- | --- |' },
  { id:'tableCell', labelKey:'personalization.markdown.tableCell', selector:'.nv-markdown-surface td', example:'| ... | ... |' },
];
const DEFAULT_MARKDOWN_STYLES = {
  paragraph:{ color:'text', background:'none', border:'none', fontSize:14, fontWeight:400, fontStyle:'normal', lineHeight:1.75, radius:0, paddingY:0, paddingX:0, marginY:7 },
  h1:{ color:'magenta', background:'none', border:'none', fontSize:24, fontWeight:800, fontStyle:'normal', lineHeight:1.25, radius:0, paddingY:0, paddingX:0, marginY:14 },
  h2:{ color:'violet-2', background:'none', border:'none', fontSize:21, fontWeight:800, fontStyle:'normal', lineHeight:1.3, radius:0, paddingY:0, paddingX:0, marginY:12 },
  h3:{ color:'text', background:'none', border:'none', fontSize:18, fontWeight:750, fontStyle:'normal', lineHeight:1.35, radius:0, paddingY:0, paddingX:0, marginY:10 },
  h4:{ color:'text', background:'none', border:'none', fontSize:16, fontWeight:700, fontStyle:'normal', lineHeight:1.4, radius:0, paddingY:0, paddingX:0, marginY:9 },
  h5:{ color:'text-dim', background:'none', border:'none', fontSize:14, fontWeight:700, fontStyle:'normal', lineHeight:1.45, radius:0, paddingY:0, paddingX:0, marginY:8 },
  h6:{ color:'text-faint', background:'none', border:'none', fontSize:12, fontWeight:800, fontStyle:'normal', lineHeight:1.45, radius:0, paddingY:0, paddingX:0, marginY:8 },
  strong:{ color:'text', background:'none', border:'none', fontSize:0, fontWeight:800, fontStyle:'normal', lineHeight:0, radius:0, paddingY:0, paddingX:0, marginY:0 },
  emphasis:{ color:'text-dim', background:'none', border:'none', fontSize:0, fontWeight:400, fontStyle:'italic', lineHeight:0, radius:0, paddingY:0, paddingX:0, marginY:0 },
  dialogue:{ color:'text', background:'none', border:'none', fontSize:0, fontWeight:500, fontStyle:'normal', lineHeight:0, radius:0, paddingY:0, paddingX:0, marginY:0 },
  strike:{ color:'text-faint', background:'none', border:'none', fontSize:0, fontWeight:400, fontStyle:'normal', lineHeight:0, radius:0, paddingY:0, paddingX:0, marginY:0 },
  link:{ color:'magenta', background:'none', border:'none', fontSize:0, fontWeight:650, fontStyle:'normal', lineHeight:0, radius:0, paddingY:0, paddingX:0, marginY:0 },
  inlineCode:{ color:'magenta', background:'panel-2', border:'line', fontSize:13, fontWeight:600, fontStyle:'normal', lineHeight:1.55, radius:5, paddingY:2, paddingX:5, marginY:0 },
  codeBlock:{ color:'text', background:'void', border:'line', fontSize:12, fontWeight:400, fontStyle:'normal', lineHeight:1.65, radius:10, paddingY:12, paddingX:14, marginY:10 },
  quote:{ color:'text-dim', background:'panel-2', border:'violet-2', fontSize:14, fontWeight:400, fontStyle:'italic', lineHeight:1.7, radius:8, paddingY:10, paddingX:13, marginY:10 },
  unorderedList:{ color:'text', background:'none', border:'none', fontSize:14, fontWeight:400, fontStyle:'normal', lineHeight:1.7, radius:0, paddingY:0, paddingX:0, marginY:8 },
  orderedList:{ color:'text', background:'none', border:'none', fontSize:14, fontWeight:400, fontStyle:'normal', lineHeight:1.7, radius:0, paddingY:0, paddingX:0, marginY:8 },
  listItem:{ color:'text', background:'none', border:'none', fontSize:14, fontWeight:400, fontStyle:'normal', lineHeight:1.7, radius:0, paddingY:0, paddingX:0, marginY:2 },
  rule:{ color:'line', background:'none', border:'none', fontSize:1, fontWeight:400, fontStyle:'normal', lineHeight:1, radius:0, paddingY:0, paddingX:0, marginY:14 },
  table:{ color:'text', background:'panel', border:'line', fontSize:13, fontWeight:400, fontStyle:'normal', lineHeight:1.55, radius:9, paddingY:0, paddingX:0, marginY:10 },
  tableHeader:{ color:'text', background:'panel-2', border:'line', fontSize:12, fontWeight:800, fontStyle:'normal', lineHeight:1.5, radius:0, paddingY:8, paddingX:10, marginY:0 },
  tableCell:{ color:'text-dim', background:'none', border:'line', fontSize:12, fontWeight:400, fontStyle:'normal', lineHeight:1.55, radius:0, paddingY:8, paddingX:10, marginY:0 },
};

const DIALOGUE_QUOTE_MODES = {
  straight: { open: '"', close: '"', example: '"..."' },
  french: { open: '«', close: '»', example: '«...»' },
};
function getDialogueQuoteMode() {
  const saved = localStorage.getItem(STORAGE.dialogueQuotes);
  return Object.prototype.hasOwnProperty.call(DIALOGUE_QUOTE_MODES, saved) ? saved : 'straight';
}
function saveDialogueQuoteMode(mode) {
  const safe = Object.prototype.hasOwnProperty.call(DIALOGUE_QUOTE_MODES, mode) ? mode : 'straight';
  localStorage.setItem(STORAGE.dialogueQuotes, safe);
  return safe;
}
function dialogueQuoteExample() {
  return DIALOGUE_QUOTE_MODES[getDialogueQuoteMode()]?.example || DIALOGUE_QUOTE_MODES.straight.example;
}

function markdownTokenCss(token, fallback = 'text') {
  const safe = MARKDOWN_STYLE_TOKENS.includes(token) ? token : fallback;
  return `var(--${safe})`;
}
function normalizeMarkdownStyle(id, input = {}) {
  const base = DEFAULT_MARKDOWN_STYLES[id] || DEFAULT_MARKDOWN_STYLES.paragraph;
  const n = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const inheritsTypography = ['strong','emphasis','dialogue','strike','link'].includes(id);
  return {
    color: MARKDOWN_STYLE_TOKENS.includes(input.color) ? input.color : base.color,
    background: input.background === MARKDOWN_NONE || MARKDOWN_STYLE_TOKENS.includes(input.background) ? input.background : base.background,
    border: input.border === MARKDOWN_NONE || MARKDOWN_STYLE_TOKENS.includes(input.border) ? input.border : base.border,
    fontSize: n(input.fontSize, base.fontSize, inheritsTypography ? 0 : 8, 48),
    fontWeight: n(input.fontWeight, base.fontWeight, 300, 900),
    fontStyle: input.fontStyle === 'italic' ? 'italic' : 'normal',
    lineHeight: n(input.lineHeight, base.lineHeight, inheritsTypography ? 0 : 1, 2.5),
    radius: n(input.radius, base.radius, 0, 28),
    paddingY: n(input.paddingY, base.paddingY, 0, 24),
    paddingX: n(input.paddingX, base.paddingX, 0, 32),
    marginY: n(input.marginY, base.marginY, 0, 32),
  };
}
function getMarkdownPersonalization() {
  const saved = readJson(STORAGE.markdownStyles, {});
  return Object.fromEntries(MARKDOWN_STYLE_TYPES.map(type => [type.id, normalizeMarkdownStyle(type.id, saved?.[type.id] || {})]));
}
function saveMarkdownPersonalization(styles) {
  writeJson(STORAGE.markdownStyles, Object.fromEntries(MARKDOWN_STYLE_TYPES.map(type => [type.id, normalizeMarkdownStyle(type.id, styles?.[type.id] || {})])));
  applyMarkdownPersonalization();
}
function markdownRule(type, style) {
  const background = style.background === MARKDOWN_NONE ? 'transparent' : markdownTokenCss(style.background, 'panel');
  const border = style.border === MARKDOWN_NONE ? 'none' : `1px solid ${markdownTokenCss(style.border, 'line')}`;
  const base = `color:${markdownTokenCss(style.color)};font-size:${style.fontSize === 0 ? 'inherit' : `${style.fontSize}px`};font-weight:${style.fontWeight};font-style:${style.fontStyle};line-height:${style.lineHeight === 0 ? 'inherit' : style.lineHeight};background:${background};border:${border};border-radius:${style.radius}px;padding:${style.paddingY}px ${style.paddingX}px;margin-top:${style.marginY}px;margin-bottom:${style.marginY}px;`;
  if (type.id === 'quote') return `${type.selector}{${base}border-left:${style.border === MARKDOWN_NONE ? '3px solid transparent' : `3px solid ${markdownTokenCss(style.border,'violet-2')}`};}`;
  if (type.id === 'rule') return `${type.selector}{height:0;border:0;border-top:1px solid ${markdownTokenCss(style.color,'line')};margin:${style.marginY}px 0;}`;
  if (type.id === 'link') return `${type.selector}{${base}text-decoration:underline;text-underline-offset:3px;}`;
  if (type.id === 'strike') return `${type.selector}{${base}text-decoration:line-through;}`;
  if (type.id === 'unorderedList' || type.id === 'orderedList') return `${type.selector}{${base}padding-left:${Math.max(22, style.paddingX + 22)}px;}`;
  return `${type.selector}{${base}}`;
}
function applyMarkdownPersonalization(styles = getMarkdownPersonalization()) {
  let node = document.getElementById('nv-markdown-personalization-style');
  if (!node) { node = document.createElement('style'); node.id = 'nv-markdown-personalization-style'; document.head.append(node); }
  node.textContent = MARKDOWN_STYLE_TYPES.map(type => markdownRule(type, styles[type.id])).join('\n') + `\n.nv-markdown-surface ul>li::marker,.nv-markdown-surface ol>li::marker{color:${markdownTokenCss(styles.listItem.color)}}`;
}
function markdownColorOptions(value, allowNone = false) {
  const options = allowNone ? [`<option value="none" ${value === 'none' ? 'selected' : ''}>${escapeHtml(t('personalization.none'))}</option>`] : [];
  for (const token of MARKDOWN_STYLE_TOKENS) options.push(`<option value="${token}" ${value === token ? 'selected' : ''}>${escapeHtml(t(`personalization.token.${token}`))}</option>`);
  return options.join('');
}
function markdownPreviewSample() {
  return `# ${t('personalization.preview.h1')}\n## ${t('personalization.preview.h2')}\n### ${t('personalization.preview.h3')}\n\n${t('personalization.preview.paragraph')} **${t('personalization.preview.bold')}**, *${t('personalization.preview.italic')}*, "${t('personalization.preview.dialogue')}", «${t('personalization.preview.dialogueAlt')}», ~~${t('personalization.preview.strike')}~~ ${t('personalization.preview.and')} [${t('personalization.preview.link')}](https://example.com).\n\n> ${t('personalization.preview.quote')}\n\n- ${t('personalization.preview.listOne')}\n- ${t('personalization.preview.listTwo')}\n\n1. ${t('personalization.preview.orderedOne')}\n2. ${t('personalization.preview.orderedTwo')}\n\nInline: \`const mood = "NastyVerse";\`\n\n\`\`\`js\nfunction hello(name) {\n  return \`Hello \${name}\`;\n}\n\`\`\`\n\n---\n\n| ${t('personalization.preview.tableA')} | ${t('personalization.preview.tableB')} |\n| --- | --- |\n| ChatML | 32K |\n| Mistral | 128K |`;
}
const DEFAULT_MESSAGE_APPEARANCE = {
  maxWidth: 82,
  gap: 18,
  bubbleRadius: 14,
  bubblePaddingY: 13,
  bubblePaddingX: 15,
  showNames: true,
  showPersonaAvatar: true,
  showCharacterAvatar: true,
  personaAlign: 'right',
  characterAlign: 'left',
  personaAvatarSide: 'right',
  characterAvatarSide: 'left',
  avatarShape: 'square',
  avatarSize: 38,
  avatarRadius: 32,
  avatarGap: 10,
  avatarVertical: 'top',
  avatarBorderWidth: 1,
  avatarBorder: 'line',
  personaAvatarX: 50,
  personaAvatarY: 50,
  characterAvatarX: 50,
  characterAvatarY: 50,
  personaAvatarZoom: 100,
  characterAvatarZoom: 100,
};
function normalizeMessageAppearance(input = {}) {
  const n = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const side = value => value === 'right' ? 'right' : 'left';
  const vertical = ['top','center','bottom'].includes(input.avatarVertical) ? input.avatarVertical : DEFAULT_MESSAGE_APPEARANCE.avatarVertical;
  return {
    maxWidth: n(input.maxWidth, DEFAULT_MESSAGE_APPEARANCE.maxWidth, 40, 100),
    gap: n(input.gap, DEFAULT_MESSAGE_APPEARANCE.gap, 4, 48),
    bubbleRadius: n(input.bubbleRadius, DEFAULT_MESSAGE_APPEARANCE.bubbleRadius, 0, 32),
    bubblePaddingY: n(input.bubblePaddingY, DEFAULT_MESSAGE_APPEARANCE.bubblePaddingY, 4, 28),
    bubblePaddingX: n(input.bubblePaddingX, DEFAULT_MESSAGE_APPEARANCE.bubblePaddingX, 6, 36),
    showNames: input.showNames !== false,
    showPersonaAvatar: input.showPersonaAvatar !== false,
    showCharacterAvatar: input.showCharacterAvatar !== false,
    personaAlign: side(input.personaAlign || DEFAULT_MESSAGE_APPEARANCE.personaAlign),
    characterAlign: side(input.characterAlign || DEFAULT_MESSAGE_APPEARANCE.characterAlign),
    personaAvatarSide: side(input.personaAvatarSide || DEFAULT_MESSAGE_APPEARANCE.personaAvatarSide),
    characterAvatarSide: side(input.characterAvatarSide || DEFAULT_MESSAGE_APPEARANCE.characterAvatarSide),
    avatarShape: input.avatarShape === 'portrait' ? 'portrait' : 'square',
    avatarSize: Math.max(16, Number.isFinite(Number(input.avatarSize)) ? Number(input.avatarSize) : DEFAULT_MESSAGE_APPEARANCE.avatarSize),
    avatarRadius: n(input.avatarRadius, DEFAULT_MESSAGE_APPEARANCE.avatarRadius, 0, 50),
    avatarGap: n(input.avatarGap, DEFAULT_MESSAGE_APPEARANCE.avatarGap, 2, 28),
    avatarVertical: vertical,
    avatarBorderWidth: n(input.avatarBorderWidth, DEFAULT_MESSAGE_APPEARANCE.avatarBorderWidth, 0, 4),
    avatarBorder: MARKDOWN_STYLE_TOKENS.includes(input.avatarBorder) ? input.avatarBorder : DEFAULT_MESSAGE_APPEARANCE.avatarBorder,
    personaAvatarX: n(input.personaAvatarX, DEFAULT_MESSAGE_APPEARANCE.personaAvatarX, 0, 100),
    personaAvatarY: n(input.personaAvatarY, DEFAULT_MESSAGE_APPEARANCE.personaAvatarY, 0, 100),
    characterAvatarX: n(input.characterAvatarX, DEFAULT_MESSAGE_APPEARANCE.characterAvatarX, 0, 100),
    characterAvatarY: n(input.characterAvatarY, DEFAULT_MESSAGE_APPEARANCE.characterAvatarY, 0, 100),
    personaAvatarZoom: n(input.personaAvatarZoom, DEFAULT_MESSAGE_APPEARANCE.personaAvatarZoom, 100, 400),
    characterAvatarZoom: n(input.characterAvatarZoom, DEFAULT_MESSAGE_APPEARANCE.characterAvatarZoom, 100, 400),
  };
}
function getMessagePersonalization() {
  return normalizeMessageAppearance(readJson(STORAGE.messageAppearance, {}));
}
function saveMessagePersonalization(settings) {
  const normalized = normalizeMessageAppearance(settings);
  writeJson(STORAGE.messageAppearance, normalized);
  applyMessagePersonalization(normalized);
  return normalized;
}
function currentMessagePersonalizationConversation() {
  return typeof nvSession === 'function' ? nvSession() : null;
}
function getConversationMessagePersonalization(chat = currentMessagePersonalizationConversation()) {
  const global = getMessagePersonalization();
  const raw = chat?.messageAppearanceOverride;
  const rawSettings = raw && typeof raw === 'object' && raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  return {
    enabled: raw?.enabled === true,
    settings: normalizeMessageAppearance({ ...global, ...rawSettings }),
  };
}
function getEffectiveMessagePersonalization(chat = currentMessagePersonalizationConversation()) {
  const global = getMessagePersonalization();
  const local = getConversationMessagePersonalization(chat);
  return local.enabled ? local.settings : global;
}
async function saveConversationMessagePersonalization(settings, enabled = true, chat = currentMessagePersonalizationConversation()) {
  if (!chat) return getMessagePersonalization();
  const normalized = normalizeMessageAppearance(settings);
  chat.messageAppearanceOverride = { enabled: Boolean(enabled), settings: normalized };
  chat.updatedAt = Date.now();
  if (typeof nvSave === 'function') await nvSave();
  applyMessagePersonalization(enabled ? normalized : getMessagePersonalization());
  return normalized;
}
function messageAvatarFrameValues(role, settings = getMessagePersonalization()) {
  const normalized = normalizeMessageAppearance(settings || {});
  const prefix = role === 'persona' || role === 'user' ? 'persona' : 'character';
  return {
    x: normalized[`${prefix}AvatarX`],
    y: normalized[`${prefix}AvatarY`],
    zoom: normalized[`${prefix}AvatarZoom`],
  };
}
function applyMessageAvatarFrame(image, role, settings = getMessagePersonalization()) {
  if (!(image instanceof HTMLImageElement)) return;
  const frame = image.parentElement;
  if (!frame) return;
  const render = () => {
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!(frameWidth > 0 && frameHeight > 0 && naturalWidth > 0 && naturalHeight > 0)) return;
    const { x, y, zoom } = messageAvatarFrameValues(role, settings);
    const coverScale = Math.max(frameWidth / naturalWidth, frameHeight / naturalHeight);
    const scale = coverScale * Math.max(1, Number(zoom || 100) / 100);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const overflowX = Math.max(0, renderedWidth - frameWidth);
    const overflowY = Math.max(0, renderedHeight - frameHeight);
    const left = -overflowX * (Number(x || 0) / 100);
    const top = -overflowY * (Number(y || 0) / 100);
    image.style.position = 'absolute';
    image.style.inset = 'auto';
    image.style.left = `${left.toFixed(3)}px`;
    image.style.top = `${top.toFixed(3)}px`;
    image.style.width = `${renderedWidth.toFixed(3)}px`;
    image.style.height = `${renderedHeight.toFixed(3)}px`;
    image.style.maxWidth = 'none';
    image.style.maxHeight = 'none';
    image.style.objectFit = 'fill';
    image.style.objectPosition = '50% 50%';
    image.style.transform = 'none';
    image.style.transformOrigin = 'center center';
  };
  if (image.complete && image.naturalWidth) render();
  else image.addEventListener('load', render, { once: true });
}
function refreshMessageAvatarFraming(settings = getMessagePersonalization(), root = document) {
  const normalized = normalizeMessageAppearance(settings || {});
  root.querySelectorAll?.('.nv-message-avatar.nv-avatar-persona img').forEach(image => applyMessageAvatarFrame(image, 'persona', normalized));
  root.querySelectorAll?.('.nv-message-avatar.nv-avatar-character img').forEach(image => applyMessageAvatarFrame(image, 'character', normalized));
  root.querySelectorAll?.('[data-avatar-crop-stage="persona"] img').forEach(image => applyMessageAvatarFrame(image, 'persona', normalized));
  root.querySelectorAll?.('[data-avatar-crop-stage="character"] img').forEach(image => applyMessageAvatarFrame(image, 'character', normalized));
}
function messageAvatarInlineStyle() {
  // Framing is applied from the image's natural dimensions after it loads.
  return 'position:absolute;inset:auto;max-width:none;max-height:none;object-fit:fill;transform:none';
}
function applyMessagePersonalization(settings = getMessagePersonalization()) {
  const normalized = normalizeMessageAppearance(settings);
  const root = document.documentElement;
  root.style.setProperty('--nv-message-max-width', `${normalized.maxWidth}%`);
  root.style.setProperty('--nv-message-gap', `${normalized.gap}px`);
  root.style.setProperty('--nv-message-radius', `${normalized.bubbleRadius}px`);
  root.style.setProperty('--nv-message-pad-y', `${normalized.bubblePaddingY}px`);
  root.style.setProperty('--nv-message-pad-x', `${normalized.bubblePaddingX}px`);
  const avatarWidth = normalized.avatarSize;
  const avatarHeight = normalized.avatarShape === 'portrait' ? normalized.avatarSize * 1.5 : normalized.avatarSize;
  root.style.setProperty('--nv-avatar-size', `${avatarWidth}px`);
  root.style.setProperty('--nv-avatar-width', `${avatarWidth}px`);
  root.style.setProperty('--nv-avatar-height', `${avatarHeight}px`);
  root.style.setProperty('--nv-avatar-aspect', normalized.avatarShape === 'portrait' ? '2 / 3' : '1 / 1');
  root.style.setProperty('--nv-avatar-radius', `${normalized.avatarRadius}%`);
  root.style.setProperty('--nv-avatar-gap', `${normalized.avatarGap}px`);
  root.style.setProperty('--nv-avatar-border-width', `${normalized.avatarBorderWidth}px`);
  root.style.setProperty('--nv-avatar-border-color', markdownTokenCss(normalized.avatarBorder, 'line'));
  root.style.setProperty('--nv-persona-avatar-x', `${normalized.personaAvatarX}%`);
  root.style.setProperty('--nv-persona-avatar-y', `${normalized.personaAvatarY}%`);
  root.style.setProperty('--nv-character-avatar-x', `${normalized.characterAvatarX}%`);
  root.style.setProperty('--nv-character-avatar-y', `${normalized.characterAvatarY}%`);
  requestAnimationFrame(() => refreshMessageAvatarFraming(normalized));
  root.dataset.nvMessageNames = normalized.showNames ? 'show' : 'hide';
  return normalized;
}
function personalizationTabs(active) {
  return `<div class="personalization-tabs" role="tablist"><button type="button" class="${active === 'text' ? 'active' : ''}" data-personalization-section="text">${escapeHtml(t('personalization.section.text'))}</button><button type="button" class="${active === 'messages' ? 'active' : ''}" data-personalization-section="messages">${escapeHtml(t('personalization.section.messages'))}</button></div>`;
}
function bindPersonalizationTabs() {
  pageRoot.querySelectorAll('[data-personalization-section]').forEach(button => button.addEventListener('click', () => renderPersonalization(state.markdownStyleType || 'paragraph', button.dataset.personalizationSection)));
}
function messagePersonalizationSelect(field, value, options, disabled = false) {
  return `<select data-message-style="${field}" ${disabled ? 'disabled' : ''}>${options.map(([id,label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
}
function messagePersonalizationPreview(settings) {
  const persona = typeof nvPersona === 'function' ? nvPersona(typeof nvSession === 'function' ? nvSession() : null) : { name: t('personalization.messages.preview.user'), avatar: '' };
  const character = typeof activeCharacter === 'function' ? activeCharacter() : null;
  const personaName = persona?.name || t('personalization.messages.preview.user');
  const characterName = character?.name || t('personalization.messages.preview.character');
  const avatar = (source, name, role) => {
    const roleClass = role === 'user' ? 'nv-avatar-persona' : 'nv-avatar-character';
    if (!source) return `<div class="nv-message-avatar ${roleClass} nv-avatar-fallback" aria-hidden="true">${escapeHtml((name || '?').slice(0,1).toUpperCase())}</div>`;
    const inlineStyle = messageAvatarInlineStyle(role, settings);
    return `<div class="nv-message-avatar ${roleClass}"><img src="${escapeHtml(source)}" alt="" style="${inlineStyle}"></div>`;
  };
  const personaAvatar = resolvedAvatarSource(persona);
  const characterAvatar = resolvedAvatarSource(character);
  const item = (role, name, source, side, align, visible, body) => `<article class="message message-${role} nv-align-${align}"><div class="nv-message-row nv-avatar-${side} ${settings.avatarVertical === 'center' ? 'nv-avatar-v-center' : settings.avatarVertical === 'bottom' ? 'nv-avatar-v-bottom' : 'nv-avatar-v-top'}">${visible ? avatar(source,name,role) : ''}<div class="nv-message-body"><div class="message-role">${escapeHtml(name)}</div><div class="message-bubble nv-markdown-surface">${body}</div></div></div></article>`;
  return `<div class="messages nv-personalization-message-preview">${item('assistant', characterName, characterAvatar, settings.characterAvatarSide, settings.characterAlign, settings.showCharacterAvatar, `<p>${escapeHtml(t('personalization.messages.preview.assistant'))}</p>`)}${item('user', personaName, personaAvatar, settings.personaAvatarSide, settings.personaAlign, settings.showPersonaAvatar, `<p>${escapeHtml(t('personalization.messages.preview.userMessage'))}</p>`)}</div>`;
}
function messageOutputSuffix(key) {
  return ['maxWidth','avatarRadius','personaAvatarX','personaAvatarY','characterAvatarX','characterAvatarY','personaAvatarZoom','characterAvatarZoom'].includes(key) ? '%' : 'px';
}
function messageAvatarCropMarkup(role, settings, source, name, disabled = false) {
  const prefix = role === 'persona' ? 'persona' : 'character';
  const x = settings[`${prefix}AvatarX`];
  const y = settings[`${prefix}AvatarY`];
  const zoom = settings[`${prefix}AvatarZoom`];
  const inlineStyle = messageAvatarInlineStyle(prefix, settings);
  const disabledAttr = disabled ? 'disabled' : '';
  const visual = source
    ? `<img src="${escapeHtml(source)}" alt="" style="${inlineStyle}">`
    : `<div class="message-avatar-crop-fallback">${escapeHtml((name || '?').slice(0,1).toUpperCase())}</div>`;
  return `<div class="message-avatar-crop-editor ${disabled ? 'is-disabled' : ''}" data-avatar-crop-role="${prefix}">
    <div class="message-avatar-crop-stage ${source ? 'has-image' : 'no-image'} nv-avatar-shape-${settings.avatarShape}" data-avatar-crop-stage="${prefix}" aria-label="${escapeHtml(t('personalization.messages.avatarFraming'))}" style="border-radius:${settings.avatarRadius}%;aspect-ratio:${settings.avatarShape === 'portrait' ? '2 / 3' : '1 / 1'}">${visual}<div class="message-avatar-crop-reticle" aria-hidden="true"></div></div>
    <div class="message-avatar-crop-copy"><strong>${escapeHtml(t('personalization.messages.avatarFraming'))}</strong><small>${escapeHtml(source ? t('personalization.messages.avatarFramingHelp') : t('personalization.messages.avatarFramingNoImage'))}</small></div>
    <div class="message-avatar-crop-controls">
      <label><span>${escapeHtml(t('personalization.messages.zoom'))}</span><input data-message-style="${prefix}AvatarZoom" type="range" min="100" max="400" step="1" value="${zoom}" ${disabledAttr}><output data-output="${prefix}AvatarZoom">${zoom}%</output></label>
      <label><span>${escapeHtml(t('personalization.messages.anchorX'))}</span><input data-message-style="${prefix}AvatarX" type="range" min="0" max="100" step="1" value="${x}" ${disabledAttr}><output data-output="${prefix}AvatarX">${x}%</output></label>
      <label><span>${escapeHtml(t('personalization.messages.anchorY'))}</span><input data-message-style="${prefix}AvatarY" type="range" min="0" max="100" step="1" value="${y}" ${disabledAttr}><output data-output="${prefix}AvatarY">${y}%</output></label>
    </div>
    <button type="button" class="btn btn-ghost btn-small message-avatar-center" data-avatar-center="${prefix}" ${disabledAttr}>${escapeHtml(t('personalization.messages.centerFrame'))}</button>
  </div>`;
}

function renderMessagePersonalization(scope = state.messagePersonalizationScope || 'global') {
  state.currentPage = 'personalization';
  state.personalizationSection = 'messages';
  state.messagePersonalizationScope = scope === 'conversation' ? 'conversation' : 'global';
  renderNavbar();

  const chat = currentMessagePersonalizationConversation();
  const globalSettings = getMessagePersonalization();
  const conversation = getConversationMessagePersonalization(chat);
  const isConversation = state.messagePersonalizationScope === 'conversation';
  const conversationEnabled = Boolean(chat && conversation.enabled);
  const disabled = isConversation && !conversationEnabled;
  const s = isConversation ? (conversationEnabled ? conversation.settings : globalSettings) : globalSettings;
  const disabledAttr = disabled ? 'disabled' : '';
  const scopeTitle = isConversation ? t('personalization.messages.currentConversation') : t('personalization.messages.globalDefaults');
  const resetLabel = isConversation ? t('personalization.messages.resetConversation') : t('personalization.messages.resetGlobal');
  const cropPersona = typeof nvPersona === 'function' ? nvPersona(chat) : null;
  const cropCharacter = typeof activeCharacter === 'function' ? activeCharacter() : null;
  const cropPersonaSource = resolvedAvatarSource(cropPersona);
  const cropCharacterSource = resolvedAvatarSource(cropCharacter);

  pageRoot.innerHTML = `<div class="personalization-page personalization-page-messages">
    <div class="personalization-head"><div><h1>${escapeHtml(t('personalization.title'))}</h1><p>${escapeHtml(t('personalization.messages.desc'))}</p></div><button class="btn btn-ghost" id="message-style-reset">${escapeHtml(resetLabel)}</button></div>
    ${personalizationTabs('messages')}
    <div class="message-scope-tabs" role="tablist">
      <button type="button" class="${!isConversation ? 'active' : ''}" data-message-scope="global">${escapeHtml(t('personalization.messages.globalDefaults'))}</button>
      <button type="button" class="${isConversation ? 'active' : ''}" data-message-scope="conversation" ${chat ? '' : 'disabled'}>${escapeHtml(t('personalization.messages.currentConversation'))}</button>
    </div>
    ${isConversation ? (chat ? `<div class="conversation-appearance-toggle"><div><strong>${escapeHtml(chat.title || t('personalization.messages.currentConversation'))}</strong><small>${escapeHtml(t('personalization.messages.conversationHelp'))}</small></div><label class="message-style-toggle"><span>${escapeHtml(t('personalization.messages.overrideConversation'))}</span><input type="checkbox" id="message-conversation-override" ${conversationEnabled ? 'checked' : ''}></label></div>` : `<div class="conversation-appearance-empty">${escapeHtml(t('personalization.messages.noConversation'))}</div>`) : ''}
    <div class="message-personalization-layout">
      <section class="personalization-editor message-personalization-editor ${disabled ? 'is-disabled' : ''}">
        <div class="personalization-editor-head"><div><span>${escapeHtml(scopeTitle)}</span><h2>${escapeHtml(t('personalization.messages.layout'))}</h2></div></div>
        <div class="message-style-grid">
          <label><span>${escapeHtml(t('personalization.messages.maxWidth'))}</span><input data-message-style="maxWidth" type="range" min="40" max="100" step="1" value="${s.maxWidth}" ${disabledAttr}><output data-output="maxWidth">${s.maxWidth}%</output></label>
          <label><span>${escapeHtml(t('personalization.messages.gap'))}</span><input data-message-style="gap" type="range" min="4" max="48" step="1" value="${s.gap}" ${disabledAttr}><output data-output="gap">${s.gap}px</output></label>
          <label><span>${escapeHtml(t('personalization.messages.radius'))}</span><input data-message-style="bubbleRadius" type="range" min="0" max="32" step="1" value="${s.bubbleRadius}" ${disabledAttr}><output data-output="bubbleRadius">${s.bubbleRadius}px</output></label>
          <label><span>${escapeHtml(t('personalization.messages.paddingY'))}</span><input data-message-style="bubblePaddingY" type="range" min="4" max="28" step="1" value="${s.bubblePaddingY}" ${disabledAttr}><output data-output="bubblePaddingY">${s.bubblePaddingY}px</output></label>
          <label><span>${escapeHtml(t('personalization.messages.paddingX'))}</span><input data-message-style="bubblePaddingX" type="range" min="6" max="36" step="1" value="${s.bubblePaddingX}" ${disabledAttr}><output data-output="bubblePaddingX">${s.bubblePaddingX}px</output></label>
          <label class="message-style-toggle"><span>${escapeHtml(t('personalization.messages.showNames'))}</span><input data-message-style="showNames" type="checkbox" ${s.showNames ? 'checked' : ''} ${disabledAttr}></label>
        </div>
        <div class="personalization-subsection"><div class="personalization-editor-head"><div><span>${escapeHtml(t('personalization.messages.avatars'))}</span><h2>${escapeHtml(t('personalization.messages.avatarStyle'))}</h2></div></div>
          <div class="message-style-grid">
            <label><span>${escapeHtml(t('personalization.messages.avatarShape'))}</span>${messagePersonalizationSelect('avatarShape',s.avatarShape,[['square',t('personalization.messages.avatarShape.square')],['portrait',t('personalization.messages.avatarShape.portrait')]], disabled)}</label>
            <label><span>${escapeHtml(t('personalization.messages.avatarSize'))}</span><input data-message-style="avatarSize" type="number" min="16" step="1" value="${s.avatarSize}" ${disabledAttr}><small>${escapeHtml(t('personalization.messages.avatarSizeHelp'))}</small></label>
            <label><span>${escapeHtml(t('personalization.messages.avatarRoundness'))}</span><input data-message-style="avatarRadius" type="range" min="0" max="50" step="1" value="${s.avatarRadius}" ${disabledAttr}><output data-output="avatarRadius">${s.avatarRadius}%</output></label>
            <label><span>${escapeHtml(t('personalization.messages.avatarGap'))}</span><input data-message-style="avatarGap" type="range" min="2" max="28" step="1" value="${s.avatarGap}" ${disabledAttr}><output data-output="avatarGap">${s.avatarGap}px</output></label>
            <label><span>${escapeHtml(t('personalization.messages.avatarVertical'))}</span>${messagePersonalizationSelect('avatarVertical',s.avatarVertical,[['top',t('personalization.messages.top')],['center',t('personalization.messages.center')],['bottom',t('personalization.messages.bottom')]], disabled)}</label>
            <label><span>${escapeHtml(t('personalization.messages.avatarBorderWidth'))}</span><input data-message-style="avatarBorderWidth" type="range" min="0" max="4" step="1" value="${s.avatarBorderWidth}" ${disabledAttr}><output data-output="avatarBorderWidth">${s.avatarBorderWidth}px</output></label>
            <label><span>${escapeHtml(t('personalization.messages.avatarBorder'))}</span><select data-message-style="avatarBorder" ${disabledAttr}>${markdownColorOptions(s.avatarBorder)}</select></label>
          </div>
        </div>
        <div class="personalization-subsection message-role-settings">
          <div><h3>${escapeHtml(t('personalization.messages.character'))}</h3><label class="message-style-toggle"><span>${escapeHtml(t('personalization.messages.showAvatar'))}</span><input data-message-style="showCharacterAvatar" type="checkbox" ${s.showCharacterAvatar?'checked':''} ${disabledAttr}></label><label><span>${escapeHtml(t('personalization.messages.messageSide'))}</span>${messagePersonalizationSelect('characterAlign',s.characterAlign,[['left',t('personalization.messages.left')],['right',t('personalization.messages.right')]],disabled)}</label><label><span>${escapeHtml(t('personalization.messages.avatarSide'))}</span>${messagePersonalizationSelect('characterAvatarSide',s.characterAvatarSide,[['left',t('personalization.messages.left')],['right',t('personalization.messages.right')]],disabled)}</label>${messageAvatarCropMarkup('character', s, cropCharacterSource, cropCharacter?.name || t('personalization.messages.preview.character'), disabled)}</div>
          <div><h3>${escapeHtml(t('personalization.messages.persona'))}</h3><label class="message-style-toggle"><span>${escapeHtml(t('personalization.messages.showAvatar'))}</span><input data-message-style="showPersonaAvatar" type="checkbox" ${s.showPersonaAvatar?'checked':''} ${disabledAttr}></label><label><span>${escapeHtml(t('personalization.messages.messageSide'))}</span>${messagePersonalizationSelect('personaAlign',s.personaAlign,[['left',t('personalization.messages.left')],['right',t('personalization.messages.right')]],disabled)}</label><label><span>${escapeHtml(t('personalization.messages.avatarSide'))}</span>${messagePersonalizationSelect('personaAvatarSide',s.personaAvatarSide,[['left',t('personalization.messages.left')],['right',t('personalization.messages.right')]],disabled)}</label>${messageAvatarCropMarkup('persona', s, cropPersonaSource, cropPersona?.name || t('personalization.messages.preview.user'), disabled)}</div>
        </div>
      </section>
      <aside class="message-personalization-preview"><div class="personalization-preview-label">${escapeHtml(t('personalization.preview'))}</div><div id="message-style-preview">${messagePersonalizationPreview(s)}</div><p class="message-personalization-help">${escapeHtml(t('personalization.messages.avatarHelp'))}</p></aside>
    </div>
  </div>`;

  bindPersonalizationTabs();
  pageRoot.querySelectorAll('[data-message-scope]').forEach(button => button.addEventListener('click', () => renderMessagePersonalization(button.dataset.messageScope)));
  document.getElementById('message-conversation-override')?.addEventListener('change', async event => {
    const settings = conversation.settings || globalSettings;
    await saveConversationMessagePersonalization(settings, event.target.checked, chat);
    renderMessagePersonalization('conversation');
  });

  const readMessageStyleForm = () => {
    const base = isConversation ? getConversationMessagePersonalization(chat).settings : getMessagePersonalization();
    const next = { ...base };
    pageRoot.querySelectorAll('[data-message-style]').forEach(input => {
      const key = input.dataset.messageStyle;
      next[key] = input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(input.value) : input.value;
    });
    return normalizeMessageAppearance(next);
  };
  const refreshMessageStylePreview = settings => {
    const normalized = normalizeMessageAppearance(settings);
    for (const output of pageRoot.querySelectorAll('[data-output]')) {
      const key = output.dataset.output, value = normalized[key];
      output.textContent = `${value}${messageOutputSuffix(key)}`;
    }
    applyMessagePersonalization(normalized);
    pageRoot.querySelectorAll('[data-avatar-crop-stage]').forEach(stage => {
      stage.style.aspectRatio = normalized.avatarShape === 'portrait' ? '2 / 3' : '1 / 1';
      stage.classList.toggle('nv-avatar-shape-portrait', normalized.avatarShape === 'portrait');
      stage.classList.toggle('nv-avatar-shape-square', normalized.avatarShape !== 'portrait');
    });
    requestAnimationFrame(() => refreshMessageAvatarFraming(normalized, pageRoot));
    const preview = document.getElementById('message-style-preview');
    if (preview) {
      preview.innerHTML = messagePersonalizationPreview(normalized);
      requestAnimationFrame(() => refreshMessageAvatarFraming(normalized, preview));
    }
    return normalized;
  };
  const collect = async () => {
    // Update the visible preview immediately. Persistence may involve nvSave(), so
    // never make the preview wait for disk/IndexedDB work.
    const next = refreshMessageStylePreview(readMessageStyleForm());
    return isConversation ? await saveConversationMessagePersonalization(next, true, chat) : saveMessagePersonalization(next);
  };
  pageRoot.querySelectorAll('[data-message-style]').forEach(input => input.addEventListener('input', collect));

  const syncAvatarCropStage = role => {
    const prefix = role === 'persona' ? 'persona' : 'character';
    const stage = pageRoot.querySelector(`[data-avatar-crop-stage="${prefix}"]`);
    const image = stage?.querySelector('img');
    if (!stage || !image) return;
    const xInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarX"]`);
    const yInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarY"]`);
    const zoomInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarZoom"]`);
    const current = readMessageStyleForm();
    applyMessageAvatarFrame(image, prefix, current);
  };
  for (const role of ['character','persona']) {
    const prefix = role;
    const stage = pageRoot.querySelector(`[data-avatar-crop-stage="${prefix}"]`);
    const xInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarX"]`);
    const yInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarY"]`);
    const zoomInput = pageRoot.querySelector(`[data-message-style="${prefix}AvatarZoom"]`);
    [xInput,yInput,zoomInput].filter(Boolean).forEach(input => input.addEventListener('input', () => syncAvatarCropStage(prefix)));
    if (stage?.classList.contains('has-image') && !disabled) {
      let dragging = false, startClientX = 0, startClientY = 0, startX = 50, startY = 50;
      const finishDrag = event => {
        if (!dragging) return;
        dragging = false;
        try { stage.releasePointerCapture?.(event.pointerId); } catch {}
        collect();
      };
      stage.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        dragging = true;
        startClientX = event.clientX;
        startClientY = event.clientY;
        startX = Number(xInput?.value ?? 50);
        startY = Number(yInput?.value ?? 50);
        stage.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      stage.addEventListener('pointermove', event => {
        if (!dragging || !xInput || !yInput) return;
        const rect = stage.getBoundingClientRect();
        const nextX = Math.max(0, Math.min(100, startX - ((event.clientX - startClientX) / Math.max(1, rect.width)) * 100));
        const nextY = Math.max(0, Math.min(100, startY - ((event.clientY - startClientY) / Math.max(1, rect.height)) * 100));
        xInput.value = String(Math.round(nextX));
        yInput.value = String(Math.round(nextY));
        const xOutput = pageRoot.querySelector(`[data-output="${prefix}AvatarX"]`);
        const yOutput = pageRoot.querySelector(`[data-output="${prefix}AvatarY"]`);
        if (xOutput) xOutput.textContent = `${Math.round(nextX)}%`;
        if (yOutput) yOutput.textContent = `${Math.round(nextY)}%`;
        syncAvatarCropStage(prefix);
        refreshMessageStylePreview(readMessageStyleForm());
      });
      stage.addEventListener('pointerup', finishDrag);
      stage.addEventListener('pointercancel', finishDrag);
    }
    pageRoot.querySelector(`[data-avatar-center="${prefix}"]`)?.addEventListener('click', async () => {
      if (xInput) xInput.value = '50';
      if (yInput) yInput.value = '50';
      const xOutput = pageRoot.querySelector(`[data-output="${prefix}AvatarX"]`);
      const yOutput = pageRoot.querySelector(`[data-output="${prefix}AvatarY"]`);
      if (xOutput) xOutput.textContent = '50%';
      if (yOutput) yOutput.textContent = '50%';
      syncAvatarCropStage(prefix);
      await collect();
    });
    syncAvatarCropStage(prefix);
  }

  document.getElementById('message-style-reset')?.addEventListener('click', async () => {
    if (isConversation && chat) {
      delete chat.messageAppearanceOverride;
      chat.updatedAt = Date.now();
      if (typeof nvSave === 'function') await nvSave();
      applyMessagePersonalization(getMessagePersonalization());
      renderMessagePersonalization('conversation');
      return;
    }
    localStorage.removeItem(STORAGE.messageAppearance);
    applyMessagePersonalization();
    renderMessagePersonalization('global');
  });
  applyMessagePersonalization(s);
}
function renderPersonalization(typeId = 'paragraph', section = 'text') {
  state.personalizationSection = section === 'messages' ? 'messages' : 'text';
  if (state.personalizationSection === 'messages') return renderMessagePersonalization();
  state.currentPage = 'personalization';
  state.markdownStyleType = MARKDOWN_STYLE_TYPES.some(type => type.id === typeId) ? typeId : 'paragraph';
  renderNavbar();
  const styles = getMarkdownPersonalization();
  const activeType = MARKDOWN_STYLE_TYPES.find(type => type.id === state.markdownStyleType) || MARKDOWN_STYLE_TYPES[0];
  const style = styles[activeType.id];
  const inheritsTypography = ['strong','emphasis','dialogue','strike','link'].includes(activeType.id);
  const syntaxExample = activeType.id === 'dialogue' ? dialogueQuoteExample() : (activeType.example || '');
  const dialogueMode = getDialogueQuoteMode();
  pageRoot.innerHTML = `<div class="personalization-page">
    <div class="personalization-head"><div><h1>${escapeHtml(t('personalization.title'))}</h1><p>${escapeHtml(t('personalization.desc'))}</p></div><button class="btn btn-ghost" id="markdown-reset-all">${escapeHtml(t('personalization.resetAll'))}</button></div>
    ${personalizationTabs('text')}
    <div class="personalization-layout">
      <aside class="personalization-elements">${MARKDOWN_STYLE_TYPES.map(type => `<button class="personalization-element ${type.id === activeType.id ? 'active' : ''}" data-md-type="${type.id}">${escapeHtml(t(type.labelKey))}</button>`).join('')}</aside>
      <section class="personalization-editor">
        <div class="personalization-editor-head"><div><span>${escapeHtml(t('personalization.editing'))}</span><h2>${escapeHtml(t(activeType.labelKey))}</h2></div><button class="btn btn-ghost btn-small" id="markdown-reset-current">${escapeHtml(t('personalization.resetCurrent'))}</button></div>
        <div class="markdown-syntax-example"><span>${escapeHtml(t('personalization.syntax'))}</span><pre><code id="markdown-syntax-code">${escapeHtml(syntaxExample)}</code></pre></div>
        ${activeType.id === 'dialogue' ? `<div class="dialogue-quote-preference"><label><span>${escapeHtml(t('personalization.dialogueQuotes'))}</span><select id="dialogue-quote-mode"><option value="straight" ${dialogueMode === 'straight' ? 'selected' : ''}>${escapeHtml(t('personalization.dialogueQuotes.straight'))} — &quot;...&quot;</option><option value="french" ${dialogueMode === 'french' ? 'selected' : ''}>${escapeHtml(t('personalization.dialogueQuotes.french'))} — «...»</option></select><small>${escapeHtml(t('personalization.dialogueQuotes.help'))}</small></label></div>` : ''}
        <div class="markdown-controls">
          <label><span>${escapeHtml(t('personalization.color'))}</span><select data-md-field="color">${markdownColorOptions(style.color)}</select></label>
          <label><span>${escapeHtml(t('personalization.background'))}</span><select data-md-field="background">${markdownColorOptions(style.background, true)}</select></label>
          <label><span>${escapeHtml(t('personalization.border'))}</span><select data-md-field="border">${markdownColorOptions(style.border, true)}</select></label>
          <label><span>${escapeHtml(t('personalization.size'))}${inheritsTypography ? ` <small>${escapeHtml(t('personalization.inheritHint'))}</small>` : ''}</span><input data-md-field="fontSize" type="number" min="${inheritsTypography ? 0 : 8}" max="48" step="1" value="${style.fontSize}"></label>
          <label><span>${escapeHtml(t('personalization.weight'))}</span><select data-md-field="fontWeight">${[300,400,500,600,650,700,750,800,900].map(v => `<option value="${v}" ${Number(style.fontWeight)===v?'selected':''}>${v}</option>`).join('')}</select></label>
          <label><span>${escapeHtml(t('personalization.style'))}</span><select data-md-field="fontStyle"><option value="normal" ${style.fontStyle==='normal'?'selected':''}>${escapeHtml(t('personalization.style.normal'))}</option><option value="italic" ${style.fontStyle==='italic'?'selected':''}>${escapeHtml(t('personalization.style.italic'))}</option></select></label>
          <label><span>${escapeHtml(t('personalization.lineHeight'))}${inheritsTypography ? ` <small>${escapeHtml(t('personalization.inheritHint'))}</small>` : ''}</span><input data-md-field="lineHeight" type="number" min="${inheritsTypography ? 0 : 1}" max="2.5" step="0.05" value="${style.lineHeight}"></label>
          <label><span>${escapeHtml(t('personalization.radius'))}</span><input data-md-field="radius" type="number" min="0" max="28" step="1" value="${style.radius}"></label>
          <label><span>${escapeHtml(t('personalization.paddingY'))}</span><input data-md-field="paddingY" type="number" min="0" max="24" step="1" value="${style.paddingY}"></label>
          <label><span>${escapeHtml(t('personalization.paddingX'))}</span><input data-md-field="paddingX" type="number" min="0" max="32" step="1" value="${style.paddingX}"></label>
          <label><span>${escapeHtml(t('personalization.spacing'))}</span><input data-md-field="marginY" type="number" min="0" max="32" step="1" value="${style.marginY}"></label>
        </div>
        <div class="personalization-preview-wrap"><div class="personalization-preview-label">${escapeHtml(t('personalization.preview'))}</div><div class="personalization-preview message-bubble nv-markdown-surface" id="markdown-preview">${typeof nvMarkdown === 'function' ? nvMarkdown(markdownPreviewSample()) : ''}</div></div>
      </section>
    </div>
  </div>`;
  bindPersonalizationTabs();
  pageRoot.querySelectorAll('[data-md-type]').forEach(button => button.addEventListener('click', () => renderPersonalization(button.dataset.mdType, 'text')));
  const preview = document.getElementById('markdown-preview');
  const commit = () => {
    const next = getMarkdownPersonalization();
    const current = { ...next[activeType.id] };
    pageRoot.querySelectorAll('[data-md-field]').forEach(input => { current[input.dataset.mdField] = ['fontSize','fontWeight','lineHeight','radius','paddingY','paddingX','marginY'].includes(input.dataset.mdField) ? Number(input.value) : input.value; });
    next[activeType.id] = normalizeMarkdownStyle(activeType.id, current);
    saveMarkdownPersonalization(next);
    if (preview) preview.innerHTML = nvMarkdown(markdownPreviewSample());
  };
  pageRoot.querySelectorAll('[data-md-field]').forEach(input => input.addEventListener('input', commit));
  document.getElementById('dialogue-quote-mode')?.addEventListener('change', event => {
    saveDialogueQuoteMode(event.target.value);
    const syntaxCode = document.getElementById('markdown-syntax-code');
    if (syntaxCode) syntaxCode.textContent = dialogueQuoteExample();
    if (preview) preview.innerHTML = nvMarkdown(markdownPreviewSample());
    if (state.currentPage === 'chat' && typeof renderChat === 'function') renderChat({ preserveScroll: true });
  });
  document.getElementById('markdown-reset-current').addEventListener('click', () => {
    const next = getMarkdownPersonalization(); next[activeType.id] = { ...DEFAULT_MARKDOWN_STYLES[activeType.id] }; saveMarkdownPersonalization(next);
    if (activeType.id === 'dialogue') localStorage.removeItem(STORAGE.dialogueQuotes);
    renderPersonalization(activeType.id, 'text');
  });
  document.getElementById('markdown-reset-all').addEventListener('click', () => { localStorage.removeItem(STORAGE.markdownStyles); localStorage.removeItem(STORAGE.dialogueQuotes); applyMarkdownPersonalization(); renderPersonalization(activeType.id, 'text'); });
  applyMarkdownPersonalization(styles);
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
    autoSelectInstructionPresetForModel(status?.modelName);
    if (!state.backendConfig) {
      try { state.backendConfig = await invoke('load_backend_config'); } catch (_) { /* Status already contains the user-facing error. */ }
    }
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
    pill.title = friendlyNativeError(error);
  }
}

/* ===================================================================
   Boot
=================================================================== */

async function bootstrap() {
  applyAccent();
  applyUiSettings();
  await initI18n();
  applyMarkdownPersonalization();
  applyMessagePersonalization();
  await loadContextPresetFactory();
  await loadInstructionPresetFactory();
  try { state.backendConfig = await invoke('load_backend_config'); } catch (error) { console.warn('[backend] Unable to load saved backend configuration.', error); }
  try { state.translationConfig = await invoke('load_translation_config'); } catch (error) { console.warn('[translate] Unable to load chat translation configuration.', error); }
  try {
    await loadAvatarAssets();
    await migrateInlineCharacterAvatars();
  } catch (error) {
    console.warn('[avatar] IndexedDB avatar storage unavailable.', error);
  }
  await nvInit();
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
