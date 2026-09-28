/* Optional conversation media. Images share the backed-up IndexedDB asset store. */
function nvImageSource(image) { return avatarAssetCache.get(image.assetId) || ''; }
function nvMediaMarkup(images = [], draft = false) {
  return images.length ? `<div class="nv-media-strip">${images.map((a,i) => `<figure><button type="button" class="nv-image-preview" data-image-index="${i}" ${draft ? 'data-draft-image' : ''}><img src="${nvEscape(nvImageSource(a))}" alt="${nvEscape(a.name)}" loading="lazy"></button><figcaption>${nvEscape(a.name)} · ${a.sendToModel ? nvText('Vision activée','Vision on') : nvText('Illustration','Illustration')}${draft ? `<button type="button" data-remove-image="${i}" aria-label="${nvText('Retirer l’image','Remove image')}">×</button>` : ''}</figcaption></figure>`).join('')}</div>` : '';
}
const CHAT_TRANSLATION_PROVIDERS = [
  { value: 'google', label: 'Google' },
  { value: 'libre', label: 'LibreTranslate' },
  { value: 'lingva', label: 'Lingva' },
  { value: 'deepl', label: 'DeepL API' },
  { value: 'deeplx', label: 'DeepLX' },
  { value: 'bing', label: 'Bing' },
  { value: 'oneringtranslator', label: 'OneRingTranslator' },
  { value: 'yandex', label: 'Yandex' },
];
const CHAT_TRANSLATION_LANGUAGES = [
  { label: 'Afrikaans', value: 'af' },
  { label: 'Albanian', value: 'sq' },
  { label: 'Amharic', value: 'am' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Armenian', value: 'hy' },
  { label: 'Azerbaijani', value: 'az' },
  { label: 'Basque', value: 'eu' },
  { label: 'Belarusian', value: 'be' },
  { label: 'Bengali', value: 'bn' },
  { label: 'Bosnian', value: 'bs' },
  { label: 'Bulgarian', value: 'bg' },
  { label: 'Catalan', value: 'ca' },
  { label: 'Cebuano', value: 'ceb' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW' },
  { label: 'Corsican', value: 'co' },
  { label: 'Croatian', value: 'hr' },
  { label: 'Czech', value: 'cs' },
  { label: 'Danish', value: 'da' },
  { label: 'Dutch', value: 'nl' },
  { label: 'English', value: 'en' },
  { label: 'Esperanto', value: 'eo' },
  { label: 'Estonian', value: 'et' },
  { label: 'Finnish', value: 'fi' },
  { label: 'French', value: 'fr' },
  { label: 'Frisian', value: 'fy' },
  { label: 'Galician', value: 'gl' },
  { label: 'Georgian', value: 'ka' },
  { label: 'German', value: 'de' },
  { label: 'Greek', value: 'el' },
  { label: 'Gujarati', value: 'gu' },
  { label: 'Haitian Creole', value: 'ht' },
  { label: 'Hausa', value: 'ha' },
  { label: 'Hawaiian', value: 'haw' },
  { label: 'Hebrew', value: 'iw' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Hmong', value: 'hmn' },
  { label: 'Hungarian', value: 'hu' },
  { label: 'Icelandic', value: 'is' },
  { label: 'Igbo', value: 'ig' },
  { label: 'Indonesian', value: 'id' },
  { label: 'Irish', value: 'ga' },
  { label: 'Italian', value: 'it' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Javanese', value: 'jw' },
  { label: 'Kannada', value: 'kn' },
  { label: 'Kazakh', value: 'kk' },
  { label: 'Khmer', value: 'km' },
  { label: 'Korean', value: 'ko' },
  { label: 'Kurdish', value: 'ku' },
  { label: 'Kyrgyz', value: 'ky' },
  { label: 'Lao', value: 'lo' },
  { label: 'Latin', value: 'la' },
  { label: 'Latvian', value: 'lv' },
  { label: 'Lithuanian', value: 'lt' },
  { label: 'Luxembourgish', value: 'lb' },
  { label: 'Macedonian', value: 'mk' },
  { label: 'Malagasy', value: 'mg' },
  { label: 'Malay', value: 'ms' },
  { label: 'Malayalam', value: 'ml' },
  { label: 'Maltese', value: 'mt' },
  { label: 'Maori', value: 'mi' },
  { label: 'Marathi', value: 'mr' },
  { label: 'Mongolian', value: 'mn' },
  { label: 'Myanmar (Burmese)', value: 'my' },
  { label: 'Nepali', value: 'ne' },
  { label: 'Norwegian', value: 'no' },
  { label: 'Nyanja (Chichewa)', value: 'ny' },
  { label: 'Pashto', value: 'ps' },
  { label: 'Persian', value: 'fa' },
  { label: 'Polish', value: 'pl' },
  { label: 'Portuguese (Portugal)', value: 'pt-PT' },
  { label: 'Portuguese (Brazil)', value: 'pt-BR' },
  { label: 'Punjabi', value: 'pa' },
  { label: 'Romanian', value: 'ro' },
  { label: 'Russian', value: 'ru' },
  { label: 'Samoan', value: 'sm' },
  { label: 'Scots Gaelic', value: 'gd' },
  { label: 'Serbian', value: 'sr' },
  { label: 'Sesotho', value: 'st' },
  { label: 'Shona', value: 'sn' },
  { label: 'Sindhi', value: 'sd' },
  { label: 'Sinhala (Sinhalese)', value: 'si' },
  { label: 'Slovak', value: 'sk' },
  { label: 'Slovenian', value: 'sl' },
  { label: 'Somali', value: 'so' },
  { label: 'Spanish', value: 'es' },
  { label: 'Sundanese', value: 'su' },
  { label: 'Swahili', value: 'sw' },
  { label: 'Swedish', value: 'sv' },
  { label: 'Tagalog (Filipino)', value: 'tl' },
  { label: 'Tajik', value: 'tg' },
  { label: 'Tamil', value: 'ta' },
  { label: 'Telugu', value: 'te' },
  { label: 'Thai', value: 'th' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Ukrainian', value: 'uk' },
  { label: 'Urdu', value: 'ur' },
  { label: 'Uzbek', value: 'uz' },
  { label: 'Vietnamese', value: 'vi' },
  { label: 'Welsh', value: 'cy' },
  { label: 'Xhosa', value: 'xh' },
  { label: 'Yiddish', value: 'yi' },
  { label: 'Yoruba', value: 'yo' },
  { label: 'Zulu', value: 'zu' }
];
const CHAT_TRANSLATION_DEFAULTS = { enabled: false, provider: 'google', targetLanguage: 'en', mode: 'both', apiKey: '', url: '', deeplEndpoint: 'free' };

function nvChatTranslationConfig() {
  return { ...CHAT_TRANSLATION_DEFAULTS, ...(state.translationConfig || {}) };
}
function nvChatTranslationApplies(role, config = nvChatTranslationConfig()) {
  if (!config.enabled) return false;
  if (role === 'user') return config.mode === 'inputs' || config.mode === 'both';
  if (role === 'assistant') return config.mode === 'responses' || config.mode === 'both';
  return false;
}
function nvMessageDisplayContent(message) {
  const config = nvChatTranslationConfig();
  if (!nvChatTranslationApplies(message?.role, config)) return String(message?.content || '');
  if (String(config.targetLanguage).toLowerCase() === 'en') return String(message?.content || '');
  if (message?.displayText && message.displaySource === message.content && message.displayLanguage === config.targetLanguage) return message.displayText;
  return nvText('Traduction…','Translating…');
}
function nvSetMessageDisplay(message, displayText, language) {
  message.displayText = String(displayText || '');
  message.displaySource = String(message.content || '');
  message.displayLanguage = String(language || '');
}
function nvClearMessageDisplay(message) {
  message.displayText = '';
  message.displaySource = '';
  message.displayLanguage = '';
}
async function nvTranslateChatText(text, targetLanguage, sourceLanguage = null) {
  const source = String(text || '');
  if (!source || String(targetLanguage || '').toLowerCase() === String(sourceLanguage || '').toLowerCase()) return source;
  // Match SillyTavern's Translate extension behavior: markdown image links are
  // kept byte-for-byte and only surrounding text is sent to the provider.
  const regex = /!\[.*?\]\([^)]*\)/g;
  const matches = [...source.matchAll(regex)];
  const chunks = source.split(regex);
  let result = '';
  for (let index = 0; index < chunks.length; index += 1) {
    if (chunks[index]) result += await invoke('translate_text', { text: chunks[index], targetLanguage, sourceLanguage });
    if (index < matches.length) result += matches[index][0];
  }
  return result;
}
async function nvPrepareOutgoingTranslation(text) {
  const config = nvChatTranslationConfig();
  if (!nvChatTranslationApplies('user', config) || String(config.targetLanguage).toLowerCase() === 'en') {
    return { content: text, displayText: '', displayLanguage: '' };
  }
  const english = await nvTranslateChatText(text, 'en', config.targetLanguage);
  return { content: english, displayText: text, displayLanguage: config.targetLanguage };
}
async function nvPrepareAssistantTranslation(text) {
  const config = nvChatTranslationConfig();
  if (!nvChatTranslationApplies('assistant', config) || String(config.targetLanguage).toLowerCase() === 'en') return null;
  return { content: await nvTranslateChatText(text, config.targetLanguage, 'en'), language: config.targetLanguage };
}
async function nvApplyAssistantDisplay(message) {
  try {
    const display = await nvPrepareAssistantTranslation(message.content);
    if (display) nvSetMessageDisplay(message, display.content, display.language);
    else nvClearMessageDisplay(message);
    return display?.content || message.content;
  } catch (error) {
    console.warn('[translate] Assistant display translation failed.', error);
    if (nvChatTranslationApplies('assistant')) {
      const placeholder = nvText('[Traduction indisponible]','[Translation unavailable]');
      nvSetMessageDisplay(message, placeholder, nvChatTranslationConfig().targetLanguage);
      return placeholder;
    }
    nvClearMessageDisplay(message);
    return message.content;
  }
}
async function nvTranslateEditedMessage(message, visibleText) {
  const config = nvChatTranslationConfig();
  if (!nvChatTranslationApplies(message.role, config) || String(config.targetLanguage).toLowerCase() === 'en') {
    message.content = visibleText;
    nvClearMessageDisplay(message);
    return;
  }
  message.content = await nvTranslateChatText(visibleText, 'en', config.targetLanguage);
  nvSetMessageDisplay(message, visibleText, config.targetLanguage);
}
async function nvClearAllChatTranslations() {
  for (const session of NV.data.sessions) for (const message of session.messages) nvClearMessageDisplay(message);
  await nvSave();
  if (state.currentPage === 'chat') renderChat();
}
const nvTranslationRefresh = new Set();
async function nvEnsureChatDisplayTranslations(chat) {
  const config = nvChatTranslationConfig();
  if (!chat || !config.enabled || String(config.targetLanguage).toLowerCase() === 'en' || nvTranslationRefresh.has(chat.id)) return;
  const pending = chat.messages.filter(message => nvChatTranslationApplies(message.role, config) && message.content && (!message.displayText || message.displaySource !== message.content || message.displayLanguage !== config.targetLanguage));
  if (!pending.length) return;
  nvTranslationRefresh.add(chat.id);
  try {
    let changed = false;
    for (const message of pending) {
      try {
        const display = await nvTranslateChatText(message.content, config.targetLanguage, null);
        if (!NV.data.sessions.includes(chat) || !chat.messages.includes(message)) continue;
        nvSetMessageDisplay(message, display, config.targetLanguage);
        changed = true;
      } catch (error) {
        console.warn('[translate] Unable to translate existing message.', error);
      }
    }
    if (changed) {
      await nvSave();
      if (state.currentPage === 'chat' && nvSession()?.id === chat.id) renderChat();
    }
  } finally {
    nvTranslationRefresh.delete(chat.id);
  }
}
async function openChatTranslationSettings() {
  let current;
  try { current = state.translationConfig || await invoke('load_translation_config'); }
  catch (error) { throw new Error(friendlyNativeError(error)); }
  current = { ...CHAT_TRANSLATION_DEFAULTS, ...(current || {}) };
  const dialog = nvDialog(nvText('Traduire le chat','Translate chat'), `
    <form class="nv-form" id="chat-translation-form">
      <label class="nv-check"><input id="translation-enabled" type="checkbox" ${current.enabled ? 'checked' : ''}>${nvText('Activer la traduction automatique du chat','Enable automatic chat translation')}</label>
      <label><span>${nvText('Traduire','Translate')}</span><select id="translation-mode">
        <option value="responses" ${current.mode === 'responses' ? 'selected' : ''}>${nvText('Messages de l’IA','AI messages')}</option>
        <option value="inputs" ${current.mode === 'inputs' ? 'selected' : ''}>${nvText('Mes messages','My messages')}</option>
        <option value="both" ${current.mode === 'both' ? 'selected' : ''}>${nvText('Les deux','Both')}</option>
      </select></label>
      <label><span>${nvText('Service de traduction','Translation provider')}</span><select id="translation-provider">${CHAT_TRANSLATION_PROVIDERS.map(provider => `<option value="${nvEscape(provider.value)}" ${provider.value === current.provider ? 'selected' : ''}>${nvEscape(provider.label)}</option>`).join('')}</select></label>
      <label><span>${nvText('Langue affichée dans le chat','Language displayed in chat')}</span><select id="translation-language">${CHAT_TRANSLATION_LANGUAGES.map(language => `<option value="${nvEscape(language.value)}" ${language.value === current.targetLanguage ? 'selected' : ''}>${nvEscape(language.label)}</option>`).join('')}</select></label>
      <label id="translation-api-key-row"><span>${nvText('Clé API','API key')}</span><input id="translation-api-key" type="password" value="${nvEscape(current.apiKey || '')}" autocomplete="off"></label>
      <label id="translation-url-row"><span>${nvText('Adresse du service','Service URL')}</span><input id="translation-url" type="url" value="${nvEscape(current.url || '')}" placeholder="https://…"></label>
      <label id="translation-deepl-row"><span>${nvText('Endpoint DeepL','DeepL endpoint')}</span><select id="translation-deepl-endpoint"><option value="free" ${current.deeplEndpoint !== 'pro' ? 'selected' : ''}>Free</option><option value="pro" ${current.deeplEndpoint === 'pro' ? 'selected' : ''}>Pro</option></select></label>
      <p class="nv-muted">${nvText('Le texte anglais reste la source enregistrée et utilisée dans le prompt. La traduction sert uniquement à l’affichage. Les textes à traduire sont envoyés au service choisi.','English remains the stored source used in the prompt. Translation is display-only. Text selected for translation is sent to the chosen provider.')}</p>
      <footer class="nv-translation-footer"><button type="button" class="btn btn-ghost" id="translation-clear">${nvText('Effacer les traductions enregistrées','Clear saved translations')}</button><span class="nv-spacer"></span><button type="button" class="btn btn-ghost" data-cancel>${nvText('Annuler','Cancel')}</button><button type="submit" class="btn btn-primary">${nvText('Enregistrer','Save')}</button></footer>
    </form>`);
  const form = dialog.querySelector('#chat-translation-form');
  const provider = dialog.querySelector('#translation-provider');
  const keyRow = dialog.querySelector('#translation-api-key-row');
  const urlRow = dialog.querySelector('#translation-url-row');
  const deeplRow = dialog.querySelector('#translation-deepl-row');
  const urlInput = dialog.querySelector('#translation-url');
  const refreshProviderFields = () => {
    const value = provider.value;
    keyRow.hidden = !['deepl','libre'].includes(value);
    urlRow.hidden = !['libre','lingva','deeplx','oneringtranslator'].includes(value);
    deeplRow.hidden = value !== 'deepl';
    if (!urlInput.value) {
      if (value === 'lingva') urlInput.placeholder = 'https://lingva.ml/api/v1';
      else if (value === 'deeplx') urlInput.placeholder = 'http://127.0.0.1:1188/translate';
      else if (value === 'oneringtranslator') urlInput.placeholder = 'http://127.0.0.1:4990/translate';
      else if (value === 'libre') urlInput.placeholder = 'http://127.0.0.1:5000/translate';
      else urlInput.placeholder = 'https://…';
    }
  };
  refreshProviderFields(); provider.addEventListener('change', refreshProviderFields);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.querySelector('#translation-clear').onclick = async () => {
    if (!confirm(nvText('Effacer toutes les traductions d’affichage déjà enregistrées ? Les textes anglais du contexte seront conservés.','Clear all saved display translations? English context sources will be kept.'))) return;
    await nvClearAllChatTranslations();
    toast(nvText('Traductions d’affichage effacées.','Display translations cleared.'),'success');
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const config = {
      enabled: dialog.querySelector('#translation-enabled').checked,
      provider: provider.value,
      targetLanguage: dialog.querySelector('#translation-language').value,
      mode: dialog.querySelector('#translation-mode').value,
      apiKey: dialog.querySelector('#translation-api-key').value.trim() || null,
      url: urlInput.value.trim() || null,
      deeplEndpoint: dialog.querySelector('#translation-deepl-endpoint').value,
    };
    try {
      const saved = await invoke('save_translation_config', { config });
      state.translationConfig = saved;
      dialog.close();
      if (state.currentPage === 'configuration') renderConfiguration('general');
      else if (state.currentPage === 'chat') renderChat();
      toast(config.enabled ? nvText('Traduction du chat activée.','Chat translation enabled.') : nvText('Traduction du chat désactivée.','Chat translation disabled.'),'success');
    } catch (error) {
      toast(friendlyNativeError(error),'error');
    }
  };
  return dialog;
}
function nvMediaBind(chat) {
  nvBind(pageRoot,{attach:()=>nvAttach(chat),illustrate:()=>{pageRoot.querySelector('.nv-composer-menu')?.removeAttribute('open');return nvIllustrate(chat);}});
  pageRoot.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{chat.draftImages.splice(Number(b.dataset.removeImage),1);nvChanged(chat);});
  pageRoot.querySelectorAll('[data-image-index]').forEach(b=>b.onclick=()=>{
    const message=chat.messages.find(m=>m.id===b.closest('[data-message]')?.dataset.message);
    const image=(b.hasAttribute('data-draft-image')?chat.draftImages:message?.attachments)?.[Number(b.dataset.imageIndex)];
    if(image)nvViewImage(image,chat,message);
  });
}
async function nvStoreImage(dataUrl,name,sendToModel=false) {
  if(!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)||dataUrl.length>28_000_000)throw new Error(nvText('Image non reconnue ou trop volumineuse.','Unrecognized or oversized image.'));
  const assetId=`nv-media:${uid()}`;await putAvatarAsset(assetId,dataUrl);
  return {id:uid(),assetId,name,sendToModel};
}
async function nvAttach(chat) {
  if(state.sending)return;
  const files=await nvPickFiles('image/png,image/jpeg,image/webp',true);if(!files.length)return;
  if((chat.draftImages?.length||0)+files.length>4)throw new Error(nvText('Quatre images maximum par message.','Maximum four images per message.'));
  const attachments=[];
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10_000_000)throw new Error(nvText('Choisissez une image PNG, JPEG ou WebP de moins de 10 Mo.','Choose a PNG, JPEG or WebP image under 10 MB.'));
    const bitmap=await createImageBitmap(file);const scale=Math.min(1,1536/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    attachments.push(await nvStoreImage(canvas.toDataURL('image/jpeg',0.88),file.name,true));
  }
  chat.draftImages=[...(chat.draftImages||[]),...attachments];nvChanged(chat);
}
function nvViewImage(image,chat,message) {
  const dialog=nvDialog(image.name,`<img class="nv-image-full" src="${nvEscape(nvImageSource(image))}" alt="${nvEscape(image.name)}"><p class="nv-muted">${nvText('Vision : cette image est jointe aux prochaines requêtes si elle entre dans le budget du contexte. Un modèle compatible est nécessaire. En mode texte, désactivez Vision et décrivez l’image dans le message.','Vision: this image accompanies subsequent requests while within the context budget. A compatible model is required. In text mode, turn Vision off and describe the image in the message.')}</p><div class="nv-actions">${nvButton('vision',image.sendToModel?nvText('Désactiver Vision','Turn Vision off'):nvText('Activer Vision','Turn Vision on'))}${nvButton('download',nvText('Télécharger','Download'))}</div>`,true);
  nvBind(dialog,{vision:()=>{if(state.sending)throw new Error(nvText('Attendez la fin de la réponse.','Wait for the reply to finish.'));image.sendToModel=!image.sendToModel;NV.prompt=null;nvChanged(chat);dialog.close();},download:()=>{const a=document.createElement('a');a.href=nvImageSource(image);a.download=image.name.replace(/[^\p{L}\p{N}_.-]/gu,'_')+'.'+(a.href.startsWith('data:image/png')?'png':a.href.startsWith('data:image/webp')?'webp':'jpg');a.click();}});
}
function nvMultimodalContent(message) {
  const images=(message.attachments||[]).filter(a=>a.sendToModel);
  if(!images.length)return message.content;
  return [{type:'text',text:message.content||nvText('Décris cette image.','Describe this image.')},...images.map(a=>{
    const url=nvImageSource(a);if(!url)throw new Error(nvText('Une image manque. Restaurez la sauvegarde complète ou désactivez sa vision.','An image is missing. Restore the full backup or turn off its vision.'));
    return {type:'image_url',image_url:{url}};
  })];
}
function nvReadableContent(content) { return Array.isArray(content)?content.map(p=>p.type==='image_url'?nvText('[Image jointe : données masquées]','[Attached image: data hidden]'):p.text||'').join('\n'):String(content||''); }
async function nvImageSettings() {
  if(!TAURI?.core)throw new Error(nvText('La configuration des images nécessite l’application Windows.','Image configuration requires the Windows app.'));
  const current=await invoke('load_image_config')||{provider:'openai',url:'https://api.openai.com/v1',model:'',apiKey:'',legacyBase64:false};
  const draft=await nvForm(nvText('Service d’images','Image service'),[nvField('provider',nvText('Service','Service'),current.provider,'select',{options:[{value:'openai',label:'OpenAI / API compatible'},{value:'automatic1111',label:'Stable Diffusion · AUTOMATIC1111'}]}),nvField('url',nvText('Adresse du service','Service address'),current.url,'url',{required:true}),nvField('model',nvText('Identifiant du modèle (API compatible)','Model identifier (compatible API)'),current.model),nvField('apiKey',nvText('Clé API (si nécessaire)','API key (if needed)'),current.apiKey||'','password'),nvField('legacyBase64',nvText('Demander b64_json (anciens modèles, pas GPT Image)','Request b64_json (older models, not GPT Image)'),current.legacyBase64,'checkbox')],nvText('Pour Stable Diffusion : démarrez AUTOMATIC1111 avec --api, puis indiquez par exemple http://127.0.0.1:7860. La clé reste dans la configuration locale et est exclue des sauvegardes exportées.','For Stable Diffusion: start AUTOMATIC1111 with --api, then enter e.g. http://127.0.0.1:7860. The key stays in local configuration and is excluded from exported backups.'));
  if(draft){await invoke('save_image_config',{config:draft});toast(nvText('Service d’images enregistré.','Image service saved.'),'success');}
}
async function nvIllustrate(chat) {
  if(!TAURI?.core)throw new Error(nvText('La génération d’images nécessite l’application Windows.','Image generation requires the Windows app.'));
  if(!await invoke('load_image_config')){await nvImageSettings();if(!await invoke('load_image_config'))return;}
  let requestId='',cancelled=false,busy=false,result=null;
  const dialog=nvDialog(nvText('Illustrer la conversation','Illustrate the conversation'),`<form class="nv-form"><label>${nvText('Décrivez l’image','Describe the image')}<textarea name="prompt" rows="5" required placeholder="${nvText('Un observatoire au clair de lune…','An observatory in the moonlight…')}"></textarea></label><label>${nvText('Format','Size')}<select name="size"><option value="1024x1024">1024 × 1024</option><option value="1024x1536">1024 × 1536</option><option value="1536x1024">1536 × 1024</option><option value="512x512">512 × 512 (Stable Diffusion)</option></select></label><p class="nv-muted">${nvText('Le clic sur Générer envoie cette description au service configuré. Une API payante peut facturer la génération.','Clicking Generate sends this description to the configured service. A paid API may charge for generation.')}</p><button class="btn btn-primary" type="submit">${nvText('Générer une image','Generate an image')}</button><p class="nv-media-status" role="status"></p></form><div class="nv-image-result"></div>`,true);
  dialog.addEventListener('close',()=>{cancelled=true;if(busy)invoke('cancel_completion',{requestId}).catch(()=>{});});
  dialog.querySelector('form').onsubmit=nvGuard(async event=>{
    if(busy)return;const form=event.target,prompt=form.elements.prompt.value.trim(),size=form.elements.size.value;
    busy=true;requestId=uid();form.querySelector('button').disabled=true;dialog.querySelector('.nv-media-status').textContent=nvText('Création en cours… Fermez cette fenêtre pour arrêter l’attente.','Creating… Close this window to stop waiting.');
    try{
      result=await invoke('generate_image',{requestId,prompt,size});if(cancelled)return;
      result.prompt=prompt;
      const area=dialog.querySelector('.nv-image-result');area.innerHTML=`<img class="nv-image-full" src="${nvEscape(result.dataUrl)}" alt="${nvEscape(prompt)}">${nvButton('insert',nvText('Ajouter à cette conversation','Add to this conversation'),true)}`;
      nvBind(area,{insert:async()=>{if(!NV.data.sessions.includes(chat))throw new Error(nvText('La conversation a été supprimée.','The conversation was deleted.'));const image=await nvStoreImage(result.dataUrl,nvText('Illustration','Illustration'));nvCheckpoint(chat);chat.messages.push(NVCore.message({role:'system',name:nvText('Illustration','Illustration'),content:result.prompt,attachments:[image],hidden:true}));await nvSave();nvChanged(chat);dialog.close();}});
    }catch(error){if(!cancelled)throw error;}finally{busy=false;form.querySelector('button').disabled=false;dialog.querySelector('.nv-media-status').textContent='';}
  });
}
