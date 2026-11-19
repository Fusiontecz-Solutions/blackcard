import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

function pageOrderKey(filename: string): number {
  const base = path.basename(filename, path.extname(filename));
  const m = base.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Renders each PDF page to PNG via pdf-poppler (pdftocairo `-scale-to`).
 * `scaleToLongEdgePx` maps to poppler’s longest-edge target (~1200 recommended).
 */
export async function renderPdfBufferToPngBuffers(
  pdfBuffer: Buffer,
  scaleToLongEdgePx: number
): Promise<Buffer[]> {
  const uniq = `claude-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = path.join(os.tmpdir(), uniq);
  const pdfPath = path.join(workDir, "input.pdf");

  await fs.mkdir(workDir, { recursive: true });

  try {
    await fs.writeFile(pdfPath, pdfBuffer);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfPoppler = require("pdf-poppler") as {
      convert: (
        filePath: string,
        opts: {
          format: string;
          out_dir: string;
          out_prefix: string;
          page: number | null;
          scale?: number;
        }
      ) => Promise<unknown>;
    };

    await pdfPoppler.convert(pdfPath, {
      format: "png",
      out_dir: workDir,
      out_prefix: "page",
      page: null,
      scale: Math.max(256, Math.floor(scaleToLongEdgePx)),
    });

    const names = await fs.readdir(workDir);
    const pngFiles = names
      .filter((n) => n.toLowerCase().endsWith(".png"))
      .sort((a, b) => {
        const da = pageOrderKey(a);
        const db = pageOrderKey(b);
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });

    if (!pngFiles.length) {
      throw new Error("PDF render produced no PNG pages (pdf-poppler)");
    }

    const buffers: Buffer[] = [];
    for (const n of pngFiles) {
      buffers.push(await fs.readFile(path.join(workDir, n)));
    }
    return buffers;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
