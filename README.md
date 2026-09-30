# TDS Certificate Filler

A Chrome extension that reads your employer's TDS / income-tax deduction certificate (PDF, Excel or CSV) and helps you fill the **Salary [Section-86]** rows on the eTax ledger portal (`ledger.etaxnbr.gov.bd`) without typing each value by hand.

Everything happens in your browser. Nothing is uploaded. See [SECURITY.md](SECURITY.md).

It **fills the form; you press save.** It never clicks the portal's Add or Save buttons.

> ## ⚠️ Always verify after importing
>
> Reading a PDF, Excel or CSV file and matching its columns is automatic, and **it can be wrong**: a column may be mapped to the wrong field, a PDF may have an unusual layout, a date may be read in the wrong order, or a value may be misread. This tool is a data-entry aid, not a source of truth. **You are responsible for what you submit to the tax authority.**
>
> Before you press save on each row, and again before you submit your return:
>
> 1. **Check the Column mapping** in the panel (amber, orange or red dots mean "please check").
> 2. **Compare every filled value with your original certificate**: challan number, date, challan amount and claimed amount.
> 3. **Check the totals.** The panel shows the claimed total, and the portal shows Total Claimed Amount and Count. They should match the certificate.
> 4. **Check the portal's verification status** for each saved row afterwards.
>
> The software is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)).

## Install (Chrome, unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder, the one that directly contains `manifest.json`. Not its parent.
4. "TDS Certificate Filler" appears in the list with no red **Errors** button.
5. Optional: click the puzzle-piece icon in the toolbar and pin the extension so its button (a blue "T") is always visible.

After changing any file, click the reload arrow on the extension's card, then reload the portal page.

## Use

1. Log in to the portal and open **Claim Source Tax → Salary (Others)**. Reload the page once if the extension was just installed.
2. A blue **TDS Filler** panel appears at the top right. Drag its header to move it; `–` collapses it, `×` hides it. The toolbar button shows or hides it.
3. In the panel, choose your certificate file (PDF, `.xlsx`/`.xls`, or `.csv`).
4. Check the **Column mapping** section (see below). Anything the extension couldn't find is flagged in red.
5. On the portal, click **Add** to get a blank row.
6. In the panel, click **Fill** on the row you want. The six fields are filled in.
7. Check the values on the portal, then press the portal's green **save** button yourself.
8. Repeat from step 5. Rows already on the portal are greyed out with an "on portal" badge.

Every row also has copy buttons (Challan no, Date, Amount, Claimed, Authority, and a whole tab-separated Row) if you'd rather paste values yourself.

### Reading the status

- The **bar at the bottom of the panel** always shows the current state: green when ready, amber for things that need your attention (with a **Show me** link), red for errors. It stays visible while you scroll.
- The panel's border and header take the same colour, and a small chip stays visible when the panel is collapsed.
- Each row shows its own result after Fill: green when filled, red with the reason if it couldn't be.

### Column mapping

The extension matches your file's columns to the portal's columns:

| Portal column | How it's found |
|---|---|
| Depositing Authority | a column, or one name for all rows (auto-filled from a PDF's employer heading) |
| Payment Document Type | a column with Challan / Certificate values, or one choice for all rows |
| Challan/ Certificate Reference No. | header words like "challan no", "reference"; values like `2526-00040888871` |
| Challan/ Certificate Date | header words like "date"; date-looking values |
| Challan/ Certificate Amount | header words like "total amount in the challan" |
| Claimed Amount | header words like "claimed", "relating to this certificate", "TDS" |

A coloured dot shows how sure it is: green = found, amber = likely, orange = guess, red = not found.

If something is wrong or missing:

- Pick the right column from that field's dropdown, or
- Type a word that appears in the column's name under **What should I look for in the column name?** and press **Find**. It's remembered for future files.
- For Excel/CSV, set **Header row #** if the header isn't on the first row (0 = no header).
- If a file has several tables or sheets, choose one from **Table / sheet**.
- **Payment Document Type** and **Depositing Authority** can be set once for all rows. Your choice is remembered.

Corrected mappings are remembered for files with the same headers.

### Fixing a row

A row with a problem turns red and shows editable boxes for just the bad fields. **Fill** stays disabled until it's fixed. **Edit** opens every field on any row.

### Dates

Unambiguous dates (`2025-08-13`, `13 Aug 2025`, `13/08/2025`) convert automatically to the portal's `DD-MM-YYYY`. If a file has dates like `05/03/2026` that could be day/month or month/day, the panel asks once which order the file uses. It never guesses.

### Clearing your data

**Clear data** (under the file name) removes the loaded file's data. It's also removed when you close the browser.

## Troubleshooting

| Problem | What to do |
|---|---|
| "Failed to load extension — Manifest file is missing" | You selected the wrong folder. Select the folder that directly contains `manifest.json`. |
| The extension's toolbar entry is greyed out in the puzzle menu | Normal on non-portal pages. On the portal it works. Reload the portal page if the panel isn't showing. |
| No panel on the portal | Reload the page; make sure the address starts with `https://ledger.etaxnbr.gov.bd/`; click the toolbar button. A red "!" on the button means you're on a different site. |
| "Click the portal's Add button first" | Fill works only on a blank row created by the portal's Add button. |
| "Could not read PDF" | Scanned/image-only PDFs can't be read. Use the original PDF, or export to CSV/Excel. |
| "File is too large" | Files over 15 MB are refused. |
| Something looks wrong | Open the browser console (F12 → Console) on the portal page and note any red errors. |

## Development

```
node --test tests/run.test.mjs        # parser, mapping and date tests
```

To also test against a real certificate (kept out of git because it holds personal data):

```
TDS_SAMPLE_PDF=/path/to/certificate.pdf node --test tests/local/
```

Layout: `manifest.json`, `background.js` (toolbar button), `content/` (panel and portal form access), `lib/` (file reading, column mapping, dates), `vendor/` (pdf.js and SheetJS, checksums in `SECURITY.md`).

## License

Copyright (c) 2026 Nasif Mahbub. All rights reserved. Source is viewable for educational, review or evaluation purposes only; see [LICENSE](LICENSE). Bundled libraries in `vendor/` keep their own licenses.
