/* Conversation workspace. Native generation remains in the single Tauri host. */
const NV = { data: NVCore.defaults(), db: null, ready: false, saving: Promise.resolve(), groupId: '', activeRequest: null, prompt: null, promptHistory: null, undo: new Map(), search: '', saved: true, scope: null };
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
  NV.data.active[chat.targetId] = chat.id; NV.data.lastSession = chat.id;
  NV.groupId = chat.targetId.startsWith('group:') ? chat.targetId.slice(6) : '';
  if (!NV.groupId) { state.activeCharacterId = chat.targetId; localStorage.setItem(STORAGE.activeCharacter, chat.targetId); }
  NV.search = ''; nvSave(); goTo('chat');
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

function nvRenderChat(scrollSnapshot = null) {
  if (!NV.ready) return;
  const current = nvSession();
  const group = NV.data.groups.find(g => g.id === NV.groupId) || (NV.groupId && current ? {name:current.title,members:[],mode:'round'} : null);
  const character = (group ? getCharacters().find(c => group.members.includes(c.id)) : activeCharacter()) || (current ? {id:current.targetId,name:current.messages.find(m => m.role === 'assistant')?.name || current.title,description:''} : null);
  const chat = character || group ? nvEnsureSession(character) : null;
  const persona = nvPersona(chat);
  const sessions = [...NV.data.sessions].sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  pageRoot.innerHTML = `<div class="nv-workspace"><aside class="nv-sidebar"><div class="nv-sidebar-head"><strong>${nvText('Conversations','Conversations')}</strong>${nvButton('new', '+', true)}</div><input id="nv-session-search" type="search" aria-label="${nvText('Rechercher une conversation','Search conversations')}" placeholder="${nvText('Retrouver une histoire…','Find a story…')}"><div class="nv-session-list">${sessions.map(s => `<button class="nv-session ${s.id === chat?.id ? 'active' : ''}" data-session="${nvEscape(s.id)}"><strong>${s.pinned ? '★ ' : ''}${nvEscape(s.title)}</strong><small>${s.targetId.startsWith('group:') ? nvText('Groupe','Group') : nvEscape(getCharacters().find(c => c.id === s.targetId)?.name || nvText('Personnage supprimé','Deleted character'))} · ${s.messages.length}</small></button>`).join('') || `<p class="nv-muted">${nvText('Vos histoires apparaîtront ici.','Your stories will appear here.')}</p>`}</div><div class="nv-sidebar-foot">${nvButton('library',nvText('Bibliothèque','Library'))}${nvButton('tools',nvText('Outils','Tools'))}</div></aside><section class="nv-chat-main">${chat ? `
    ${!TAURI ? `<div class="nv-preview-note">${nvText('Aperçu navigateur : les réponses sont simulées. Utilisez le lanceur pour votre modèle.','Browser preview: replies are simulated. Use the launcher for your model.')}</div>` : ''}
    <div class="nv-chat-toolbar"><input id="nv-message-search" type="search" value="${nvEscape(NV.search)}" placeholder="${nvText('Rechercher dans les messages…','Search messages…')}" aria-label="${nvText('Rechercher dans les messages','Search messages')}">${group ? `<select id="nv-speaker" aria-label="${nvText('Qui répond ?','Who replies?')}"><option value="">${group.mode === 'all' ? nvText('Tout le groupe','Whole group') : nvText('Tour automatique','Automatic turn')}</option>${group.members.map(id => getCharacters().find(c => c.id === id)).filter(Boolean).map(c => `<option value="${nvEscape(c.id)}">${nvEscape(c.name)}</option>`).join('')}</select>` : ''}${nvButton('bookmarks',nvText('Favoris','Bookmarks'))}${nvButton('inspect',nvText('Voir le prompt','Inspect prompt'))}${nvButton('persona',persona.name)}${nvButton('context',nvText('Contexte','Context'))}${nvButton('menu','•••')}</div>
    <div class="messages" id="messages" data-chat-session="${nvEscape(chat.id)}" aria-live="polite">${chat.messages.map((m,index) => `<article class="message message-${m.role} ${m.hidden ? 'nv-excluded' : ''}" data-message="${nvEscape(m.id)}" ${NV.search && !nvMessageDisplayContent(m).toLocaleLowerCase().includes(NV.search.toLocaleLowerCase()) ? 'hidden' : ''}><div class="message-role">${nvEscape(m.name || (m.role === 'user' ? persona.name : character?.name || 'System'))}${m.bookmark ? ' ★' : ''}<small>${m.hidden ? nvText(' · Hors contexte',' · Excluded') : ''}</small></div><div class="message-bubble nv-markdown-surface">${nvMarkdown(nvMessageDisplayContent(m))}${nvMediaMarkup(m.attachments)}</div><div class="nv-message-actions"><button data-message-action="edit">${nvText('Modifier','Edit')}</button><button data-message-action="branch">${nvText('Bifurquer','Branch')}</button><button data-message-action="bookmark" aria-label="${nvText('Marquer ce message','Bookmark message')}">☆</button><button data-message-action="more" aria-label="${nvText('Autres actions du message','More message actions')}">•••</button>${m.variants.length > 1 ? `<button data-message-action="previous" aria-label="${nvText('Variante précédente','Previous variant')}">‹</button><span>${m.variant + 1}/${m.variants.length}</span><button data-message-action="next" aria-label="${nvText('Variante suivante','Next variant')}">›</button>` : ''}${m.role === 'assistant' && index === chat.messages.length - 1 ? `<button data-message-action="regenerate">${nvText('Autre réponse','Another reply')}</button>` : ''}</div></article>`).join('')}${state.sending && NV.activeRequest?.sessionId === chat.id ? `<article class="message message-assistant"><div class="message-role">${nvEscape(NV.activeRequest.name)}</div><div id="nv-stream" class="message-bubble nv-markdown-surface">${nvMarkdown(nvChatTranslationApplies('assistant') ? nvText('Écriture et traduction en cours…','Writing and translating…') : (NV.activeRequest.content || nvText('Écriture en cours…','Writing…')))}</div><details id="nv-thinking" ${NV.activeRequest.reasoning ? '' : 'hidden'}><summary>${nvText('Raisonnement du modèle','Model reasoning')}</summary><pre></pre></details></article>` : ''}</div>
    <div class="nv-compose-area"><div class="nv-quick-replies">${NV.data.replies.filter(r => r.enabled !== false).map(r => `<button class="btn btn-ghost btn-small" data-reply="${nvEscape(r.id)}">${nvEscape(r.name)}</button>`).join('')}</div>${nvMediaMarkup(chat.draftImages,true)}<form class="composer nv-composer-row" id="composer"><details class="nv-composer-menu"><summary class="nv-composer-icon" aria-label="${nvText('Outils du message','Message tools')}" title="${nvText('Outils du message','Message tools')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M18.36 5.64l-2.12 2.12M7.76 16.24l-2.12 2.12M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/></svg></summary><div class="nv-composer-popover"><button type="button" data-nv="illustrate">${nvText('Illustrer','Illustrate')}</button></div></details><button type="button" class="nv-composer-icon" data-nv="attach" aria-label="${nvText('Joindre une image','Attach image')}" title="${nvText('Joindre une image','Attach image')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button><textarea id="composer-input" rows="1" aria-label="${nvText('Votre message','Your message')}" placeholder="${nvText('Écrivez votre message… (/ pour les commandes)','Write a message… (/ for commands)')}" ${state.sending ? 'disabled' : ''}>${nvEscape(chat.draft || '')}</textarea><button type="button" class="nv-composer-icon" data-nv="voice" aria-label="${nvText('Dicter','Dictate')}" title="${nvText('Dicter','Dictate')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M18 11a6 6 0 0 1-12 0M12 17v4M9 21h6"/></svg></button>${state.sending ? `<button type="button" class="composer-send" data-nv="stop">${nvText('Arrêter','Stop')}</button>` : `<button type="button" class="composer-send" data-nv="continue">${nvText('Continuer','Continue')}</button>`}<button type="submit" class="composer-send" ${state.sending ? 'disabled' : ''}>${nvText('Envoyer','Send')}</button></form></div>` : `<div class="chat-empty"><span class="nv-eyebrow">NASTYVERSE STUDIO</span><h2>${nvText('Une nouvelle histoire commence ici.','A new story starts here.')}</h2><p>${nvText('Choisissez un personnage, créez votre persona et entrez dans votre univers.','Choose a character, create your persona and enter your world.')}</p>${nvButton('new',nvText('Commencer une conversation','Start a conversation'),true)}${nvButton('library',nvText('Créer ou importer un personnage','Create or import a character'))}</div>`}</section></div>`;
  nvBind(pageRoot, { new: nvNewChat, library: () => goTo('library'), tools: () => goTo('configuration',{section:'studio'}), persona: () => nvChoosePersona(chat), context: () => nvContextEditor(chat), menu: () => nvChatMenu(chat), inspect: () => nvInspect(chat,character), bookmarks: () => nvBookmarks(chat), continue: () => nvGenerate(chat,'continue'), stop: nvStop, voice: () => nvDictate(chat) });
  pageRoot.querySelectorAll('[data-session]').forEach(b => b.onclick = () => nvSelectSession(NV.data.sessions.find(s => s.id === b.dataset.session)));
  document.getElementById('nv-session-search').oninput = event => { pageRoot.querySelectorAll('[data-session]').forEach(b => b.hidden = !b.textContent.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase())); };
  if (!chat) return;
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
    if (!state.backendConfig) state.backendConfig = await invoke('load_backend_config');
    if (effectiveBackendApiMode(state.backendConfig)==='text' && chat.draftImages?.some(a=>a.sendToModel)) throw new Error(nvText('Les images nécessitent le mode Chat et un modèle avec vision. Cliquez sur l’image pour désactiver Vision si vous souhaitez seulement l’afficher.','Images require Chat mode and a vision model. Click the image to turn Vision off if you only want to display it.'));
    const translated = await nvPrepareOutgoingTranslation(content);
    const message = NVCore.message({role:'user',name:nvPersona(chat).name,content:translated.content,attachments:chat.draftImages||[],displayText:translated.displayText,displaySource:translated.displayText ? translated.content : '',displayLanguage:translated.displayLanguage});
    nvCheckpoint(chat); chat.messages.push(message); chat.draftImages=[]; chat.draft = ''; chat.updatedAt = Date.now(); await nvSave();
    await nvGenerate(chat,'reply');
  } finally { NV.preparing = false; }
}
async function nvCompletion(character,history,chat,onDelta) {
  const params = {...getGenerationParams(),...NV.data.generation};
  if (nvChatTranslationApplies('assistant')) {
    history = [...history, { role:'system', content:'Write the next assistant response in English. English is the internal conversation language. Do not translate the answer for the user; the interface handles display translation separately.' }];
  }
  NV.scope = chat; NV.promptHistory = history;
  let request;
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
  } finally { NV.scope = null; NV.promptHistory = null; }
  const args = request.mode === 'text' ? {prompt:request.prompt,stopStrings:request.stopStrings,params} : {messages:request.messages,params};
  let result;
  if (TAURI?.core?.Channel && NV.data.generation.stream !== false) {
    const channel = new TAURI.core.Channel(); channel.onmessage = onDelta;
    try { result = await invoke('stream_completion',{...args,messages:args.messages || null,prompt:args.prompt || null,stopStrings:args.stopStrings || [],requestId:NV.activeRequest.id,onEvent:channel}); }
    catch (error) { if (/command.*stream_completion.*not found/i.test(String(error))) { toast(nvText('Lecture progressive : lanceur 0.1.11 requis. Réponse standard utilisée.','Streaming requires launcher 0.1.11. Using standard completion.')); result = await invoke(request.mode === 'text' ? 'text_completion' : 'chat_completion',args); } else throw error; }
  } else result = await invoke(request.mode === 'text' ? 'text_completion' : 'chat_completion',args);
  const content = request.mode === 'text' ? postProcessTextCompletionResponse(result.content,request.preset,request.formatting,request.stopStrings) : String(result.content || '');
  return {...result,content:await nvRules(content,'output')};
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
      if (mode === 'impersonate') {
        try { const display = await nvPrepareAssistantTranslation(result.content); chat.draft = display?.content || result.content; }
        catch (error) { console.warn('[translate] Impersonation translation failed.', error); chat.draft = nvText('[Traduction indisponible]','[Translation unavailable]'); }
      } else if (mode === 'regenerate' && last?.role === 'assistant') {
        last.variants.push(result.content); last.variant = last.variants.length - 1; last.content = result.content;
        await nvApplyAssistantDisplay(last);
      } else if (mode === 'continue' && last?.role === 'assistant') {
        last.content += '\n' + result.content; last.variants[last.variant] = last.content;
        await nvApplyAssistantDisplay(last);
      } else {
        const message = NVCore.message({role:'assistant',content:result.content,name:character.name,characterId:character.id,model:result.model,duration:performance.now()-started});
        chat.messages.push(message);
        await nvApplyAssistantDisplay(message);
      }
      chat.updatedAt = Date.now(); await nvSave(); run.content = '';
      if (NV.data.appearance.autoSpeak && mode !== 'impersonate') { const spokenMessage = ['regenerate','continue'].includes(mode) ? last : chat.messages.at(-1); nvSpeak(spokenMessage ? nvMessageDisplayContent(spokenMessage) : result.content); }
    }
  } catch (error) { run.failed = true; if (!run.cancelled) toast(friendlyNativeError(error),'error'); }
  finally {
    if ((run.cancelled || run.failed) && run.content.trim() && mode !== 'impersonate') {
      const partial = NVCore.message({role:'assistant',content:run.content,name:run.name,characterId:run.characterId});
      await nvApplyAssistantDisplay(partial);
      chat.messages.push(partial); await nvSave();
    }
    state.sending = false; NV.activeRequest = null; if (state.currentPage === 'chat') renderChat();
  }
}
async function nvStop() { const run = NV.activeRequest; if (!run) return; run.cancelled = true; try { await invoke('cancel_completion',{requestId:run.id}); } catch (_) { toast(nvText('Annulation demandée. Ce lanceur doit attendre la fin de la requête.','Cancellation requested. This launcher must wait for the request to finish.')); } }
async function nvMessageAction(chat,m,action) {
  if (!m) return;
  if (state.sending && NV.activeRequest?.sessionId === chat.id) return toast(nvText('Arrêtez la génération avant de modifier cette conversation.','Stop generation before editing this conversation.'));
  if (action === 'more') {
    const dialog = nvDialog(nvText('Actions du message','Message actions'),`<div class="nv-menu">${[['copy',nvText('Copier','Copy')],['speak',nvText('Lire à voix haute','Read aloud')],['hide',m.hidden ? nvText('Inclure dans le contexte','Include in context') : nvText('Exclure du contexte','Exclude from context')],['delete',nvText('Supprimer ce message','Delete this message')]].map(([key,label]) => nvButton(key,label)).join('')}<p class="nv-muted">${m.model ? nvEscape(m.model)+' · ' : ''}~${estimateTokens(m.content)} tokens · ${Math.round(m.duration/1000)} s</p></div>`);
    nvBind(dialog,Object.fromEntries(['copy','speak','hide','delete'].map(a => [a,() => { dialog.close(); return nvMessageAction(chat,m,a); }]))); return;
  }
  if (action === 'copy') return navigator.clipboard.writeText(nvMessageDisplayContent(m));
  if (action === 'speak') return nvSpeak(nvMessageDisplayContent(m));
  if (action === 'regenerate') return nvGenerate(chat,'regenerate');
  if (action === 'branch') { const branch = NVCore.branch(chat,m.id,`${chat.title} · ${nvText('bifurcation','branch')}`); NV.data.sessions.push(branch); nvSelectSession(branch); return; }
  if (action === 'edit') {
    const value = await nvForm(nvText('Modifier le message','Edit message'),[nvField('content',nvText('Texte','Text'),nvMessageDisplayContent(m),'textarea',{rows:12,required:true})]);
    if (!value) return; nvCheckpoint(chat); await nvTranslateEditedMessage(m,value.content); m.variants[m.variant] = m.content;
  } else {
    nvCheckpoint(chat);
    if (action === 'bookmark') m.bookmark = !m.bookmark;
    else if (action === 'hide') m.hidden = !m.hidden;
    else if (action === 'delete') { if (!confirm(nvText('Supprimer ce message ? Vous pourrez annuler dans le menu de conversation.','Delete this message? You can undo from the conversation menu.'))) return; chat.messages = chat.messages.filter(item => item.id !== m.id); }
    else if (action === 'previous' || action === 'next') {
      m.variant = (m.variant + (action === 'next' ? 1 : -1) + m.variants.length) % m.variants.length; m.content = m.variants[m.variant]; nvClearMessageDisplay(m);
      if (nvChatTranslationApplies(m.role) && String(nvChatTranslationConfig().targetLanguage).toLowerCase() !== 'en') {
        const display = await nvTranslateChatText(m.content,nvChatTranslationConfig().targetLanguage,'en'); nvSetMessageDisplay(m,display,nvChatTranslationConfig().targetLanguage);
      }
    }
  }
  nvChanged(chat);
}
