/**
 * Render HTML to a PNG buffer via Puppeteer (for email screenshot attachments).
 */
import { existsSync } from 'fs';
import puppeteer, { type Browser } from 'puppeteer';

const LOG_PREFIX = '[html-to-png]';

async function resolveExecutablePaths(): Promise<Array<string | undefined>> {
    const candidates: Array<string | undefined> = [];
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    if (envPath) candidates.push(envPath);

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA?.trim();
        candidates.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
        candidates.push('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe');
        if (localAppData) {
            candidates.push(`${localAppData}\\Google\\Chrome\\Application\\chrome.exe`);
        }
        candidates.push('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
        candidates.push('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe');
    }

    try {
        const bundled = await puppeteer.executablePath();
        if (bundled) candidates.push(bundled);
    } catch {
        // ignore
    }

    const seen = new Set<string>();
    const resolved: Array<string | undefined> = [];
    for (const candidate of candidates) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        if (existsSync(candidate)) resolved.push(candidate);
    }
    if (!resolved.length) resolved.push(undefined);
    return resolved;
}

async function launchBrowser(): Promise<Browser> {
    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
    ];
    const executablePaths = await resolveExecutablePaths();
    let lastError: unknown;
    for (const executablePath of executablePaths) {
        try {
            return await puppeteer.launch({
                headless: true,
                args: launchArgs,
                executablePath,
            });
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error
        ? lastError
        : new Error('Failed to launch Puppeteer for HTML screenshot');
}

function wrapHtmlDocument(html: string): string {
    const trimmed = String(html || '').trim();
    if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
        return trimmed;
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; padding: 24px; background: #f4f7f9; font-family: Arial, Helvetica, sans-serif; }
  </style>
</head>
<body>${trimmed}</body>
</html>`;
}

/** Capture a PNG screenshot of the given HTML (full page). Returns null on failure. */
export async function renderHtmlToPngBuffer(html: string): Promise<Buffer | null> {
    const content = String(html || '').trim();
    if (!content) return null;

    let browser: Browser | null = null;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 2 });
        await page.setContent(wrapHtmlDocument(content), {
            waitUntil: 'load',
            timeout: 30_000,
        });
        const png = await page.screenshot({
            type: 'png',
            fullPage: true,
        });
        const buf = Buffer.from(png);
        if (!buf.length) return null;
        console.info(`${LOG_PREFIX} captured png bytes=${buf.length}`);
        return buf;
    } catch (error) {
        console.error(`${LOG_PREFIX} screenshot failed:`, error);
        return null;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch {
                // ignore
            }
        }
    }
}
