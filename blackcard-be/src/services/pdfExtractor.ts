import fs from "fs/promises";

const loadPdfParse = () => {
  const pdfModule = require("pdf-parse");
  return pdfModule.default || pdfModule;
};

export const extractPDFTextFromBuffer = async (buffer: Buffer): Promise<string> => {
  const pdfParse = loadPdfParse();
  const data = await pdfParse(buffer);
  return data.text || "";
};

export const extractPDFText = async (filePath: string) => {
  const buffer = await fs.readFile(filePath);
  return extractPDFTextFromBuffer(buffer);
};