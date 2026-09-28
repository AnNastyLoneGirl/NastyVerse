/* Guided editors and portable data tools for NastyVerse Studio. */
function nvPickFiles(accept, multiple = false) {
  return new Promise(resolve => { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple; input.onchange = () => resolve([...input.files]); input.oncancel = () => resolve([]); input.click(); });
}
async function nvReadFile(file, max = 20_000_000) { if (file.size > max) throw new Error(nvText('Ce fichier est trop volumineux.','This file is too large.')); return file.text(); }
function nvDownload(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content],{type})); const link = document.createElement('a'); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g,'_'); link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
async function nvChoosePersona(chat) {
  const dialog = nvDialog(nvText('Votre rôle dans cette histoire','Your role in this story'),`<label class="nv-persona-picker">${nvText('Persona','Persona')}<select id="nv-persona-choice"><option value="">${nvText('Persona par défaut','Default persona')}</option>${NV.data.personas.map(p=>`<option value="${nvEscape(p.id)}" ${p.id===chat.personaId?'selected':''}>${nvEscape(p.name)}</option>`).join('')}</select></label><div id="nv-persona-context"></div><div class="nv-actions">${nvButton('variations',nvText('Gérer les variations','Manage variations'))}${nvButton('add',nvText('Variation pour cette conversation','Variation for this conversation'))}</div><p class="nv-muted">${nvText('Les variations liées à un personnage de groupe sont évaluées séparément pour chaque personnage qui répond.','Variations linked to group characters are evaluated separately for each replying character.')}</p>`);
  const refresh=()=>{
    const persona=nvPersona(chat);dialog.querySelector('#nv-persona-context').innerHTML=`<h3>${nvEscape(persona.name)}</h3><div class="nv-persona-base">${nvMarkdown(persona.baseDescription||nvText('Aucune description de base.','No base description.'))}</div><h4>${nvText('Variations actives pour cette conversation','Active variations for this conversation')}</h4><div class="nv-variation-preview">${persona.activeVariations.map(v=>`<article><strong>${nvEscape(v.name)}</strong><p>${nvEscape(v.content)}</p></article>`).join('')||`<p class="nv-muted">${nvText('Aucune variation liée active.','No active linked variations.')}</p>`}</div>`;
    dialog.querySelectorAll('[data-nv]').forEach(b=>b.disabled=!persona.id);
  };
  dialog.querySelector('#nv-persona-choice').onchange=nvGuard(async event=>{chat.personaId=event.target.value;NV.prompt=null;await nvSave();refresh();});
  nvBind(dialog,{variations:()=>{const persona=NV.data.personas.find(p=>p.id===nvPersona(chat).id);dialog.close();nvPersonaVariations(persona);},add:()=>{const persona=NV.data.personas.find(p=>p.id===nvPersona(chat).id);dialog.close();return nvVariationEditor(persona,null,{sessionId:chat.id});}});
  dialog.addEventListener('close',()=>{if(state.currentPage==='chat')renderChat();});refresh();
}
async function nvContextEditor(chat) {
  const draft = await nvForm(nvText('Le contexte de votre histoire','Your story context'),[
    nvField('scenario',nvText('Scénario propre à cette conversation','Scenario for this conversation'),chat.scenario,'textarea',{rows:3}),
    nvField('memory',nvText('À retenir : faits, relations, événements','Remember: facts, relationships, events'),chat.memory,'textarea',{rows:5}),
    nvField('note',nvText('Direction de la scène (note d’auteur)','Scene direction (author’s note)'),chat.note,'textarea',{rows:3}),
    nvField('noteDepth',nvText('Insérer la note à N messages de la fin','Insert note N messages from the end'),chat.noteDepth,'number',{min:0,max:100}),
    nvField('noteInterval',nvText('Utiliser la note tous les N tours','Use note every N turns'),chat.noteInterval,'number',{min:1,max:100}),
    nvField('bookIds',nvText('Livres de connaissances associés','Linked lorebooks'),chat.bookIds,'multiselect',{options:NV.data.books.map(b => ({value:b.id,label:b.name}))}),
    nvField('documentIds',nvText('Documents de référence','Reference documents'),chat.documentIds,'multiselect',{options:NV.data.documents.map(d => ({value:d.id,label:d.name}))}),
  ],nvText('La mémoire reste dans le contexte. Les connaissances et extraits sont sélectionnés selon la conversation.','Memory stays in context. Lore and excerpts are selected using the conversation.'));
  if (draft) { nvCheckpoint(chat); Object.assign(chat,draft); nvChanged(chat); }
}
function nvBookmarks(chat) {
  const dialog = nvDialog(nvText('Messages favoris','Bookmarked messages'),`<div class="nv-menu">${chat.messages.filter(m => m.bookmark).map(m => `<button class="btn btn-ghost" data-jump="${nvEscape(m.id)}">${nvEscape(m.content.slice(0,140))}</button>`).join('') || `<p>${nvText('Marquez un message avec ☆ pour le retrouver ici.','Bookmark a message with ☆ to find it here.')}</p>`}</div>`);
  dialog.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { NV.search = ''; dialog.close(); renderChat(); const article = [...pageRoot.querySelectorAll('[data-message]')].find(a => a.dataset.message === b.dataset.jump); requestAnimationFrame(() => article?.scrollIntoView({block:'center'})); });
}
function nvPromptItemRow(label, value, cssClass = '') {
  return `<div class="nv-prompt-item-row ${cssClass}"><span>${nvEscape(label)}</span><strong>${Number(value) || 0}</strong></div>`;
}
function nvPromptSectionTotal(items = {}) {
  return Object.values(items).reduce((sum, value) => sum + (Number(value) || 0), 0);
}
function nvPromptRawContent(record) {
  if (record?.mode === 'text') return String(record.prompt || '');
  return (record?.messages || []).map(message => `[${message.role}]\n${nvReadableContent(message.content)}`).join('\n\n');
}
function nvReconstructMessagePrompt(chat, message) {
  const index = chat.messages.findIndex(item => item.id === message.id);
  if (index < 0) return null;
  const character = getCharacters().find(item => item.id === message.characterId)
    || getCharacters().find(item => item.name === message.name)
    || getCharacters().find(item => item.id === chat.targetId);
  if (!character) return null;
  const history = NVCore.clone(chat.messages.slice(0, index));
  const params = {...getGenerationParams(),...NV.data.generation};
  NV.scope = chat; NV.promptHistory = history;
  try {
    const mode = effectiveBackendApiMode(state.backendConfig);
    const request = mode === 'text'
      ? buildTextCompletionRequest(character, history, params)
      : { mode:'chat', messages:buildChatCompletionMessages(character, history, params) };
    return nvPromptInspectionRecord(character, history, chat, request, params, true);
  } finally {
    NV.scope = null; NV.promptHistory = null;
  }
}
function nvInspectMessagePrompt(chat, message) {
  if (!chat || !message || message.role !== 'assistant') return;
  const currentVariant = Math.max(0, Number(message.variant) || 0);
  let record = nvMessagePromptRecord(message);
  if (!record) record = nvReconstructMessagePrompt(chat, message);
  if (!record) return toast(nvText('Impossible de reconstruire le prompt de ce message.','Unable to reconstruct the prompt for this message.'),'error');
  const item = record.itemization || {};
  const character = item.character || {};
  const extensions = item.extensions || {};
  const characterTotal = nvPromptSectionTotal(character);
  const extensionTotal = nvPromptSectionTotal(extensions);
  const worldInfo = Number(item.worldInfo) || 0;
  const history = Number(item.history) || 0;
  const chartTotal = Math.max(1, characterTotal + worldInfo + history + extensionTotal);
  const bar = (value, className) => `<span class="${className}" style="flex:${Math.max(0,Number(value)||0)} 0 0"></span>`;
  const modeLabel = record.mode === 'text' ? nvText('Complétion de texte','Text completion') : nvText('Chat Completion','Chat completion');
  const backendLabel = record.meta?.provider || record.meta?.backendType || nvText('Backend inconnu','Unknown backend');
  const modelLabel = record.meta?.model || message.model || nvText('Modèle inconnu','Unknown model');
  const raw = nvPromptRawContent(record);
  const contextAllowed = Number(item.contextAllowed) || 0;
  const totalTokens = Number(item.totalTokens) || (record.mode === 'text' ? estimateTokens(raw) : estimateChatMessagesTokens(record.messages || []));
  const contextMax = Number(record.meta?.contextTokens) || 0;
  const generationReserve = Number(record.meta?.maxTokens) || 0;
  const dialog = nvDialog(nvText('Prompt Itemization','Prompt Itemization'), `
    <div class="nv-prompt-inspector-head">
      <strong>API/Modèle: ${nvEscape(modeLabel)} (${nvEscape(backendLabel)}) – ${nvEscape(modelLabel)}</strong>
      <span>${nvEscape(nvText('Preset','Preset'))}: ${nvEscape(record.meta?.contextPreset || '—')} · ${nvEscape(nvText('Instruction','Instruction'))}: ${nvEscape(record.meta?.instructionPreset || '—')}</span>
      ${record.reconstructed ? `<em>${nvEscape(nvText('Aperçu reconstruit avec les réglages actuels : aucun instantané historique n’était disponible pour ce message.','Reconstructed with current settings: no historical snapshot was available for this message.'))}</em>` : `<em>${nvEscape(nvText(`Instantané enregistré pour la variante ${currentVariant + 1}.`,`Saved snapshot for variant ${currentVariant + 1}.`))}</em>`}
    </div>
    <div class="nv-prompt-inspector-layout">
      <section class="nv-prompt-itemization">
        <div class="nv-prompt-stack" aria-label="Prompt token distribution">${bar(characterTotal,'is-character')}${bar(worldInfo,'is-world')}${bar(history,'is-history')}${bar(extensionTotal,'is-extension')}</div>
        <div class="nv-prompt-item-list">
          ${nvPromptItemRow(nvText('Character Definitions','Character Definitions'),characterTotal,'is-character')}
          <div class="nv-prompt-subitems">
            ${nvPromptItemRow('↳ Description',character.description)}
            ${nvPromptItemRow(`↳ ${nvText('Personnalité','Personality')}`,character.personality)}
            ${nvPromptItemRow('↳ Scenario',character.scenario)}
            ${nvPromptItemRow(`↳ ${nvText('Exemples','Examples')}`,character.examples)}
            ${nvPromptItemRow('↳ User Persona',character.persona)}
            ${nvPromptItemRow('↳ System Prompt',character.system)}
          </div>
          ${nvPromptItemRow('World Info',worldInfo,'is-world')}
          ${nvPromptItemRow(nvText('Historique du chat','Chat History'),history,'is-history')}
          ${nvPromptItemRow('Extensions',extensionTotal,'is-extension')}
          <div class="nv-prompt-subitems">
            ${nvPromptItemRow(`↳ ${nvText('Mémoire','Memory')}`,extensions.memory)}
            ${nvPromptItemRow(`↳ ${nvText("Note d’auteur","Author's Note")}`,extensions.authorNote)}
            ${nvPromptItemRow('↳ Smart Context',extensions.smartContext)}
            ${nvPromptItemRow('↳ Post-History',extensions.postHistory)}
          </div>
        </div>
        <div class="nv-prompt-totals">
          ${nvPromptItemRow(nvText('Total des Tokens dans le Prompt','Total Prompt Tokens'),totalTokens)}
          ${nvPromptItemRow(nvText('Contexte maximum','Maximum Context'),contextMax)}
          ${nvPromptItemRow(nvText('Réserve de réponse','Reply Reserve'),generationReserve)}
          ${nvPromptItemRow(nvText('Contexte réellement disponible','Actual Max Context Allowed'),contextAllowed)}
        </div>
      </section>
      <section class="nv-prompt-raw-panel">
        <div class="nv-prompt-raw-toolbar"><strong>${nvEscape(nvText('Prompt envoyé au modèle','Prompt sent to the model'))}</strong><button type="button" class="btn btn-ghost btn-small" data-copy-prompt>${nvEscape(nvText('Copier','Copy'))}</button></div>
        <pre class="nv-prompt-raw">${nvEscape(raw)}</pre>
      </section>
    </div>`, true);
  dialog.classList.add('nv-prompt-itemization-dialog');
  dialog.querySelector('[data-copy-prompt]')?.addEventListener('click', () => navigator.clipboard.writeText(raw));
}

async function nvChatMenu(chat) {
  const actions = [['rename',nvText('Renommer','Rename')],['pin',chat.pinned ? nvText('Désépingler','Unpin') : nvText('Épingler','Pin')],['summary',nvText('Résumer la conversation','Summarize conversation')],['impersonate',nvText('Proposer mon prochain message','Draft my next message')],['undo',nvText('Annuler la dernière modification','Undo last edit')],['export',nvText('Exporter pour SillyTavern (.jsonl)','Export for SillyTavern (.jsonl)')],['import',nvText('Importer une conversation','Import conversation')],['text',nvText('Exporter en texte','Export as text')],['delete',nvText('Supprimer cette conversation','Delete this conversation')]];
  const dialog = nvDialog(chat.title,`<div class="nv-menu">${actions.map(([a,l])=>nvButton(a,l)).join('')}</div>`);
  nvBind(dialog,Object.fromEntries(actions.map(([action])=>[action,async()=>{
    dialog.close();
    if (state.sending && !['export','text'].includes(action)) return toast(nvText('Attendez ou arrêtez la génération.','Wait for or stop generation.'));
    if (action==='rename') { const d=await nvForm(nvText('Renommer','Rename'),[nvField('title',nvText('Titre','Title'),chat.title,'text',{required:true})]); if(d) Object.assign(chat,d); }
    if (action==='pin') chat.pinned=!chat.pinned;
    if (action==='undo') { const old=NV.undo.get(chat.id)?.pop(); if(old) Object.assign(chat,old); else toast(nvText('Aucune modification à annuler.','Nothing to undo.')); }
    if (action==='export') { nvDownload(`${chat.title}.jsonl`,NVCore.exportChat(chat,nvPersona(chat).name,getCharacters().find(c=>c.id===chat.targetId)?.name),'application/x-ndjson'); return; }
    if (action==='text') { nvDownload(`${chat.title}.txt`,chat.messages.map(m=>`${m.name || m.role}:\n${m.content}`).join('\n\n')); return; }
    if (action==='import') { const [file]=await nvPickFiles('.json,.jsonl'); if(file) { const imported=NVCore.importChat(await nvReadFile(file),chat.targetId,file.name.replace(/\.jsonl?$/i,'')); NV.data.sessions.push(imported); nvSelectSession(imported); } return; }
    if (action==='summary') return nvSummarize(chat);
    if (action==='impersonate') return nvGenerate(chat,'impersonate');
    if (action==='delete') { if(!confirm(nvText('Supprimer cette conversation ? Exportez-la si vous souhaitez la conserver.','Delete this conversation? Export it if you want to keep it.'))) return; NV.data.sessions=NV.data.sessions.filter(s=>s.id!==chat.id); delete NV.data.active[chat.targetId]; }
    nvChanged(chat);
  }])));
}
async function nvSummarize(chat) {
  if(state.sending || !chat.messages.length) return;
  const character=getCharacters().find(c=>c.id===chat.targetId) || getCharacters().find(c=>NV.data.groups.find(g=>`group:${g.id}`===chat.targetId)?.members.includes(c.id));
  if(!character) return;
  state.sending=true; NV.activeRequest={id:uid(),sessionId:chat.id,name:nvText('Résumé','Summary'),content:'',reasoning:'',cancelled:false};
  try {
    const history=[...chat.messages,{role:'user',content:nvText('Résume les faits, les relations et les événements importants de cette conversation pour sa mémoire future. Ne continue pas la scène.','Summarize important facts, relationships and events for future conversation memory. Do not continue the scene.')}];
    const result=await nvCompletion(character,history,chat,()=>{});
    if(NV.activeRequest.cancelled) return;
    const draft=await nvForm(nvText('Vérifier la mémoire proposée','Review proposed memory'),[nvField('memory',nvText('Mémoire','Memory'),result.content,'textarea',{rows:12})],nvText('Corrigez les faits avant de remplacer la mémoire actuelle.','Check the facts before replacing the current memory.'));
    if(draft) { nvCheckpoint(chat); chat.memory=draft.memory; await nvSave(); }
  } catch(error) { toast(friendlyNativeError(error),'error'); }
  finally { state.sending=false; NV.activeRequest=null; if(state.currentPage==='chat') renderChat(); }
}
function nvVariableCommandArg(value = '') {
  const source = String(value || '').trim();
  const keyMatch = /^key=(?:"([^"]*)"|'([^']*)'|(\S+))(?:\s+([\s\S]*))?$/.exec(source);
  if (keyMatch) return { name:keyMatch[1] ?? keyMatch[2] ?? keyMatch[3] ?? '', value:keyMatch[4] ?? '' };
  const quoted = /^(?:"([^"]*)"|'([^']*)'|(\S+))(?:\s+([\s\S]*))?$/.exec(source);
  return quoted ? { name:quoted[1] ?? quoted[2] ?? quoted[3] ?? '', value:quoted[4] ?? '' } : { name:'', value:'' };
}
function nvVariableCommandValue(chat, command, value) {
  const globalScope = command.includes('global');
  const op = command.replace('global','');
  const parsed = nvVariableCommandArg(value);
  const name = nvVariableName(parsed.name);
  if (!name) throw new Error(nvText('Nom de variable manquant.','Missing variable name.'));
  if (op === 'getvar') return nvVariableGet(chat,name,globalScope);
  if (op === 'setvar') return nvVariableSet(chat,name,parsed.value,globalScope);
  if (op === 'addvar') return nvVariableAdd(chat,name,parsed.value,globalScope);
  if (op === 'incvar') return nvVariableAdd(chat,name,1,globalScope);
  if (op === 'decvar') return nvVariableAdd(chat,name,-1,globalScope);
  if (op === 'flushvar') { nvVariableDelete(chat,name,globalScope); return ''; }
  return '';
}
async function nvCommand(content,chat) {
  const [name,...args]=content.slice(1).split(' '); const value=args.join(' ').trim();
  if(name==='help' || !name) { nvDialog(nvText('Raccourcis','Shortcuts'),`<div class="nv-help">${[['/help',nvText('Afficher cette aide','Show help')],['/continue',nvText('Continuer la réponse','Continue reply')],['/regen',nvText('Générer une variante','Generate variant')],['/note texte',nvText('Définir la direction de scène','Set scene direction')],['/memory texte',nvText('Définir la mémoire','Set memory')],['/sys texte',nvText('Ajouter une instruction système','Add a system instruction')],['/roll 2d6',nvText('Lancer les dés','Roll dice')],['/new',nvText('Nouvelle conversation','New conversation')],['/summarize',nvText('Proposer une mémoire','Suggest memory')],['/variables',nvText('Ouvrir le gestionnaire de variables','Open variable manager')],['/setvar key=nom valeur',nvText('Définir une variable du chat','Set a chat variable')],['/getvar nom',nvText('Lire une variable du chat','Read a chat variable')],['/addvar key=nom valeur',nvText('Ajouter à une variable du chat','Add to a chat variable')],['/incvar nom · /decvar nom',nvText('Incrémenter / décrémenter','Increment / decrement')],['/flushvar nom',nvText('Supprimer une variable du chat','Delete a chat variable')],['/setglobalvar key=nom valeur',nvText('Définir une variable globale','Set a global variable')],['/getglobalvar nom',nvText('Lire une variable globale','Read a global variable')],['/addglobalvar key=nom valeur',nvText('Ajouter à une variable globale','Add to a global variable')],['/incglobalvar nom · /decglobalvar nom',nvText('Incrémenter / décrémenter une globale','Increment / decrement a global')],['/flushglobalvar nom',nvText('Supprimer une variable globale','Delete a global variable')]].map(([c,d])=>`<p><code>${nvEscape(c)}</code> — ${nvEscape(d)}</p>`).join('')}</div>`); return true; }
  if(name==='variables' || name==='variableviewer') { NV.chatView='variables'; nvRenderChat(); return true; }
  const variableCommands = new Set(['getvar','setvar','addvar','incvar','decvar','flushvar','getglobalvar','setglobalvar','addglobalvar','incglobalvar','decglobalvar','flushglobalvar']);
  if (variableCommands.has(name)) {
    const result = nvVariableCommandValue(chat,name,value);
    if (!name.startsWith('get')) await nvSave();
    if (name.startsWith('flush')) toast(nvText('Variable supprimée.','Variable deleted.'),'success'); else toast(`${name}: ${result || '∅'}`,'success');
    return true;
  }
  if(name==='new') { await nvNewChat(); return true; }
  if(name==='continue' || name==='regen') { await nvGenerate(chat,name==='regen'?'regenerate':'continue'); return true; }
  if(name==='summarize') { await nvSummarize(chat); return true; }
  if(name==='note' || name==='memory') { nvCheckpoint(chat); chat[name]=value; return true; }
  if(name==='sys') { nvCheckpoint(chat); chat.messages.push(NVCore.message({role:'system',content:value,name:'System'})); return true; }
  if(name==='roll') { const match=/^(\d{1,2})d(\d{1,5})$/.exec(value||'1d20'); if(!match || +match[1]<1 || +match[1]>30 || +match[2]<1) throw new Error(nvText('Exemple : /roll 2d6 (30 dés maximum).','Example: /roll 2d6 (maximum 30 dice).')); const dice=Array.from({length:+match[1]},()=>{const n=new Uint32Array(1);crypto.getRandomValues(n);return 1+n[0] % +match[2];}); nvCheckpoint(chat);chat.messages.push(NVCore.message({role:'system',name:'🎲',content:`${value||'1d20'} → ${dice.join(' + ')} = ${dice.reduce((a,b)=>a+b,0)}`}));return true; }
  toast(nvText('Commande inconnue. /help affiche les commandes disponibles.','Unknown command. /help lists available commands.')); return true;
}
function nvSpeak(content) {
  if(!window.speechSynthesis) return toast(nvText('La lecture vocale est indisponible dans cet environnement.','Speech synthesis is unavailable in this environment.'));
  speechSynthesis.cancel(); const speech=new SpeechSynthesisUtterance(content); speech.lang=state.locale.startsWith('fr')?'fr-FR':'en-US'; speech.rate=NV.data.appearance.rate || 1; speech.voice=speechSynthesis.getVoices().find(v=>v.voiceURI===NV.data.appearance.voice)||null; speechSynthesis.speak(speech);
}
function nvDictate(chat) {
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition) return toast(nvText('La dictée n’est pas disponible dans ce navigateur/WebView.','Dictation is unavailable in this browser/WebView.'));
  const recognition=new Recognition(); recognition.lang=state.locale.startsWith('fr')?'fr-FR':'en-US';recognition.interimResults=false;
  recognition.onresult=event=>{chat.draft=(chat.draft+' '+event.results[0][0].transcript).trim();nvChanged(chat);};recognition.onerror=event=>toast(`${nvText('Dictée','Dictation')}: ${event.error}`,'error');recognition.start();toast(nvText('Parlez maintenant…','Speak now…'));
}
function nvRenderLibrary(tab) {
  const root=document.getElementById('library-content');
  const key={personas:'personas',lorebooks:'books',groups:'groups'}[tab] || 'books';
  const descriptions={personas:nvText('Votre identité, votre rôle et votre façon de parler.','Your identity, role and way of speaking.'),books:nvText('Les lieux, les personnages et les règles que le modèle doit connaître au bon moment.','Places, people and rules the model should know at the right moment.'),groups:nvText('Réunissez plusieurs personnages dans une même conversation.','Bring several characters into one conversation.')};
  root.innerHTML=`<div class="nv-library-head"><p>${descriptions[key]}</p><div class="nv-actions">${key==='books'?nvButton('import',nvText('Importer JSON','Import JSON')):''}${nvButton('create',nvText('Créer','Create'),true)}</div></div><div class="nv-card-grid">${NV.data[key].map(item=>`<article class="nv-card"><span class="nv-eyebrow">${key==='personas'?(NV.data.defaultPersona===item.id?nvText('PAR DÉFAUT','DEFAULT'):nvText('PERSONA','PERSONA')):key==='books'?`${item.entries.length} ${nvText('entrées','entries')}`:`${item.members.length} ${nvText('personnages','characters')}`}</span><h3>${nvEscape(item.name)}</h3><p>${nvEscape(item.description || (key==='books'?item.entries.slice(0,3).map(e=>e.title).join(' · '):''))}</p><div class="nv-actions"><button class="btn btn-ghost btn-small" data-edit="${nvEscape(item.id)}">${nvText('Ouvrir','Open')}</button>${key==='groups'?`<button class="btn btn-primary btn-small" data-chat="${nvEscape(item.id)}">${nvText('Discuter','Chat')}</button>`:''}</div></article>`).join('')||`<div class="nv-empty-card"><h3>${nvText('Tout commence par une idée.','It all starts with an idea.')}</h3><p>${descriptions[key]}</p></div>`}</div>`;
  const editor=key==='personas'?nvPersonaEditor:key==='books'?nvBookEditor:nvGroupEditor;
  nvBind(root,{create:()=>editor(),import:async()=>{const files=await nvPickFiles('.json',true);for(const file of files){NV.data.books.push(NVCore.normalizeBook(JSON.parse(await nvReadFile(file)),file.name.replace(/\.json$/i,'')));}await nvSave();renderLibrary(tab);}});
  root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=nvGuard(()=>editor(NV.data[key].find(i=>i.id===b.dataset.edit))));
  if(key==='personas')root.querySelectorAll('[data-edit]').forEach(b=>{const persona=NV.data.personas.find(p=>p.id===b.dataset.edit);const button=document.createElement('button');button.className='btn btn-ghost btn-small';button.textContent=`${nvText('Variations','Variations')} (${persona.variations?.length||0})`;button.onclick=()=>nvPersonaVariations(persona);b.parentElement.append(button);});
  root.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{NV.groupId=b.dataset.chat;nvEnsureSession(null);goTo('chat',{view:'conversation'});});
}
async function nvPersonaEditor(existing) {
  const recordId = existing?.id || uid();
  let avatarValue = existing?.avatar || '';
  let result = null;
  const avatarSource = () => resolvedAvatarSource(avatarValue);
  const dialog = nvDialog(nvText('Votre persona','Your persona'), `<form class="nv-form nv-persona-editor" id="nv-persona-form">
    <div class="nv-persona-avatar-editor"><div class="nv-persona-avatar-preview" id="nv-persona-avatar-preview"></div><div class="nv-actions"><button type="button" class="btn btn-ghost btn-small" data-avatar-upload>${nvText('Choisir un avatar','Choose avatar')}</button><button type="button" class="btn btn-ghost btn-small" data-avatar-remove>${nvText('Retirer','Remove')}</button></div><small>${nvText('Cet avatar apparaît dans les messages envoyés avec cette persona.','This avatar appears beside messages sent with this persona.')}</small></div>
    <label><span>${nvText('Nom','Name')}</span><input name="name" value="${nvEscape(existing?.name||'')}" required></label>
    <label><span>${nvText('Qui êtes-vous dans l’histoire ?','Who are you in the story?')}</span><textarea name="description" rows="7">${nvEscape(existing?.description||'')}</textarea></label>
    <label class="nv-check"><input name="default" type="checkbox" ${NV.data.defaultPersona===existing?.id?'checked':''}>${nvText('Utiliser par défaut','Use as default')}</label>
    ${existing ? `<label class="nv-check"><input name="remove" type="checkbox">${nvText('Supprimer cette persona','Delete this persona')}</label>` : ''}
    <footer><button type="button" class="btn btn-ghost" data-cancel>${nvText('Annuler','Cancel')}</button><button type="submit" class="btn btn-primary">${nvText('Enregistrer','Save')}</button></footer>
  </form>`);
  const form = dialog.querySelector('#nv-persona-form');
  const preview = dialog.querySelector('#nv-persona-avatar-preview');
  const renderAvatar = () => {
    const source = avatarSource();
    preview.innerHTML = source ? `<img src="${nvEscape(source)}" alt="">` : `<span>${nvEscape(String(form.elements.name.value || existing?.name || '?').slice(0,1).toUpperCase())}</span>`;
  };
  renderAvatar();
  form.elements.name.addEventListener('input', () => { if (!avatarSource()) renderAvatar(); });
  dialog.querySelector('[data-avatar-upload]').onclick = async () => {
    const [file] = await nvPickFiles('image/png,image/apng,image/jpeg,image/webp,image/gif,.apng');
    if (!file) return;
    if (file.size > 8_000_000) return toast(nvText('Avatar trop volumineux (8 Mo maximum).','Avatar is too large (8 MB maximum).'),'error');
    avatarValue = await blobToDataUrl(file);
    renderAvatar();
  };
  dialog.querySelector('[data-avatar-remove]').onclick = () => { avatarValue = ''; renderAvatar(); };
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  form.onsubmit = event => {
    event.preventDefault();
    const data = new FormData(form);
    result = { name:String(data.get('name')||'').trim(), description:String(data.get('description')||''), default:data.has('default'), remove:data.has('remove') };
    dialog.close();
  };
  await new Promise(resolve => dialog.addEventListener('close', resolve, { once:true }));
  if (!result) return;
  const assetId = `persona:${recordId}`;
  if (result.remove && existing) {
    NV.data.personas = NV.data.personas.filter(persona => persona.id !== existing.id);
    if (NV.data.defaultPersona === existing.id) NV.data.defaultPersona = '';
    await deleteAvatarAsset(assetId).catch(() => {});
  } else {
    const avatar = await persistAvatarValue(assetId, avatarValue);
    const record = { id:recordId, name:result.name, description:result.description, avatar, variations:existing?.variations||[] };
    if (existing) Object.assign(existing,record); else NV.data.personas.push(record);
    if (result.default) NV.data.defaultPersona=record.id; else if(NV.data.defaultPersona===record.id) NV.data.defaultPersona='';
  }
  await nvSave();
  renderLibrary('personas');
}

function nvPersonaVariations(persona) {
  persona.variations = Array.isArray(persona.variations) ? persona.variations : [];
  const dialog=nvDialog(`${persona.name} · ${nvText('Variations','Variations')}`,`<p class="nv-muted">${nvText('La description de base reste toujours présente. Une variation s’ajoute uniquement si elle est activée et liée au personnage qui répond ou à la conversation en cours. Plusieurs variations peuvent s’appliquer ensemble.','The base description is always present. A variation is added only when enabled and linked to the replying character or current conversation. Multiple variations can apply together.')}</p>${nvButton('add',nvText('Ajouter une variation','Add variation'),true)}<div class="nv-entry-list">${persona.variations.map(v=>{
    const characterNames=(v.characterIds||[]).map(id=>getCharacters().find(c=>c.id===id)?.name).filter(Boolean);
    const sessionNames=(v.sessionIds||[]).map(id=>NV.data.sessions.find(s=>s.id===id)?.title).filter(Boolean);
    const targets=[characterNames.length?`${nvText('Personnages','Characters')} : ${characterNames.join(', ')}`:'',sessionNames.length?`${nvText('Conversations','Conversations')} : ${sessionNames.join(', ')}`:''].filter(Boolean).join(' · ');
    return `<button class="nv-entry" data-variation="${nvEscape(v.id)}"><strong>${v.enabled!==false?'●':'○'} ${nvEscape(v.name)}</strong><small>${nvEscape(v.content.slice(0,180))}</small><span>${nvEscape(targets||nvText('Aucun lien : cette variation ne sera pas injectée.','No links: this variation will not be injected.'))}</span></button>`;
  }).join('')||`<p class="nv-muted">${nvText('Exemple : une relation particulière avec Élara, ou un souvenir propre à une conversation.','Example: a specific relationship with Élara, or a memory unique to one conversation.')}</p>`}</div>`,true);
  nvBind(dialog,{add:async()=>{dialog.close();await nvVariationEditor(persona);}});
  dialog.querySelectorAll('[data-variation]').forEach(b=>b.onclick=nvGuard(async()=>{dialog.close();await nvVariationEditor(persona,persona.variations.find(v=>v.id===b.dataset.variation));}));
  dialog.addEventListener('close',()=>{if(state.currentPage==='library')renderLibrary('personas');});
}
async function nvVariationEditor(persona,existing,initial = {}) {
  persona.variations = Array.isArray(persona.variations) ? persona.variations : [];
  const draft=await nvForm(nvText('Variation de persona','Persona variation'),[
    nvField('name',nvText('Nom de la variation','Variation name'),existing?.name||'','text',{required:true}),
    nvField('content',nvText('Informations à ajouter au contexte de la persona','Information to add to the persona context'),existing?.content||'','textarea',{rows:7,required:true}),
    nvField('enabled',nvText('Activer cette variation','Enable this variation'),existing?.enabled!==false,'checkbox'),
    nvField('characterIds',nvText('Lier à des personnages','Link to characters'),existing?.characterIds||[],'multiselect',{options:getCharacters().map(c=>({value:c.id,label:c.name}))}),
    nvField('sessionIds',nvText('Lier à des conversations','Link to conversations'),existing?.sessionIds||(initial.sessionId?[initial.sessionId]:[]),'multiselect',{options:NV.data.sessions.map(s=>({value:s.id,label:`${s.title} · ${s.targetId.startsWith('group:')?nvText('Groupe','Group'):getCharacters().find(c=>c.id===s.targetId)?.name||nvText('Conversation','Conversation')} · ${new Date(s.createdAt).toLocaleDateString(intlLocale())} · ${s.id.slice(0,6)}`}))}),
    ...(existing?[nvField('remove',nvText('Supprimer cette variation','Delete this variation'),false,'checkbox')]:[]),
  ],nvText('Un lien avec le personnage OU avec la conversation suffit. Si les deux correspondent, le texte est ajouté une seule fois. Sans lien, la variation reste en réserve.','A character OR conversation link is sufficient. If both match, the text is added once. With no links, the variation stays in reserve.'));
  if(draft){if(draft.remove)persona.variations=persona.variations.filter(v=>v.id!==existing.id);else{const record={id:existing?.id||uid(),name:draft.name.trim(),content:draft.content,enabled:draft.enabled,characterIds:draft.characterIds,sessionIds:draft.sessionIds};if(existing)Object.assign(existing,record);else persona.variations.push(record);}await nvSave();NV.prompt=null;}
  nvPersonaVariations(persona);
}
async function nvGroupEditor(existing) {
  const draft=await nvForm(nvText('Groupe de personnages','Character group'),[nvField('name',nvText('Nom du groupe','Group name'),existing?.name||'','text',{required:true}),nvField('members',nvText('Participants','Participants'),existing?.members||[],'multiselect',{options:getCharacters().map(c=>({value:c.id,label:c.name}))}),nvField('mode',nvText('Qui prend la parole ?','Who speaks?'),existing?.mode||'round','select',{options:[{value:'round',label:nvText('Chacun son tour','Round robin')},{value:'all',label:nvText('Tout le groupe répond','Everyone replies')},{value:'random',label:nvText('Un personnage au hasard','Random character')}]}),...(existing?[nvField('remove',nvText('Supprimer ce groupe','Delete this group'),false,'checkbox')]:[])],nvText('Vous pouvez aussi choisir manuellement le prochain personnage dans la conversation.','You can also choose the next speaker manually in the conversation.'));
  if(!draft)return;if(draft.remove)NV.data.groups=NV.data.groups.filter(g=>g.id!==existing.id);else{if(!draft.members.length)throw new Error(nvText('Choisissez au moins un personnage.','Choose at least one character.'));const record={id:existing?.id||uid(),name:draft.name,members:draft.members,mode:draft.mode};if(existing)Object.assign(existing,record);else NV.data.groups.push(record);}await nvSave();renderLibrary('groups');
}
async function nvBookEditor(book) {
  if(!book){const draft=await nvForm(nvText('Nouveau livre de connaissances','New lorebook'),[nvField('name',nvText('Nom du livre','Book name'),'','text',{required:true})]);if(!draft)return;book={id:uid(),name:draft.name,enabled:true,global:false,entries:[]};NV.data.books.push(book);await nvSave();}
  const dialog=nvDialog(book.name,`<div class="nv-actions">${nvButton('add',nvText('Ajouter une entrée','Add entry'),true)}${nvButton('settings',nvText('Réglages','Settings'))}${nvButton('export',nvText('Exporter','Export'))}</div><input class="nv-full" type="search" id="nv-entry-search" placeholder="${nvText('Rechercher une connaissance…','Search knowledge…')}"><div class="nv-entry-list">${book.entries.map(e=>`<button class="nv-entry" data-entry="${nvEscape(e.id)}"><strong>${e.enabled?'●':'○'} ${nvEscape(e.title)}</strong><span>${nvEscape(e.constant?nvText('Toujours active','Always active'):e.keys.join(', '))}</span><small>${nvEscape(e.content.slice(0,130))}</small></button>`).join('')||`<p class="nv-muted">${nvText('Ajoutez une connaissance et les mots qui doivent la déclencher.','Add knowledge and the words that should trigger it.')}</p>`}</div>`,true);
  dialog.addEventListener('close',()=>{if(state.currentPage==='library')renderLibrary('lorebooks');});
  nvBind(dialog,{add:async()=>{dialog.close();await nvEntryEditor(book);},export:()=>downloadJsonFile(`${book.name}.json`,NVCore.exportBook(book)),settings:async()=>{dialog.close();const d=await nvForm(nvText('Réglages du livre','Book settings'),[nvField('name',nvText('Nom','Name'),book.name,'text',{required:true}),nvField('enabled',nvText('Activer ce livre','Enable this book'),book.enabled,'checkbox'),nvField('global',nvText('Disponible dans toutes les conversations','Available in every conversation'),book.global,'checkbox'),nvField('remove',nvText('Supprimer le livre et ses entrées','Delete book and its entries'),false,'checkbox')]);if(d){if(d.remove)NV.data.books=NV.data.books.filter(b=>b.id!==book.id);else Object.assign(book,d);await nvSave();}renderLibrary('lorebooks');}});
  dialog.querySelectorAll('[data-entry]').forEach(b=>b.onclick=nvGuard(async()=>{dialog.close();await nvEntryEditor(book,book.entries.find(e=>e.id===b.dataset.entry));}));
  dialog.querySelector('#nv-entry-search').oninput=event=>dialog.querySelectorAll('[data-entry]').forEach(b=>b.hidden=!b.textContent.toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase()));
}
async function nvEntryEditor(book,existing) {
  const draft=await nvForm(nvText('Une connaissance','Knowledge entry'),[
    nvField('title',nvText('Nom de l’entrée','Entry name'),existing?.title||'','text',{required:true}),nvField('keys',nvText('Mots déclencheurs, séparés par des virgules','Trigger words, comma separated'),existing?.keys.join(', ')||''),nvField('content',nvText('Ce que le modèle doit savoir','What the model should know'),existing?.content||'','textarea',{required:true,rows:8}),nvField('enabled',nvText('Activée','Enabled'),existing?.enabled!==false,'checkbox'),nvField('constant',nvText('Toujours incluse (sans mot déclencheur)','Always included (no trigger needed)'),existing?.constant||false,'checkbox'),nvField('wholeWords',nvText('Mots entiers uniquement','Whole words only'),existing?.wholeWords||false,'checkbox'),nvField('caseSensitive',nvText('Respecter les majuscules','Case sensitive'),existing?.caseSensitive||false,'checkbox'),nvField('secondaryKeys',nvText('Conditions complémentaires (mots séparés par des virgules)','Secondary keywords (comma separated)'),existing?.secondaryKeys?.join(', ')||''),nvField('selectiveLogic',nvText('Combinaison des conditions complémentaires','Secondary keyword logic'),existing?.selectiveLogic||0,'select',{options:[{value:0,label:nvText('Au moins un mot présent','Any present')},{value:1,label:nvText('Au moins un mot absent','Any absent')},{value:2,label:nvText('Aucun mot présent','None present')},{value:3,label:nvText('Tous les mots présents','All present')}]}),nvField('order',nvText('Priorité (la plus élevée est retenue en premier)','Priority (higher is included first)'),existing?.order??100,'number',{min:-10000,max:10000}),nvField('position',nvText('Position','Position'),existing?.position||'after','select',{options:[{value:'before',label:nvText('Avant le personnage','Before character')},{value:'after',label:nvText('Après le personnage','After character')}]}),nvField('probability',nvText('Probabilité d’activation (%)','Activation probability (%)'),existing?.probability??100,'number',{min:0,max:100}),...(existing?[nvField('remove',nvText('Supprimer cette entrée','Delete this entry'),false,'checkbox')]:[])],nvText('Les options avancées des fichiers importés sont conservées à l’export ; consultez la matrice de compatibilité pour leur prise en charge.','Advanced imported options are preserved on export; see the compatibility matrix for runtime support.'));
  if(draft){if(draft.remove)book.entries=book.entries.filter(e=>e.id!==existing.id);else{const keys=draft.keys.split(',').map(s=>s.trim()).filter(Boolean),secondaryKeys=draft.secondaryKeys.split(',').map(s=>s.trim()).filter(Boolean);const entry={...(existing||{id:uid(),source:{}}),...draft,keys,secondaryKeys,selective:secondaryKeys.length>0,selectiveLogic:Number(draft.selectiveLogic)};if(existing)Object.assign(existing,entry);else book.entries.push(entry);}await nvSave();}nvBookEditor(book);
}
function nvAppearance() {
  const themes={violet:['#0a0713','#120b1f','#160f26','#b24bff'],midnight:['#070e17','#0e1928','#152237','#5dabed'],forest:['#09150f','#12251b','#193322','#62c593']};
  const colors=themes[NV.data.appearance.theme]||themes.violet;['--void','--panel','--panel-2','--violet-2'].forEach((key,i)=>document.documentElement.style.setProperty(key,colors[i]));
  const background=NV.data.appearance.background;const chat=document.querySelector('.nv-chat-main');if(chat)chat.style.backgroundImage=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(background)?`linear-gradient(rgba(10,7,19,.78),rgba(10,7,19,.86)),url("${background}")`:'';
}
function nvRenderTools() {
  const root=document.getElementById('config-body');const data=NV.data;
  const cards=[['images',nvText('Service d’images','Image service'),nvText('Configurez la génération d’illustrations dans vos conversations.','Configure illustration generation for your conversations.')],['replies',nvText('Réponses rapides','Quick replies'),nvText('Insérez vos répliques et instructions favorites.','Insert favorite lines and instructions.')],['rules',nvText('Règles de texte','Text rules'),nvText('Nettoyez ou remplacez du texte à l’entrée et à la sortie.','Clean or replace incoming and outgoing text.')],['documents',nvText('Documents','Documents'),nvText('Ajoutez des textes et retrouvez les extraits pertinents.','Add texts and retrieve relevant excerpts.')],['appearance',nvText('Ambiance & voix','Appearance & voice'),nvText('Thèmes, fond, lecture vocale et vitesse.','Themes, background, voice and speed.')],['generation',nvText('Génération avancée','Advanced generation'),nvText('Lecture progressive, contrôles et budget des connaissances.','Streaming, controls and lore budget.')],['profiles',nvText('Profils de génération','Generation profiles'),nvText('Enregistrez vos paramètres et formats de prompts.','Save generation settings and prompt formats.')],['backup',nvText('Sauvegardes','Backups'),nvText('Exportez ou restaurez votre bibliothèque et vos histoires.','Export or restore your library and stories.')],['stats',nvText('Statistiques','Statistics'),nvText('Suivez vos conversations et le temps de génération.','Track conversations and generation time.')]];
  root.innerHTML=`<div class="config-page-head"><div><h2>${nvText('Votre atelier','Your studio')}</h2><p>${nvText('Les réglages utiles, réunis au même endroit.','Useful controls, together in one place.')}</p></div></div><div class="nv-card-grid">${cards.map(([key,title,description])=>`<button class="nv-card nv-tool-card" data-tool="${key}"><h3>${title}</h3><p>${description}</p><span>${nvText('Ouvrir →','Open →')}</span></button>`).join('')}</div>`;
  root.querySelectorAll('[data-tool]').forEach(b=>b.onclick=nvGuard(()=>nvTool(b.dataset.tool)));
}
async function nvTool(tool) {
  if(tool==='images')return nvImageSettings();
  if(['replies','rules','documents','profiles'].includes(tool))return nvCollection(tool);
  if(tool==='appearance'){
    const a=NV.data.appearance;const voices=window.speechSynthesis?.getVoices()||[];
    const d=await nvForm(nvText('Ambiance & voix','Appearance & voice'),[nvField('theme',nvText('Thème','Theme'),a.theme,'select',{options:[{value:'violet',label:'NastyVerse'},{value:'midnight',label:nvText('Minuit','Midnight')},{value:'forest',label:nvText('Forêt','Forest')}]}),nvField('autoSpeak',nvText('Lire automatiquement les réponses','Automatically read replies'),a.autoSpeak,'checkbox'),nvField('voice',nvText('Voix du système','System voice'),a.voice,'select',{options:[{value:'',label:nvText('Voix par défaut','Default voice')},...voices.map(v=>({value:v.voiceURI,label:`${v.name} (${v.lang})`}))]}),nvField('rate',nvText('Vitesse de lecture','Speech speed'),a.rate,'number',{min:0.5,max:2,step:0.1}),nvField('image',nvText('Choisir une image de fond après enregistrement','Choose a background image after saving'),false,'checkbox'),nvField('clear',nvText('Retirer le fond','Remove background'),false,'checkbox')],nvText('Les voix et la dictée dépendent des capacités du navigateur ou de Windows.','Voices and dictation depend on browser or Windows capabilities.'));
    if(d){Object.assign(a,{theme:d.theme,autoSpeak:d.autoSpeak,voice:d.voice,rate:d.rate});if(d.clear)a.background='';if(d.image){const[file]=await nvPickFiles('image/png,image/jpeg,image/webp');if(file){if(file.size>5_000_000)throw new Error(nvText('Image : 5 Mo maximum.','Image: maximum 5 MB.'));a.background=await blobToDataUrl(file);}}await nvSave();nvAppearance();}return;
  }
  if(tool==='generation'){
    const p=NV.data.generation,l=NV.data.lore;
    const d=await nvForm(nvText('Génération avancée','Advanced generation'),[nvField('stream',nvText('Afficher la réponse pendant sa génération (lanceur 0.1.11)','Show reply as it is generated (launcher 0.1.11)'),p.stream!==false,'checkbox'),nvField('scanDepth',nvText('Analyser les N derniers messages pour les connaissances','Scan last N messages for lore'),l.scanDepth,'number',{min:1,max:100}),nvField('budget',nvText('Budget des connaissances (tokens estimés)','Lore budget (estimated tokens)'),l.budget,'number',{min:0,max:32000}),nvField('recursive',nvText('Les connaissances peuvent en activer d’autres','Lore entries can activate other entries'),l.recursive,'checkbox'),nvField('topK',nvText('Top K (modèles locaux, vide = défaut)','Top K (local models, blank = default)'),p.topK??''),nvField('minP',nvText('Min P (modèles locaux, 0 à 1)','Min P (local models, 0 to 1)'),p.minP??''),nvField('repetitionPenalty',nvText('Pénalité de répétition (local, 0 à 3)','Repetition penalty (local, 0 to 3)'),p.repetitionPenalty??''),nvField('frequencyPenalty',nvText('Pénalité de fréquence (−2 à 2)','Frequency penalty (−2 to 2)'),p.frequencyPenalty??''),nvField('presencePenalty',nvText('Pénalité de présence (−2 à 2)','Presence penalty (−2 to 2)'),p.presencePenalty??''),nvField('seed',nvText('Graine aléatoire (entier, vide = aléatoire)','Random seed (integer, blank = random)'),p.seed??'')],nvText('Les paramètres optionnels sont envoyés par le lanceur 0.1.11. Leur prise en charge dépend du fournisseur.','Optional samplers are sent by launcher 0.1.11. Support depends on the provider.'));
    if(d){const ranges={topK:[0,1000],minP:[0,1],repetitionPenalty:[0,3],frequencyPenalty:[-2,2],presencePenalty:[-2,2],seed:[-2147483648,2147483647]};const generation={stream:d.stream};for(const[k,[min,max]]of Object.entries(ranges)){if(d[k].trim()==='')continue;const value=Number(d[k]);if(!Number.isFinite(value)||value<min||value>max||(['topK','seed'].includes(k)&&!Number.isInteger(value)))throw new Error(`${k}: ${min} … ${max}`);generation[k]=value;}NV.data.generation=generation;NV.data.lore={scanDepth:d.scanDepth,budget:d.budget,recursive:d.recursive};await nvSave();}return;
  }
  if(tool==='stats'){
    const messages=NV.data.sessions.flatMap(s=>s.messages),replies=messages.filter(m=>m.role==='assistant');nvDialog(nvText('Vos statistiques','Your statistics'),`<div class="nv-stats">${[[NV.data.sessions.length,nvText('conversations','conversations')],[messages.length,nvText('messages','messages')],[messages.filter(m=>m.bookmark).length,nvText('favoris','bookmarks')],[`~${messages.reduce((n,m)=>n+estimateTokens(m.content),0)}`,nvText('tokens conservés (estimation)','stored tokens (estimate)')],[`${Math.round(replies.reduce((n,m)=>n+m.duration,0)/1000)} s`,nvText('temps de génération cumulé','cumulative generation time')]].map(([v,l])=>`<div><strong>${v}</strong><span>${l}</span></div>`).join('')}</div><p class="nv-muted">${nvText('Les bifurcations sont comptées séparément. Aucun coût réel n’est déduit de ces estimations.','Branches are counted separately. These estimates do not represent actual costs.')}</p>`);return;
  }
  if(tool==='backup')return nvBackupDialog();
}
async function nvCollection(kind) {
  const labels={replies:nvText('Réponses rapides','Quick replies'),rules:nvText('Règles de texte','Text rules'),documents:nvText('Documents','Documents'),profiles:nvText('Profils de génération','Generation profiles')};
  const dialog=nvDialog(labels[kind],`<div class="nv-actions">${nvButton('add',kind==='profiles'?nvText('Sauver le profil actuel','Save current profile'):nvText('Ajouter','Add'),true)}${kind==='documents'?nvButton('import',nvText('Importer TXT / MD','Import TXT / MD')):''}</div><div class="nv-entry-list">${NV.data[kind].map(item=>`<div class="nv-entry-row"><button class="nv-entry" data-id="${nvEscape(item.id)}"><strong>${nvEscape(item.name)}</strong><small>${nvEscape(item.content?.slice(0,110)||item.find||'')}</small></button>${kind==='profiles'?`<button class="btn btn-primary btn-small" data-apply="${nvEscape(item.id)}">${nvText('Activer','Apply')}</button>`:''}</div>`).join('')||`<p class="nv-muted">${nvText('Aucun élément. Ajoutez le premier.','No items yet. Add the first one.')}</p>`}</div>`);
  nvBind(dialog,{add:async()=>{dialog.close();await nvCollectionEditor(kind);},import:async()=>{for(const file of await nvPickFiles('.txt,.md,.csv',true)){NV.data.documents.push({id:uid(),name:file.name,content:await nvReadFile(file,2_000_000),enabled:true});}await nvSave();dialog.close();nvCollection(kind);}});
  dialog.querySelectorAll('[data-id]').forEach(b=>b.onclick=nvGuard(async()=>{dialog.close();await nvCollectionEditor(kind,NV.data[kind].find(i=>i.id===b.dataset.id));}));
  dialog.querySelectorAll('[data-apply]').forEach(b=>b.onclick=nvGuard(async()=>{const p=NV.data.profiles.find(p=>p.id===b.dataset.apply);for(const[k,v]of Object.entries(p.settings)){if(Object.values(STORAGE).includes(k))localStorage.setItem(k,v);}NV.data.generation={...p.generation};await nvSave();toast(nvText('Profil activé.','Profile applied.'),'success');dialog.close();}));
}
async function nvCollectionEditor(kind,existing) {
  const fields=[nvField('name',nvText('Nom','Name'),existing?.name||'','text',{required:true})];
  if(kind==='replies'||kind==='documents')fields.push(nvField('content',nvText('Texte','Text'),existing?.content||'','textarea',{rows:10,required:true}));
  if(kind==='rules')fields.push(nvField('find',nvText('Chercher','Find'),existing?.find||'','text',{required:true}),nvField('replace',nvText('Remplacer par','Replace with'),existing?.replace||''),nvField('regex',nvText('Expression régulière (avancé)','Regular expression (advanced)'),existing?.regex||false,'checkbox'),nvField('flags',nvText('Options regex','Regex flags'),existing?.flags||'g'),nvField('target',nvText('Appliquer sur','Apply to'),existing?.target||'output','select',{options:[{value:'input',label:nvText('Mes messages','My messages')},{value:'output',label:nvText('Réponses du modèle','Model replies')}]}));
  if(kind!=='profiles')fields.push(nvField('enabled',nvText('Activé','Enabled'),existing?.enabled!==false,'checkbox'));
  if(existing)fields.push(nvField('remove',nvText('Supprimer','Delete'),false,'checkbox'));
  const draft=await nvForm(nvText('Éditer','Edit'),fields,kind==='documents'?nvText('Associez ce document dans Contexte. Recherche locale par mots-clés, sans service externe.','Link this document from Context. Local keyword retrieval, with no external service.'):kind==='replies'?nvText('Macros disponibles : {{user}}, {{char}}, {{date}}, {{time}}. Le texte est inséré pour relecture avant envoi.','Macros: {{user}}, {{char}}, {{date}}, {{time}}. Text is inserted for review before sending.'):'');
  if(draft){if(draft.remove)NV.data[kind]=NV.data[kind].filter(i=>i.id!==existing.id);else{if(kind==='rules'&&draft.regex){if(!/^[gimsuy]*$/.test(draft.flags))throw new Error('Invalid regex flags');new RegExp(draft.find,draft.flags);}const record={id:existing?.id||uid(),...draft};if(kind==='profiles'){record.settings=Object.fromEntries([STORAGE.params,STORAGE.contextTemplate,STORAGE.contextPresets,STORAGE.instructionPresets,STORAGE.instructionTemplate,STORAGE.contextFormatting,STORAGE.globalSystemPrompt,STORAGE.globalPostHistory].map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null));record.generation=NVCore.clone(NV.data.generation);}if(existing)Object.assign(existing,record);else NV.data[kind].push(record);}await nvSave();}nvCollection(kind);
}
async function nvBackupData() {
  await loadAvatarAssets();
  return {format:'nastyverse-backup',version:1,createdAt:new Date().toISOString(),workspace:NVCore.clone(NV.data),settings:Object.fromEntries(Object.values(STORAGE).map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null)),avatars:Object.fromEntries(avatarAssetCache)};
}
async function nvBackupDialog() {
  const dialog=nvDialog(nvText('Sauvegardes portables','Portable backups'),`<p>${nvText('Personnages, avatars, conversations, personas, connaissances et réglages. Les clés API ne sont pas incluses.','Characters, avatars, conversations, personas, lore and settings. API keys are not included.')}</p><div class="nv-menu">${nvButton('export',nvText('Télécharger une sauvegarde complète','Download full backup'),true)}${nvButton('restore',nvText('Restaurer une sauvegarde','Restore backup'))}</div>`);
  nvBind(dialog,{export:async()=>downloadJsonFile(`NastyVerse-${new Date().toISOString().slice(0,10)}.json`,await nvBackupData()),restore:async()=>{
    if(state.sending)throw new Error(nvText('Arrêtez la génération avant une restauration.','Stop generation before restoring.'));
    const[file]=await nvPickFiles('.json');if(!file)return;const data=JSON.parse(await nvReadFile(file,100_000_000));
    if(data.format!=='nastyverse-backup'||data.version!==1||!data.settings||typeof data.settings!=='object')throw new Error(nvText('Sauvegarde NastyVerse non reconnue.','Unrecognized NastyVerse backup.'));
    const workspace=NVCore.normalizeWorkspace(data.workspace);const allowed=new Set(Object.values(STORAGE));const settings=Object.entries(data.settings).filter(([key,value])=>allowed.has(key)&&typeof value==='string');
    for(const[key,value]of settings){if([STORAGE.characters,STORAGE.conversations,STORAGE.params,STORAGE.contextPresets,STORAGE.instructionPresets,STORAGE.ui].includes(key))JSON.parse(value);}
    const characters=JSON.parse(data.settings[STORAGE.characters]||'[]');if(!Array.isArray(characters)||!characters.every(c=>c&&typeof c.name==='string'&&typeof c.id==='string'))throw new Error('Invalid character backup');
    for(const value of Object.values(data.avatars||{})){if(typeof value!=='string'||!/^data:image\/(png|jpeg|webp|gif|apng);base64,/.test(value))throw new Error('Invalid avatar backup');}
    if(!confirm(nvText(`Restaurer ${characters.length} personnages et ${workspace.sessions.length} conversations ? Les données actuelles seront remplacées après le téléchargement d’une sauvegarde de secours.`,`Restore ${characters.length} characters and ${workspace.sessions.length} conversations? Current data will be replaced after downloading a recovery backup.`)))return;
    const old=await nvBackupData();downloadJsonFile(`NastyVerse-avant-restauration-${Date.now()}.json`,old);
    try{for(const[id,avatar]of Object.entries(data.avatars||{}))await putAvatarAsset(id,avatar);for(const key of allowed)localStorage.removeItem(key);for(const[key,value]of settings)localStorage.setItem(key,value);NV.data=workspace;await nvSave();location.reload();}
    catch(error){NV.data=NVCore.normalizeWorkspace(old.workspace);for(const key of allowed)localStorage.removeItem(key);for(const[key,value]of Object.entries(old.settings))localStorage.setItem(key,value);for(const[id,avatar]of Object.entries(old.avatars))await putAvatarAsset(id,avatar);await nvSave();throw error;}
  }});
}
