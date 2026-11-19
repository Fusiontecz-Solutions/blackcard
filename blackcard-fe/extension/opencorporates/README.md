# CRM Background Check Bridge (Chrome Extension)

Loads on **OpenCorporates** and **NY Court (NYSCEF)** and adds a **Send to CRM** button when opened from the Hardrock/Katan background check tab.

## Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `katan-fe/extension/opencorporates` (or `hardrock-fe/extension/opencorporates`)
5. Pin **CRM Background Check Bridge** in the toolbar

## OpenCorporates workflow

1. CRM → Application → **Background Check** → OpenCorporates card → **Search OpenCorporates**
2. Solve captcha if shown
3. Review search results or open a company detail page
4. Click **Send to CRM** (purple button, bottom-right)
5. CRM tab refocuses automatically; use **Apply to notes** if needed

Detail pages also extract officers/directors when visible on the page.

## NY Court (NYSCEF) workflow

1. CRM → **Background Check** → NY Court card
2. Click **Search NY Court** (use the Business/Owner toggle if both names are on the deal)
3. On the court site, confirm the prefilled name and click **Search**
4. On the results page, click **Send to CRM** (teal button, bottom-right)
5. CRM tab refocuses; review cases and **Apply to notes**

## Paste JSON fallback

If the extension is not installed:

- OpenCorporates console: `CrmOpenCorporatesBookmarklet()`
- NYSCEF console: `CrmNyscefBookmarklet()`

Then use **Paste JSON** in the CRM panel.

## Files

- `manifest.json` — MV3 manifest (OpenCorporates + NYSCEF)
- `bridge.js` — shared CRM return URL / postMessage bridge
- `extract.js` / `content.js` — OpenCorporates extraction
- `nyscef-extract.js` / `content-nyscef.js` — NY Court extraction
- `popup.html` / `popup.js` — toolbar instructions
