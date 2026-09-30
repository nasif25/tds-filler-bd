// Content scripts can't be ES modules; load the real panel as one. Guarded so a second injection
// (toolbar click on a page opened before install) can't create a second panel, but a failed start can retry.
if (!globalThis.__tdsFillerLoaded) {
  globalThis.__tdsFillerLoaded = true;
  import(chrome.runtime.getURL('content/panel.js')).catch((e) => {
    globalThis.__tdsFillerLoaded = false;
    console.error('[TDS Filler] failed to start:', e);
    // The background script shows this reason in the red banner when the toolbar icon is clicked.
    chrome.runtime.sendMessage({ type: 'tds-error', text: String(e?.message ?? e).slice(0, 200) }).catch(() => {});
  });
}
