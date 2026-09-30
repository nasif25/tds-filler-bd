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
> 1. **Check the Column mapping** in the panel (amber ⚠ and red ✕ lines need your attention; blue ℹ lines are values used for every row, so make sure they're right).
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

### Column mapping (always shown first)

After you choose a file, the panel opens **Check the column mapping**: one block per portal column, each with an icon and a sentence saying where its value comes from. Read every line before you fill.

| Icon | Meaning |
|---|---|
| ✓ green | Found in a column of your file, e.g. "Found in column “Challan No.”". |
| ℹ blue | No column, so one value is used for every row, and it says where that came from: "from the document heading", "remembered from last time", "the default", or "set by you". Change it if it's wrong. |
| ⚠ amber | The extension guessed a column. Please check it. |
| ✕ red | Not found. It's highlighted and it offers **suggestions**. |

The portal columns are: Depositing Authority, Payment Document Type, Challan/ Certificate Reference No., Challan/ Certificate Date, Challan/ Certificate Amount, Claimed Amount.

- **Payment Document Type** defaults to **Challan** for every row. Switch it to Certificate if your file has certificates, or map a column that holds Challan / Certificate values.
- **Depositing Authority** comes from a column, or one name for every row. For PDFs the employer name in the document heading is used; a name you type is remembered for the next file.

If a portal column is missing (red):

- Click one of the **suggested columns** (unused columns, best fit first), or choose from the dropdown, or
- Type a word from the column's name in the **type a word** box. Grey ghost text suggests a column name as you type: **→** adds one letter, **Tab** accepts the whole suggestion, **Enter** searches. Your word is remembered for future files.
- For Excel/CSV, set **Header row #** if the header isn't on the first row (0 = no header row).
- If a file has several tables or sheets, choose one from **Table / sheet**.

Columns you pick are remembered for files with the same headers. Guesses stay flagged until you confirm them.

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
| Panel doesn't appear, or a red banner says it "could not start" | Click the toolbar icon on the portal page. The banner shows the extension version and, if known, the reason. Check the version: the panel header shows it (e.g. `v0.2.0`), and `chrome://extensions` shows it on the extension's card. If it's older than `0.2.0`, replace the folder with the latest copy, click the reload arrow on the extension's card, then reload the portal page. Needs Chrome 102 or newer. If it still fails, press F12 → Console on the portal page and send the line starting `[TDS Filler]`. |
| The extensions menu says it "has access to this site" but there's no panel | That only means the permission is fine. Click the toolbar icon (pin it via the puzzle-piece menu first). If a banner appears, follow it. |
| "Manifest file is missing" after unzipping | Zips often unpack into a folder inside a folder. Select the inner folder that directly contains `manifest.json`. |
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
