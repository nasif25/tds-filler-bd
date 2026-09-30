# Security notes

**Self-contained.** No network requests are made by this extension's code (no fetch/XHR/WebSocket/beacon), no remote code is loaded, and there is no eval. The only external address in the code is the portal host it is allowed to run on.

**Scope.** The panel runs only on https://ledger.etaxnbr.gov.bd/* . Permissions: `storage`, `activeTab` (toolbar click), `scripting` (start the panel on a page opened before install). No host permissions beyond the content-script match.

**Your data.**
- Files are parsed in the browser; nothing is uploaded.
- The loaded file's tables are kept in memory-only session storage (cleared when the browser closes, or with "Clear data").
- Persisted on disk (chrome.storage.local): column mappings (header names -> column index), keywords you taught it, last-used employer name and payment type, and whether the panel is hidden. No amounts, TINs or challan numbers.

**Page isolation.** The panel's shadow DOM is closed (portal scripts cannot read it), clicks/changes not produced by a real user action are ignored, and toolbar messages are accepted only from this extension.

**Rendering.** All file-derived text is HTML-escaped before it is rendered.

**Bundled libraries** (vendor/, verify with `shasum -a 256`):
- pdf.js 4.10.38 (Apache-2.0), loaded with isEval disabled
- SheetJS 0.20.3 (Apache-2.0), includes the fixes for CVE-2023-30533 and CVE-2024-22363; downloaded from cdn.sheetjs.com (the vendor's own distribution, npm's copy is stale)

    27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c  pdf.min.mjs
    1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36  pdf.worker.min.mjs
    1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db  xlsx.mjs
