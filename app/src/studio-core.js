/* NastyVerse Studio: data and prompt operations, independent of the UI.
   Written for NastyVerse; no SillyTavern runtime dependency. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => globalThis.crypto?.randomUUID?.() || `nv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const text = value => String(value ?? '');
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const tokens = value => Math.ceil(text(value).length / 3.5);
  const words = value => text(value).toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  const defaults = () => ({ version: 1, sessions: [], active: {}, personas: [], defaultPersona: '', books: [], groups: [], documents: [], replies: [], rules: [], profiles: [], appearance: { theme: 'violet', background: '', autoSpeak: false, voice: '', rate: 1 }, lore: { scanDepth: 8, budget: 1200, recursive: true }, generation: { stream: true }, lastSession: '' });
  function message(raw = {}) {
    const content = text(raw.content ?? raw.mes);
    const variants = Array.isArray(raw.variants ?? raw.swipes) ? (raw.variants ?? raw.swipes).map(text) : [content];
    const selected = number(raw.variant ?? raw.swipe_id, 0, 0, Math.max(0, variants.length - 1));
    const legacyTranslation = raw.translation && typeof raw.translation.content === 'string' && text(raw.translation.source) === content ? raw.translation : null;
    const promptRecords = Array.isArray(raw.promptRecords)
      ? raw.promptRecords.map(record => record && typeof record === 'object' ? clone(record) : null)
      : [];
    return { id: text(raw.id || id()), role: ['user', 'system', 'assistant'].includes(raw.role) ? raw.role : raw.is_user ? 'user' : raw.is_system ? 'system' : 'assistant', content, name: text(raw.name), characterId: text(raw.characterId), personaId: text(raw.personaId), createdAt: Number(raw.createdAt) || Date.parse(raw.send_date) || Date.now(), variants: variants.length ? variants : [content], variant: selected, hidden: !!raw.hidden, bookmark: !!raw.bookmark, model: text(raw.model), promptRecords, attachments: (Array.isArray(raw.attachments) ? raw.attachments : []).filter(a => a && typeof a.assetId === 'string').slice(0,4).map(a => ({id:text(a.id||id()),assetId:text(a.assetId),name:text(a.name||'Image'),sendToModel:!!a.sendToModel})), displayText: text(raw.displayText ?? raw.display_text ?? legacyTranslation?.content), displaySource: text(raw.displaySource ?? raw.display_source ?? legacyTranslation?.source), displayLanguage: text(raw.displayLanguage ?? raw.display_language ?? legacyTranslation?.language), duration: number(raw.duration, 0, 0, 86400000) };
  }
  function session(targetId, name, messages = []) {
    return { id: id(), targetId, title: name || 'Conversation', createdAt: Date.now(), updatedAt: Date.now(), messages: messages.map(message), personaId: '', bookIds: [], documentIds: [], note: '', noteDepth: 2, noteInterval: 1, memory: '', scenario: '', pinned: false, draft: '', draftImages: [] };
  }
  function migrate(characters, conversations) {
    const data = defaults();
    for (const [target, messages] of Object.entries(conversations || {})) {
      if (!Array.isArray(messages)) continue;
      const chat = session(target, characters.find(c => c.id === target)?.name || 'Conversation', messages);
      data.sessions.push(chat); data.active[target] = chat.id;
    }
    return data;
  }
  function normalizeWorkspace(raw) {
    if (!raw || raw.version !== 1) throw new Error('Unsupported NastyVerse workspace version.');
    const data = { ...defaults(), ...clone(raw) };
    for (const key of ['sessions', 'personas', 'books', 'groups', 'documents', 'replies', 'rules', 'profiles']) {
      if (!Array.isArray(data[key])) throw new Error(`Invalid ${key}`);
    }
    data.sessions = data.sessions.map(s => {
      if (!s || typeof s.targetId !== 'string' || !Array.isArray(s.messages)) throw new Error('Invalid conversation');
      return { ...session(s.targetId, s.title), ...s, messages: s.messages.map(message), draftImages: message({attachments:s.draftImages}).attachments, bookIds: Array.isArray(s.bookIds) ? s.bookIds : [], documentIds: Array.isArray(s.documentIds) ? s.documentIds : [] };
    });
    const ids = new Set();
    for (const chat of data.sessions) { if (ids.has(chat.id)) throw new Error('Duplicate conversation ID'); ids.add(chat.id); }
    data.active = data.active && typeof data.active === 'object' && !Array.isArray(data.active) ? data.active : {};
    data.appearance = { ...defaults().appearance, ...data.appearance };
    data.lore = { ...defaults().lore, ...data.lore };
    data.generation = { ...defaults().generation, ...data.generation };
    return data;
  }
  function normalizeBook(raw, name = 'World') {
    const source = raw.character_book || raw.data?.character_book || raw;
    if (!source || !source.entries || typeof source.entries !== 'object') throw new Error('No lore entries found');
    const entries = Object.values(source.entries).map((e, index) => ({
      id: text(e.id ?? e.uid ?? `entry:${index}`), title: text(e.title || e.comment || e.name || `Entry ${index + 1}`),
      keys: (Array.isArray(e.keys ?? e.key) ? e.keys ?? e.key : text(e.keys ?? e.key).split(',')).map(text).map(k => k.trim()).filter(Boolean),
      secondaryKeys: (Array.isArray(e.secondaryKeys ?? e.keysecondary) ? e.secondaryKeys ?? e.keysecondary : []).map(text),
      content: text(e.content), enabled: e.enabled !== false && !e.disable, constant: !!e.constant,
      selective: !!e.selective, selectiveLogic: number(e.selectiveLogic, 0, 0, 3),
      caseSensitive: !!(e.caseSensitive ?? e.case_sensitive), wholeWords: !!(e.wholeWords ?? e.matchWholeWords),
      order: number(e.order ?? e.insertion_order, 100, -10000, 10000),
      position: (e.position === 'before' || e.position === 'before_char' || e.position === 0 || e.extensions?.position === 0) ? 'before' : 'after',
      probability: e.useProbability === false ? 100 : number(e.probability ?? e.extensions?.probability, 100, 0, 100),
      excludeRecursion: !!(e.excludeRecursion ?? e.extensions?.exclude_recursion),
      preventRecursion: !!(e.preventRecursion ?? e.extensions?.prevent_recursion),
      source: clone(e),
    }));
    return { id: id(), name: text(source.name || name), enabled: true, global: false, entries, source: clone(source) };
  }
  function exportBook(book) {
    return { name: book.name, entries: Object.fromEntries(book.entries.map((e, i) => [i, { ...e.source, uid: i, key: e.keys, keysecondary: e.secondaryKeys, comment: e.title, content: e.content, constant: e.constant, disable: !e.enabled, selective: e.selective, selectiveLogic: e.selectiveLogic, caseSensitive: e.caseSensitive, matchWholeWords: e.wholeWords, order: e.order, position: e.position === 'before' ? 0 : 1, probability: e.probability, useProbability: true, excludeRecursion: e.excludeRecursion, preventRecursion: e.preventRecursion }])) };
  }
  function matches(key, haystack, entry) {
    // Imported slash-regex keys are preserved in source, but never executed implicitly.
    if (!key || /^\/.*\/[a-z]*$/i.test(key)) return false;
    const source = entry.caseSensitive ? haystack : haystack.toLocaleLowerCase();
    const needle = entry.caseSensitive ? key : key.toLocaleLowerCase();
    if (!entry.wholeWords) return source.includes(needle);
    let at = source.indexOf(needle);
    while (at >= 0) {
      const boundary = c => !c || !/[\p{L}\p{N}_]/u.test(c);
      if (boundary(source[at - 1]) && boundary(source[at + needle.length])) return true;
      at = source.indexOf(needle, at + 1);
    }
    return false;
  }
  function lore(books, history, settings = {}, seed = '') {
    const depth = number(settings.scanDepth, 8, 1, 100);
    const budget = number(settings.budget, 1200, 0, 32000);
    let corpus = history.filter(m => !m.hidden).slice(-depth).map(m => m.content).join('\n');
    const candidates = books.filter(b => b.enabled).flatMap(b => b.entries.filter(e => e.enabled).map(e => ({ ...e, sourceId: `${b.id}:${e.id}`, bookName: b.name }))).sort((a, b) => b.order - a.order);
    const active = [], skipped = [], seen = new Set(); let cost = 0;
    const roll = value => { let hash = 2166136261; for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); return (hash >>> 0) % 100; };
    for (let pass = 0; pass < (settings.recursive ? 4 : 1); pass++) {
      let additions = '';
      for (const entry of candidates) {
        if (seen.has(entry.sourceId) || (pass && entry.excludeRecursion)) continue;
        const primary = entry.keys.some(k => matches(k, corpus, entry));
        const second = entry.secondaryKeys.map(k => matches(k, corpus, entry));
        const selective = !entry.selective || !second.length || [second.some(Boolean), !second.every(Boolean), !second.some(Boolean), second.every(Boolean)][entry.selectiveLogic];
        if (!entry.constant && !(primary && selective)) continue;
        seen.add(entry.sourceId);
        if (roll(seed + entry.sourceId) >= entry.probability) continue;
        const entryCost = tokens(entry.content);
        if (cost + entryCost > budget) { skipped.push(entry); continue; }
        active.push(entry); cost += entryCost;
        if (!entry.preventRecursion) additions += '\n' + entry.content;
      }
      if (!additions) break;
      corpus += additions;
    }
    active.sort((a,b) => b.order - a.order);
    return { active, skipped, tokens: cost, before: active.filter(e => e.position === 'before').map(e => e.content).join('\n\n'), after: active.filter(e => e.position !== 'before').map(e => e.content).join('\n\n') };
  }
  function retrieve(documents, query, budget = 1200) {
    const terms = new Set(words(query).filter(w => w.length > 2));
    if (!terms.size) return [];
    const candidates = documents.filter(d => d.enabled !== false).flatMap(doc => {
      const paragraphs = text(doc.content).match(/[\s\S]{1,1400}(?:\n|$)|[\s\S]{1,1400}/g) || [];
      return paragraphs.map((content, index) => {
        const bag = new Set(words(content));
        const score = [...terms].reduce((n, term) => n + (bag.has(term) ? 1 : 0), 0);
        return { documentId: doc.id, name: doc.name, index, content, score };
      });
    }).filter(c => c.score).sort((a,b) => b.score - a.score);
    let cost = 0;
    return candidates.filter(c => { const size = tokens(c.content); if (cost + size > budget) return false; cost += size; return true; }).slice(0, 6);
  }
  function importChat(source, target, title) {
    const trimmed = text(source).trim(); let messages, metadata = {};
    try {
      const parsed = JSON.parse(trimmed);
      messages = Array.isArray(parsed) ? parsed : parsed.messages;
      metadata = Array.isArray(parsed) ? {} : parsed;
    } catch (_) {
      const lines = trimmed.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      metadata = lines[0]?.chat_metadata || {};
      messages = lines.filter(line => typeof line.mes === 'string' || typeof line.content === 'string');
    }
    if (!Array.isArray(messages) || !messages.every(m => m && (typeof m.content === 'string' || typeof m.mes === 'string'))) throw new Error('Invalid chat file');
    const result = session(target, title, messages);
    result.memory = text(metadata.memory ?? metadata.chat_metadata?.memory);
    result.note = text(metadata.note ?? metadata.chat_metadata?.note);
    return result;
  }
  function exportChat(chat, user = 'User', character = 'Assistant') {
    return [JSON.stringify({ user_name: user, character_name: character, create_date: new Date(chat.createdAt).toISOString(), chat_metadata: { memory: chat.memory, note: chat.note, nastyverse: { title: chat.title, personaId: chat.personaId } } }), ...chat.messages.map(m => JSON.stringify({ name: m.name || (m.role === 'user' ? user : character), is_user: m.role === 'user', is_system: m.role === 'system', send_date: new Date(m.createdAt).toISOString(), mes: m.content, swipes: m.variants, swipe_id: m.variant, extra: { isSmallSys: false }, hidden: m.hidden, bookmark: m.bookmark }))].join('\n');
  }
  function branch(chat, messageId, title) {
    const index = chat.messages.findIndex(m => m.id === messageId);
    if (index < 0) throw new Error('Unknown message');
    return { ...clone(chat), id: id(), title, parentId: chat.id, branchAt: messageId, createdAt: Date.now(), updatedAt: Date.now(), messages: clone(chat.messages.slice(0,index + 1)), draft: '', draftImages: [] };
  }
  function expand(source, context = {}) {
    return text(source).replace(/\{\{\s*(user|char|persona|description|scenario|lastMessage|date|time|newline)\s*\}\}/gi, (match, key) => {
      const map = { user: context.user || 'User', char: context.char || '', persona: context.persona || '', description: context.description || '', scenario: context.scenario || '', lastmessage: context.lastMessage || '', date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), newline: '\n' };
      return map[key.toLowerCase()];
    });
  }
  function personaContext(persona, scope = {}) {
    const base = persona || { name: 'User', description: '', variations: [] };
    const activeVariations = (Array.isArray(base.variations) ? base.variations : []).filter(variation =>
      variation && variation.enabled !== false && text(variation.content).trim() &&
      ((scope.characterId && Array.isArray(variation.characterIds) && variation.characterIds.includes(scope.characterId)) ||
       (scope.sessionId && Array.isArray(variation.sessionIds) && variation.sessionIds.includes(scope.sessionId)))
    );
    return { ...base, baseDescription: text(base.description), description: [text(base.description), ...activeVariations.map(v => text(v.content))].filter(Boolean).join('\n\n'), activeVariations };
  }
  const api = { clone, id, text, number, tokens, defaults, message, session, migrate, normalizeWorkspace, normalizeBook, exportBook, lore, retrieve, importChat, exportChat, branch, expand, personaContext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NVCore = api;
})(globalThis);
