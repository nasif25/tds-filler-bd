// Portal-specific DOM access (Angular reactive form; fields keyed by formcontrolname).
import { toPortal } from '../lib/dates.js';

const SALARY_HASH = '#/pages/source-tax/private-salary';
export const onSalaryPage = () => location.hash.startsWith(SALARY_HASH);

/** Challan numbers already saved in the table, normalised to the 15-char form the portal displays. */
export const norm = (no) => String(no).trim().slice(0, 15);

export function savedChallanNos() {
  const out = new Set();
  for (const tr of document.querySelectorAll('table tbody tr')) {
    if (tr.querySelector('[formcontrolname]')) continue; // editable row, not saved
    const m = tr.innerText.match(/\d{4}-\d{6,}/);
    if (m) out.add(norm(m[0]));
  }
  return out;
}

/** The blank row created by the portal's "Add" button, or null. */
export function editableRow() {
  const rows = [...document.querySelectorAll('table tbody tr')].filter((tr) => tr.querySelector('[formcontrolname="paymentNo"]'));
  return rows[rows.length - 1] ?? null;
}

function setValue(el, v) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  for (const t of ['input', 'change', 'blur']) el.dispatchEvent(new Event(t, { bubbles: true }));
}

/** @returns {{ok:boolean, error?:string, failed?:string[]}} */
export function fillRow(row) {
  const tr = editableRow();
  if (!tr) return { ok: false, error: 'Click the portal’s Add button first.' };
  if (!row.date) return { ok: false, error: 'This row has no valid date — fix it in the panel first.' };
  const values = {
    depositingAuthority: row.authority,
    paymentType: row.paymentType,
    paymentNo: row.challanNo,
    paymentDate: toPortal(row.date),
    amount: String(row.challanAmount),
    claimedAmount: String(row.tdsClaim),
  };
  const failed = [];
  for (const [name, v] of Object.entries(values)) {
    const el = tr.querySelector(`[formcontrolname="${name}"]`);
    if (!el) { failed.push(name); continue; }
    setValue(el, v);
    if (el.value !== v) failed.push(name);
  }
  return failed.length ? { ok: false, error: `Could not set: ${failed.join(', ')}`, failed } : { ok: true };
}
