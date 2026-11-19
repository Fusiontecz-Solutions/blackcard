import * as fs from 'fs';
import * as path from 'path';

// pdf-parse v2 uses PDFParse class; no default export
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');

class PDFExtractionService {
  /**
   * Extract raw text from PDF using pdf-parse (+ optional OCR fallback)
   * @param filePath - Path to the PDF file
   * @returns Extracted text and metadata
   */
  async extractFromPDF(filePath: string, _customPrompt?: string): Promise<any> {
    try {
      // Read the PDF file
      const fileData = fs.readFileSync(filePath);

      // First attempt: extract raw text content using pdf-parse v2 (PDFParse + getText())
      let pdfText = '';
      try {
        const parser = new PDFParse({ data: fileData });
        const textResult = await parser.getText();
        pdfText = (textResult?.text ?? '').trim();
      } catch (parseError: any) {
        console.error('[pdfExtractionService] pdf-parse failed:', parseError);
      }

      // If there is no or almost no selectable text, try OCR as a best‑effort fallback
      if (!pdfText || pdfText.length < 50) {
        console.log(
          '[pdfExtractionService] No / very little selectable text foun                   d. Running OCR fallback...',
        );
        try {
          // Lazy-require heavy OCR dependencies
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Tesseract = require('tesseract.js');
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const pdf = require('pdf-poppler');

          const outputDir = path.join(process.cwd(), 'tmp', 'pdf-ocr');

          // Ensure output directory exists for pdf-poppler output
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          const opts = {
            format: 'png',
            out_dir: outputDir,
            out_prefix: 'page',
            page: null as number | null,
          };

          try {
            await pdf.convert(filePath, opts);
          } catch (ocrConvertError: any) {
            console.error(
              '[pdfExtractionService] Failed to convert PDF to images for OCR:',
              ocrConvertError,
            );
          }

          const imagePath = path.join(outputDir, 'page-1.png');

          if (fs.existsSync(imagePath)) {
            try {
              const result = await Tesseract.recognize(imagePath, 'eng');
              const ocrText = result?.data?.text?.trim?.() ?? '';
              if (ocrText.length > pdfText.length) {
                pdfText = ocrText;
              }
            } catch (ocrError: any) {
              console.error('[pdfExtractionService] OCR text recognition failed:', ocrError);
            }
          } else {
            console.warn(
              '[pdfExtractionService] OCR image not found at path:',
              imagePath,
            );
          }
        } catch (ocrSetupError: any) {
          console.error(
            '[pdfExtractionService] OCR setup failed (tesseract/pdf-poppler):',
            ocrSetupError,
          );
        }
      }

      // If we still have no text, bail out with a clear error
      if (!pdfText) {
        console.error(
          '[pdfExtractionService] No text extracted from PDF (even after OCR).',
        );
        throw new Error(
          'No text content could be extracted from the PDF. It may be image-only or very low quality. Please use a text-based or higher-quality PDF.',
        );
      }

      console.log(
        '[pdfExtractionService] PDF text length:',
        pdfText.length,
        'chars',
      );

      // If there is at least some text, attempt extraction anyway.
      // Very short text may lead to poor results, but we avoid hard‑failing the request.
      const MIN_TEXT_LENGTH = 100;
      if (pdfText.length < MIN_TEXT_LENGTH) {
        console.warn(
          '[pdfExtractionService] PDF has very little text for extraction:',
          pdfText.length,
          'chars (recommended minimum',
          MIN_TEXT_LENGTH,
          '). Proceeding with best‑effort extraction.',
        );
      }

      // Optionally truncate extremely long PDFs to stay within context limits
      const MAX_TEXT_LENGTH = 120_000;
      if (pdfText.length > MAX_TEXT_LENGTH) {
        pdfText = pdfText.slice(0, MAX_TEXT_LENGTH);
      }

      return {
        text: pdfText,
        textLength: pdfText.length,
      };
    } catch (error: any) {
      console.error('[pdfExtractionService] Extraction failed:', {
        message: error?.message || error,
        name: error?.name,
        code: error?.code,
      });
      if (process.env.NODE_ENV === 'development' && error?.stack) {
        console.error('[pdfExtractionService] Stack:', error.stack);
      }
      throw error;
    }
  }
}

export default new PDFExtractionService();

