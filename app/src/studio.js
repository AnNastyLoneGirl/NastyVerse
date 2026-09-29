/* Conversation workspace. Native generation remains in the single Tauri host. */
const NV = { data: NVCore.defaults(), db: null, ready: false, saving: Promise.resolve(), groupId: '', activeRequest: null, prompt: null, promptHistory: null, undo: new Map(), search: '', saved: true, scope: null, closedTarget: '', chatView: 'library' };
const nvText = (fr, en) => state.locale.startsWith('fr') ? fr : en;
const nvEscape = value => escapeHtml(value);
const nvButton = (action, label, primary = false) => `<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-ghost'} btn-small" data-nv="${nvEscape(action)}">${nvEscape(label)}</button>`;
const nvField = (key, label, value = '', type = 'text', options = {}) => ({ key, label, value, type, ...options });
function nvGuard(fn) { return (...args) => { if (args[0]?.type === 'submit') args[0].preventDefault(); return Promise.resolve().then(() => fn(...args)).catch(error => toast(String(error.message || error), 'error')); }; }
function nvBind(root, handlers) { root.querySelectorAll('[data-nv]').forEach(button => { const handler = handlers[button.dataset.nv]; if (handler) button.addEventListener('click', nvGuard(handler)); }); }
function nvDialog(title, content, wide = false) {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog'); dialog.className = `nv-dialog ${wide ? 'nv-wide' : ''}`;
  dialog.innerHTML = `<header><h2>${nvEscape(title)}</h2><button class="btn btn-ghost btn-small" aria-label="${nvEscape(nvText('Fermer','Close'))}" data-close>×</button></header><div class="nv-dialog-content">${content}</div>`;
  document.body.append(dialog); dialog.showModal();
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { dialog.remove(); previous?.focus(); }, { once: true });
  return dialog;
}
function nvForm(title, fields, description = '') {
  return new Promise(resolve => {
    const dialog = nvDialog(title, `<p class="nv-muted">${nvEscape(description)}</p><form class="nv-form">${fields.map(f => {
      const key = nvEscape(f.key), label = nvEscape(f.label), value = nvEscape(f.value);
      const attributes = `${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''}`;
      if (f.type === 'checkbox') return `<label class="nv-check"><input name="${key}" type="checkbox" ${f.value ? 'checked' : ''}>${label}</label>`;
      if (f.type === 'multiselect') return `<fieldset><legend>${label}</legend>${(f.options || []).map(o => `<label class="nv-check"><input name="${key}" type="checkbox" value="${nvEscape(o.value)}" ${(f.value || []).includes(o.value) ? 'checked' : ''}>${nvEscape(o.label)}</label>`).join('') || `<p class="nv-muted">${nvText('Aucun élément disponible.','No items available.')}</p>`}</fieldset>`;
      const input = f.type === 'textarea' ? `<textarea name="${key}" rows="${f.rows || 5}" ${attributes}>${value}</textarea>` : f.type === 'select' ? `<select name="${key}">${(f.options || []).map(o => `<option value="${nvEscape(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${nvEscape(o.label)}</option>`).join('')}</select>` : `<input name="${key}" type="${f.type}" value="${value}" ${attributes} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`;
      return `<label><span>${label}</span>${input}${f.help ? `<small>${nvEscape(f.help)}</small>` : ''}</label>`;
    }).join('')}<footer><button type="button" class="btn btn-ghost" data-cancel>${nvText('Annuler','Cancel')}</button><button type="submit" class="btn btn-primary">${nvText('Enregistrer','Save')}</button></footer></form>`);
    const advancedKeys = new Set(['noteDepth','noteInterval','wholeWords','caseSensitive','secondaryKeys','selectiveLogic','order','position','probability','topK','minP','repetitionPenalty','frequencyPenalty','presencePenalty','seed']);
    const advanced = fields.filter(f => advancedKeys.has(f.key));
    if (advanced.length) {
      const details = document.createElement('details'); details.className = 'nv-advanced';
      const summary = document.createElement('summary'); summary.textContent = nvText('Options avancées','Advanced options'); details.append(summary);
      const form = dialog.querySelector('form'); form.insertBefore(details,form.querySelector('footer'));
      for (const field of advanced) { const input = form.elements.namedItem(field.key); if (input?.closest('label')) details.append(input.closest('label')); }
    }
    let result = null;
    dialog.addEventListener('close', () => resolve(result), { once: true });
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault(); const data = new FormData(event.target);
      result = Object.fromEntries(fields.map(f => [f.key, f.type === 'checkbox' ? data.has(f.key) : f.type === 'multiselect' ? data.getAll(f.key) : f.type === 'number' ? Number(data.get(f.key)) : String(data.get(f.key) || '')])); dialog.close();
    };
    dialog.querySelector('input,textarea,select')?.focus();
  });
}
function nvStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = NV.db.transaction('workspace', mode);
    let result;
    const request = operation(transaction.objectStore('workspace'));
    if (request) request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Storage failure'));
    transaction.onabort = () => reject(transaction.error || new Error('Storage aborted'));
  });
}
async function nvInit() {
  NV.db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('nastyverse-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const saved = await nvStore('readonly', store => store.get('current'));
  NV.data = saved ? NVCore.normalizeWorkspace(saved) : NVCore.migrate(getCharacters(), getConversations());
  NV.ready = true;
  if (!saved) await nvSave();
  const last = NV.data.sessions.find(s => s.id === NV.data.lastSession);
  if (last?.targetId.startsWith('group:')) NV.groupId = last.targetId.slice(6);
  else if (last) { state.activeCharacterId = last.targetId; localStorage.setItem(STORAGE.activeCharacter,last.targetId); }
  nvAppearance();
  window.addEventListener('beforeunload', event => { if (!NV.saved) { event.preventDefault(); event.returnValue = ''; } });
}
function nvSave() {
  NV.saved = false;
  const snapshot = NVCore.clone(NV.data);
  const task = NV.saving.catch(() => {}).then(() => nvStore('readwrite', store => store.put(snapshot, 'current')));
  NV.saving = task;
  task.then(() => { if (NV.saving === task) { NV.saved = true; document.getElementById('nv-storage-error')?.remove(); } }, () => {
    if (!document.getElementById('nv-storage-error')) {
      const banner = document.createElement('div'); banner.id = 'nv-storage-error'; banner.className = 'nv-error-banner';
      banner.textContent = nvText('Sauvegarde locale impossible. Gardez cette fenêtre ouverte et exportez une sauvegarde depuis Outils.','Local save failed. Keep this window open and export a backup from Tools.'); document.body.append(banner);
    }
  });
  return task;
}
function nvSession() {
  if (NV.scope) return NV.scope;
  const target = NV.groupId ? `group:${NV.groupId}` : state.activeCharacterId;
  return NV.data.sessions.find(s => s.id === NV.data.active[target]) || null;
}
function nvPersona(session = nvSession(), character = null) {
  const persona = NV.data.personas.find(p => p.id === (session?.personaId || NV.data.defaultPersona));
  return NVCore.personaContext(persona, {sessionId:session?.id,characterId:character?.id || (session?.targetId?.startsWith('group:') ? null : session?.targetId)});
}
function nvEnsureSession(character) {
  const target = NV.groupId ? `group:${NV.groupId}` : character?.id;
  if (!target) return null;
  let chat = NV.data.sessions.find(s => s.id === NV.data.active[target]);
  if (!chat) {
    const group = NV.data.groups.find(g => g.id === NV.groupId);
    chat = NVCore.session(target, group?.name || character?.name);
    if (character?.firstMessage && !group) chat.messages.push(NVCore.message({ role: 'assistant', content: NVCore.expand(character.firstMessage, { char: character.name, user: nvPersona(chat).name }), name: character.name, characterId: character.id, variants: [character.firstMessage, ...(character.alternateGreetings || [])].map(s => NVCore.expand(s, { char: character.name, user: nvPersona(chat).name })) }));
    NV.data.sessions.push(chat); NV.data.active[target] = chat.id; nvSave();
  }
  NV.data.lastSession = chat.id;
  return chat;
}
function nvSelectSession(chat) {
  NV.closedTarget = '';
  NV.data.active[chat.targetId] = chat.id; NV.data.lastSession = chat.id;
  NV.groupId = chat.targetId.startsWith('group:') ? chat.targetId.slice(6) : '';
  if (!NV.groupId) { state.activeCharacterId = chat.targetId; localStorage.setItem(STORAGE.activeCharacter, chat.targetId); }
  NV.search = ''; NV.chatView = 'conversation'; nvSave(); goTo('chat',{view:'conversation'});
}
function nvCheckpoint(chat) {
  const stack = NV.undo.get(chat.id) || []; stack.push(NVCore.clone(chat)); if (stack.length > 20) stack.shift(); NV.undo.set(chat.id, stack);
}
function nvChanged(chat) { chat.updatedAt = Date.now(); nvSave(); if (state.currentPage === 'chat') renderChat(); }
function nvContextSession(character) {
  if (NV.scope) return NV.scope;
  const current = nvSession();
  if (current?.targetId === character.id || NV.data.groups.some(g => `group:${g.id}` === current?.targetId && g.members.includes(character.id))) return current;
  return NV.data.sessions.find(s => s.id === NV.data.active[character.id]) || null;
}
function nvPromptData(character, history = NV.promptHistory || nvContextSession(character)?.messages || []) {
  const chat = nvContextSession(character), persona = nvPersona(chat, character);
  const books = NV.data.books.filter(b => b.global || chat?.bookIds?.includes(b.id) || b.characterId === character.id);
  if (character.characterBook?.entries) { const book = NVCore.normalizeBook(character.characterBook, character.name); book.id = `card:${character.id}`; books.push(book); }
  const lore = NVCore.lore(books, history, NV.data.lore, `${chat?.id || ''}:${history.length}`);
  const expand = source => NVCore.expand(source, { char: character.name, user: persona.name, persona: persona.description, description: character.description, scenario: chat?.scenario || character.scenario, lastMessage: history.at(-1)?.content });
  const sources = NVCore.retrieve(NV.data.documents.filter(d => chat?.documentIds?.includes(d.id)), history.filter(m => m.role === 'user').slice(-2).map(m => m.content).join('\n'));
  const memory = chat?.memory ? `[${nvText('Mémoire de la conversation','Conversation memory')}]\n${chat.memory}` : '';
  const documents = sources.length ? `[${nvText('Extraits de documents de référence','Reference document excerpts')}]\n${sources.map(d => `[${d.name} #${d.index + 1}]\n${d.content}`).join('\n\n')}` : '';
  return { persona, lore, sources, before: expand(lore.before), after: expand([lore.after, memory, documents].filter(Boolean).join('\n\n')), expand };
}
function nvPreparedHistory(character, history) {
  const chat = nvContextSession(character); const data = nvPromptData(character, history);
  let entries = history.filter(m => !m.hidden).map(m => ({ ...m, content: data.expand(m.content) }));
  if (chat?.targetId.startsWith('group:')) entries = entries.map(m => ({ ...m, content: m.role === 'assistant' && m.name && m.name !== character.name ? `${m.name}: ${m.content}` : m.content }));
  if (chat?.note && history.filter(m => m.role === 'user').length % Math.max(1, Number(chat.noteInterval) || 1) === 0) {
    entries.splice(Math.max(0, entries.length - Number(chat.noteDepth || 0)), 0, { role: 'system', content: data.expand(chat.note), injectedStory: true });
  }
  return entries;
}
function nvBuildChat(character, history, params) {
  const data = nvPromptData(character, history), chat = nvContextSession(character);
  const permanent = [effectiveSystemPrompt(character), data.before, character.description, character.personality, chat?.scenario || character.scenario, data.persona.description, data.after].filter(Boolean).map(content => ({ role: 'system', content: data.expand(content) }));
  let examples = parseSillyTavernExamples(character.exampleMessages, character, getActiveContextPreset(), false).flatMap(block => parseExampleDialogueBlock(block, character)).map(m => ({ role: m.role, content: m.content }));
  let recent = nvPreparedHistory(character, history).map(m => ({ role: m.attachments?.some(a => a.sendToModel) ? 'user' : m.role, content: nvMultimodalContent(m) }));
  const tail = effectivePostHistoryInstructions(character) ? [{ role: 'system', content: effectivePostHistoryInstructions(character) }] : [];
  const budget = Math.max(128, params.contextTokens - params.maxTokens);
  if (getContextFormatting().exampleMessagesBehavior === 'strip') examples = [];
  const assemble = () => [...permanent, ...examples, ...recent, ...tail];
  while (estimateChatMessagesTokens(assemble()) > budget && examples.length) examples.shift();
  while (estimateChatMessagesTokens(assemble()) > budget && recent.length > 1) {
    const index = recent.findIndex(m => m.role !== 'system'); if (index < 0) break; recent.splice(index, 1);
  }
  return assemble();
}
function nvMarkdownSafeUrl(url) {
  const value = String(url || '').trim().replace(/&amp;/g, '&');
  if (/^(https?:|mailto:)/i.test(value) || value.startsWith('#')) return value;
  return '';
}
function nvDialogueQuotePair(depth = 0) {
  const preferred = typeof getDialogueQuoteMode === 'function' ? getDialogueQuoteMode() : 'straight';
  const usePreferred = depth % 2 === 0;
  const mode = usePreferred ? preferred : (preferred === 'french' ? 'straight' : 'french');
  return mode === 'french'
    ? { open: '«', close: '»' }
    : { open: '&quot;', close: '&quot;' };
}
function nvDialogueQuoteRaw(node) {
  if (!node || node.type === 'text') return node?.value || '';
  return `${node.openRaw || ''}${(node.children || []).map(nvDialogueQuoteRaw).join('')}${node.closed ? (node.closeRaw || '') : ''}`;
}
function nvRenderDialogueQuotes(input, hold) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const appendText = value => {
    if (value) stack[stack.length - 1].children.push({ type: 'text', value });
  };
  const openQuote = (style, raw) => {
    const node = { type: 'quote', style, openRaw: raw, closeRaw: '', closed: false, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  };
  const closeQuote = (style, raw) => {
    const top = stack[stack.length - 1];
    if (top?.type === 'quote' && top.style === style) {
      top.closed = true;
      top.closeRaw = raw;
      stack.pop();
      return true;
    }
    return false;
  };

  const tokenRegex = /&quot;|“|”|«|»/g;
  let cursor = 0;
  let match;
  while ((match = tokenRegex.exec(String(input || '')))) {
    appendText(input.slice(cursor, match.index));
    const raw = match[0];
    if (raw === '«') openQuote('french', raw);
    else if (raw === '»') { if (!closeQuote('french', raw)) appendText(raw); }
    else if (raw === '“') openQuote('curly', raw);
    else if (raw === '”') { if (!closeQuote('curly', raw)) appendText(raw); }
    else if (raw === '&quot;') {
      const top = stack[stack.length - 1];
      if (!(top?.type === 'quote' && top.style === 'straight' && closeQuote('straight', raw))) openQuote('straight', raw);
    }
    cursor = match.index + raw.length;
  }
  appendText(String(input || '').slice(cursor));

  const renderNode = (node, depth = 0) => {
    if (node.type === 'text') return node.value;
    if (!node.closed) return nvDialogueQuoteRaw(node);
    const pair = nvDialogueQuotePair(depth);
    const inner = node.children.map(child => renderNode(child, depth + 1)).join('').trim();
    const quoted = `${pair.open}${inner}${pair.close}`;
    return depth === 0 ? hold(`<span class="nv-md-dialogue">${quoted}</span>`) : quoted;
  };
  return root.children.map(node => renderNode(node, 0)).join('');
}
function nvMarkdownInline(content) {
  let rendered = nvEscape(String(content ?? ''));
  const protectedParts = [];
  const hold = html => { const key = `\u0002${protectedParts.length}\u0002`; protectedParts.push(html); return key; };
  rendered = rendered.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${code}</code>`));
  rendered = rendered.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, (_, alt, href) => {
    const safe = nvMarkdownSafeUrl(href); if (!safe) return `![${alt}](${href})`;
    return hold(`<a class="nv-md-image-link" href="${nvEscape(safe)}" target="_blank" rel="noopener noreferrer" title="${nvEscape(alt)}">🖼 ${alt || nvText('Image','Image')}</a>`);
  });
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, (_, label, href) => {
    const safe = nvMarkdownSafeUrl(href); if (!safe) return `[${label}](${href})`;
    return hold(`<a href="${nvEscape(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });
  // NastyVerse RP convention: quoted text is dialogue. Nested quotations are
  // normalized with the opposite quote style so an inner citation can never
  // visually collide with the outer dialogue delimiter. Source text is untouched.
  rendered = nvRenderDialogueQuotes(rendered, hold);
  rendered = rendered.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  return rendered.replace(/\u0002(\d+)\u0002/g, (_, i) => protectedParts[Number(i)] || '');
}
function nvMarkdownTableCells(line) {
  let value = String(line || '').trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map(cell => cell.trim());
}
function nvMarkdown(content) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const isTableDivider = line => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const isBlockStart = (line, next = '') => /^\s*```/.test(line) || /^\s{0,3}#{1,6}\s+/.test(line) || /^\s*>/.test(line) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) || /^\s*[-+*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || (line.includes('|') && isTableDivider(next));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i], next = lines[i + 1] || '';
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*```\s*([^\s`]*)?.*$/);
    if (fence) {
      const language = fence[1] || ''; const code = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      html.push(`<pre${language ? ` data-language="${nvEscape(language)}"` : ''}><code>${nvEscape(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { const level = heading[1].length; html.push(`<h${level}>${nvMarkdownInline(heading[2])}</h${level}>`); i++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(line)) {
      const quote = []; while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      html.push(`<blockquote>${quote.map(nvMarkdownInline).join('<br>')}</blockquote>`); continue;
    }
    if (line.includes('|') && isTableDivider(next)) {
      const headers = nvMarkdownTableCells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(nvMarkdownTableCells(lines[i++]));
      html.push(`<div class="nv-md-table-wrap"><table><thead><tr>${headers.map(cell => `<th>${nvMarkdownInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${headers.map((_, index) => `<td>${nvMarkdownInline(row[index] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)/), ordered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (unordered || ordered) {
      const orderedList = !!ordered, items = [];
      const pattern = orderedList ? /^\s*\d+[.)]\s+(.+)/ : /^\s*[-+*]\s+(.+)/;
      while (i < lines.length) { const match = lines[i].match(pattern); if (!match) break; items.push(match[1]); i++; }
      const tag = orderedList ? 'ol' : 'ul'; html.push(`<${tag}>${items.map(item => `<li>${nvMarkdownInline(item)}</li>`).join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1] || '')) paragraph.push(lines[i++]);
    html.push(`<p>${paragraph.map(nvMarkdownInline).join('<br>')}</p>`);
  }
  return html.join('');
}
function nvCaptureChatScroll() {
  const scroller = document.querySelector('.messages[data-chat-session]');
  if (!scroller) return null;
  const bounds = scroller.getBoundingClientRect();
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const nearBottom = maxScrollTop - scroller.scrollTop <= 48;
  let anchor = null;
  for (const article of scroller.querySelectorAll('[data-message]')) {
    if (article.hidden) continue;
    const rect = article.getBoundingClientRect();
    if (rect.bottom >= bounds.top && rect.top <= bounds.bottom) {
      anchor = { id: article.dataset.message, offset: rect.top - bounds.top };
      break;
    }
  }
  return {
    sessionId: scroller.dataset.chatSession || '',
    scrollTop: scroller.scrollTop,
    nearBottom,
    anchor,
  };
}

function nvRestoreChatScroll(snapshot) {
  requestAnimationFrame(() => {
    const scroller = document.querySelector('.messages[data-chat-session]');
    if (!scroller) return;
    const sessionId = scroller.dataset.chatSession || '';
    const sameConversation = snapshot?.sessionId && snapshot.sessionId === sessionId;
    const previousBehavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    if (!sameConversation || snapshot.nearBottom) {
      scroller.scrollTop = scroller.scrollHeight;
    } else if (snapshot.anchor?.id) {
      const anchor = [...scroller.querySelectorAll('[data-message]')].find(article => article.dataset.message === snapshot.anchor.id);
      if (anchor) {
        const bounds = scroller.getBoundingClientRect();
        const currentOffset = anchor.getBoundingClientRect().top - bounds.top;
        scroller.scrollTop += currentOffset - snapshot.anchor.offset;
      } else {
        scroller.scrollTop = snapshot.scrollTop;
      }
    } else {
      scroller.scrollTop = snapshot.scrollTop;
    }
    if (previousBehavior) scroller.style.scrollBehavior = previousBehavior;
    else scroller.style.removeProperty('scroll-behavior');
  });
}

function nvResizeComposerInput(input) {
  if (!input) return;
  input.style.height = 'auto';
  const styles = getComputedStyle(input);
  const minHeight = Number.parseFloat(styles.minHeight) || 40;
  const maxHeight = Number.parseFloat(styles.maxHeight) || 78;
  const nextHeight = Math.max(minHeight, Math.min(input.scrollHeight, maxHeight));
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = input.scrollHeight > maxHeight + 1 ? 'auto' : 'hidden';
}


function nvMessageAvatarMarkup(message, persona, fallbackCharacter, settings) {
  if (!message || message.role === 'system') return '';
  let owner = null;
  let visible = false;
  if (message.role === 'user') {
    owner = NV.data.personas.find(item => item.id === message.personaId) || persona || { name: message.name || nvText('Vous','You'), avatar: '' };
    visible = settings.showPersonaAvatar;
  } else if (message.role === 'assistant') {
    owner = getCharacters().find(character => character.id === message.characterId)
      || getCharacters().find(character => character.name === message.name)
      || fallbackCharacter
      || { name: message.name || nvText('Assistant','Assistant'), avatar: '' };
    visible = settings.showCharacterAvatar;
  }
  if (!visible) return '';
  const name = message.name || owner?.name || '?';
  const source = typeof resolvedAvatarSource === 'function' ? resolvedAvatarSource(owner) : '';
  const roleClass = message.role === 'user' ? 'nv-avatar-persona' : 'nv-avatar-character';
  const avatarRole = message.role === 'user' ? 'persona' : 'character';
  const inlineStyle = typeof messageAvatarInlineStyle === 'function' ? messageAvatarInlineStyle(avatarRole, settings) : '';
  if (source) return `<div class="nv-message-avatar ${roleClass}" title="${nvEscape(name)}"><img src="${nvEscape(source)}" alt=""${inlineStyle ? ` style="${inlineStyle}"` : ''}></div>`;
  return `<div class="nv-message-avatar ${roleClass} nv-avatar-fallback" title="${nvEscape(name)}" aria-hidden="true">${nvEscape(String(name || '?').slice(0,1).toUpperCase())}</div>`;
}
function nvMessageLayout(message, persona, fallbackCharacter, settings) {
  const isUser = message?.role === 'user';
  const isAssistant = message?.role === 'assistant';
  const align = isUser ? settings.personaAlign : isAssistant ? settings.characterAlign : 'left';
  const side = isUser ? settings.personaAvatarSide : isAssistant ? settings.characterAvatarSide : 'left';
  const vertical = settings.avatarVertical === 'center' ? 'center' : settings.avatarVertical === 'bottom' ? 'bottom' : 'top';
  return { align, side, vertical, avatar: nvMessageAvatarMarkup(message, persona, fallbackCharacter, settings) };
}
function nvMessageRoleName(message, persona, fallbackCharacter) {
  if (message?.name) return message.name;
  if (message?.role === 'user') return persona?.name || nvText('Vous','You');
  if (message?.role === 'assistant') {
    const owner = getCharacters().find(character => character.id === message.characterId) || fallbackCharacter;
    return owner?.name || 'Assistant';
  }
  return 'System';
}
function nvPromptInspectionRecord(character, history, chat, request, params, reconstructed = false) {
  const data = nvPromptData(character, history);
  const persona = data.persona || {};
  const scenario = chat?.scenario || character.scenario || '';
  const documentsText = (data.sources || []).map(source => source.content || '').join('\n\n');
  const historyText = nvPreparedHistory(character, history).filter(entry => !entry.injectedStory).map(entry => entry.content || '').join('\n\n');
  const characterItems = {
    description: estimateTokens(character.description),
    personality: estimateTokens(character.personality),
    scenario: estimateTokens(scenario),
    examples: request.mode === 'text' ? estimateTokens(request.examples) : estimateTokens(character.exampleMessages),
    persona: estimateTokens(persona.description),
    system: estimateTokens(effectiveSystemPrompt(character)),
  };
  const extensionItems = {
    memory: estimateTokens(chat?.memory),
    authorNote: estimateTokens(chat?.note),
    smartContext: estimateTokens(documentsText),
    postHistory: estimateTokens(effectivePostHistoryInstructions(character)),
  };
  const worldInfo = Number(data.lore?.tokens) || estimateTokens([data.before, data.lore?.after].filter(Boolean).join('\n\n'));
  const totalTokens = request.mode === 'text' ? estimateTokens(request.prompt) : estimateChatMessagesTokens(request.messages || []);
  const config = state.backendConfig || {};
  const provider = typeof backendDefinition === 'function' ? backendDefinition(config.backendType) : null;
  const instructionState = typeof getInstructionPresetState === 'function' ? getInstructionPresetState() : null;
  const contextPreset = typeof getActiveContextPreset === 'function' ? getActiveContextPreset() : null;
  return {
    version: 1,
    createdAt: Date.now(),
    reconstructed: Boolean(reconstructed),
    mode: request.mode,
    prompt: request.mode === 'text' ? String(request.prompt || '') : '',
    messages: request.mode === 'chat' ? NVCore.clone(request.messages || []) : [],
    stopStrings: request.mode === 'text' ? [...(request.stopStrings || [])] : [],
    meta: {
      backendType: String(config.backendType || ''),
      provider: String(provider?.label || config.backendType || ''),
      model: String(config.model || state.modelStatus?.modelName || ''),
      character: String(character.name || ''),
      contextPreset: String(contextPreset?.name || ''),
      instructionPreset: String(instructionState?.active || ''),
      contextTokens: Number(params?.contextTokens) || 0,
      maxTokens: Number(params?.maxTokens) || 0,
    },
    itemization: {
      character: characterItems,
      worldInfo,
      history: estimateTokens(historyText),
      extensions: extensionItems,
      totalTokens,
      contextAllowed: Math.max(0, (Number(params?.contextTokens) || 0) - (Number(params?.maxTokens) || 0)),
    },
  };
}
function nvMessagePromptRecord(message) {
  if (!message || message.role !== 'assistant') return null;
  const records = Array.isArray(message.promptRecords) ? message.promptRecords : [];
  const index = Math.max(0, Number(message.variant) || 0);
  return records[index] || null;
}

function nvMessageVariantNav(message) {
  if (message?.role !== 'assistant') return '';
  const total = Math.max(1, Array.isArray(message.variants) ? message.variants.length : 1);
  const current = Math.min(Math.max(Number(message.variant) || 0, 0), total - 1);
  if (total <= 1) {
    return `<div class="nv-variant-nav nv-variant-nav-single" aria-label="${nvText('Variantes de réponse','Response variants')}"><button type="button" data-message-action="next" aria-label="${nvText('Créer une autre variante','Create another variant')}">›</button></div>`;
  }
  return `<div class="nv-variant-nav" aria-label="${nvText('Variantes de réponse','Response variants')}"><button type="button" data-message-action="previous" aria-label="${nvText('Variante précédente','Previous variant')}" ${current <= 0 ? 'disabled' : ''}>‹</button><span>${current + 1}/${total}</span><button type="button" data-message-action="next" aria-label="${current >= total - 1 ? nvText('Créer une autre variante','Create another variant') : nvText('Variante suivante','Next variant')}">›</button></div>`;
}
function nvMessageArticle(message, index, chat, persona, fallbackCharacter, settings) {
  const layout = nvMessageLayout(message, persona, fallbackCharacter, settings);
  const hiddenBySearch = NV.search && !nvMessageDisplayContent(message).toLocaleLowerCase().includes(NV.search.toLocaleLowerCase());
  const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5"/></svg>`;
  const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.8-10.8a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 7.5l3 3"/></svg>`;
  const contextIcon = message.hidden
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.6 10.6 0 0 1 12 5c5.5 0 9 7 9 7a16 16 0 0 1-2.3 3.2M6.6 6.6C4.2 8.2 3 12 3 12s3.5 7 9 7a9.6 9.6 0 0 0 3.4-.6"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="2.5"/></svg>`;
  const contextLabel = message.hidden ? nvText('Afficher dans le contexte','Include in context') : nvText('Cacher du contexte','Hide from context');
  const promptIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h4"/></svg>`;
  const promptAction = message.role === 'assistant' ? `<button type="button" data-message-action="prompt" aria-label="${nvText('Voir le prompt de ce message','Inspect this message prompt')}" title="${nvText('Voir le prompt de ce message','Inspect this message prompt')}">${promptIcon}</button>` : '';
  const actions = `<div class="nv-message-actions"><button type="button" data-message-action="delete" aria-label="${nvText('Supprimer le message','Delete message')}" title="${nvText('Supprimer le message','Delete message')}">${deleteIcon}</button><button type="button" data-message-action="edit" aria-label="${nvText('Éditer le message','Edit message')}" title="${nvText('Éditer le message','Edit message')}">${editIcon}</button><button type="button" class="nv-context-toggle ${message.hidden ? 'is-hidden' : 'is-visible'}" data-message-action="hide" aria-pressed="${message.hidden ? 'true' : 'false'}" aria-label="${contextLabel}" title="${contextLabel}">${contextIcon}</button>${promptAction}</div>`;
  const variantNav = nvMessageVariantNav(message);
  return `<article class="message message-${message.role} nv-align-${layout.align} ${message.hidden ? 'nv-excluded' : ''}" data-message="${nvEscape(message.id)}" ${hiddenBySearch ? 'hidden' : ''}>${actions}<div class="nv-message-row nv-avatar-${layout.side} nv-avatar-v-${layout.vertical}">${layout.avatar}<div class="nv-message-body"><div class="message-role">${nvEscape(nvMessageRoleName(message, persona, fallbackCharacter))}<small>${message.hidden ? nvText(' · Hors contexte',' · Excluded') : ''}</small></div><div class="message-bubble nv-markdown-surface ${variantNav ? 'nv-has-variant-nav' : ''}">${nvMarkdown(nvMessageDisplayContent(message))}${nvMediaMarkup(message.attachments)}${variantNav}</div></div></div></article>`;
}
function nvStreamingMessageArticle(chat, persona, fallbackCharacter, settings) {
  if (!(state.sending && NV.activeRequest?.sessionId === chat.id) || NV.activeRequest?.variantMessageId) return '';
  const message = { role:'assistant', name:NV.activeRequest.name, characterId:NV.activeRequest.characterId };
  const layout = nvMessageLayout(message, persona, fallbackCharacter, settings);
  return `<article class="message message-assistant nv-align-${layout.align}"><div class="nv-message-row nv-avatar-${layout.side} nv-avatar-v-${layout.vertical}">${layout.avatar}<div class="nv-message-body"><div class="message-role">${nvEscape(NV.activeRequest.name)}</div><div id="nv-stream" class="message-bubble nv-markdown-surface">${nvMarkdown(nvChatTranslationApplies('assistant') ? nvText('Écriture et traduction en cours…','Writing and translating…') : (NV.activeRequest.content || nvText('Écriture en cours…','Writing…')))}</div><details id="nv-thinking" ${NV.activeRequest.reasoning ? '' : 'hidden'}><summary>${nvText('Raisonnement du modèle','Model reasoning')}</summary><pre></pre></details></div></div></article>`;
}

function nvOpenTimeline(chat) {
  if (!chat) return;
  const sessions = NV.data.sessions.filter(session => session.targetId === chat.targetId).sort((a,b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt);
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const viewStorageKey = `nastyverse.timeline.view:${chat.targetId}`;
  let savedView = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(viewStorageKey) || 'null');
    if (parsed && Number.isFinite(parsed.zoom) && Number.isFinite(parsed.panX) && Number.isFinite(parsed.panY)) savedView = parsed;
  } catch {}
  const tl = {
    zoom: savedView?.zoom ?? 1,
    panX: savedView?.panX ?? 0,
    panY: savedView?.panY ?? 0,
    hasSavedView: Boolean(savedView),
    showSwipes: false,
    expanded: new Set(),
    selected: '',
    graph: null,
    ignoreClick: '',
    search: '',
    panning: false,
    panPointer: null,
    spaceHeld: false,
  };
  const title = chat.targetId.startsWith('group:')
    ? (NV.data.groups.find(group => `group:${group.id}` === chat.targetId)?.name || chat.title)
    : (getCharacters().find(character => character.id === chat.targetId)?.name || chat.title);
  const dialog = nvDialog(`${nvText('Timeline','Timeline')} · ${title}`, `
    <div class="nv-timeline-toolbar">
      <button type="button" class="btn btn-ghost btn-small" data-tl="current">${nvText('Discussion actuelle','Current chat')}</button>
      <button type="button" class="btn btn-ghost btn-small" data-tl="swipes">${nvText('Afficher les variantes','Show swipes')}</button>
      <input type="search" data-tl-search placeholder="${nvEscape(nvText('Rechercher dans toutes les discussions…','Search all chats…'))}" aria-label="${nvEscape(nvText('Rechercher dans la timeline','Search timeline'))}">
      <span class="nv-timeline-count" data-tl-count></span>
      <button type="button" class="btn btn-ghost btn-small" data-tl="zoom-out" aria-label="${nvText('Dézoomer','Zoom out')}">−</button>
      <button type="button" class="btn btn-ghost btn-small" data-tl="fit">${nvText('Ajuster','Fit')}</button>
      <button type="button" class="btn btn-ghost btn-small" data-tl="zoom-in" aria-label="${nvText('Zoomer','Zoom in')}">+</button>
    </div>
    <div class="nv-timeline-layout">
      <div class="nv-timeline-viewport" data-tl-viewport>
        <div class="nv-timeline-space" data-tl-space><div class="nv-timeline-stage" data-tl-stage></div></div>
        <div class="nv-timeline-tooltip" data-tl-tooltip hidden></div>
      </div>
      <aside class="nv-timeline-inspector" data-tl-inspector>
        <span class="nv-eyebrow">TIMELINE</span>
        <h3>${nvText('Naviguez dans vos branches','Navigate your branches')}</h3>
        <p>${nvText('Glissez le fond pour déplacer la Timeline et utilisez la molette pour zoomer autour du curseur. Cliquez sur un nœud pour voir ses occurrences, double-cliquez pour y aller, ou maintenez-le pour déplier ses variantes.','Drag the background to pan the Timeline and use the wheel to zoom around the cursor. Click a node to inspect its occurrences, double-click to jump there, or hold it to expand its swipes.')}</p>
      </aside>
    </div>
    <div class="nv-timeline-legend">
      <span><i class="is-current"></i>${nvText('Discussion actuelle','Current chat')}</span>
      <span><i class="is-user"></i>${nvText('Utilisateur','User')}</span>
      <span><i class="is-assistant"></i>${nvText('Assistant','Assistant')}</span>
      <span><i class="is-swipe"></i>${nvText('Variante','Swipe')}</span>
    </div>`, true);
  dialog.classList.add('nv-timeline-dialog');
  const viewport = dialog.querySelector('[data-tl-viewport]');
  const space = dialog.querySelector('[data-tl-space]');
  const stage = dialog.querySelector('[data-tl-stage]');
  const inspector = dialog.querySelector('[data-tl-inspector]');
  const tooltip = dialog.querySelector('[data-tl-tooltip]');
  const count = dialog.querySelector('[data-tl-count]');
  const search = dialog.querySelector('[data-tl-search]');

  const canonical = value => String(value || '').replace(/\r\n/g,'\n').trim();
  const preview = value => canonical(value).replace(/\s+/g,' ').slice(0, 135) || nvText('(message vide)','(empty message)');
  const termsMatch = (text, query) => {
    const bag = String(text || '').toLocaleLowerCase();
    const terms = String(query || '').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return !terms.length || terms.every(term => bag.includes(term));
  };
  const nodeCenter = node => ({ x: node.x + 88, y: node.y + 31 });

  function buildGraph() {
    const nodes = [];
    const nodeByKey = new Map();
    const lookup = new Map();
    const edgeByKey = new Map();
    sessions.forEach((session, lane) => {
      let previous = null;
      session.messages.forEach((message, index) => {
        const selectedVariant = Math.max(0, Math.min(Number(message.variant) || 0, Math.max(0, (message.variants || []).length - 1)));
        const selectedContent = canonical(message.variants?.[selectedVariant] ?? message.content);
        const key = `${index}\u0000${message.role}\u0000${selectedContent}`;
        let node = nodeByKey.get(key);
        if (!node) {
          node = { id:`n${nodes.length}`, key, depth:index, role:message.role, content:selectedContent, occurrences:[], lanes:[], hasSwipes:false, swipeCount:0, swipe:false };
          nodes.push(node); nodeByKey.set(key,node);
        }
        const occurrence = { sessionId:session.id, messageId:message.id, index, variantIndex:selectedVariant, lane, isLast:index === session.messages.length - 1 };
        node.occurrences.push(occurrence); node.lanes.push(lane);
        node.hasSwipes ||= (message.variants?.length || 0) > 1;
        node.swipeCount = Math.max(node.swipeCount, Math.max(0,(message.variants?.length || 1) - 1));
        lookup.set(`${session.id}:${index}`,node.id);
        if (previous) {
          const edgeKey = `${previous}->${node.id}`;
          let edge = edgeByKey.get(edgeKey);
          if (!edge) { edge = { id:`e${edgeByKey.size}`, from:previous, to:node.id, sessions:new Set() }; edgeByKey.set(edgeKey,edge); }
          edge.sessions.add(session.id);
        }
        previous = node.id;
      });
    });
    const byDepth = new Map();
    nodes.forEach(node => {
      node.x = 82 + node.depth * 228;
      node.rawY = 70 + ((node.lanes.reduce((a,b) => a+b,0) / Math.max(1,node.lanes.length)) * 132);
      if (!byDepth.has(node.depth)) byDepth.set(node.depth,[]);
      byDepth.get(node.depth).push(node);
    });
    byDepth.forEach(column => {
      column.sort((a,b) => a.rawY - b.rawY);
      let last = 20;
      column.forEach(node => { node.y = Math.max(node.rawY,last); last = node.y + 92; });
    });
    const primaryById = new Map(nodes.map(node => [node.id,node]));
    const swipeNodes = [];
    const swipeEdges = [];
    for (const node of nodes) {
      if (!(tl.showSwipes || tl.expanded.has(node.id)) || !node.hasSwipes) continue;
      const variants = new Map();
      for (const occurrence of node.occurrences) {
        const session = sessionById.get(occurrence.sessionId); const message = session?.messages?.[occurrence.index];
        (message?.variants || []).forEach((variant, variantIndex) => {
          if (variantIndex === occurrence.variantIndex) return;
          const content = canonical(variant);
          const key = `${message.role}\u0000${content}`;
          if (!variants.has(key)) variants.set(key,{ content, role:message.role, occurrences:[] });
          variants.get(key).occurrences.push({ ...occurrence, variantIndex, isLast:occurrence.index === session.messages.length - 1 });
        });
      }
      let offset = 0;
      for (const variant of variants.values()) {
        const swipe = { id:`s${swipeNodes.length}:${node.id}`, role:variant.role, content:variant.content, occurrences:variant.occurrences, swipe:true, parentNodeId:node.id, hasSwipes:false, swipeCount:0, depth:node.depth, x:node.x + 26, y:node.y + 72 + offset * 68 };
        swipeNodes.push(swipe); offset += 1;
        const predecessors = new Set();
        variant.occurrences.forEach(occurrence => { if (occurrence.index > 0) { const predecessor = lookup.get(`${occurrence.sessionId}:${occurrence.index - 1}`); if (predecessor) predecessors.add(predecessor); } });
        if (!predecessors.size) predecessors.add(node.id);
        predecessors.forEach(from => swipeEdges.push({ id:`se${swipeEdges.length}`, from, to:swipe.id, sessions:new Set(variant.occurrences.map(item => item.sessionId)), swipe:true }));
      }
    }
    const allNodes = [...nodes,...swipeNodes];
    const allById = new Map(allNodes.map(node => [node.id,node]));
    const edges = [...edgeByKey.values(),...swipeEdges];
    let width = 520, height = 360;
    allNodes.forEach(node => { width = Math.max(width,node.x + 240); height = Math.max(height,node.y + 130); });
    return { nodes, swipeNodes, allNodes, allById, edges, lookup, width, height, primaryById };
  }

  function edgePath(edge) {
    const from = tl.graph.allById.get(edge.from), to = tl.graph.allById.get(edge.to);
    if (!from || !to) return '';
    const a = nodeCenter(from), b = nodeCenter(to);
    const dx = Math.max(42,Math.abs(b.x-a.x)*.46);
    return `M ${a.x} ${a.y} C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`;
  }

  const clampZoom = value => Math.max(.25,Math.min(2.5,Number(value) || 1));

  function applyView() {
    if (!tl.graph) return;
    tl.zoom = clampZoom(tl.zoom);
    stage.style.transform = `translate(${tl.panX}px,${tl.panY}px) scale(${tl.zoom})`;
  }

  function saveView() {
    try { localStorage.setItem(viewStorageKey,JSON.stringify({ zoom:tl.zoom, panX:tl.panX, panY:tl.panY })); } catch {}
  }

  function zoomAt(clientX, clientY, nextZoom) {
    if (!tl.graph) return;
    const rect = viewport.getBoundingClientRect();
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const worldX = (pointX - tl.panX) / tl.zoom;
    const worldY = (pointY - tl.panY) / tl.zoom;
    tl.zoom = clampZoom(nextZoom);
    tl.panX = pointX - worldX * tl.zoom;
    tl.panY = pointY - worldY * tl.zoom;
    applyView();
  }

  function zoomFromCenter(factor) {
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + viewport.clientWidth / 2,rect.top + viewport.clientHeight / 2,tl.zoom * factor);
    saveView();
  }

  function scrollToNode(node, flash = false) {
    if (!node) return;
    const center = nodeCenter(node);
    tl.panX = viewport.clientWidth / 2 - center.x * tl.zoom;
    tl.panY = viewport.clientHeight / 2 - center.y * tl.zoom;
    applyView();
    if (flash) {
      const element = stage.querySelector(`[data-tl-node="${node.id}"]`);
      element?.classList.add('is-flash'); setTimeout(() => element?.classList.remove('is-flash'),900);
    }
    saveView();
  }

  function currentLastNode() {
    return tl.graph?.nodes.filter(node => node.occurrences.some(occurrence => occurrence.sessionId === chat.id)).sort((a,b) => b.depth-a.depth)[0] || null;
  }

  function updateSearch(focus = false) {
    const query = search.value;
    tl.search = query;
    let first = null, matches = 0;
    stage.querySelectorAll('[data-tl-node]').forEach(element => {
      const node = tl.graph.allById.get(element.dataset.tlNode);
      const match = node && termsMatch(node.content,query);
      element.classList.toggle('is-search-dim',Boolean(query) && !match);
      element.classList.toggle('is-search-match',Boolean(query) && match);
      if (match && query) { matches += 1; if (!first) first = node; }
    });
    count.textContent = query ? `${matches} ${nvText('résultat(s)','result(s)')}` : `${sessions.length} ${nvText('discussion(s)','chat(s)')} · ${tl.graph.nodes.length} ${nvText('nœud(s)','node(s)')}`;
    if (focus && first) scrollToNode(first);
  }

  function renderInspector(node) {
    if (!node) {
      inspector.innerHTML = `<span class="nv-eyebrow">TIMELINE</span><h3>${nvText('Naviguez dans vos branches','Navigate your branches')}</h3><p>${nvText('Glissez le fond pour déplacer la Timeline et utilisez la molette pour zoomer autour du curseur. Cliquez sur un nœud pour voir ses occurrences, double-cliquez pour y aller, ou maintenez-le pour déplier ses variantes.','Drag the background to pan the Timeline and use the wheel to zoom around the cursor. Click a node to inspect its occurrences, double-click to jump there, or hold it to expand its swipes.')}</p>`;
      return;
    }
    const rows = node.occurrences.map((occurrence,index) => {
      const session = sessionById.get(occurrence.sessionId);
      const canGo = !node.swipe || occurrence.isLast || session?.messages?.[occurrence.index]?.variant === occurrence.variantIndex;
      return `<div class="nv-timeline-occurrence"><div><strong>${nvEscape(session?.title || nvText('Discussion','Chat'))}</strong><small>#${occurrence.index + 1}${occurrence.sessionId === chat.id ? ` · ${nvText('actuelle','current')}` : ''}</small></div><div><button type="button" class="btn btn-ghost btn-small" data-tl-go="${index}" ${canGo ? '' : 'disabled'}>${nvText('Aller au message','Go to message')}</button><button type="button" class="btn btn-ghost btn-small" data-tl-branch="${index}">${nvText('Créer une branche','Create branch')}</button></div></div>`;
    }).join('');
    inspector.innerHTML = `<span class="nv-eyebrow">${node.swipe ? nvText('VARIANTE','SWIPE') : nvText('MESSAGE','MESSAGE')}</span><h3>${nvEscape(node.role === 'user' ? nvText('Utilisateur','User') : node.role === 'assistant' ? nvText('Assistant','Assistant') : nvText('Système','System'))}</h3><div class="nv-timeline-fulltext">${nvEscape(node.content)}</div>${node.hasSwipes ? `<button type="button" class="btn btn-ghost btn-small" data-tl-expand>${tl.expanded.has(node.id) || tl.showSwipes ? nvText('Masquer les variantes','Hide swipes') : `${nvText('Afficher les variantes','Show swipes')} (${node.swipeCount})`}</button>` : ''}<div class="nv-timeline-occurrences">${rows}</div>`;
    inspector.querySelectorAll('[data-tl-go]').forEach(button => button.onclick = nvGuard(() => goToOccurrence(node,node.occurrences[Number(button.dataset.tlGo)])));
    inspector.querySelectorAll('[data-tl-branch]').forEach(button => button.onclick = nvGuard(() => branchFromOccurrence(node,node.occurrences[Number(button.dataset.tlBranch)])));
    inspector.querySelector('[data-tl-expand]')?.addEventListener('click', () => { tl.expanded.has(node.id) ? tl.expanded.delete(node.id) : tl.expanded.add(node.id); renderGraph(node.id); });
  }

  function pickOccurrence(node) {
    return [...node.occurrences].sort((a,b) => Number(b.sessionId === chat.id) - Number(a.sessionId === chat.id) || (sessionById.get(b.sessionId)?.updatedAt || 0) - (sessionById.get(a.sessionId)?.updatedAt || 0))[0];
  }

  async function switchSwipe(session, occurrence) {
    const message = session?.messages?.[occurrence.index];
    if (!message || occurrence.variantIndex == null || occurrence.variantIndex === message.variant) return;
    nvCheckpoint(session); message.variant = occurrence.variantIndex; message.content = message.variants[message.variant] ?? message.content; nvClearMessageDisplay(message);
    if (nvChatTranslationApplies(message.role) && String(nvChatTranslationConfig().targetLanguage).toLowerCase() !== 'en') {
      try { const display = await nvTranslateChatText(message.content,nvChatTranslationConfig().targetLanguage,'en'); nvSetMessageDisplay(message,display,nvChatTranslationConfig().targetLanguage); } catch (error) { console.warn('[timeline] Swipe display translation failed.',error); }
    }
    session.updatedAt = Date.now(); await nvSave();
  }

  async function goToOccurrence(node, occurrence) {
    const session = sessionById.get(occurrence?.sessionId); if (!session) return;
    const message = session.messages[occurrence.index]; if (!message) return;
    if (node.swipe && occurrence.variantIndex !== message.variant) {
      if (!occurrence.isLast) return;
      await switchSwipe(session,occurrence);
    }
    dialog.close(); nvSelectSession(session);
    setTimeout(() => { const target = [...pageRoot.querySelectorAll('[data-message]')].find(element => element.dataset.message === message.id); target?.scrollIntoView({block:'center'}); target?.classList.add('nv-timeline-jump'); setTimeout(() => target?.classList.remove('nv-timeline-jump'),1100); },80);
  }

  async function branchFromOccurrence(node, occurrence) {
    const session = sessionById.get(occurrence?.sessionId); const message = session?.messages?.[occurrence.index]; if (!session || !message) return;
    const branchNumber = NV.data.sessions.filter(item => item.parentId === session.id).length + 1;
    const branch = NVCore.branch(session,message.id,`${session.title} · ${nvText('branche','branch')} ${branchNumber}`);
    if (node.swipe) {
      const cloned = branch.messages.at(-1);
      if (cloned && cloned.variants?.[occurrence.variantIndex] != null) { cloned.variant = occurrence.variantIndex; cloned.content = cloned.variants[occurrence.variantIndex]; nvClearMessageDisplay(cloned); }
    }
    NV.data.sessions.push(branch); await nvSave(); dialog.close(); nvSelectSession(branch);
    setTimeout(() => { const target = pageRoot.querySelector('[data-message]:last-of-type'); target?.scrollIntoView({block:'center'}); },80);
  }

  async function activateNode(node) {
    const occurrence = pickOccurrence(node); if (!occurrence) return;
    if (node.swipe && !occurrence.isLast) return branchFromOccurrence(node,occurrence);
    return goToOccurrence(node,occurrence);
  }

  function bindNodes() {
    stage.querySelectorAll('[data-tl-node]').forEach(element => {
      const node = tl.graph.allById.get(element.dataset.tlNode); if (!node) return;
      let pressTimer = 0;
      element.addEventListener('click', () => { if (tl.ignoreClick === node.id) { tl.ignoreClick = ''; return; } tl.selected = node.id; stage.querySelectorAll('[data-tl-node]').forEach(item => item.classList.toggle('is-selected',item.dataset.tlNode === node.id)); renderInspector(node); });
      element.addEventListener('dblclick', event => { event.preventDefault(); activateNode(node); });
      if (node.hasSwipes && !node.swipe) {
        element.addEventListener('pointerdown', () => { pressTimer = window.setTimeout(() => { tl.ignoreClick = node.id; tl.expanded.has(node.id) ? tl.expanded.delete(node.id) : tl.expanded.add(node.id); renderGraph(node.id); },480); });
        ['pointerup','pointercancel','pointerleave'].forEach(type => element.addEventListener(type,() => clearTimeout(pressTimer)));
      }
      element.addEventListener('pointerenter', () => { tooltip.hidden = false; tooltip.textContent = preview(node.content); stage.querySelectorAll('[data-tl-edge]').forEach(edge => edge.classList.toggle('is-hover',edge.dataset.from === node.id || edge.dataset.to === node.id)); });
      element.addEventListener('pointermove', event => { const rect = viewport.getBoundingClientRect(); tooltip.style.left = `${Math.min(viewport.clientWidth - 250,Math.max(8,event.clientX - rect.left + 14))}px`; tooltip.style.top = `${Math.min(viewport.clientHeight - 90,Math.max(8,event.clientY - rect.top + 14))}px`; });
      element.addEventListener('pointerleave', () => { tooltip.hidden = true; stage.querySelectorAll('[data-tl-edge]').forEach(edge => edge.classList.remove('is-hover')); });
    });
    stage.querySelectorAll('[data-tl-edge]').forEach(edge => {
      edge.addEventListener('click', () => { const node = tl.graph.allById.get(edge.dataset.to); if (node) { tl.selected = node.id; renderInspector(node); scrollToNode(node); } });
    });
  }

  function renderGraph(selectId = tl.selected) {
    tl.graph = buildGraph();
    const currentEdges = new Set(tl.graph.edges.filter(edge => edge.sessions.has(chat.id)).map(edge => edge.id));
    const edgeMarkup = tl.graph.edges.map(edge => `<path class="nv-timeline-edge ${edge.swipe ? 'is-swipe' : ''} ${currentEdges.has(edge.id) ? 'is-current' : ''}" data-tl-edge="${edge.id}" data-from="${edge.from}" data-to="${edge.to}" d="${edgePath(edge)}"/>`).join('');
    const nodeMarkup = tl.graph.allNodes.map(node => {
      const current = node.occurrences.some(occurrence => occurrence.sessionId === chat.id);
      const swipes = node.hasSwipes ? `<span class="nv-timeline-swipe-badge">+${node.swipeCount}</span>` : '';
      return `<button type="button" class="nv-timeline-node role-${node.role} ${node.swipe ? 'is-swipe' : ''} ${current ? 'is-current' : ''} ${selectId === node.id ? 'is-selected' : ''}" data-tl-node="${node.id}" style="left:${node.x}px;top:${node.y}px"><small>${node.swipe ? nvText('Variante','Swipe') : `#${node.depth + 1}`}</small><strong>${nvEscape(preview(node.content))}</strong>${swipes}</button>`;
    }).join('');
    stage.style.width = `${tl.graph.width}px`; stage.style.height = `${tl.graph.height}px`;
    stage.innerHTML = `<svg class="nv-timeline-edges" width="${tl.graph.width}" height="${tl.graph.height}" viewBox="0 0 ${tl.graph.width} ${tl.graph.height}" aria-hidden="true">${edgeMarkup}</svg>${nodeMarkup}`;
    applyView(); bindNodes(); updateSearch(false);
    if (selectId && tl.graph.allById.has(selectId)) { tl.selected = selectId; renderInspector(tl.graph.allById.get(selectId)); } else { tl.selected = ''; renderInspector(null); }
  }

  function fitGraph() {
    if (!tl.graph) return;
    const padding = 42;
    const availableWidth = Math.max(1,viewport.clientWidth - padding * 2);
    const availableHeight = Math.max(1,viewport.clientHeight - padding * 2);
    tl.zoom = clampZoom(Math.min(1.35,availableWidth / Math.max(1,tl.graph.width),availableHeight / Math.max(1,tl.graph.height)));
    tl.panX = (viewport.clientWidth - tl.graph.width * tl.zoom) / 2;
    tl.panY = (viewport.clientHeight - tl.graph.height * tl.zoom) / 2;
    applyView(); saveView();
  }

  function beginPan(event) {
    const interactive = event.target.closest('[data-tl-node],[data-tl-edge]');
    const wantsCanvasPan = event.button === 0 && (!interactive || tl.spaceHeld) || event.button === 1;
    if (!wantsCanvasPan) return;
    event.preventDefault();
    tl.panning = true;
    tl.panPointer = event.pointerId;
    tl.panStartX = event.clientX;
    tl.panStartY = event.clientY;
    tl.panOriginX = tl.panX;
    tl.panOriginY = tl.panY;
    viewport.classList.add('is-panning');
    viewport.setPointerCapture?.(event.pointerId);
  }

  function movePan(event) {
    if (!tl.panning || event.pointerId !== tl.panPointer) return;
    tl.panX = tl.panOriginX + event.clientX - tl.panStartX;
    tl.panY = tl.panOriginY + event.clientY - tl.panStartY;
    applyView();
  }

  function endPan(event) {
    if (!tl.panning || (event.pointerId != null && event.pointerId !== tl.panPointer)) return;
    tl.panning = false;
    tl.panPointer = null;
    viewport.classList.remove('is-panning');
    try { viewport.releasePointerCapture?.(event.pointerId); } catch {}
    saveView();
  }

  viewport.addEventListener('pointerdown',beginPan);
  viewport.addEventListener('pointermove',movePan);
  viewport.addEventListener('pointerup',endPan);
  viewport.addEventListener('pointercancel',endPan);
  viewport.addEventListener('wheel',event => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * .0015);
    zoomAt(event.clientX,event.clientY,tl.zoom * factor);
  },{ passive:false });

  const onKeyDown = event => {
    if (event.code !== 'Space' || event.repeat || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    tl.spaceHeld = true;
    viewport.classList.add('is-space-pan');
    event.preventDefault();
  };
  const onKeyUp = event => {
    if (event.code !== 'Space') return;
    tl.spaceHeld = false;
    viewport.classList.remove('is-space-pan');
  };
  window.addEventListener('keydown',onKeyDown);
  window.addEventListener('keyup',onKeyUp);
  dialog.addEventListener('close',() => {
    saveView();
    window.removeEventListener('keydown',onKeyDown);
    window.removeEventListener('keyup',onKeyUp);
  },{ once:true });

  dialog.querySelector('[data-tl="current"]').onclick = () => scrollToNode(currentLastNode(),true);
  dialog.querySelector('[data-tl="swipes"]').onclick = event => { tl.showSwipes = !tl.showSwipes; event.currentTarget.textContent = tl.showSwipes ? nvText('Masquer les variantes','Hide swipes') : nvText('Afficher les variantes','Show swipes'); renderGraph(); };
  dialog.querySelector('[data-tl="zoom-out"]').onclick = () => zoomFromCenter(1 / 1.18);
  dialog.querySelector('[data-tl="zoom-in"]').onclick = () => zoomFromCenter(1.18);
  dialog.querySelector('[data-tl="fit"]').onclick = fitGraph;
  search.oninput = () => updateSearch(true);
  renderGraph();
  requestAnimationFrame(() => {
    if (tl.hasSavedView) { applyView(); return; }
    fitGraph();
    const current = currentLastNode();
    if (current) setTimeout(() => scrollToNode(current,true),120);
  });
}

function nvTopbarIcon(action, title, svg) {
  return `<button type="button" class="nv-topbar-icon" data-nv="${nvEscape(action)}" aria-label="${nvEscape(title)}" title="${nvEscape(title)}">${svg}</button>`;
}
function nvChatTopbarActions() {
  const manager = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 4v16M11 8h6M11 12h6M11 16h4"/></svg>`;
  const create = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h9a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H9l-4 3v-3a4 4 0 0 1-3-4v-2a4 4 0 0 1 3-4Z"/><path d="M10 8v6M7 11h6"/></svg>`;
  const rename = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.8-10.8a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 7.5l3 3"/></svg>`;
  const remove = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5"/></svg>`;
  const close = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  return [
    nvTopbarIcon('chat-files',nvText('Gérer les discussions','View chat files'),manager),
    nvTopbarIcon('new',nvText('Nouvelle discussion','New chat'),create),
    nvTopbarIcon('rename-chat',nvText('Renommer la discussion','Rename chat'),rename),
    nvTopbarIcon('delete-chat',nvText('Supprimer la discussion','Delete chat'),remove),
    nvTopbarIcon('close-chat',nvText('Fermer la discussion','Close chat'),close),
  ].join('');
}
function nvChatFilesManager(chat) {
  if (!chat) return;
  const sessions = NV.data.sessions.filter(session => session.targetId === chat.targetId).sort((a,b) => b.updatedAt - a.updatedAt);
  const dialog = nvDialog(nvText('Discussions','Chats'), `<div class="nv-chat-file-list">${sessions.map(session => `<button type="button" class="nv-chat-file ${session.id === chat.id ? 'is-current' : ''}" data-chat-file="${nvEscape(session.id)}"><span><strong>${nvEscape(session.title)}</strong><small>${nvEscape(new Date(session.updatedAt || session.createdAt).toLocaleString())}</small></span>${session.id === chat.id ? `<em>${nvText('Actuelle','Current')}</em>` : ''}</button>`).join('') || `<p class="nv-muted">${nvText('Aucune discussion disponible.','No chats available.')}</p>`}</div>`);
  dialog.querySelectorAll('[data-chat-file]').forEach(button => button.addEventListener('click', () => {
    const session = NV.data.sessions.find(item => item.id === button.dataset.chatFile);
    if (!session) return;
    dialog.close();
    nvSelectSession(session);
  }));
}
async function nvRenameCurrentChat(chat) {
  if (!chat) return;
  if (state.sending) return toast(nvText('Attendez ou arrêtez la génération.','Wait for or stop generation.'));
  const draft = await nvForm(nvText('Renommer la discussion','Rename chat'),[nvField('title',nvText('Titre','Title'),chat.title,'text',{required:true})]);
  if (!draft?.title.trim()) return;
  chat.title = draft.title.trim();
  nvChanged(chat);
}
async function nvDeleteCurrentChat(chat) {
  if (!chat) return;
  if (state.sending) return toast(nvText('Attendez ou arrêtez la génération.','Wait for or stop generation.'));
  if (!confirm(nvText('Supprimer cette discussion ? Cette action ne peut pas être annulée.','Delete this chat? This action cannot be undone.'))) return;
  const targetId = chat.targetId;
  NV.data.sessions = NV.data.sessions.filter(session => session.id !== chat.id);
  const remaining = NV.data.sessions.filter(session => session.targetId === targetId).sort((a,b) => b.updatedAt - a.updatedAt);
  if (NV.data.active[targetId] === chat.id) {
    if (remaining.length) NV.data.active[targetId] = remaining[0].id;
    else delete NV.data.active[targetId];
  }
  if (NV.data.lastSession === chat.id) NV.data.lastSession = remaining[0]?.id || NV.data.sessions.slice().sort((a,b) => b.updatedAt - a.updatedAt)[0]?.id || '';
  NV.closedTarget = '';
  NV.chatView = 'library';
  await nvSave();
  goTo('chat',{view:'library'});
}
function nvCloseCurrentChat(chat) {
  if (!chat) return;
  if (state.sending) return toast(nvText('Attendez ou arrêtez la génération.','Wait for or stop generation.'));
  NV.closedTarget = '';
  NV.chatView = 'library';
  NV.search = '';
  goTo('chat',{view:'library'});
}

function nvSessionTargetLabel(session) {
  if (!session) return nvText('Discussion','Chat');
  if (session.targetId?.startsWith('group:')) {
    const group = NV.data.groups.find(item => `group:${item.id}` === session.targetId);
    return group?.name || nvText('Groupe','Group');
  }
  return getCharacters().find(character => character.id === session.targetId)?.name || nvText('Personnage supprimé','Deleted character');
}
function nvSessionPreview(session) {
  const message = [...(session?.messages || [])].reverse().find(item => item && item.role !== 'system' && String(nvMessageDisplayContent(item) || '').trim());
  return message ? String(nvMessageDisplayContent(message)).replace(/\s+/g,' ').trim().slice(0,220) : nvText('Cette discussion ne contient pas encore de message.','This chat does not have any messages yet.');
}
function nvRenderChatLibrary() {
  const sessions = [...NV.data.sessions].sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const cards = sessions.map(session => {
    const target = nvSessionTargetLabel(session);
    const date = new Date(session.updatedAt || session.createdAt || Date.now()).toLocaleString();
    return `<article class="nv-chat-library-card" data-chat-library-card="${nvEscape(session.id)}">
      <button type="button" class="nv-chat-library-open" data-open-session="${nvEscape(session.id)}">
        <div class="nv-chat-library-card-meta"><span class="nv-eyebrow">${session.pinned ? '★ ' : ''}${nvEscape(target)}</span><time>${nvEscape(date)}</time></div>
        <h3>${nvEscape(session.title || target)}</h3>
        <p>${nvEscape(nvSessionPreview(session))}</p>
        <footer><span>${session.messages.length} ${nvText('message(s)','message(s)')}</span><strong>${nvText('Ouvrir','Open')} →</strong></footer>
      </button>
    </article>`;
  }).join('');
  pageRoot.innerHTML = `<section class="nv-chat-library-page">
    <div class="nv-chat-library-head">
      <div><span class="nv-eyebrow">NASTYVERSE</span><h1>${nvText('Discussions','Chats')}</h1><p>${nvText('Retrouvez toutes vos histoires et ouvrez celle que vous voulez continuer.','Browse all your stories and open the one you want to continue.')}</p></div>
      ${nvButton('new',nvText('Nouvelle discussion','New chat'),true)}
    </div>
    <div class="nv-chat-library-toolbar"><input id="nv-chat-library-search" type="search" placeholder="${nvText('Rechercher une discussion…','Search chats…')}" aria-label="${nvText('Rechercher une discussion','Search chats')}"><span>${sessions.length} ${nvText('discussion(s)','chat(s)')}</span></div>
    <div class="nv-chat-library-grid">${cards || `<div class="nv-chat-library-empty"><h2>${nvText('Aucune discussion pour le moment.','No chats yet.')}</h2><p>${nvText('Créez une discussion depuis un personnage ou utilisez le bouton ci-dessus.','Start a chat from a character or use the button above.')}</p></div>`}</div>
  </section>`;
  nvBind(pageRoot,{new:nvNewChat});
  pageRoot.querySelectorAll('[data-open-session]').forEach(button => button.addEventListener('click',() => {
    const session = NV.data.sessions.find(item => item.id === button.dataset.openSession);
    if (session) nvSelectSession(session);
  }));
  const search = document.getElementById('nv-chat-library-search');
  if (search) search.oninput = event => {
    const query = event.target.value.toLocaleLowerCase().trim();
    pageRoot.querySelectorAll('[data-chat-library-card]').forEach(card => { card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase().includes(query); });
  };
}

function nvRenderConversation(scrollSnapshot = null) {
  const chat = nvSession();
  if (!chat) { NV.chatView = 'library'; nvRenderChatLibrary(); return; }
  NV.groupId = chat.targetId.startsWith('group:') ? chat.targetId.slice(6) : '';
  if (!NV.groupId) {
    state.activeCharacterId = chat.targetId;
    localStorage.setItem(STORAGE.activeCharacter,chat.targetId);
  }
  const group = NV.groupId ? NV.data.groups.find(g => g.id === NV.groupId) || {name:chat.title,members:[],mode:'round'} : null;
  const character = (group ? getCharacters().find(c => group.members.includes(c.id)) : getCharacters().find(c => c.id === chat.targetId)) || {id:chat.targetId,name:chat.messages.find(m => m.role === 'assistant')?.name || chat.title,description:''};
  const persona = nvPersona(chat);
  const messageAppearance = typeof getEffectiveMessagePersonalization === 'function' ? getEffectiveMessagePersonalization(chat) : (typeof getMessagePersonalization === 'function' ? getMessagePersonalization() : {});
  if (typeof applyMessagePersonalization === 'function') applyMessagePersonalization(messageAppearance);
  pageRoot.innerHTML = `<div class="nv-workspace nv-workspace-conversation"><section class="nv-chat-main nv-chat-main-standalone">
    ${!TAURI ? `<div class="nv-preview-note">${nvText('Aperçu navigateur : les réponses sont simulées. Utilisez le lanceur pour votre modèle.','Browser preview: replies are simulated. Use the launcher for your model.')}</div>` : ''}
    <div class="nv-chat-toolbar">${nvButton('timeline','Timeline')}<input id="nv-message-search" type="search" value="${nvEscape(NV.search)}" placeholder="${nvText('Rechercher dans les messages…','Search messages…')}" aria-label="${nvText('Rechercher dans les messages','Search messages')}"><div class="nv-chat-top-actions">${nvChatTopbarActions()}</div></div>
    <div class="messages" id="messages" data-chat-session="${nvEscape(chat.id)}" aria-live="polite">${chat.messages.map((m,index) => nvMessageArticle(m,index,chat,persona,character,messageAppearance)).join('')}${nvStreamingMessageArticle(chat,persona,character,messageAppearance)}</div>
    <div class="nv-compose-area"><div class="nv-quick-replies">${NV.data.replies.filter(r => r.enabled !== false).map(r => `<button class="btn btn-ghost btn-small" data-reply="${nvEscape(r.id)}">${nvEscape(r.name)}</button>`).join('')}</div>${nvMediaMarkup(chat.draftImages,true)}<form class="composer nv-composer-row" id="composer"><details class="nv-composer-menu"><summary class="nv-composer-icon" aria-label="${nvText('Outils du message','Message tools')}" title="${nvText('Outils du message','Message tools')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M18.36 5.64l-2.12 2.12M7.76 16.24l-2.12 2.12M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg></summary><div class="nv-composer-popover"><button type="button" data-nv="illustrate">${nvText('Illustrer','Illustrate')}</button></div></details><button type="button" class="nv-composer-icon" data-nv="attach" aria-label="${nvText('Joindre une image','Attach image')}" title="${nvText('Joindre une image','Attach image')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><textarea id="composer-input" rows="1" aria-label="${nvText('Votre message','Your message')}" placeholder="${nvText('Écrivez votre message… (/ pour les commandes)','Write a message… (/ for commands)')}" ${state.sending ? 'disabled' : ''}>${nvEscape(chat.draft || '')}</textarea><button type="button" class="nv-composer-icon" data-nv="voice" aria-label="${nvText('Dicter','Dictate')}" title="${nvText('Dicter','Dictate')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M18 11a6 6 0 0 1-12 0M12 17v4M9 21h6"/></svg></button>${state.sending ? `<button type="button" class="composer-send" data-nv="stop">${nvText('Arrêter','Stop')}</button>` : `<button type="button" class="composer-send" data-nv="continue">${nvText('Continuer','Continue')}</button>`}<button type="submit" class="composer-send" ${state.sending ? 'disabled' : ''}>${nvText('Envoyer','Send')}</button></form></div>
  </section></div>`;
  if (typeof refreshMessageAvatarFraming === 'function') requestAnimationFrame(() => refreshMessageAvatarFraming(messageAppearance, pageRoot));
  nvBind(pageRoot, { new: nvNewChat, timeline: () => nvOpenTimeline(chat), 'chat-files': () => nvChatFilesManager(chat), 'rename-chat': () => nvRenameCurrentChat(chat), 'delete-chat': () => nvDeleteCurrentChat(chat), 'close-chat': () => nvCloseCurrentChat(chat), continue: () => nvGenerate(chat,'continue'), stop: nvStop, voice: () => nvDictate(chat) });
  const input = document.getElementById('composer-input');
  nvResizeComposerInput(input);
  input.oninput = () => { chat.draft = input.value; nvResizeComposerInput(input); nvSave(); };
  input.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); document.getElementById('composer').requestSubmit(); } };
  document.getElementById('composer').onsubmit = nvGuard(async event => { event.preventDefault(); const content = input.value.trim(); if ((!content && !chat.draftImages?.length) || state.sending) return; if (content.startsWith('/') && await nvCommand(content,chat)) { chat.draft = ''; nvChanged(chat); return; } await nvSend(chat, content); });
  document.getElementById('nv-message-search').oninput = event => { NV.search = event.target.value; pageRoot.querySelectorAll('[data-message]').forEach(article => { const m = chat.messages.find(m => m.id === article.dataset.message); article.hidden = !nvMessageDisplayContent(m).toLocaleLowerCase().includes(NV.search.toLocaleLowerCase()); }); };
  pageRoot.querySelectorAll('[data-message-action]').forEach(b => b.onclick = nvGuard(() => nvMessageAction(chat,chat.messages.find(m => m.id === b.closest('[data-message]').dataset.message),b.dataset.messageAction)));
  pageRoot.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => { const r = NV.data.replies.find(r => r.id === b.dataset.reply); input.value = chat.draft = NVCore.expand(r.content,{char:character?.name,user:persona.name}); nvResizeComposerInput(input); nvSave(); input.focus(); });
  nvMediaBind(chat); nvAppearance(); nvRestoreChatScroll(scrollSnapshot); nvEnsureChatDisplayTranslations(chat).catch(error => console.warn('[translate] Chat display refresh failed.', error));
}

function nvRenderChat(scrollSnapshot = null) {
  if (!NV.ready) return;
  if (NV.chatView === 'conversation') nvRenderConversation(scrollSnapshot);
  else nvRenderChatLibrary();
}
async function nvNewChat() {
  const characters = getCharacters();
  if (!characters.length && !NV.data.groups.length) { goTo('library'); openCharacterEditor(); return; }
  const options = [...characters.map(c => ({value:c.id,label:c.name})),...NV.data.groups.map(g => ({value:`group:${g.id}`,label:`${nvText('Groupe','Group')} · ${g.name}`}))];
  const draft = await nvForm(nvText('Nouvelle conversation','New conversation'),[nvField('target',nvText('Avec qui ?','With whom?'),state.activeCharacterId || options[0].value,'select',{options}),nvField('title',nvText('Titre de votre histoire','Story title'),'', 'text')]);
  if (!draft) return;
  const character = characters.find(c => c.id === draft.target);
  const chat = NVCore.session(draft.target,draft.title || character?.name || NV.data.groups.find(g => `group:${g.id}` === draft.target)?.name);
  if (character) {
    const greetings = [character.firstMessage,...(character.alternateGreetings || [])].filter(Boolean);
    if (greetings.length) chat.messages.push(NVCore.message({role:'assistant',name:character.name,characterId:character.id,content:NVCore.expand(greetings[0],{char:character.name,user:nvPersona(chat).name}),variants:greetings.map(s => NVCore.expand(s,{char:character.name,user:nvPersona(chat).name}))}));
  }
  NV.data.sessions.push(chat); nvSelectSession(chat);
}

function nvMessageMacroCharacter(chat, preferred = null) {
  if (preferred?.name) return preferred;
  if (!chat) return null;
  const characters = getCharacters();
  if (!String(chat.targetId || '').startsWith('group:')) return characters.find(character => character.id === chat.targetId) || null;
  const manualSpeaker = document.getElementById('nv-speaker')?.value;
  if (manualSpeaker) return characters.find(character => character.id === manualSpeaker) || null;
  const group = NV.data.groups.find(item => `group:${item.id}` === chat.targetId);
  const members = characters.filter(character => group?.members?.includes(character.id));
  return members.length === 1 ? members[0] : null;
}
function nvResolveMessageMacros(source, chat, character = null, history = null) {
  const selectedCharacter = nvMessageMacroCharacter(chat, character);
  const persona = nvPersona(chat, selectedCharacter);
  const group = String(chat?.targetId || '').startsWith('group:')
    ? NV.data.groups.find(item => `group:${item.id}` === chat.targetId)
    : null;
  const records = Array.isArray(history) ? history : (chat?.messages || []);
  const lastMessage = [...records].reverse().find(message => message && !message.hidden)?.content || '';
  return NVCore.expand(source, {
    char: selectedCharacter?.name || group?.name || '',
    user: persona.name,
    persona: persona.description,
    description: selectedCharacter?.description || '',
    scenario: chat?.scenario || selectedCharacter?.scenario || '',
    lastMessage,
  });
}

async function nvRules(content, target) {
  const rules = NV.data.rules.filter(r => r.enabled && r.target === target);
  if (!rules.length) return content;
  return new Promise((resolve,reject) => {
    const worker = new Worker('text-rules-worker.js');
    const timer = setTimeout(() => { worker.terminate(); reject(new Error(nvText('Une règle de texte est trop lente. Désactivez-la dans Outils.','A text rule timed out. Disable it in Tools.'))); },750);
    worker.onmessage = ({data}) => { clearTimeout(timer); worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.content); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Text rule worker failed')); };
    worker.postMessage({content,rules});
  });
}
async function nvSend(chat,content) {
  if (state.sending || NV.preparing) return;
  NV.preparing = true;
  try {
    content = await nvRules(content,'input');
    if(!content.trim() && chat.draftImages?.length) content = chat.draftImages.some(a=>a.sendToModel) ? nvText('Que vois-tu sur cette image ?','What do you see in this image?') : nvText('[Image conservée localement, non transmise au modèle.]','[Image stored locally, not sent to the model.]');
    content = nvResolveMessageMacros(content, chat);
    if (!state.backendConfig) state.backendConfig = await invoke('load_backend_config');
    if (effectiveBackendApiMode(state.backendConfig)==='text' && chat.draftImages?.some(a=>a.sendToModel)) throw new Error(nvText('Les images nécessitent le mode Chat et un modèle avec vision. Cliquez sur l’image pour désactiver Vision si vous souhaitez seulement l’afficher.','Images require Chat mode and a vision model. Click the image to turn Vision off if you only want to display it.'));
    const translated = await nvPrepareOutgoingTranslation(content);
    const activePersona = nvPersona(chat);
    const message = NVCore.message({role:'user',name:activePersona.name,personaId:activePersona.id,content:translated.content,attachments:chat.draftImages||[],displayText:translated.displayText,displaySource:translated.displayText ? translated.content : '',displayLanguage:translated.displayLanguage});
    nvCheckpoint(chat); chat.messages.push(message); chat.draftImages=[]; chat.draft = ''; chat.updatedAt = Date.now(); await nvSave();
    await nvGenerate(chat,'reply');
  } finally { NV.preparing = false; }
}
async function nvCompletion(character,history,chat,onDelta) {
  const params = {...getGenerationParams(),...NV.data.generation};
  NV.scope = chat; NV.promptHistory = history;
  let request;
  let promptRecord = null;
  try {
    if (effectiveBackendApiMode(state.backendConfig) === 'text') {
      if(history.some(m=>!m.hidden&&m.attachments?.some(a=>a.sendToModel))) throw new Error(nvText('Cette conversation contient des images avec Vision activée. Passez en mode Chat ou désactivez Vision sur les images.','This conversation includes images with Vision enabled. Switch to Chat mode or turn off Vision on the images.'));
      request = buildTextCompletionRequest(character,history,params);
      if (request.overBudget) throw new Error(nvText('Le contexte permanent dépasse la capacité choisie. Réduisez les connaissances ou augmentez le contexte.','Permanent context exceeds the selected capacity. Reduce knowledge or increase context.'));
    } else {
      const messages = buildChatCompletionMessages(character,history,params);
      if (estimateChatMessagesTokens(messages) > Math.max(128, params.contextTokens - params.maxTokens)) throw new Error(nvText('Le contexte dépasse la capacité choisie. Réduisez la mémoire, les documents ou les connaissances.','Context exceeds the selected capacity. Reduce memory, documents or knowledge.'));
      request = {mode:'chat',messages};
    }
    NV.prompt = { ...NVCore.clone(request), sessionId:chat.id, character:character.name, lore:nvPromptData(character,history).lore, sources:nvPromptData(character,history).sources };
    promptRecord = nvPromptInspectionRecord(character, history, chat, request, params, false);
  } finally { NV.scope = null; NV.promptHistory = null; }
  const args = request.mode === 'text' ? {prompt:request.prompt,stopStrings:request.stopStrings,params} : {messages:request.messages,params};
  let result;
  if (TAURI?.core?.Channel && NV.data.generation.stream !== false) {
    const channel = new TAURI.core.Channel(); channel.onmessage = onDelta;
    try { result = await invoke('stream_completion',{...args,messages:args.messages || null,prompt:args.prompt || null,stopStrings:args.stopStrings || [],requestId:NV.activeRequest.id,onEvent:channel}); }
    catch (error) { if (/command.*stream_completion.*not found/i.test(String(error))) { toast(nvText('Lecture progressive : lanceur 0.1.11 requis. Réponse standard utilisée.','Streaming requires launcher 0.1.11. Using standard completion.')); result = await invoke(request.mode === 'text' ? 'text_completion' : 'chat_completion',args); } else throw error; }
  } else result = await invoke(request.mode === 'text' ? 'text_completion' : 'chat_completion',args);
  const content = request.mode === 'text' ? postProcessTextCompletionResponse(result.content,request.preset,request.formatting,request.stopStrings) : String(result.content || '');
  if (promptRecord) promptRecord.meta.model = String(result.model || promptRecord.meta.model || '');
  return {...result,content:await nvRules(content,'output'),promptRecord};
}
async function nvGenerate(chat,mode = 'reply') {
  if (!chat || state.sending) return;
  const group = NV.data.groups.find(g => `group:${g.id}` === chat.targetId);
  let speakers = group ? getCharacters().filter(c => group.members.includes(c.id)) : getCharacters().filter(c => c.id === chat.targetId);
  const manual = document.getElementById('nv-speaker')?.value;
  if (manual) speakers = speakers.filter(c => c.id === manual);
  else if (group && group.mode !== 'all') { const count = chat.messages.filter(m => m.role === 'assistant').length; speakers = speakers.length ? [speakers[group.mode === 'random' ? Math.floor(Math.random()*speakers.length) : count % speakers.length]] : []; }
  const last = chat.messages.at(-1);
  if (['regenerate','continue'].includes(mode) && last?.role === 'assistant') { const c = getCharacters().find(c => c.id === (last.characterId || chat.targetId)); if (c) speakers = [c]; }
  if (!speakers.length) return toast(nvText('Aucun personnage disponible pour répondre. Ajoutez un participant ou ouvrez une conversation avec un personnage existant.','No character is available to reply. Add a participant or open a conversation with an existing character.'),'error');
  nvCheckpoint(chat); state.sending = true;
  const run = {id:uid(),sessionId:chat.id,content:'',reasoning:'',name:'',cancelled:false}; NV.activeRequest = run;
  try {
    if (!state.backendConfig) state.backendConfig = await invoke('load_backend_config');
    for (const character of speakers) {
      if (run.cancelled) break;
      run.id = uid(); run.name = character.name; run.characterId = character.id; run.content = ''; run.reasoning = '';
      const started = performance.now(); let history = NVCore.clone(chat.messages);
      if (mode === 'regenerate' && last?.role === 'assistant') history.pop();
      if (mode === 'continue') history.push({role:'system',content:nvText('Continue la dernière réponse sans la répéter.','Continue the last reply without repeating it.')});
      if (mode === 'impersonate') history.push({role:'system',content:`Write only the next message from ${nvPersona(chat).name}, in first person. Do not write the assistant response.`});
      if (state.currentPage === 'chat') renderChat();
      const result = await nvCompletion(character,history,chat,event => {
        run.content += event.delta || ''; run.reasoning += event.reasoning || '';
        if (nvSession()?.id === chat.id) {
          const bubble = document.getElementById('nv-stream'); if (bubble) bubble.textContent = nvChatTranslationApplies('assistant') ? nvText('Écriture et traduction en cours…','Writing and translating…') : (run.content || nvText('Réflexion en cours…','Thinking…'));
          const details = document.getElementById('nv-thinking'); if (details && run.reasoning) { details.hidden = false; details.querySelector('pre').textContent = run.reasoning; }
        }
      });
      if (run.cancelled) break;
      if (!result.content.trim()) throw new Error(nvText('Le modèle a renvoyé une réponse vide.','The model returned an empty reply.'));
      const resolvedAssistant = nvResolveMessageMacros(result.content, chat, character, history);
      const canonicalAssistant = await nvPrepareAssistantCanonical(resolvedAssistant);
      if (mode === 'impersonate') {
        try { const display = await nvPrepareAssistantTranslation(canonicalAssistant); chat.draft = display?.content || canonicalAssistant; }
        catch (error) { console.warn('[translate] Impersonation translation failed.', error); chat.draft = nvText('[Traduction indisponible]','[Translation unavailable]'); }
      } else if (mode === 'regenerate' && last?.role === 'assistant') {
        last.variants.push(canonicalAssistant); last.variant = last.variants.length - 1; last.content = canonicalAssistant;
        last.promptRecords = Array.isArray(last.promptRecords) ? last.promptRecords : [];
        while (last.promptRecords.length < last.variants.length - 1) last.promptRecords.push(null);
        last.promptRecords.push(result.promptRecord || null);
        await nvApplyAssistantDisplay(last);
      } else if (mode === 'continue' && last?.role === 'assistant') {
        last.content += '\n' + canonicalAssistant; last.variants[last.variant] = last.content;
        last.promptRecords = Array.isArray(last.promptRecords) ? last.promptRecords : [];
        while (last.promptRecords.length <= last.variant) last.promptRecords.push(null);
        last.promptRecords[last.variant] = result.promptRecord || last.promptRecords[last.variant] || null;
        await nvApplyAssistantDisplay(last);
      } else {
        const message = NVCore.message({role:'assistant',content:canonicalAssistant,name:character.name,characterId:character.id,model:result.model,duration:performance.now()-started,promptRecords:[result.promptRecord || null]});
        chat.messages.push(message);
        await nvApplyAssistantDisplay(message);
      }
      chat.updatedAt = Date.now(); await nvSave(); run.content = '';
      if (NV.data.appearance.autoSpeak && mode !== 'impersonate') { const spokenMessage = ['regenerate','continue'].includes(mode) ? last : chat.messages.at(-1); nvSpeak(spokenMessage ? nvMessageDisplayContent(spokenMessage) : result.content); }
    }
  } catch (error) { run.failed = true; if (!run.cancelled) toast(friendlyNativeError(error),'error'); }
  finally {
    if ((run.cancelled || run.failed) && run.content.trim() && mode !== 'impersonate') {
      const partialCharacter = getCharacters().find(character => character.id === run.characterId) || null;
      const partialResolved = nvResolveMessageMacros(run.content, chat, partialCharacter, chat.messages);
      const partialContent = await nvPrepareAssistantCanonical(partialResolved);
      const partial = NVCore.message({role:'assistant',content:partialContent,name:run.name,characterId:run.characterId});
      await nvApplyAssistantDisplay(partial);
      chat.messages.push(partial); await nvSave();
    }
    state.sending = false; NV.activeRequest = null; if (state.currentPage === 'chat') renderChat();
  }
}
async function nvCreateMessageVariant(chat, message) {
  if (!chat || !message || message.role !== 'assistant') return;
  if (state.sending) return toast(nvText('Arrêtez la génération avant de créer une variante.','Stop generation before creating a variant.'));
  const index = chat.messages.findIndex(item => item.id === message.id);
  if (index < 0) return;
  const character = getCharacters().find(item => item.id === message.characterId)
    || getCharacters().find(item => item.name === message.name)
    || getCharacters().find(item => item.id === chat.targetId);
  if (!character) return toast(nvText('Le personnage associé à ce message est introuvable.','The character associated with this message could not be found.'),'error');
  const scrollSnapshot = nvCaptureChatScroll();
  state.sending = true;
  const run = { id:uid(), sessionId:chat.id, content:'', reasoning:'', name:character.name, characterId:character.id, cancelled:false, variantMessageId:message.id };
  NV.activeRequest = run;
  if (state.currentPage === 'chat' && nvSession()?.id === chat.id) nvRenderChat(scrollSnapshot);
  try {
    if (!state.backendConfig) state.backendConfig = await invoke('load_backend_config');
    const history = NVCore.clone(chat.messages.slice(0,index));
    const started = performance.now();
    const result = await nvCompletion(character,history,chat,event => {
      run.content += event.delta || '';
      run.reasoning += event.reasoning || '';
    });
    if (run.cancelled) return;
    if (!String(result.content || '').trim()) throw new Error(nvText('Le modèle a renvoyé une réponse vide.','The model returned an empty reply.'));
    const resolvedAssistant = nvResolveMessageMacros(result.content, chat, character, history);
    const canonicalAssistant = await nvPrepareAssistantCanonical(resolvedAssistant);
    message.variants = Array.isArray(message.variants) && message.variants.length ? message.variants : [message.content || ''];
    message.variants.push(canonicalAssistant);
    message.promptRecords = Array.isArray(message.promptRecords) ? message.promptRecords : [];
    while (message.promptRecords.length < message.variants.length - 1) message.promptRecords.push(null);
    message.promptRecords.push(result.promptRecord || null);
    message.variant = message.variants.length - 1;
    message.content = canonicalAssistant;
    message.model = result.model || message.model;
    message.duration = performance.now() - started;
    await nvApplyAssistantDisplay(message);
    chat.updatedAt = Date.now();
    await nvSave();
  } catch (error) {
    if (!run.cancelled) toast(friendlyNativeError(error),'error');
  } finally {
    state.sending = false;
    NV.activeRequest = null;
    if (state.currentPage === 'chat' && nvSession()?.id === chat.id) nvRenderChat(scrollSnapshot);
  }
}
async function nvStop() { const run = NV.activeRequest; if (!run) return; run.cancelled = true; try { await invoke('cancel_completion',{requestId:run.id}); } catch (_) { toast(nvText('Annulation demandée. Ce lanceur doit attendre la fin de la requête.','Cancellation requested. This launcher must wait for the request to finish.')); } }
async function nvMessageAction(chat,m,action) {
  if (!m) return;
  if (state.sending && NV.activeRequest?.sessionId === chat.id) return toast(nvText('Arrêtez la génération avant de modifier cette conversation.','Stop generation before editing this conversation.'));
  if (action === 'copy') return navigator.clipboard.writeText(nvMessageDisplayContent(m));
  if (action === 'speak') return nvSpeak(nvMessageDisplayContent(m));
  if (action === 'regenerate') return nvGenerate(chat,'regenerate');
  if (action === 'branch') { const branch = NVCore.branch(chat,m.id,`${chat.title} · ${nvText('bifurcation','branch')}`); NV.data.sessions.push(branch); nvSelectSession(branch); return; }
  if (action === 'prompt') return nvInspectMessagePrompt(chat,m);
  if (action === 'edit') {
    const value = await nvForm(nvText('Modifier le message','Edit message'),[nvField('content',nvText('Texte','Text'),nvMessageDisplayContent(m),'textarea',{rows:12,required:true})]);
    if (!value) return;
    nvCheckpoint(chat);
    const messageIndex = chat.messages.indexOf(m);
    const editCharacter = m.role === 'assistant'
      ? (getCharacters().find(character => character.id === m.characterId) || getCharacters().find(character => character.name === m.name) || null)
      : null;
    const resolvedEdit = nvResolveMessageMacros(value.content, chat, editCharacter, chat.messages.slice(0, Math.max(0, messageIndex)));
    await nvTranslateEditedMessage(m,resolvedEdit);
    m.variants[m.variant] = m.content;
  } else {
    nvCheckpoint(chat);
    if (action === 'bookmark') m.bookmark = !m.bookmark;
    else if (action === 'hide') m.hidden = !m.hidden;
    else if (action === 'delete') { if (!confirm(nvText('Supprimer ce message ? Vous pourrez annuler dans le menu de conversation.','Delete this message? You can undo from the conversation menu.'))) return; chat.messages = chat.messages.filter(item => item.id !== m.id); }
    else if (action === 'previous' || action === 'next') {
      const variants = Array.isArray(m.variants) && m.variants.length ? m.variants : [m.content || ''];
      m.variants = variants;
      const current = Math.min(Math.max(Number(m.variant) || 0,0),variants.length - 1);
      if (action === 'previous') {
        if (current <= 0) return;
        m.variant = current - 1;
      } else if (current < variants.length - 1) {
        m.variant = current + 1;
      } else {
        return nvCreateMessageVariant(chat,m);
      }
      m.content = m.variants[m.variant]; nvClearMessageDisplay(m);
      if (nvChatTranslationApplies(m.role) && String(nvChatTranslationConfig().targetLanguage).toLowerCase() !== 'en') {
        const display = await nvTranslateChatText(m.content,nvChatTranslationConfig().targetLanguage,'en'); nvSetMessageDisplay(m,display,nvChatTranslationConfig().targetLanguage);
      }
    }
  }
  nvChanged(chat);
}
