// Node-side PDF loader for tests (legacy pdf.js build). node tests/dump.mjs <pdf> prints the detected tables.
import fs from 'node:fs';
import * as pdfjs from './vendor-legacy/pdf.min.mjs';
import { pdfPagesToTables } from '../lib/extract.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor-legacy/pdf.worker.min.mjs', import.meta.url).href;

export async function pdfPages(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
  return pages;
}

if (process.argv[2]) {
  const tables = pdfPagesToTables(await pdfPages(fs.readFileSync(process.argv[2])));
  for (const t of tables) console.log(t.name, '\n  headers:', t.headers, '\n  row0:', t.rows[0], '\n  meta:', t.meta);
}
