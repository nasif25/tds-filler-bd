// Toolbar button: bring the on-page panel up / hide it. Works even if the page was opened before the
// extension was installed, and says why on the page itself if it cannot.
const PORTAL = 'https://ledger.etaxnbr.gov.bd/';
const VERSION = chrome.runtime.getManifest().version;

// Loaded documents live in memory-only session storage (gone when the browser closes). Guarded so an
// older Chrome without this API cannot stop the whole background script from starting.
function allowSession() {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
  } catch { /* API not available: the panel then keeps the loaded file in memory only */ }
}
allowSession();
chrome.runtime.onInstalled.addListener(allowSession);
chrome.runtime.onStartup.addListener(allowSession);

// The content script reports why it could not start.
const lastError = new Map();
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m?.type === 'tds-error' && sender.tab) lastError.set(sender.tab.id, m.text);
});

/** A red banner at the top of the page: impossible to miss, click to dismiss. */
function banner(tabId, text) {
  chrome.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (msg) => {
      const d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b91c1c;color:#fff;padding:12px 16px;font:14px/1.4 system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 12px #0006';
      d.title = 'Click to dismiss';
      d.onclick = () => d.remove();
      (document.body ?? document.documentElement).appendChild(d);
      setTimeout(() => d.remove(), 20000);
    },
  }).catch(() => { /* pages Chrome does not allow scripts on (chrome://, web store) */ });
}

async function badge(tabId, title) {
  await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c', tabId });
  await chrome.action.setBadgeText({ text: '!', tabId });
  await chrome.action.setTitle({ title, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    chrome.action.setTitle({ title: 'Show / hide TDS Filler', tabId }).catch(() => {});
  }, 5000);
}

async function fail(tabId, text) {
  const err = lastError.get(tabId);
  const msg = `TDS Filler v${VERSION}: ${text}${err ? ` (${err})` : ''}`;
  banner(tabId, msg);
  await badge(tabId, msg);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith(PORTAL)) {
    await fail(tab.id, 'this only works on ledger.etaxnbr.gov.bd. Open the portal, then Claim Source Tax → Salary (Others), and click the icon again.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'tds-toggle' }); // panel already there: show/hide
    return;
  } catch { /* no panel on this page yet */ }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/loader.js'] });
    for (let i = 0; i < 25; i++) { // wait for the panel to start listening (≈4 s max)
      await new Promise((r) => setTimeout(r, 160));
      try { await chrome.tabs.sendMessage(tab.id, { type: 'tds-toggle', show: true }); return; } catch { /* still loading */ }
    }
    await fail(tab.id, 'the panel could not start on this page. Reload the page (Ctrl/Cmd+R) and click the icon again. If it still fails, update the extension to the latest version.');
  } catch (e) {
    await fail(tab.id, `could not start on this page (${e.message}). Reload the page and click the icon again.`);
  }
});
