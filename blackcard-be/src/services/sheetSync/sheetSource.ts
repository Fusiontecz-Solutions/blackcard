import fs from 'fs/promises';
import * as XLSX from 'xlsx';
import { google } from 'googleapis';

/**
 * Where the sync reads its tabs from. Both sources return the same shape — each tab as an array
 * of rows of raw cell values (numbers stay numbers, percentages are fractions, dates are Excel
 * serial numbers) — so the sync logic never cares which one it is reading.
 */
export type SheetTabs = Record<string, unknown[][]>;

export type SheetSource =
    | { kind: 'file'; path: string }
    | { kind: 'google'; spreadsheetId: string }
    /** A sheet shared as "Anyone with the link can view": downloaded as .xlsx, no Google API or key. */
    | { kind: 'link'; spreadsheetId: string };

/** Read-only scopes: the service account can never change the sheet, even by mistake. */
const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
];

/**
 * A service account key from the env when one is set; otherwise Application Default Credentials,
 * i.e. `gcloud auth application-default login --impersonate-service-account=…` on this machine.
 * The keyless route exists because some Google organisations block service account keys.
 */
function googleAuth() {
    const inline = process.env.GOOGLE_SHEETS_SA_KEY;
    const keyFile = process.env.GOOGLE_SHEETS_SA_KEY_FILE;
    return new google.auth.GoogleAuth({
        ...(inline ? { credentials: JSON.parse(inline) } : keyFile ? { keyFile } : {}),
        scopes: GOOGLE_SCOPES,
    });
}

function readWorkbookTabs(buffer: Buffer, tabNames: string[], label: string): SheetTabs {
    const workbook = XLSX.read(buffer, { type: 'buffer', sheets: tabNames });
    const tabs: SheetTabs = {};
    for (const name of tabNames) {
        const ws = workbook.Sheets[name];
        if (!ws) throw new Error(`Tab "${name}" not found in ${label}.`);
        tabs[name] = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
    }
    return tabs;
}

/** Google's .xlsx export of a link-shared sheet — the same file as File → Download → .xlsx. */
async function downloadLinkSharedSheet(spreadsheetId: string): Promise<Buffer> {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
    const res = await fetch(url, { redirect: 'follow' });
    const type = res.headers.get('content-type') ?? '';
    // A sheet that is not shared by link answers with Google's sign-in page (HTML), not a file.
    if (!res.ok || !type.includes('spreadsheetml')) {
        throw new Error(`Could not download sheet ${spreadsheetId} (HTTP ${res.status}). Is it shared as "Anyone with the link"?`);
    }
    return Buffer.from(await res.arrayBuffer());
}

export async function readSheetTabs(source: SheetSource, tabNames: string[]): Promise<SheetTabs> {
    if (source.kind === 'file') return readWorkbookTabs(await fs.readFile(source.path), tabNames, source.path);
    if (source.kind === 'link') {
        return readWorkbookTabs(await downloadLinkSharedSheet(source.spreadsheetId), tabNames, `sheet ${source.spreadsheetId}`);
    }

    const sheets = google.sheets({ version: 'v4', auth: googleAuth() });
    const { data } = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: source.spreadsheetId,
        ranges: tabNames.map((name) => `'${name.replace(/'/g, "''")}'`),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const tabs: SheetTabs = {};
    tabNames.forEach((name, i) => {
        tabs[name] = (data.valueRanges?.[i]?.values ?? []) as unknown[][];
    });
    return tabs;
}

/** Last edit time of the Google Sheet — one cheap call used to skip syncs when nothing changed. */
export async function getSheetModifiedTime(spreadsheetId: string): Promise<string | null> {
    const drive = google.drive({ version: 'v3', auth: googleAuth() });
    const { data } = await drive.files.get({ fileId: spreadsheetId, fields: 'modifiedTime', supportsAllDrives: true });
    return data.modifiedTime ?? null;
}
