export const ADDITIONAL_INFO_NOTE_PREFIX = "__FX_ADDITIONAL_INFO__:";

export const SOURCE_OF_REVENUE_OPTIONS = [
  "ACH",
  "Wires",
  "Cash Deposit",
  "Mobile deposit",
  "Zelle",
  "Cash App",
  "Others",
] as const;

/** One line of Critical Wire Transactions. */
export type WireRow = {
  date: string;
  amount: string;
  description: string;
  /** Set when the row was generated from a Positions row, so it follows it. */
  positionId?: string;
};

export type WireData = {
  credit: WireRow[];
  debit: WireRow[];
  /** Generated rows the user deleted by hand; never re-created. */
  positionWiresDismissed: string[];
};

export type AdditionalInfo = {
  sourceOfRevenue: string[];
  businessModel: string;
  onlinePresence: string;
  pros: string;
  cons: string;
  wire: WireData;
};

export const EMPTY_ADDITIONAL_INFO: AdditionalInfo = {
  sourceOfRevenue: [],
  businessModel: "",
  onlinePresence: "",
  pros: "",
  cons: "",
  wire: { credit: [], debit: [], positionWiresDismissed: [] },
};

function normalizeWireSide(rows: unknown): WireRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    const out: WireRow = {
      date: String(row?.date ?? ""),
      amount: String(row?.amount ?? ""),
      description: String(row?.description ?? ""),
    };
    const positionId = String(row?.positionId ?? "");
    if (positionId) out.positionId = positionId;
    return out;
  });
}

export function normalizeAdditionalInfo(raw: unknown): AdditionalInfo {
  if (!raw || typeof raw !== "object") {
    return {
      ...EMPTY_ADDITIONAL_INFO,
      sourceOfRevenue: [],
      wire: { credit: [], debit: [], positionWiresDismissed: [] },
    };
  }
  const data = raw as Record<string, unknown>;
  let sourceOfRevenue: string[] = [];
  if (Array.isArray(data.sourceOfRevenue)) {
    sourceOfRevenue = data.sourceOfRevenue
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  } else if (typeof data.sourceOfRevenue === "string" && data.sourceOfRevenue.trim()) {
    sourceOfRevenue = data.sourceOfRevenue
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return {
    sourceOfRevenue,
    businessModel: String(data.businessModel ?? ""),
    onlinePresence: String(data.onlinePresence ?? ""),
    pros: String(data.pros ?? ""),
    cons: String(data.cons ?? ""),
    wire: (() => {
      const wire = (data.wire ?? {}) as Record<string, unknown>;
      return {
        credit: normalizeWireSide(wire.credit),
        debit: normalizeWireSide(wire.debit),
        positionWiresDismissed: Array.isArray(wire.positionWiresDismissed)
          ? wire.positionWiresDismissed.map((k) => String(k ?? "")).filter(Boolean)
          : [],
      };
    })(),
  };
}

/** Amounts are stored as typed text, so read the number back out. */
export function parseWireAmount(value: unknown): number {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatWireAmount(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "") return "";
  return parseWireAmount(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatWireTotal(n: number): string {
  return `$${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Stored dates are ISO (YYYY-MM-DD); people read MM-DD-YYYY. */
export function wireIsoToUS(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[2]}-${m[3]}-${m[1]}` : String(iso || "");
}

export function wireMonthLabel(key: string): string {
  if (key === "Undated") return "Undated";
  const d = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Group a side's rows by month, oldest first, undated last. */
export function wireGroupByMonth<T extends { date: string }>(
  rows: T[] | undefined,
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  (rows || []).forEach((r) => {
    const key = /^\d{4}-\d{2}/.test(String(r.date || ""))
      ? String(r.date).slice(0, 7)
      : "Undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  return [...groups.entries()].sort((a, b) =>
    a[0] === "Undated" ? 1 : b[0] === "Undated" ? -1 : a[0].localeCompare(b[0]),
  );
}

export function wireHasData(raw: unknown): boolean {
  const w = normalizeAdditionalInfo(raw).wire;
  return w.credit.length + w.debit.length > 0;
}

/** Accepts a date string or an ISO timestamp and returns YYYY-MM-DD, or "". */
function toIsoDay(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const head = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Every funded position is a wire in. Build the credit row each position owns:
 * one per row that has a funding date and an amount, described as
 * "Funding wire- <Lender>" and tagged with the position's id.
 *
 * The id is the position's own `_id` from the API, so the row follows it across
 * reloads without storing anything extra on the position. A position that has
 * not been saved yet has no id, and gains its wire once it is saved.
 */
function positionFundingWireRows(positions: unknown): WireRow[] {
  if (!Array.isArray(positions)) return [];
  return positions.reduce<WireRow[]>((rows, pos) => {
    const p = (pos ?? {}) as Record<string, unknown>;
    const positionId = String(p._id ?? p.id ?? "").trim();
    if (!positionId) return rows;
    // Rows reach us in two shapes: the API's (fundingDate / fundedAmount /
    // funder) and the Positions table's (startingDate / amountFunded / lender).
    const rawDate = p.startingDate ?? p.fundingDate ?? "";
    const date = toIsoDay(rawDate);
    if (!date) return rows;
    const amount = parseWireAmount(p.amountFunded ?? p.fundedAmount);
    if (!(amount > 0)) return rows;
    const lender = String(p.lender ?? p.funder ?? "").trim();
    rows.push({
      date,
      amount: amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      description: lender ? `Funding wire- ${lender}` : "Funding wire",
      positionId,
    });
    return rows;
  }, []);
}

function sameWireRow(a: WireRow, b: WireRow): boolean {
  return (
    String(a?.date ?? "") === String(b?.date ?? "") &&
    String(a?.amount ?? "") === String(b?.amount ?? "") &&
    String(a?.description ?? "") === String(b?.description ?? "") &&
    String(a?.positionId ?? "") === String(b?.positionId ?? "")
  );
}

/**
 * Mirror Positions into the credit side of Critical Wire Transactions.
 *
 * Each funded position owns exactly one credit row, matched by the position's
 * id rather than by its text, so renaming a funder edits that one row instead
 * of adding one per keystroke, and deleting the position deletes its wire. Rows
 * typed by hand carry no position id and are never touched. A generated row the
 * user deletes is remembered in `wire.positionWiresDismissed` and not recreated.
 *
 * Pure: the same input always gives the same result, so it is safe inside a
 * state updater, and it returns the input unchanged when nothing moved.
 */
export function syncWireCreditFromPositions(
  raw: unknown,
  positions: unknown,
): AdditionalInfo {
  const data = normalizeAdditionalInfo(raw);
  const stored = data.wire.credit;
  const dismissed = new Set(data.wire.positionWiresDismissed);

  const generated = positionFundingWireRows(positions).filter(
    (row) => !dismissed.has(String(row.positionId)),
  );
  const byPositionId = new Map(generated.map((row) => [row.positionId, row]));

  const used = new Set<string>();
  const credit: WireRow[] = [];
  stored.forEach((row) => {
    const positionId = String(row.positionId ?? "");
    if (positionId) {
      const desired = byPositionId.get(positionId);
      // Position gone, no longer funded, or dismissed - its wire goes with it.
      if (!desired || used.has(positionId)) return;
      used.add(positionId);
      credit.push(sameWireRow(row, desired) ? row : desired);
      return;
    }
    // Rows saved before positions carried ids: adopt the one that matches
    // exactly, so it keeps following its position instead of being duplicated.
    const match = generated.find(
      (g) =>
        !used.has(String(g.positionId)) &&
        sameWireRow({ ...g, positionId: "" }, { ...row, positionId: "" }),
    );
    if (match) {
      used.add(String(match.positionId));
      credit.push(match);
      return;
    }
    credit.push(row);
  });

  generated.forEach((row) => {
    const positionId = String(row.positionId);
    if (used.has(positionId)) return;
    used.add(positionId);
    credit.push(row);
  });

  const unchanged =
    credit.length === stored.length && credit.every((row, i) => row === stored[i]);
  if (unchanged) return data;
  return { ...data, wire: { ...data.wire, credit } };
}

export function additionalInfoSignature(data: AdditionalInfo): string {
  return JSON.stringify(normalizeAdditionalInfo(data));
}

export function getAdditionalInfoDisplayRows(
  raw: unknown,
): Array<{ label: string; value: string }> {
  const data = normalizeAdditionalInfo(raw);
  const rows: Array<{ label: string; value: string }> = [];
  if (data.sourceOfRevenue.length > 0) {
    rows.push({
      label: "Source of revenue",
      value: data.sourceOfRevenue.join(", "),
    });
  }
  if (String(data.businessModel).trim() !== "") {
    rows.push({ label: "Business Model", value: String(data.businessModel).trim() });
  }
  if (String(data.onlinePresence).trim() !== "") {
    rows.push({
      label: "Online Presence",
      value: String(data.onlinePresence).trim(),
    });
  }
  if (String(data.pros).trim() !== "") {
    rows.push({ label: "Pros", value: String(data.pros).trim() });
  }
  if (String(data.cons).trim() !== "") {
    rows.push({ label: "Cons", value: String(data.cons).trim() });
  }
  return rows;
}

export function additionalInfoHasData(raw: unknown): boolean {
  return getAdditionalInfoDisplayRows(raw).length > 0 || wireHasData(raw);
}

export function isAdditionalInfoNoteContent(content: unknown): boolean {
  return String(content ?? "").startsWith(ADDITIONAL_INFO_NOTE_PREFIX);
}

export function encodeAdditionalInfoNote(data: AdditionalInfo): string {
  return `${ADDITIONAL_INFO_NOTE_PREFIX}${JSON.stringify(normalizeAdditionalInfo(data))}`;
}

export function decodeAdditionalInfoNote(content: unknown): AdditionalInfo | null {
  const raw = String(content ?? "");
  if (!raw.startsWith(ADDITIONAL_INFO_NOTE_PREFIX)) return null;
  try {
    return normalizeAdditionalInfo(
      JSON.parse(raw.slice(ADDITIONAL_INFO_NOTE_PREFIX.length)),
    );
  } catch {
    return null;
  }
}

export function additionalInfoStorageKey(applicationId: string): string {
  return `finexus.additionalInfo.${applicationId}`;
}
