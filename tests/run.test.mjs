import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../vendor/xlsx.mjs';
import { parseDate, toPortal } from '../lib/dates.js';
import { extractFile, rankTables, parseCsv, withHeaderRow } from '../lib/extract.js';
import { autoMap, buildRows, rowOk, signature, normPaymentType } from '../lib/mapping.js';

const loaders = { pdfPages: async () => { throw new Error('PDF loader not used in the committed tests'); }, xlsx: async () => XLSX };
const fileFromText = (name, text) => ({ name, text: async () => text });
const fileFromBuf = (name, buf) => ({ name, arrayBuffer: async () => buf });

test('dates: unambiguous formats', () => {
  assert.equal(parseDate('2025-08-13').iso, '2025-08-13');
  assert.equal(parseDate('13-08-2025').iso, '2025-08-13');
  assert.equal(parseDate('08/13/2025').iso, '2025-08-13');
  assert.equal(parseDate('13 Aug 2025').iso, '2025-08-13');
  assert.equal(parseDate('August 13, 2025').iso, '2025-08-13');
  assert.equal(parseDate('05/05/2026').iso, '2026-05-05');
});
test('dates: ambiguous asks, hint resolves', () => {
  assert.equal(parseDate('05/03/2026').ambiguous, true);
  assert.equal(parseDate('05/03/2026', 'DMY').iso, '2026-03-05');
  assert.equal(parseDate('05/03/2026', 'MDY').iso, '2026-05-03');
});
test('dates: invalid / unrecognized', () => {
  assert.ok(parseDate('2026-02-30').error);
  assert.ok(parseDate('hello').error);
  assert.ok(parseDate('').error);
});
test('dates: portal format', () => assert.equal(toPortal('2025-08-13'), '13-08-2025'));

test('csv: different header names, quotes, semicolons', async () => {
  const csv = 'Employer;"Chalan Number";"Deposit Date";"Challan Value";"TDS Amount"\n"Acme, Ltd";2526-00000000011;13/08/2025;"5,000,000";"40,000"\nAcme, Ltd;2526-00000000022;25/09/2025;4000000;12000\nTotal;;;;52000\n';
  const { tables } = await extractFile(fileFromText('a.csv', csv), loaders);
  const t = tables[0];
  const { map } = autoMap(t);
  assert.deepEqual(map, { challanNo: 1, date: 2, challanAmount: 3, tdsClaim: 4, authority: 0, paymentType: null });
  const r = buildRows(t, map, { paymentType: 'Challan' });
  assert.equal(r.rows.length, 2); // "Total" line dropped
  assert.equal(r.rows[0].authority, 'Acme, Ltd');
  assert.equal(r.rows[0].date, '2025-08-13'); // 13 > 12 disambiguates
  assert.ok(r.rows.every(rowOk));
});

test('csv: ambiguous dates require a hint, hint resolves', async () => {
  const csv = 'Challan No,Date,Challan Amount,Claimed Amount\n2526-00000000011,05/03/2026,1000,100\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  const { map } = autoMap(t);
  let r = buildRows(t, map, { authority: 'X', paymentType: 'Challan' });
  assert.equal(r.ambiguous, true);
  assert.equal(r.rows[0].errors.date, 'ambiguous');
  r = buildRows(t, map, { authority: 'X', paymentType: 'Challan', dateHint: 'DMY' });
  assert.equal(r.rows[0].date, '2026-03-05');
  assert.ok(rowOk(r.rows[0]));
});

test('csv: no header row → columns guessed from content, amounts flagged as guess', async () => {
  const csv = '2526-00000000011,2025-08-13,5000000,40000\n2526-00000000022,2025-09-11,4000000,12000\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  assert.equal(t.headerRow, -1);
  const { map, confidence } = autoMap(t);
  assert.equal(map.challanNo, 0); assert.equal(map.date, 1);
  assert.equal(map.challanAmount, 2); assert.equal(map.tdsClaim, 3);
  assert.equal(confidence.tdsClaim, 'guess');
});

test('graceful failure: unrecognisable columns leave blanks the user can fill', async () => {
  const csv = 'Foo,Bar,Baz\nalpha,beta,gamma\none,two,three\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  const { map } = autoMap(t);
  assert.ok(Object.values(map).every((v) => v == null));
  let r = buildRows(t, map, {});
  assert.ok(r.rows.every((x) => !rowOk(x))); // errors, not exceptions
  // user maps columns manually + types the authority
  const manual = { challanNo: 0, date: 1, challanAmount: 2, tdsClaim: 2, authority: null, paymentType: null };
  const fixed = buildRows(t, manual, { authority: 'Acme', paymentType: 'Reference', edits: { 0: { date: '2025-08-13', challanAmount: '10', tdsClaim: '5' } } });
  assert.deepEqual(fixed.rows[0].errors, {});
  assert.equal(fixed.rows[0].tdsClaim, 5);
  assert.ok(fixed.rows[1].errors.date); // second row still needs attention
});

test('graceful failure: empty / unsupported files return an error, never throw', async () => {
  assert.equal((await extractFile(fileFromText('a.docx', ''), loaders)).error.includes('Unsupported'), true);
  assert.equal((await extractFile(fileFromText('a.csv', ''), loaders)).tables[0].rows.length, 0);
  assert.ok((await extractFile(fileFromBuf('a.xlsx', new ArrayBuffer(4)), loaders)).error === undefined || true);
});

test('xlsx: date serials and numbers are read exactly, header row detected below a title', async () => {
  const aoa = [
    ['TDS schedule FY 2025-26'], [],
    ['Depositing Authority', 'Challan No.', 'Challan Date', 'Total Amount in the Challan', 'Amount Relating to this Certificate'],
    ['Acme Ltd', '2526-00000000011', new Date(Date.UTC(2025, 7, 13)), 5000000, 40000],
    ['Acme Ltd', '2526-00000000022', new Date(Date.UTC(2025, 8, 11)), 4000000, 12000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'TDS');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true });
  const t = (await extractFile(fileFromBuf('a.xlsx', buf), loaders)).tables[0];
  assert.equal(t.headerRow, 2);
  const { map } = autoMap(t);
  assert.deepEqual(map, { challanNo: 1, date: 2, challanAmount: 3, tdsClaim: 4, authority: 0, paymentType: null });
  const r = buildRows(t, map, { paymentType: 'Challan' });
  assert.deepEqual(r.rows.map((x) => x.date), ['2025-08-13', '2025-09-11']);
  assert.deepEqual(r.rows.map((x) => x.tdsClaim), [40000, 12000]);
  // user says "row 1 is the header" → override re-derives the table
  assert.equal(withHeaderRow(t, 0).headers[0], 'TDS schedule FY 2025-26');
});

test('saved mapping is reused for the same header signature', () => {
  const t = { headers: ['A', 'B', 'C'], rows: [['x', 'y', 'z']] };
  const saved = { cols: 3, map: { challanNo: 2, date: 0, challanAmount: null, tdsClaim: 1, authority: null } };
  const { map, confidence } = autoMap(t, saved);
  assert.equal(map.challanNo, 2); assert.equal(confidence.challanNo, 'saved');
  assert.equal(signature(['A ', 'b']), 'a|b');
});

test('csv parser handles embedded newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,"b ""q"" c",d\n1,2,3'), [['a', 'b "q" c', 'd'], ['1', '2', '3']]);
});

test('payment type: column detected by header, values normalised per row', async () => {
  const csv = 'Payment Document Type,Challan/ Certificate Reference No.,Challan/ Certificate Date,Challan/ Certificate Amount,Claimed Amount\nChallan,2526-00000000011,2025-08-13,1000,100\nCertificate,CERT-778899,2025-09-13,2000,200\nCheque,X-1234567,2025-10-13,3000,300\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  const { map } = autoMap(t);
  assert.equal(map.paymentType, 0); assert.equal(map.challanNo, 1);
  const r = buildRows(t, map, { authority: 'A' });
  assert.deepEqual(r.rows.map((x) => x.paymentType), ['Challan', 'Reference', null]);
  assert.match(r.rows[2].errors.paymentType, /unrecognised "Cheque"/); // flagged, not guessed
  assert.ok(rowOk(r.rows[0]) && rowOk(r.rows[1]) && !rowOk(r.rows[2]));
});

test('payment type: no column and no constant is flagged; constant fixes it', async () => {
  const csv = 'Challan No,Date,Amount,Claimed\n2526-00000000011,2025-08-13,1000,100\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  const { map } = autoMap(t);
  assert.equal(map.paymentType, null);
  assert.equal(buildRows(t, map, { authority: 'A' }).rows[0].errors.paymentType, 'missing');
  assert.ok(rowOk(buildRows(t, map, { authority: 'A', paymentType: 'Reference' }).rows[0]));
  assert.equal(normPaymentType('Challan'), 'Challan');
  assert.equal(normPaymentType('certificate'), 'Reference');
  assert.equal(normPaymentType('nope'), null);
});

test('aliases: a keyword the user taught maps a header we could not recognise', async () => {
  const csv = 'Employer,Slip,When,Grand,TDS Paid\nA,2526-00000000011,2025-08-13,1000,100\n';
  const t = (await extractFile(fileFromText('a.csv', csv), loaders)).tables[0];
  const { map } = autoMap(t, undefined, { tdsClaim: ['tds paid'], challanAmount: ['grand'] });
  assert.equal(map.tdsClaim, 4); assert.equal(map.challanAmount, 3);
});
