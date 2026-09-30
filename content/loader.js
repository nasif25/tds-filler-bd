// Content scripts can't be ES modules; load the real panel as one. Guarded so that a second
// injection (toolbar button on a page opened before install) can't create a second panel.
if (!globalThis.__tdsFillerLoaded) {
  globalThis.__tdsFillerLoaded = true;
  import(chrome.runtime.getURL('content/panel.js'));
}
