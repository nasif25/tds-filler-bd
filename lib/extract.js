// File → candidate tables. A table is { name, headers:string[], rows:string[][], meta, grid?, headerRow? }.
// Extraction never throws for "unexpected layout": it returns whatever it found (possibly no tables).
import { autoMap, FIELDS } from './mapping.js';

const MAX_CELL = 500; // pathological cell text must not be able to stall the header/date regexes
const clean = (s) => String(s ?? '').slice(0, MAX_CELL * 4).replace(/\s+/g, ' ').trim().slice(0, MAX_CELL);
const colName = (i) => 'Column ' + (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

/* ---------- CSV ---------- */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const grid = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); grid.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); grid.push(row); }
  return grid.map((r) => r.map(clean));
}

/* ---------- grid (CSV / Excel sheet) → table ---------- */
const isNum = (s) => /^-?[\d,]+(\.\d+)?$/.test(s);

/** 0-based header row index that best looks like a header, or -1 if none. */
export function guessHeaderRow(grid) {
  const dummy = (h) => ({ headers: h, rows: [] });
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const cells = grid[i].filter(Boolean);
    if (cells.length < 3) continue;
    const textual = cells.filter((c) => !isNum(c) && !/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(c)).length / cells.length;
    if (textual < 0.7) continue;
    // keyword hits from the mapper's own header patterns
    const hits = FIELDS.reduce((a, f) => a + (grid[i].some((h) => autoMap({ headers: [h], rows: [] }).map[f.key] === 0) ? 1 : 0), 0);
    const score = textual + hits + cells.length * 0.01;
    if (score > bestScore) { bestScore = score; best = i; }
    if (hits >= 2) break;
  }
  return best;
}

export function gridToTable(grid, name, headerRow = guessHeaderRow(grid)) {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const pad = (r) => Array.from({ length: width }, (_, c) => r[c] ?? '');
  const headers = headerRow >= 0
    ? pad(grid[headerRow]).map((h, c) => h || colName(c))
    : Array.from({ length: width }, (_, c) => colName(c));
  const body = grid.slice(headerRow + 1).map(pad).filter((r) => r.filter(Boolean).length >= 2);
  return { name, headers, rows: body, grid, headerRow, meta: {} };
}

/** Re-derive a grid table with a different header row (-1 = no header row). */
export const withHeaderRow = (t, headerRow) => (t.grid ? gridToTable(t.grid, t.name, headerRow) : t);

/* ---------- Excel ---------- */
export function xlsxToTables(XLSX, buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: true });
  const tables = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) continue;
    const rg = XLSX.utils.decode_range(ws['!ref']);
    const grid = [];
    for (let r = rg.s.r; r <= rg.e.r; r++) {
      const row = [];
      for (let c = rg.s.c; c <= rg.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) { row.push(''); continue; }
        if (cell.t === 'd' && cell.v instanceof Date) {
          const d = cell.v;
          row.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
        } else if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          const d = XLSX.SSF.parse_date_code(cell.v); // exact y/m/d, no timezone or locale involved
          row.push(`${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`);
        } else if (cell.t === 'n') row.push(String(cell.v));
        else row.push(clean(cell.v));
      }
      grid.push(row);
    }
    const t = gridToTable(grid, `Sheet: ${name}`);
    if (t.rows.length) tables.push(t);
  }
  return tables;
}

/* ---------- PDF ---------- */
const NUMISH = /^-?[\d,]+(\.\d+)?$/;
const DATEISH = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;

/** pdf.js text items of one page → lines of merged cells. */
export function pageToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5], w = it.width ?? it.str.length * 5;
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, items: [] }));
    row.items.push({ x, x1: x + w, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    const cells = [];
    for (const it of r.items.sort((a, b) => a.x - b.x)) {
      const last = cells[cells.length - 1];
      if (last && it.x - last.x1 < 6) { last.s += (it.x - last.x1 > 1 ? ' ' : '') + it.s; last.x1 = it.x1; }
      else cells.push({ ...it });
    }
    cells.forEach((c) => { c.s = clean(c.s); });
    return { y: r.y, cells: cells.filter((c) => c.s) };
  });
}

const dataLike = (l) => l.cells.length >= 3 && l.cells.filter((c) => NUMISH.test(c.s) || DATEISH.test(c.s)).length >= 2;

export function pdfPagesToTables(pages) {
  const tables = [];
  const allText = [];
  pages.forEach((items, pi) => {
    const lines = pageToLines(items);
    lines.forEach((l) => allText.push(l.cells.map((c) => c.s).join(' ')));
    // group data-like lines by column count
    const byCount = new Map();
    lines.forEach((l, li) => { if (dataLike(l)) { const k = l.cells.length; (byCount.get(k) ?? byCount.set(k, []).get(k)).push(li); } });
    for (const [k, idxs] of byCount) {
      if (idxs.length < 2) continue;
      const dataLines = idxs.map((i) => lines[i]);
      // column x-zones from the data cells
      const zones = Array.from({ length: k }, (_, c) => ({
        lo: Math.min(...dataLines.map((l) => l.cells[c].x)) - 4,
        hi: Math.max(...dataLines.map((l) => l.cells[c].x1)) + 4,
      }));
      // header: non-data lines directly above the first data line
      const headers = Array.from({ length: k }, () => []);
      for (let li = idxs[0] - 1, n = 0; li >= 0 && n < 4; li--, n++) {
        const l = lines[li];
        if (dataLike(l) || lines[idxs[0]].y - l.y > 50) break;
        for (const cell of l.cells) {
          if (cell.s.length > 50) continue; // prose, not a column header
          // header text may be centred/left-aligned over right-aligned data: take the nearest zone within reach
          const mid = (cell.x + cell.x1) / 2;
          let best = -1, bestD = 40;
          zones.forEach((z, c) => {
            const d = mid < z.lo ? z.lo - mid : mid > z.hi ? mid - z.hi : 0;
            if (d < bestD) { bestD = d; best = c; }
          });
          if (best >= 0) headers[best].unshift(cell.s);
        }
      }
      tables.push({
        name: `PDF page ${pi + 1}: table of ${k} columns, ${dataLines.length} rows`,
        headers: headers.map((h, c) => clean(h.join(' ')) || colName(c)),
        rows: dataLines.map((l) => l.cells.map((c) => c.s)),
        meta: {},
      });
    }
  });

  // document-level hints (best effort, all optional)
  const ci = allText.findIndex((t) => /^Income Tax Certificate/i.test(t));
  const authority = ci > 0 ? allText[ci - 1] : '';
  const totalLine = [...allText].reverse().find((t) => /^Total\s+[\d,]+$/.test(t));
  for (const t of tables) {
    if (authority) t.meta.authority = authority;
    if (totalLine) t.meta.statedTotal = Number(totalLine.split(/\s+/)[1].replace(/,/g, ''));
  }
  return tables;
}

/* ---------- entry point ---------- */
/**
 * @param {{name:string, arrayBuffer():Promise<ArrayBuffer>, text():Promise<string>}} file
 * @param {{pdfPages:(buf:ArrayBuffer)=>Promise<any[][]>, xlsx:()=>Promise<any>}} loaders
 * @returns {Promise<{tables:Array, error?:string}>}
 */
export async function extractFile(file, loaders) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return { tables: [gridToTable(parseCsv(await file.text()), file.name)] };
    if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return { tables: xlsxToTables(await loaders.xlsx(), await file.arrayBuffer()) };
    if (ext === 'pdf') return { tables: pdfPagesToTables(await loaders.pdfPages(await file.arrayBuffer())) };
    return { tables: [], error: `Unsupported file type ".${ext}". Use PDF, Excel or CSV.` };
  } catch (e) {
    return { tables: [], error: `Could not read ${file.name}: ${e.message}` };
  }
}

/** Order candidate tables best-first by how many required fields auto-map. */
export function rankTables(tables) {
  const score = (t) => {
    const { map, confidence } = autoMap(t);
    return FIELDS.reduce((a, f) => a + (map[f.key] != null ? (confidence[f.key] === 'high' ? 2 : 1) : 0), 0) + Math.min(t.rows.length, 50) / 100;
  };
  return tables.map((t) => [t, score(t)]).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
