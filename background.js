// Toolbar button: show/hide the on-page panel. If the page was opened before the extension was
// installed/reloaded, inject the panel first.
const PORTAL = 'https://ledger.etaxnbr.gov.bd/';

// Loaded documents are kept in memory-only session storage (gone when the browser closes).
const allowSession = () => chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
allowSession();
chrome.runtime.onInstalled.addListener(allowSession);
chrome.runtime.onStartup.addListener(allowSession);

async function flash(tabId, text, title) {
  await chrome.action.setBadgeBackgroundColor({ color: '#b91c1c', tabId });
  await chrome.action.setBadgeText({ text, tabId });
  await chrome.action.setTitle({ title, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    chrome.action.setTitle({ title: 'Show / hide TDS Filler', tabId }).catch(() => {});
  }, 4000);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url?.startsWith(PORTAL)) {
    await flash(tab.id, '!', 'TDS Filler only works on ledger.etaxnbr.gov.bd — open the Salary (Others) page.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'tds-toggle' });
  } catch {
    // no panel on this page yet: inject, wait for it to start listening, then make sure it is shown
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/loader.js'] });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        try { await chrome.tabs.sendMessage(tab.id, { type: 'tds-toggle', show: true }); return; } catch { /* still loading */ }
      }
      await flash(tab.id, '!', 'TDS Filler could not start on this page. Reload the page and try again.');
    } catch {
      await flash(tab.id, '!', 'TDS Filler could not start on this page. Reload the page and try again.');
    }
  }
});
