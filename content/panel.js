// Floating panel injected into the portal: load PDF/Excel/CSV, review column mapping, fill / copy rows.
import { extractFile, rankTables, withHeaderRow } from '../lib/extract.js';
import { autoMap, buildRows, rowOk, signature, candidateColumns, FIELDS } from '../lib/mapping.js';
import { toPortal } from '../lib/dates.js';
import { onSalaryPage, savedChallanNos, fillRow, norm } from './portal.js';

const MAX_FILE = 15 * 1024 * 1024;
const K = { session: 'tdsFiller', maps: 'tdsFillerMaps', authority: 'tdsFillerAuthority', aliases: 'tdsFillerAliases', ptype: 'tdsFillerPtype', hidden: 'tdsFillerHidden' };
const state = {
  fileName: '', tables: [], tIdx: 0,
  headerRows: {}, maps: {}, // per-table user overrides
  authority: undefined, hint: undefined, edits: {}, filled: new Set(), editAll: new Set(),
  mapOpen: true, touched: {}, savedMaps: {}, aliases: {}, ptype: undefined, lastPtype: '', lastAuthority: '', keywordMsg: {}, rowNote: {}, notice: null, scrollTo: null, hidden: false, open: true, busy: false,
};

const loaders = {
  async pdfPages(buf) {
    const pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, enableXfa: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
    return pages;
  },
  xlsx: () => import('../vendor/xlsx.mjs'),
};

/* ---------- shell ---------- */
const host = document.createElement('div');
host.style.cssText = 'all:initial;position:fixed;top:70px;right:12px;z-index:2147483647';
const TEST = !!globalThis.__TDS_TEST_OPEN; // only settable by code in this same JS world (i.e. our own test page)
const root = host.attachShadow({ mode: TEST ? 'open' : 'closed' }); // closed: scripts on the portal page cannot read the panel
root.innerHTML = `
<style>
  :host{font:13px/1.35 system-ui,sans-serif;color:#1f2937}
  .box{width:500px;max-height:85vh;overflow:auto;background:#fff;border:1px solid #9ca3af;border-radius:8px;box-shadow:0 6px 24px #0004}
  header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#0f5c8a;color:#fff;cursor:move;position:sticky;top:0;z-index:1}
  header b{flex:1}
  button{font:inherit;cursor:pointer;border:1px solid #9ca3af;background:#f3f4f6;border-radius:4px;padding:4px 8px;min-height:28px}
  button:hover{background:#e5e7eb}
  button.go{background:#0f5c8a;color:#fff;border-color:#0f5c8a}
  button.go:disabled{background:#9ca3af;border-color:#9ca3af;cursor:not-allowed}
  header button{background:#ffffff26;color:#fff;border-color:#ffffff66;min-height:24px}
  .body{padding:10px}
  .warn{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:6px 8px;border-radius:4px;margin:6px 0}
  .info{background:#eff6ff;border:1px solid #93c5fd;padding:6px 8px;border-radius:4px;margin:6px 0}
  details.map{border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;margin:8px 0}
  details.map summary{cursor:pointer;font-weight:600}
  .m{display:grid;grid-template-columns:14px 150px 1fr;gap:6px;align-items:center;margin:5px 0}
  .dot{width:10px;height:10px;border-radius:50%;background:#d1d5db}
  .dot.high,.dot.saved{background:#16a34a}.dot.medium{background:#f59e0b}.dot.guess{background:#f97316}.dot.none{background:#dc2626}
  select,input[type=text],input[type=number]{font:inherit;padding:3px 4px;border:1px solid #9ca3af;border-radius:4px;min-height:26px;max-width:100%;box-sizing:border-box}
  select{width:100%}
  .sub{grid-column:3;font-size:12px;color:#6b7280}
  .need{color:#b91c1c;font-size:12px}
  .row{border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;margin:6px 0}
  .row.done{opacity:.55;background:#f3f4f6}
  .row.bad{border-color:#f87171;background:#fef2f2}
  .top{display:flex;align-items:center;gap:8px}
  .top .no{flex:1;font-weight:600;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
  .meta{display:flex;justify-content:space-between;margin:4px 0;color:#374151}
  .copies{display:flex;gap:4px;flex-wrap:wrap}
  .copies button{font-size:12px;padding:3px 7px}
  .edit{display:grid;grid-template-columns:110px 1fr;gap:4px 8px;margin:6px 0;align-items:center}
  .edit input{width:100%}
  .edit .bad{border-color:#dc2626}
  .badge{font-size:11px;padding:1px 6px;border-radius:9px;background:#d1fae5;color:#065f46;white-space:nowrap}
  .badge.f{background:#fef3c7;color:#92400e}
  input[type=file]{width:100%}
  header .chip{font-size:12px;padding:1px 8px;border-radius:10px;background:#ffffff33;white-space:nowrap}
  .box.st-error header{background:#b91c1c}.box.st-warn header{background:#b45309}.box.st-ok header{background:#15803d}
  .box{border-width:2px}.box.st-error{border-color:#b91c1c}.box.st-warn{border-color:#d97706}.box.st-ok{border-color:#16a34a}
  .status{position:sticky;bottom:0;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;font-weight:600;border-top:2px solid;cursor:default}
  .status.error{background:#fee2e2;color:#991b1b;border-color:#b91c1c}
  .status.warn{background:#fef3c7;color:#92400e;border-color:#d97706}
  .status.success,.status.ok{background:#dcfce7;color:#166534;border-color:#16a34a}
  .status.info{background:#eff6ff;color:#1e40af;border-color:#93c5fd}
  .status .txt{flex:1}
  .status .txt div+div{margin-top:3px}
  .status.go{cursor:pointer}
  .status button{min-height:22px;padding:0 6px;background:transparent;border-color:currentColor;color:inherit}
  .status.pulse{animation:pop .45s ease-out}
  .status.error.pulse{animation:shake .5s}
  @keyframes pop{0%{transform:translateY(10px);opacity:.3}60%{transform:translateY(-3px)}100%{transform:none;opacity:1}}
  @keyframes shake{0%,100%{transform:none}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
  .row.ok{border-color:#16a34a;background:#f0fdf4}
  .note{margin:4px 0;padding:4px 8px;border-radius:4px;font-weight:600}
  .note.error{background:#fee2e2;color:#991b1b}.note.ok{background:#dcfce7;color:#166534}
  .hint{color:#4b5563;margin:4px 0 8px}
  .tbad{color:#b91c1c}.tamber{color:#b45309}
  .fld{border:1px solid #d1d5db;border-left-width:5px;border-radius:6px;padding:6px 8px;margin:6px 0;background:#fff}
  .fld.found{border-left-color:#16a34a}
  .fld.const{border-left-color:#2563eb;background:#f8fbff}
  .fld.check{border-left-color:#f59e0b;background:#fffbeb}
  .fld.missing{border-color:#dc2626;border-left-color:#dc2626;background:#fef2f2;animation:attn 1s ease-in-out 2}
  @keyframes attn{50%{box-shadow:0 0 0 3px #dc262666}}
  .fh{display:flex;align-items:center;gap:8px}
  .fh .eg{margin-left:auto;color:#6b7280;font-family:ui-monospace,monospace;font-size:12px}
  .ic{display:inline-flex;width:20px;height:20px;border-radius:50%;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex:none}
  .ic.found{background:#16a34a}.ic.const{background:#2563eb}.ic.check{background:#f59e0b}.ic.missing{background:#dc2626}
  .fs{margin:3px 0 5px 28px}
  .fs.found{color:#166534}.fs.const{color:#1e40af}.fs.check{color:#92400e;font-weight:600}.fs.missing{color:#991b1b;font-weight:700}
  .fc{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:28px}
  .fc select:first-child{flex:1;min-width:150px}
  .fc .or{color:#6b7280;font-size:12px}
  .fc input[type=text]{flex:1;min-width:130px}
  .sug{margin:6px 0 2px 28px}
  .sug>span{font-weight:600;color:#991b1b}
  .sug button{margin:2px 2px 2px 0;background:#fff;border-color:#dc2626;color:#991b1b}
  .kwrow{margin-top:6px}
  .kwrow small{display:block;color:#6b7280}
  .ac{position:relative;display:inline-block;width:190px;height:26px;vertical-align:middle}
  .ac input{position:absolute;inset:0;width:100%;height:100%;background:transparent;z-index:1;box-sizing:border-box}
  .ac .ghost{position:absolute;inset:0;display:flex;align-items:center;padding:0 5px;border:1px solid transparent;box-sizing:border-box;color:#9ca3af;white-space:pre;overflow:hidden;pointer-events:none;font:inherit}
  .need{color:#b91c1c;font-size:12px;margin-top:4px}
</style>
<div class="box"><header><b>TDS Filler <small style="font-weight:400;opacity:.8">v${chrome.runtime.getManifest?.().version ?? '?'}</small></b><span class="chip" hidden></span><button data-a="toggle" title="Collapse / expand">–</button><button data-a="hide" title="Hide (click the toolbar icon to bring it back)">×</button></header><div class="body"></div><div class="status" hidden></div></div>`;
const body = root.querySelector('.body');
const box = root.querySelector('.box');
const statusEl = root.querySelector('.status');
const chip = root.querySelector('.chip');

root.querySelector('header').addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) return;
  const r = host.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  const move = (m) => { host.style.left = m.clientX - dx + 'px'; host.style.top = m.clientY - dy + 'px'; host.style.right = 'auto'; };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
  addEventListener('mousemove', move); addEventListener('mouseup', up);
});

/* ---------- derived view of the current table ---------- */
const fmt = (n) => (n == null ? '?' : Number(n).toLocaleString('en-IN'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (s, n = 34) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function current() {
  const base = state.tables[state.tIdx];
  if (!base) return null;
  const hr = state.headerRows[state.tIdx];
  const table = hr === undefined ? base : withHeaderRow(base, hr);
  const sig = signature(table.headers);
  const auto = autoMap(table, state.savedMaps['sig:' + sig], state.aliases); // prefixed: a header called "__proto__" must not touch the object's prototype
  const map = state.maps[state.tIdx] ?? auto.map;
  // Once the user edits the mapping, only the fields they actually touched count as "their choice";
  // columns the extension merely guessed keep asking to be checked.
  const touched = state.touched[state.tIdx] ?? [];
  const confidence = state.maps[state.tIdx]
    ? Object.fromEntries(FIELDS.map((f) => [f.key, map[f.key] == null ? 'none'
      : touched.includes(f.key) || map[f.key] !== auto.map[f.key] ? 'saved' : auto.confidence[f.key]]))
    : auto.confidence;
  // values that apply to every row, and where they came from (shown to the user)
  const [authority, authoritySrc] = state.authority !== undefined ? [state.authority, 'user']
    : table.meta?.authority ? [table.meta.authority, 'document']
    : state.lastAuthority ? [state.lastAuthority, 'remembered'] : ['', ''];
  const [paymentType, ptypeSrc] = state.ptype ? [state.ptype, 'user'] : state.lastPtype ? [state.lastPtype, 'remembered'] : ['Challan', 'default'];
  const built = buildRows(table, map, { authority, paymentType, dateHint: state.hint, edits: state.edits[state.tIdx] });
  return { table, sig, map, confidence, authority, authoritySrc, paymentType, ptypeSrc, built };
}

const sess = chrome.storage.session; // memory-only; content-script access is enabled by background.js
function persist() {
  const { fileName, tables, tIdx, headerRows, maps, authority, hint, edits } = state;
  sess?.set({ [K.session]: { fileName, tables, tIdx, headerRows, maps, authority, hint, edits } }).catch(() => {});
}

/* ---------- status: transient notices + always-on summary ---------- */
let noticeTimer;
function notify(type, text) {
  state.notice = { type, text };
  clearTimeout(noticeTimer);
  if (type === 'success' || type === 'info') noticeTimer = setTimeout(clearNotice, type === 'success' ? 6000 : 4000);
  renderStatus(true);
}
function clearNotice() { clearTimeout(noticeTimer); state.notice = null; renderStatus(); }

/** What the user most needs to know right now, derived from state (never stale). */
function summary(cur) {
  if (!onSalaryPage()) return { type: 'info', text: 'Open Claim Source Tax → Salary (Others) to fill rows.', chip: 'i' };
  if (state.busy) return { type: 'info', text: 'Reading file…', chip: '…' };
  if (!state.fileName) return { type: 'info', text: 'Choose a PDF, Excel or CSV file to begin.', chip: '' };
  if (!cur) return { type: 'error', text: 'No table with challan-like rows was found in this file. Try another file or sheet.', chip: '✕' };
  const b = cur.built, saved = savedChallanNos();
  const stat = FIELDS.map((f) => fieldStatus(cur, f));
  const missing = stat.filter((x) => x.kind === 'missing'), check = stat.filter((x) => x.kind === 'check');
  const bad = b.rows.filter((r) => !rowOk(r)).length;
  const left = b.rows.filter((r) => !saved.has(norm(r.challanNo))).length;
  const issues = [];
  if (missing.length) issues.push(`${missing.length} portal column${missing.length > 1 ? 's' : ''} missing`);
  if (check.length) issues.push(`${check.length} column${check.length > 1 ? 's' : ''} to double-check`);
  if (b.ambiguous) issues.push('date format needs your answer');
  if (bad) issues.push(`${bad} row${bad > 1 ? 's' : ''} need fixing`);
  if (b.warnings.length) issues.push(b.warnings[0]);
  if (issues.length) return { type: 'warn', text: issues.join(' · '), chip: '⚠ ' + (missing.length + check.length + (b.ambiguous ? 1 : 0) + bad + b.warnings.length), go: true };
  return left ? { type: 'ok', text: `Ready — ${left} row${left > 1 ? 's' : ''} left to enter.`, chip: '✓' } : { type: 'ok', text: 'All rows are already on the portal.', chip: '✓' };
}

function renderStatus(pulse) {
  const cur = current();
  const sm = summary(cur);
  const n = state.notice;
  // A transient notice never hides a standing problem: show both, and colour by the worst.
  const lines = [];
  if (n) lines.push({ ...n, notice: true });
  if (!n || sm.type === 'warn' || sm.type === 'error') lines.push({ ...sm, summary: true });
  const rank = { error: 4, warn: 3, success: 2, ok: 2, info: 1 };
  const kind = lines.reduce((w, l) => (rank[l.type] > rank[w] ? l.type : w), 'info');
  const icon = (t) => ({ error: '✕', warn: '⚠', success: '✓', ok: '✓', info: 'ℹ' }[t]);
  const go = !!(sm.go && !n?.type?.match(/error/));
  statusEl.hidden = false;
  statusEl.className = `status ${kind}${go ? ' go' : ''}`;
  statusEl.dataset.a = go ? 'gotoissue' : '';
  statusEl.innerHTML = `<div class="txt">${lines.map((l) => `<div>${icon(l.type)} ${esc(l.text)}${l.summary && sm.go ? ' <u>Show me</u>' : ''}</div>`).join('')}</div>${n ? '<button data-a="dismiss" title="Dismiss">×</button>' : ''}`;
  const level = kind === 'success' ? 'ok' : kind;
  box.className = 'box' + (level === 'info' ? '' : ` st-${level}`);
  const c = kind === 'error' ? '✕' : kind === 'warn' ? sm.chip || '⚠' : n ? icon(n.type) : sm.chip;
  chip.hidden = !c; chip.textContent = c || '';
  if (pulse) { statusEl.classList.remove('pulse'); void statusEl.offsetWidth; statusEl.classList.add('pulse'); }
}

/* ---------- render ---------- */
const SRC = {
  authority: { document: 'taken from the document heading', remembered: 'remembered from last time', user: 'set by you' },
  ptype: { default: 'the default', remembered: 'remembered from last time', user: 'set by you' },
};
const typeLabel = (t) => (t === 'Reference' ? 'Certificate' : t);

/** Plain-language status of one portal column: where its value comes from, or that it's missing. */
function fieldStatus(cur, f) {
  const c = cur.map[f.key], conf = cur.confidence[f.key], H = cur.table.headers;
  const key = f.key;
  if (c != null) {
    const n = `“${H[c]}”`;
    if (conf === 'high') return { kind: 'found', icon: '✓', text: `Found in column ${n}.` };
    if (conf === 'saved') return { kind: 'found', icon: '✓', text: `Column ${n} (your choice).` };
    return { kind: 'check', icon: '⚠', text: `${conf === 'guess' ? 'Guessed' : 'Probably'} column ${n}. Please check it.` };
  }
  if (key === 'authority' && cur.authority) return { kind: 'const', icon: 'ℹ', text: `No column. Using “${cur.authority}” for every row (${SRC.authority[cur.authoritySrc]}). Change it if it's wrong.` };
  if (key === 'paymentType') return { kind: 'const', icon: 'ℹ', text: `No column. Using ${typeLabel(cur.paymentType)} for every row (${SRC.ptype[cur.ptypeSrc]}). Change it if this file has certificates.` };
  return { kind: 'missing', icon: '✕', text: 'Not found in this file. Pick a column or type a value.' };
}

function mappingUI(cur) {
  const { table, map } = cur;
  const used = new Set(Object.values(map).filter((v) => v != null));
  const sample = (c) => table.rows.find((r) => r[c])?.[c] ?? '';
  const opts = (sel) => `<option value="">— none —</option>` + table.headers.map((h, c) =>
    `<option value="${c}" ${sel === c ? 'selected' : ''}>${esc(short(h, 30))}${sample(c) ? ' · ' + esc(short(sample(c), 22)) : ''}</option>`).join('');
  const st = FIELDS.map((f) => [f, fieldStatus(cur, f)]);
  const nMissing = st.filter(([, s]) => s.kind === 'missing').length, nCheck = st.filter(([, s]) => s.kind === 'check').length;
  const head = nMissing ? ` — <span class="tbad">${nMissing} missing</span>` : nCheck ? ` — <span class="tamber">${nCheck} to check</span>` : ' ✓';
  let h = `<details class="map" ${state.mapOpen ? 'open' : ''}><summary>Check the column mapping${head}</summary>
    <div class="hint">Each portal column is listed with where its value comes from. Confirm every line before you fill.</div>`;
  if (state.tables.length > 1) {
    h += `<div class="m"><span></span><span>Table / sheet</span><select data-a="table">${state.tables.map((t, i) => `<option value="${i}" ${i === state.tIdx ? 'selected' : ''}>${esc(short(t.name, 60))}</option>`).join('')}</select></div>`;
  }
  if (table.grid) {
    h += `<div class="m"><span></span><span>Header row #</span><span><input type="number" min="0" max="${table.grid.length}" style="width:70px" data-a="hdr" value="${table.headerRow + 1}"> <span class="sub">0 = no header row</span></span></div>`;
  }
  for (const [f, s] of st) {
    const c = map[f.key];
    h += `<div class="fld ${s.kind}"><div class="fh"><span class="ic ${s.kind}">${s.icon}</span><b>${esc(f.label)}</b>${c != null && sample(c) ? `<span class="eg">e.g. ${esc(short(sample(c), 26))}</span>` : ''}</div>
      <div class="fs ${s.kind}">${esc(s.text)}</div>
      <div class="fc"><select data-a="map" data-f="${f.key}" title="Column in your file">${opts(c)}</select>`;
    if (f.key === 'authority') {
      h += `<span class="or">or one value for every row:</span><input type="text" data-a="auth" value="${esc(cur.authority)}" placeholder="e.g. employer name">`;
    } else if (f.key === 'paymentType') {
      h += `<span class="or">or one value for every row:</span><select data-a="ptype" style="width:auto"><option value="Challan" ${cur.paymentType === 'Challan' ? 'selected' : ''}>Challan</option><option value="Reference" ${cur.paymentType === 'Reference' ? 'selected' : ''}>Certificate</option></select>`;
    }
    h += `</div>`;
    if (s.kind === 'missing') {
      const cands = candidateColumns(table, f.key, used).slice(0, 6);
      h += `<div class="sug"><span>Suggestions (click one):</span> ${cands.map((k) => `<button data-a="pick" data-f="${f.key}" data-c="${k}" title="${esc(short(sample(k), 40))}">${esc(short(table.headers[k], 28))}</button>`).join(' ') || '<i>no unused columns left</i>'}
        <div class="kwrow">or type a word from its column name: <span class="ac"><span class="ghost" aria-hidden="true"></span><input type="text" data-a="kw" data-f="${f.key}" autocomplete="off" spellcheck="false"></span> <button data-a="kwgo" data-f="${f.key}">Find</button>
        <small>→ adds a letter, Tab accepts the suggestion</small></div>
        ${state.keywordMsg[f.key] ? `<div class="need">${esc(state.keywordMsg[f.key])}</div>` : ''}</div>`;
    }
    h += `</div>`;
  }
  return h + `</details>`;
}

/* ghost-text suggestions for the "type a word" box */
function suggestion(field, typed) {
  const cur = current();
  if (!cur) return '';
  const used = new Set(Object.values(cur.map).filter((v) => v != null));
  const heads = candidateColumns(cur.table, field, used).map((c) => cur.table.headers[c]);
  const t = typed.toLowerCase();
  if (!t) return heads[0] ?? '';
  for (const hd of heads) {
    const l = hd.toLowerCase();
    for (let i = 0; i + t.length <= l.length; i++) if ((i === 0 || /[\s/\-_.(]/.test(l[i - 1])) && l.startsWith(t, i)) return hd.slice(i);
  }
  return '';
}
function paintGhost(input) {
  const sug = suggestion(input.dataset.f, input.value);
  input.dataset.sug = sug;
  const ghost = input.parentElement.querySelector('.ghost');
  ghost.innerHTML = `<span style="visibility:hidden">${esc(input.value)}</span>${esc(sug.slice(input.value.length))}`;
}
root.addEventListener('input', (e) => { if (e.target.dataset?.a === 'kw') paintGhost(e.target); });
root.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t?.dataset?.a !== 'kw' || (!e.isTrusted && !TEST)) return;
  const sug = t.dataset.sug ?? '', rest = sug.slice(t.value.length);
  const atEnd = t.selectionStart === t.value.length && t.selectionEnd === t.value.length;
  if (e.key === 'Tab' && !e.shiftKey && rest && atEnd) { e.preventDefault(); t.value = sug; paintGhost(t); }
  else if (e.key === 'ArrowRight' && rest && atEnd) { e.preventDefault(); t.value += rest[0]; paintGhost(t); }
  else if (e.key === 'Enter') { e.preventDefault(); root.querySelector(`button[data-a="kwgo"][data-f="${t.dataset.f}"]`)?.click(); }
});
// remember whether the user collapsed the mapping section
root.addEventListener('toggle', (e) => { if (e.target.matches?.('details.map')) state.mapOpen = e.target.open; }, true);

function editFields(r, all) {
  const cols = [['paymentType', 'Payment type', r.paymentType === 'Reference' ? 'Certificate' : r.paymentType ?? ''], ['challanNo', 'Challan no.', r.challanNo], ['date', 'Date', r.date ? toPortal(r.date) : r.dateRaw], ['challanAmount', 'Challan amount', r.challanAmount ?? ''], ['tdsClaim', 'Claimed', r.tdsClaim ?? ''], ['authority', 'Authority', r.authority]];
  const shown = cols.filter(([k]) => all || r.errors[k]);
  if (!shown.length) return '';
  return `<div class="edit">${shown.map(([k, l, v]) => `<label>${l}${r.errors[k] ? ` <small style="color:#b91c1c">(${esc(r.errors[k])})</small>` : ''}</label><input type="text" class="${r.errors[k] ? 'bad' : ''}" data-a="edit" data-src="${r.src}" data-f="${k}" value="${esc(v)}" ${k === 'date' ? 'placeholder="DD-MM-YYYY or YYYY-MM-DD"' : ''}>`).join('')}</div>`;
}

function render() {
  box.querySelector('header button').textContent = state.open ? '–' : '+';
  if (!state.open) { body.style.display = 'none'; renderStatus(); return; }
  body.style.display = '';
  const cur = current();
  const saved = savedChallanNos();
  let h = `<input type="file" accept=".pdf,.xlsx,.xls,.xlsm,.csv,.tsv,application/pdf" data-a="file">`;
  if (state.fileName) h += `<div style="margin-top:4px;color:#6b7280;display:flex;gap:8px;align-items:center"><span style="flex:1">${esc(state.fileName)}</span><button data-a="clear" title="Remove the loaded file\u2019s data from this browser">Clear data</button></div>`;
  if (cur) {
    const b = cur.built;
    h += mappingUI(cur);
    for (const w of b.warnings) h += `<div class="warn">${esc(w)}</div>`;
    if (b.ambiguous) h += `<div class="info">Some dates could be read two ways (like 05/03/2026). How are dates written in this file?<div style="margin-top:6px"><button data-a="hint" data-h="DMY">Day / Month</button> <button data-a="hint" data-h="MDY">Month / Day</button></div></div>`;
    const pending = b.rows.filter((r) => !saved.has(norm(r.challanNo))).length;
    const bad = b.rows.filter((r) => !rowOk(r)).length;
    h += `<div style="margin:6px 0"><b>${b.rows.length}</b> rows · ${pending} left to enter${bad ? ` · <span style="color:#b91c1c">${bad} need fixing</span>` : ''} · claimed total ${fmt(b.sum)}</div>`;
    for (const r of b.rows) {
      const done = saved.has(norm(r.challanNo));
      const ok = rowOk(r);
      const note = state.rowNote[r.src];
      h += `<div class="row ${done ? 'done' : ''} ${ok ? (state.filled.has(r.src) ? 'ok' : '') : 'bad'}" data-row="${r.src}">
        <div class="top"><span class="no">${esc(r.challanNo || '(no challan no.)')}</span>
          ${done ? '<span class="badge">on portal</span>' : state.filled.has(r.src) ? '<span class="badge f">filled – press save</span>' : ''}
          <button data-a="editall" data-src="${r.src}">${state.editAll.has(r.src) ? 'Done' : 'Edit'}</button>
          <button class="go" data-a="fill" data-src="${r.src}" ${done || !ok ? 'disabled' : ''}>Fill</button></div>
        <div class="meta"><span>${r.paymentType === 'Reference' ? 'Certificate' : esc(r.paymentType || '—')} · ${r.date ? toPortal(r.date) : esc(r.dateRaw || '—')} · ${esc(r.authority || '—')}</span><span>${fmt(r.challanAmount)} → <b>${fmt(r.tdsClaim)}</b></span></div>
        ${note ? `<div class="note ${note.type}">${esc(note.text)}</div>` : ''}
        ${editFields(r, state.editAll.has(r.src))}
        <div class="copies">
          <button data-a="copy" data-src="${r.src}" data-f="challanNo">Challan no</button>
          <button data-a="copy" data-src="${r.src}" data-f="date">Date</button>
          <button data-a="copy" data-src="${r.src}" data-f="challanAmount">Amount</button>
          <button data-a="copy" data-src="${r.src}" data-f="tdsClaim">Claimed</button>
          <button data-a="copy" data-src="${r.src}" data-f="authority">Authority</button>
          <button data-a="copy" data-src="${r.src}" data-f="row">Row</button></div></div>`;
    }
  }
  body.innerHTML = h;
  renderStatus();
  body.querySelectorAll('input[data-a="kw"]').forEach(paintGhost);
  if (state.scrollTo != null) {
    (state.scrollTo === 'map' ? body.querySelector('.fld.missing, .fld.check') : body.querySelector(`[data-row="${state.scrollTo}"]`))?.scrollIntoView({ block: 'nearest' });
    state.scrollTo = null;
  }
}

/* ---------- actions ---------- */
const rowBySrc = (src) => current()?.built.rows.find((r) => r.src === +src);
const copyValue = (r, f) => {
  const d = r.date ? toPortal(r.date) : r.dateRaw;
  if (f === 'date') return d;
  if (f === 'row') return [r.authority, 'Challan', r.challanNo, d, r.challanAmount ?? '', r.tdsClaim ?? ''].join('\t');
  return String(r[f] ?? '');
};

function setMapField(field, value) {
  const cur = current();
  const map = { ...cur.map, [field]: value === '' ? null : +value };
  state.maps[state.tIdx] = map;
  (state.touched[state.tIdx] ??= []).includes(field) || state.touched[state.tIdx].push(field);
  state.savedMaps['sig:' + cur.sig] = { cols: cur.table.headers.length, map, picked: [...state.touched[state.tIdx]] };
  chrome.storage.local.set({ [K.maps]: state.savedMaps }).catch(() => {});
  state.mapOpen = true;
}

root.addEventListener('click', async (e) => {
  if (!e.isTrusted && !TEST) return; // ignore clicks synthesised by scripts on the page
  if (e.target.closest('.status') && !e.target.closest('button') && statusEl.dataset.a === 'gotoissue') {
    (body.querySelector('.fld.missing, .fld.check, .row.bad') ?? body.querySelector('details.map'))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!state.open) { state.open = true; render(); }
    return;
  }
  const b = e.target.closest('button');
  if (!b) return;
  const a = b.dataset.a;
  try { await onClick(b, a); } catch (err) { notify('error', 'Something went wrong: ' + err.message); }
});

async function onClick(b, a) {
  if (a === 'dismiss') { clearNotice(); return; }
  if (a === 'hide') { setHidden(true); return; }
  if (a === 'clear') {
    Object.assign(state, { fileName: '', tables: [], tIdx: 0, headerRows: {}, maps: {}, authority: undefined, hint: undefined, edits: {}, rowNote: {}, keywordMsg: {}, filled: new Set(), editAll: new Set() });
    sess?.remove(K.session).catch(() => {});
    notify('success', 'Cleared. The loaded file\u2019s data has been removed from this browser.');
    render();
    return;
  }
  if (a === 'toggle') { state.open = !state.open; }
  else if (a === 'hint') { state.hint = b.dataset.h; persist(); }
  else if (a === 'kwgo') {
    const f = b.dataset.f, kw = root.querySelector(`input[data-a="kw"][data-f="${f}"]`).value.trim().toLowerCase();
    const cur = current();
    const c = kw ? cur.table.headers.findIndex((x) => x.toLowerCase().includes(kw)) : -1;
    const fl = FIELDS.find((x) => x.key === f).label;
    if (c < 0) {
      state.keywordMsg[f] = kw ? `No column name contains \u201c${kw}\u201d. Try another word, or pick a column from the list.` : 'Type a word that appears in the column name.';
      notify('warn', `${fl}: ${state.keywordMsg[f]}`);
    } else {
      delete state.keywordMsg[f];
      notify('success', `${fl} \u2192 column \u201c${cur.table.headers[c]}\u201d (remembered for next time).`);
      (state.aliases[f] ??= []).includes(kw) || state.aliases[f].push(kw); // remembered for future files
      chrome.storage.local.set({ [K.aliases]: state.aliases }).catch(() => {});
      setMapField(f, String(c));
      persist();
    }
  }
  else if (a === 'pick') {
    const f = b.dataset.f, c = +b.dataset.c, cur = current(), hdr = cur.table.headers[c];
    if (!/^column [a-z]+$/i.test(hdr)) { // remember the header word for future files (not generic "Column A")
      (state.aliases[f] ??= []).includes(hdr.toLowerCase()) || state.aliases[f].push(hdr.toLowerCase());
      chrome.storage.local.set({ [K.aliases]: state.aliases }).catch(() => {});
    }
    setMapField(f, String(c));
    persist();
    notify('success', `${FIELDS.find((x) => x.key === f).label} \u2192 column \u201c${hdr}\u201d.`);
  }
  else if (a === 'editall') { const s = +b.dataset.src; state.editAll.has(s) ? state.editAll.delete(s) : state.editAll.add(s); }
  else if (a === 'fill') {
    const r = rowBySrc(b.dataset.src);
    const res = fillRow(r);
    state.scrollTo = r.src;
    if (res.ok) {
      state.filled.add(r.src);
      state.rowNote[r.src] = { type: 'ok', text: 'Filled on the portal. Check the values, then press its green save button.' };
      notify('success', `Filled ${r.challanNo}. Check it, then press the portal\u2019s green save button.`);
      if (r.authority) chrome.storage.local.set({ [K.authority]: r.authority }).catch(() => {});
    } else {
      state.filled.delete(r.src);
      state.rowNote[r.src] = { type: 'error', text: res.error };
      notify('error', res.error);
    }
  } else if (a === 'copy') {
    try {
      await navigator.clipboard.writeText(copyValue(rowBySrc(b.dataset.src), b.dataset.f));
      const t = b.textContent; b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = t), 900);
      return;
    } catch { notify('error', 'The browser blocked clipboard access. Click on the page first and try again.'); }
  }
  render();
}

root.addEventListener('change', async (e) => {
  if (!e.isTrusted && !TEST) return;
  const t = e.target, a = t.dataset.a;
  if (a === 'file') {
    const file = t.files[0];
    if (!file) return;
    if (file.size > MAX_FILE) { t.value = ''; notify('error', `That file is ${(file.size / 1048576).toFixed(1)} MB. Files over ${MAX_FILE / 1048576} MB are refused to keep the portal page responsive.`); return; }
    clearNotice(); state.busy = true; render();
    let res;
    try { res = await extractFile(file, loaders); } catch (err) { res = { tables: [], error: 'Could not read the file: ' + err.message }; }
    const { tables, error } = res;
    Object.assign(state, { busy: false, fileName: file.name, tables: rankTables(tables), tIdx: 0, headerRows: {}, maps: {}, keywordMsg: {}, rowNote: {}, touched: {}, mapOpen: true, scrollTo: 'map', ptype: undefined, authority: undefined, hint: undefined, edits: {}, editAll: new Set(), filled: new Set() });
    persist();
    if (error) notify('error', error);
    else if (!tables.length) notify('error', 'No table was found in this file. Try another file, or export the certificate to CSV.');
    else { const n = current().built.rows.length; notify('success', `Loaded ${file.name}: ${n} row${n === 1 ? '' : 's'} found.`); }
  } else if (a === 'table') { state.tIdx = +t.value; state.hint = undefined; persist(); }
  else if (a === 'hdr') { state.headerRows[state.tIdx] = Math.max(0, Math.floor(+t.value || 0)) - 1; delete state.maps[state.tIdx]; delete state.touched[state.tIdx]; state.mapOpen = true; persist(); }
  else if (a === 'map') { setMapField(t.dataset.f, t.value); persist(); }
  else if (a === 'auth') {
    state.authority = t.value.trim();
    if (state.authority) { state.lastAuthority = state.authority; chrome.storage.local.set({ [K.authority]: state.authority }).catch(() => {}); } // default for the next file
    persist();
  }
  else if (a === 'ptype') { state.ptype = t.value || undefined; if (t.value) chrome.storage.local.set({ [K.ptype]: t.value }).catch(() => {}); persist(); }
  else if (a === 'edit') {
    const ed = ((state.edits[state.tIdx] ??= {})[t.dataset.src] ??= {});
    ed[t.dataset.f] = t.value;
    delete state.rowNote[t.dataset.src];
    persist();
  } else return;
  render();
});

/* ---------- boot ---------- */
document.documentElement.appendChild(host);
chrome.storage.local.remove(K.session).catch(() => {}); // older versions kept the document on disk; remove it
Promise.all([
  chrome.storage.local.get([K.maps, K.authority, K.aliases, K.ptype, K.hidden]),
  (sess?.get(K.session) ?? Promise.resolve({})).catch(() => ({})),
]).then(([o, so]) => {
  state.hidden = !!o[K.hidden];
  host.style.display = state.hidden ? 'none' : '';
  state.savedMaps = o[K.maps] ?? {};
  state.aliases = o[K.aliases] ?? {};
  state.lastPtype = o[K.ptype] ?? '';
  state.lastAuthority = o[K.authority] ?? '';
  const s = so[K.session];
  if (s?.tables?.length) Object.assign(state, s);
  render();
});
let timer;
new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (state.open && !root.activeElement) render(); }, 400); })
  .observe(document.body, { childList: true, subtree: true });
addEventListener('hashchange', render);

/* ---------- toolbar button: show / hide ---------- */
function setHidden(hide) {
  state.hidden = hide;
  host.style.display = hide ? 'none' : '';
  chrome.storage.local.set({ [K.hidden]: hide }).catch(() => {});
  if (!hide) { // bring it back on screen if it was dragged out of view
    const r = host.getBoundingClientRect();
    if (r.right < 60 || r.left > innerWidth - 60 || r.top < 0 || r.top > innerHeight - 40) { host.style.left = 'auto'; host.style.right = '12px'; host.style.top = '70px'; }
    render();
  }
}
chrome.runtime.onMessage.addListener((m, sender) => {
  if (sender?.id !== chrome.runtime.id) return; // only our own background script
  if (m?.type === 'tds-toggle') setHidden(m.show === undefined ? !state.hidden : !m.show);
});
