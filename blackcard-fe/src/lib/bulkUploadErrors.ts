import * as XLSX from "xlsx";

export type BulkImportRowError = {
  excelRowNumber: number;
  message: string;
  dealId?: string | null;
  dealName?: string | null;
};

/**
 * Export only the rows that failed during bulk import so the user can fix and re-upload.
 * `excelRowNumber` is 1-based (matches Excel row numbers, including the header row).
 */
export async function downloadFailedBulkUploadRows(
  sourceFile: File,
  errors: BulkImportRowError[],
): Promise<void> {
  if (!errors.length) {
    throw new Error("No failed rows to export.");
  }

  const buffer = await sourceFile.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Could not read worksheet.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (!rows.length) {
    throw new Error("Worksheet is empty.");
  }

  const failedRowNumbers = new Set(
    errors.map((err) => err.excelRowNumber).filter((n) => n > 0),
  );
  const header = rows[0];
  const failedDataRows = rows.filter((_, index) =>
    failedRowNumbers.has(index + 1),
  );

  const exportRows = [header, ...failedDataRows];
  const exportSheet = XLSX.utils.aoa_to_sheet(exportRows);
  const exportWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(exportWorkbook, exportSheet, sheetName);

  const output = XLSX.write(exportWorkbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const baseName = sourceFile.name.replace(/\.xlsx?$/i, "");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName}-failed-rows.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
