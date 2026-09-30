// Date parsing to canonical ISO (YYYY-MM-DD). Never guesses on ambiguous input.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function valid(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function iso(y, m, d) {
  return valid(y, m, d)
    ? { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
    : { error: 'invalid' };
}

/**
 * @param {string} input
 * @param {'DMY'|'MDY'|undefined} hint  order for ambiguous numeric dates
 * @returns {{iso:string}|{ambiguous:true}|{error:string}}
 */
export function parseDate(input, hint) {
  const s = String(input ?? '').trim();
  if (!s) return { error: 'empty' };

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // 13 Aug 2025, 13-Aug-2025, 13th August, 2025
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/,.]*([A-Za-z]{3,9})[\s\-/,.]*(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return iso(+m[3], mi + 1, +m[1]);
  }
  // August 13, 2025
  m = s.match(/^([A-Za-z]{3,9})[\s\-/,.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/,.]*(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return iso(+m[3], mi + 1, +m[2]);
  }

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) return iso(y, b, a); // must be D/M
    if (b > 12) return iso(y, a, b); // must be M/D
    if (a === b) return iso(y, a, b);
    if (hint === 'DMY') return iso(y, b, a);
    if (hint === 'MDY') return iso(y, a, b);
    return { ambiguous: true };
  }
  return { error: 'unrecognized' };
}

/** Portal display format. */
export function toPortal(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

/** Parse many dates; report whether the user must pick DMY/MDY. */
export function parseAll(values, hint) {
  const results = values.map((v) => parseDate(v, hint));
  return { results, needsHint: results.some((r) => r.ambiguous) };
}
