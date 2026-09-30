// Column auto-mapping (header keywords + content sniffing) and row building. Pure, no DOM.
import { parseDate } from './dates.js';

// Labels are the portal's own column names, in portal order.
export const FIELDS = [
  { key: 'authority', label: 'Depositing Authority' },
  { key: 'paymentType', label: 'Payment Document Type' },
  { key: 'challanNo', label: 'Challan/ Certificate Reference No.' },
  { key: 'date', label: 'Challan/ Certificate Date' },
  { key: 'challanAmount', label: 'Challan/ Certificate Amount' },
  { key: 'tdsClaim', label: 'Claimed Amount' },
];

/** Portal dropdown values: 'Challan' | 'Reference' (shown as "Certificate"). */
export function normPaymentType(s) {
  const t = String(s ?? '').trim().toLowerCase();
  if (/^(challan|chalan|chalaan|challans?)\b/.test(t)) return 'Challan';
  if (/^(certificate|cert\b|reference|ref\b)/.test(t)) return 'Reference';
  return null;
}

const HEADER = {
  paymentType: [[/payment\s*(doc|type|mode)|document\s*type|doc\.?\s*type/i, 1], [/\btype\b/i, 0.5]],
  challanNo: [[/challan|chalan|treasury/i, 1], [/reference|ref\b|payment\s*(no|num)|document\s*no|receipt|slip/i, 0.7]],
  date: [[/date/i, 1], [/\bdt\b|\bon\b/i, 0.4]],
  tdsClaim: [[/claim|relating|relates|this\s*cert|attribut/i, 1], [/tds|deduct|withh?eld|tax\s*amount|share/i, 0.6]],
  challanAmount: [[/(total|challan|deposit).*(amount|amt|value)|(amount|amt).*(challan|total|deposit)/i, 1], [/amount|amt|deposited|paid/i, 0.4]],
  authority: [[/authority|employer|deductor|company|organi[sz]ation|payer|deposit(or|ing)/i, 1]],
};

const clean = (s) => String(s ?? '').trim();
export const toNumber = (s) => {
  const t = clean(s).replace(/tk\.?|bdt|৳|taka/gi, '').replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

function headerScore(field, header, aliases) {
  let best = 0;
  for (const [re, w] of HEADER[field]) if (re.test(header)) best = Math.max(best, w);
  // keywords the user taught us for this field
  const h = header.toLowerCase();
  if ((aliases?.[field] ?? []).some((k) => h.includes(k))) best = 1;
  if (field !== 'paymentType' && /\btype\b/i.test(header)) return 0;
  // an amount column that mentions "claim" is the claim, not the challan total
  if (field === 'challanAmount' && HEADER.tdsClaim[0][0].test(header)) return 0;
  if (field === 'challanNo' && /date|amount|amt/i.test(header)) return 0;
  if (field === 'date' && /amount|amt/i.test(header) && !/date/i.test(header)) return 0;
  return best;
}

function contentScore(field, values) {
  const v = values.map(clean).filter(Boolean);
  if (!v.length) return 0;
  const frac = (fn) => v.filter(fn).length / v.length;
  switch (field) {
    case 'challanNo': {
      if (frac((x) => /^\d{4}-\d{6,}$/.test(x)) > 0.8) return 1; // portal's own format
      return frac((x) => /[0-9]/.test(x) && x.replace(/\s/g, '').length >= 8 && toNumber(x) == null) * 0.6;
    }
    case 'date': return frac((x) => !parseDate(x).error) ;
    case 'challanAmount':
    case 'tdsClaim': {
      const nums = v.map(toNumber);
      const numeric = nums.filter((n) => n != null);
      if (numeric.length / v.length < 0.8) return 0;
      // serial-number columns (1,2,3…) are not amounts
      if (numeric.every((n, i) => n === i + 1)) return 0;
      // dates like 20250813 or years should not count; amounts are usually > 100
      return 0.8;
    }
    case 'paymentType': return frac((x) => normPaymentType(x) != null) >= 0.8 ? 0.9 : 0;
    case 'authority': return frac((x) => /[A-Za-z]{3}/.test(x) && toNumber(x) == null && !/^\d{4}-/.test(x)) * 0.5;
  }
  return 0;
}

export const signature = (headers) => headers.map((h) => clean(h).toLowerCase()).join('|');

/**
 * @returns {{map:Object<string,number|null>, confidence:Object<string,'saved'|'high'|'medium'|'guess'|'none'>}}
 */
export function autoMap(table, saved, aliases) {
  const cols = table.headers.length;
  const map = Object.fromEntries(FIELDS.map((f) => [f.key, null]));
  const confidence = Object.fromEntries(FIELDS.map((f) => [f.key, 'none']));

  if (saved && saved.cols === cols) {
    for (const f of FIELDS) if (saved.map[f.key] != null && saved.map[f.key] < cols) { map[f.key] = saved.map[f.key]; confidence[f.key] = 'saved'; }
    return { map, confidence };
  }

  const colValues = Array.from({ length: cols }, (_, c) => table.rows.map((r) => r[c] ?? ''));
  const pairs = [];
  for (const f of FIELDS) {
    for (let c = 0; c < cols; c++) {
      const h = headerScore(f.key, table.headers[c], aliases);
      const k = contentScore(f.key, colValues[c]);
      if (f.key === 'challanNo' && k === 1) { pairs.push({ f: f.key, c, s: 1.2 }); continue; }
      if (h === 0 && k < 0.5) continue;
      let s = h * 0.6 + k * 0.4;
      if (f.key === 'date' && k >= 0.9) s = Math.max(s, 0.5); // a column of dates is a date column, header or not
      pairs.push({ f: f.key, c, s, h, k });
    }
  }
  pairs.sort((a, b) => b.s - a.s);
  const usedCol = new Set();
  for (const p of pairs) {
    if (map[p.f] != null || usedCol.has(p.c) || p.s < 0.45) continue;
    map[p.f] = p.c; usedCol.add(p.c);
    confidence[p.f] = p.s >= 0.8 ? 'high' : 'medium';
  }

  // Both amounts unmapped but exactly two untouched numeric columns → order by magnitude, flag as guess.
  if (map.challanAmount == null && map.tdsClaim == null) {
    const numericCols = colValues.map((v, c) => ({ c, s: contentScore('tdsClaim', v) })).filter((x) => x.s > 0 && !usedCol.has(x.c));
    if (numericCols.length === 2) {
      const total = (c) => colValues[c].reduce((a, x) => a + (toNumber(x) ?? 0), 0);
      const [big, small] = numericCols.map((x) => x.c).sort((a, b) => total(b) - total(a));
      map.challanAmount = big; map.tdsClaim = small;
      confidence.challanAmount = confidence.tdsClaim = 'guess';
    }
  }
  return { map, confidence };
}

/**
 * Build portal rows from a table + mapping.
 * @param {{authority?:string, paymentType?:'Challan'|'Reference', dateHint?:string, edits?:Object}} opts  edits[sourceRowIndex][field] overrides raw text
 */
export function buildRows(table, map, opts = {}) {
  const cell = (r, key, i) => {
    const o = opts.edits?.[i]?.[key];
    if (o !== undefined) return clean(o);
    return map[key] == null ? '' : clean(r[map[key]]);
  };
  const rows = [];
  let ambiguous = false;
  table.rows.forEach((r, i) => {
    const mappedText = FIELDS.map((f) => (f.key === 'authority' || f.key === 'paymentType' ? '' : cell(r, f.key, i)));
    if (!mappedText.some(Boolean)) return; // blank row
    if (/^total\b/i.test(clean(r.find((x) => clean(x)) ?? ''))) return; // totals line
    const errors = {};
    const ptRaw = cell(r, 'paymentType', i);
    const ptCol = map.paymentType != null || opts.edits?.[i]?.paymentType !== undefined;
    const paymentType = (ptCol && ptRaw ? normPaymentType(ptRaw) : null) ?? (ptCol && ptRaw ? null : opts.paymentType || null);
    if (!paymentType) errors.paymentType = ptRaw ? `unrecognised "${ptRaw}"` : 'missing';
    const challanNo = cell(r, 'challanNo', i).replace(/\s+/g, '');
    if (!challanNo) errors.challanNo = 'missing';
    const dRaw = cell(r, 'date', i);
    const d = dRaw ? parseDate(dRaw, opts.dateHint) : { error: 'missing' };
    if (d.ambiguous) { ambiguous = true; errors.date = 'ambiguous'; } else if (d.error) errors.date = d.error;
    const amt = toNumber(cell(r, 'challanAmount', i));
    if (amt == null || amt < 0) errors.challanAmount = 'not a number';
    const claim = toNumber(cell(r, 'tdsClaim', i));
    if (claim == null || claim < 0) errors.tdsClaim = 'not a number';
    const authority = (map.authority != null || opts.edits?.[i]?.authority !== undefined ? cell(r, 'authority', i) : '') || clean(opts.authority);
    if (!authority) errors.authority = 'missing';
    rows.push({ src: i, paymentType, challanNo, date: d.iso ?? null, dateRaw: dRaw, challanAmount: amt, tdsClaim: claim, authority, errors });
  });

  const warnings = [];
  if (!rows.length) warnings.push('No data rows found with this mapping.');
  const sum = rows.reduce((a, r) => a + (r.tdsClaim ?? 0), 0);
  if (table.meta?.statedTotal != null && rows.length && table.meta.statedTotal !== sum)
    warnings.push(`Claimed amounts sum to ${sum.toLocaleString('en-IN')}, but the document says ${table.meta.statedTotal.toLocaleString('en-IN')}. Check the mapping.`);
  const dup = rows.map((r) => r.challanNo).filter((x, i, a) => x && a.indexOf(x) !== i);
  if (dup.length) warnings.push(`Duplicate challan numbers: ${[...new Set(dup)].join(', ')}`);
  return { rows, ambiguous, sum, warnings };
}

export const rowOk = (r) => Object.keys(r.errors).length === 0;
