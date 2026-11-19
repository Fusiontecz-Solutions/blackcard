import { Parser } from "json2csv";
import fs from "fs";

function nullsToEmptyStrings(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v == null || v === undefined ? "" : v;
  }
  return out;
}

/** Flatten `parseBusinessData`-shaped `{ business, owner }` for one CSV row. */
export function flattenParsedBusinessOwner(data: {
  business?: Record<string, unknown> | null;
  owner?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const biz = data?.business && typeof data.business === "object" ? data.business : {};
  const own = data?.owner && typeof data.owner === "object" ? data.owner : {};
  return {
    ...nullsToEmptyStrings(biz as Record<string, unknown>),
    ...nullsToEmptyStrings(own as Record<string, unknown>),
  };
}

/** Single-row CSV string (header + values) suitable for logs or spreadsheets. */
export function parsedBusinessDataToCsvString(
  data: { business?: Record<string, unknown> | null; owner?: Record<string, unknown> | null } | null | undefined,
): string {
  if (!data || typeof data !== "object") return "";
  const flat = flattenParsedBusinessOwner(data);
  const parser = new Parser();
  return parser.parse([flat]);
}

/**
 * Log extracted business + owner fields as CSV (two lines: headers, then one row).
 * Use alongside JSON logs for quick spreadsheet paste / diff in terminals.
 */
export function logExtractedBusinessDataCsv(
  data: { business?: unknown; owner?: unknown } | null | undefined,
  opts?: { tag?: string; fileName?: string | null },
): void {
  const tag = opts?.tag ?? "[pdf-extract]";
  const file = opts?.fileName ? ` file=${opts.fileName}` : "";
  const csv = parsedBusinessDataToCsvString(
    data as { business?: Record<string, unknown> | null; owner?: Record<string, unknown> | null },
  ).trim();

  if (!csv) {
    console.log(`${tag} extracted_data_csv${file}(empty)`);
    return;
  }

  console.log(`${tag} extracted_data_csv${file}\n${csv}`);
}

export const convertToCSV = (data: any) => {

  // flatten business + owner
  const flatData = {
    ...data.business,
    ...data.owner
  };

  const parser = new Parser();

  const csv = parser.parse([flatData]);

  fs.writeFileSync("output.csv", csv);
};