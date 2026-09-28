/* Regex rules run off the UI thread and are terminated by the caller on timeout. */
self.onmessage = event => {
  try {
    let content = String(event.data.content || '');
    for (const rule of event.data.rules || []) {
      if (!rule.enabled) continue;
      if (rule.regex) content = content.replace(new RegExp(rule.find, rule.flags || 'g'), rule.replace || '');
      else if (rule.find) content = content.split(rule.find).join(rule.replace || '');
      if (content.length > 2000000) throw new Error('Text rule output is too large');
    }
    self.postMessage({ content });
  } catch (error) { self.postMessage({ error: String(error.message || error) }); }
};
