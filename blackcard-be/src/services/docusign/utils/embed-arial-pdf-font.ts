import type { PDFDocument, PDFFont } from 'pdf-lib';
import * as fs from 'fs';

const ARIAL_FONT_CANDIDATE_PATHS = [
  process.env.DOCUSIGN_ARIAL_FONT_PATH,
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/Library/Fonts/Arial.ttf',
].filter((p): p is string => Boolean(String(p || '').trim()));

const ARIAL_BOLD_FONT_CANDIDATE_PATHS = [
  process.env.DOCUSIGN_ARIAL_BOLD_FONT_PATH,
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/Arialbd.ttf',
  'C:/Windows/Fonts/ARIALBD.TTF',
  '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/Library/Fonts/Arial Bold.ttf',
].filter((p): p is string => Boolean(String(p || '').trim()));

async function embedFontFromCandidates(
  pdfDoc: PDFDocument,
  candidates: string[],
  fallback: 'Helvetica' | 'HelveticaBold',
): Promise<PDFFont> {
  const { StandardFonts } = await import('pdf-lib');

  for (const fontPath of candidates) {
    try {
      if (!fs.existsSync(fontPath)) continue;
      const fontkit = await import('@pdf-lib/fontkit');
      pdfDoc.registerFontkit(fontkit.default);
      const fontBytes = fs.readFileSync(fontPath);
      return await pdfDoc.embedFont(fontBytes);
    } catch {
      continue;
    }
  }

  console.warn(
    `[DocuSign] Arial${fallback === 'HelveticaBold' ? ' Bold' : ''} font file not found for PDF flatten — falling back to ${fallback}. ` +
      'Set DOCUSIGN_ARIAL_FONT_PATH / DOCUSIGN_ARIAL_BOLD_FONT_PATH or install Arial on the server.',
  );
  return pdfDoc.embedFont(
    fallback === 'HelveticaBold' ? StandardFonts.HelveticaBold : StandardFonts.Helvetica,
  );
}

/** Embed Arial (or closest available sans) for flattened prefill PDFs. */
export async function embedArialPdfFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  return embedFontFromCandidates(pdfDoc, ARIAL_FONT_CANDIDATE_PATHS, 'Helvetica');
}

/** Embed Arial Bold (or closest available bold sans) for flattened prefill PDFs. */
export async function embedArialBoldPdfFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  return embedFontFromCandidates(pdfDoc, ARIAL_BOLD_FONT_CANDIDATE_PATHS, 'HelveticaBold');
}
