import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WHITE_VEIL } from "./sectionBarStyles";

export const SOURCE_OF_REVENUE_OPTIONS = [
  "ACH",
  "Wires",
  "Cash Deposit",
  "Mobile deposit",
  "Zelle",
  "Cash App",
  "Others",
];

export const EMPTY_ADDITIONAL_INFO = {
  sourceOfRevenue: [],
  businessModel: "",
  onlinePresence: "",
  pros: "",
  cons: "",
  wire: { credit: [], debit: [] },
};

// Normalize a wire side ([{date, amount, description, positionId?}]).
function normalizeWireSide(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = {
      date: String(r?.date ?? ""),
      amount: String(r?.amount ?? ""),
      description: String(r?.description ?? ""),
    };
    // Rows generated from a Positions row carry that row's id.
    const positionId = String(r?.positionId ?? "");
    if (positionId) row.positionId = positionId;
    return row;
  });
}

export function normalizeAdditionalInfo(raw) {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_ADDITIONAL_INFO, sourceOfRevenue: [] };
  }
  let sourceOfRevenue = [];
  if (Array.isArray(raw.sourceOfRevenue)) {
    sourceOfRevenue = raw.sourceOfRevenue
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
  } else if (typeof raw.sourceOfRevenue === "string" && raw.sourceOfRevenue.trim()) {
    sourceOfRevenue = raw.sourceOfRevenue
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return {
    sourceOfRevenue,
    businessModel: String(raw.businessModel ?? ""),
    onlinePresence: String(raw.onlinePresence ?? ""),
    pros: String(raw.pros ?? ""),
    cons: String(raw.cons ?? ""),
    wire: {
      credit: normalizeWireSide(raw.wire?.credit),
      debit: normalizeWireSide(raw.wire?.debit),
      // Position ids whose funding wire the user deleted by hand; never re-created.
      positionWiresDismissed: Array.isArray(raw.wire?.positionWiresDismissed)
        ? raw.wire.positionWiresDismissed.map((k) => String(k ?? "")).filter(Boolean)
        : [],
    },
  };
}

/** Rows that have values — empty fields are omitted from preview tables. */
export function getAdditionalInfoDisplayRows(raw) {
  const data = normalizeAdditionalInfo(raw);
  const rows = [];
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
    rows.push({ label: "Online Presence", value: String(data.onlinePresence).trim() });
  }
  if (String(data.pros).trim() !== "") {
    rows.push({ label: "Pros", value: String(data.pros).trim() });
  }
  if (String(data.cons).trim() !== "") {
    rows.push({ label: "Cons", value: String(data.cons).trim() });
  }
  return rows;
}

export function additionalInfoHasData(raw) {
  return getAdditionalInfoDisplayRows(raw).length > 0 || wireHasData(raw);
}

// ── Shared wire helpers (used by the editable table and the read-only preview) ──────────────
function wireParseAmount(s) {
  const n = parseFloat(String(s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function wireFormatTotal(n) {
  return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function wireIsoToUS(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[2]}-${m[3]}-${m[1]}` : String(iso || "");
}
function wireGroupByMonth(rows) {
  const groups = new Map();
  (rows || []).forEach((r) => {
    const key = /^\d{4}-\d{2}/.test(String(r.date || "")) ? String(r.date).slice(0, 7) : "Undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  return [...groups.entries()].sort((a, b) =>
    a[0] === "Undated" ? 1 : b[0] === "Undated" ? -1 : a[0].localeCompare(b[0])
  );
}
function wireMonthLabelText(key) {
  if (key === "Undated") return "Undated";
  const d = new Date(key + "-01T00:00:00");
  return isNaN(d.getTime()) ? key : d.toLocaleString("en-US", { month: "long", year: "numeric" });
}
// Band across the top of each wire table: green for credit, dark red for debit.
/* Status-chip palette: a light tinted band with matching coloured text
   (green on mint for credit, red on pink for debit) — same as the
   APPROVED / DECLINED chips. */
/* Deepened in steps from #e7f8ed / #fdecec — each step blends toward that side's own text
   colour rather than toward black, so they stay mint/pink instead of turning grey.
   Current values are 15% deeper again than #d3eddc / #f9d9d9. */
const WIRE_SIDE_TAB_COLOR = { credit: "#b8dfc4", debit: "#f3bfbf" };
const WIRE_SIDE_TAB_TEXT = { credit: "#1e8e3e", debit: "#d32f2f" };
function wireSideTabStyle(side) {
  const fill = WIRE_SIDE_TAB_COLOR[side] || WIRE_SIDE_TAB_COLOR.credit;
  const text = WIRE_SIDE_TAB_TEXT[side] || WIRE_SIDE_TAB_TEXT.credit;
  // Same eased white veil as every other section bar (see sectionBarStyles.js) so the fade reads
  // as one design language. backgroundColor stays as the flat fallback: copy/paste into email
  // keeps whichever it understands.
  return {
    backgroundColor: fill,
    backgroundImage: WHITE_VEIL,
    color: text,
  };
}

// Credit and Debit sit side by side under one heading, so each side owns half the width.
const WIRE_SIDE_ORDER = ["debit", "credit"];

// Month subtotal rows read as separators, so they carry a stronger tint than the body rows.
const WIRE_MONTH_FILL = "rgba(174, 214, 239, 0.18)";
const WIRE_MONTH_CELL_STYLE = {
  borderColor: "var(--ledgerx-border)",
  background: WIRE_MONTH_FILL,
  backgroundColor: WIRE_MONTH_FILL,
};

const WIRE_HEADER_FILL = "rgba(174, 214, 239, 0.85)";
const WIRE_HEADER_CELL_STYLE = {
  borderColor: "var(--ledgerx-border)",
  background: WIRE_HEADER_FILL,
  backgroundColor: WIRE_HEADER_FILL,
};

// Literal capitalized label (not CSS text-transform) so it survives copy/paste into email.
const WIRE_SIDE_LABEL = { credit: "Credit", debit: "Debit" };
function wireSideLabel(side) {
  return WIRE_SIDE_LABEL[side] || (side ? side.charAt(0).toUpperCase() + side.slice(1) : "");
}

/** Stable id for a Positions row, so its funding wire can follow it. */
export function newPositionWireId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Give every Positions row a wireId, keeping the ones it already has. */
export function withPositionWireIds(positions) {
  if (!Array.isArray(positions)) return positions;
  let changed = false;
  const next = positions.map((pos) => {
    if (!pos || typeof pos !== "object") return pos;
    if (String(pos.wireId ?? "").trim() !== "") return pos;
    changed = true;
    return { ...pos, wireId: newPositionWireId() };
  });
  return changed ? next : positions;
}

/**
 * Every funded position is a wire in. Build the credit row each position owns:
 * one per row that has a start date and an amount funded, described as
 * "Funding wire- <Lender>" and tagged with the position's id.
 */
function positionFundingWireRows(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.reduce((rows, pos) => {
    const positionId = String(pos?.wireId ?? "").trim();
    if (!positionId) return rows;
    const date = String(pos?.startingDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return rows;
    const amount = wireParseAmount(pos?.amountFunded);
    if (!(amount > 0)) return rows;
    const lender = String(pos?.lender ?? "").trim();
    rows.push({
      date,
      amount: amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      description: lender ? `Funding wire- ${lender}` : "Funding wire",
      positionId,
    });
    return rows;
  }, []);
}

function sameWireRow(a, b) {
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
 * id — never by its text — so renaming a funder edits that one row instead of
 * adding one per keystroke, and deleting the position deletes its wire. Rows the
 * user typed by hand have no position id and are never touched. A generated row
 * the user deletes is remembered in `wire.positionWiresDismissed` and not
 * re-created.
 *
 * Pure: same input always gives the same result, so it is safe inside a state
 * updater, and it returns the same object when nothing changed.
 */
export function syncWireCreditFromPositions(raw, positions) {
  const data = normalizeAdditionalInfo(raw);
  const stored = data.wire.credit || [];
  const dismissed = new Set(data.wire.positionWiresDismissed || []);

  const generated = positionFundingWireRows(positions).filter(
    (row) => !dismissed.has(row.positionId)
  );
  const byPositionId = new Map(generated.map((row) => [row.positionId, row]));

  const used = new Set();
  const credit = [];
  stored.forEach((row) => {
    const positionId = String(row.positionId ?? "");
    if (positionId) {
      const desired = byPositionId.get(positionId);
      // Position gone, no longer funded, or dismissed → its wire goes with it.
      if (!desired || used.has(positionId)) return;
      used.add(positionId);
      credit.push(sameWireRow(row, desired) ? row : desired);
      return;
    }
    // Rows saved before positions carried ids: adopt the one that matches exactly,
    // so it keeps following its position instead of being duplicated.
    const match = generated.find(
      (g) => !used.has(g.positionId) && sameWireRow({ ...g, positionId: "" }, { ...row, positionId: "" })
    );
    if (match) {
      used.add(match.positionId);
      credit.push(match);
      return;
    }
    credit.push(row);
  });

  generated.forEach((row) => {
    if (used.has(row.positionId)) return;
    used.add(row.positionId);
    credit.push(row);
  });

  const unchanged =
    credit.length === stored.length && credit.every((row, i) => row === stored[i]);
  if (unchanged) return raw;
  return { ...data, wire: { ...data.wire, credit } };
}

export function wireHasData(raw) {
  const w = normalizeAdditionalInfo(raw).wire || { credit: [], debit: [] };
  return (w.credit?.length || 0) + (w.debit?.length || 0) > 0;
}

// Read-only wire table (one side), grouped by month with subtotals — for previews/PDF.
function WirePreviewSide({ side, rows }) {
  const groups = wireGroupByMonth(rows);
  return (
    <div>
      <div
                      className={`rounded-lg overflow-hidden border mca-wire-card-${side}`}
                      style={{ borderColor: "var(--ledgerx-border)" }}
                    >
        {/* Side label is a full-width solid band inside the table frame, above the column headers. */}
        <div
          className="px-3 py-2 text-xs font-semibold tracking-wide text-center mca-wire-bar"
          style={wireSideTabStyle(side)}
        >
          {wireSideLabel(side)}
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr
              className="font-semibold text-slate-700 uppercase tracking-wide text-xs border-b mca-wire-head"
              style={{ borderColor: "var(--ledgerx-border)" }}
            >
              {/* Fill sits on the th cells (not just the tr): preview containers force a
                  flat `[&_th]:bg-slate-50` fill that would otherwise paint over the row. */}
              <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)", width: "28%" }}>Date</th>
              <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)", width: "24%" }}>Amount</th>
              <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-slate-400 px-2 py-1 border" style={{ borderColor: "var(--ledgerx-border)" }}>—</td>
              </tr>
            ) : (
              groups.map(([monthKey, entries]) => {
                const subtotal = entries.reduce((s, r) => s + wireParseAmount(r.amount), 0);
                return (
                  <Fragment key={monthKey}>
                    <tr style={{ background: WIRE_MONTH_FILL }}>
                      <td className="border px-2 py-1 font-bold text-black mca-strong" style={WIRE_MONTH_CELL_STYLE}>
                        {wireMonthLabelText(monthKey)}
                        <span className="ml-1 text-slate-500 font-normal">({entries.length})</span>
                      </td>
                      <td className="border px-2 py-1 text-left font-bold text-black mca-strong" style={WIRE_MONTH_CELL_STYLE}>
                        {wireFormatTotal(subtotal)}
                      </td>
                      <td className="border px-2 py-1" style={WIRE_MONTH_CELL_STYLE}></td>
                    </tr>
                    {entries.map((r, i) => (
                      <tr key={i}>
                        <td className="border px-2 py-1 text-[#000000]" style={{ borderColor: "var(--ledgerx-border)" }}>{wireIsoToUS(r.date)}</td>
                        <td className="border px-2 py-1 text-[#000000]" style={{ borderColor: "var(--ledgerx-border)" }}>{r.amount ? "$" + r.amount : ""}</td>
                        <td className="border px-2 py-1 text-[#000000]" style={{ borderColor: "var(--ledgerx-border)", whiteSpace: "pre-wrap" }}>{r.description || ""}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Read-only Additional Info for preview modals.
 * Renders nothing when there is no data; omits empty field rows.
 */
export function AdditionalInfoPreview({ value = EMPTY_ADDITIONAL_INFO, className = "" }) {
  const rows = getAdditionalInfoDisplayRows(value);
  const wire = normalizeAdditionalInfo(value).wire || { credit: [], debit: [] };
  const showWire = (wire.credit?.length || 0) + (wire.debit?.length || 0) > 0;
  if (rows.length === 0 && !showWire) return null;

  return (
    <div
      className={`w-full overflow-x-auto rounded-xl ${className}`.trim()}
      style={{ border: "1px solid var(--ledgerx-border)" }}
      data-additional-info-preview="true"
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 rounded-t-lg backdrop-blur-sm flex-wrap h-[40px] mca-section-bar mca-live-section-head"
        style={{
          borderColor: "var(--ledgerx-border)",
          backgroundColor: "rgba(174, 214, 239, 0.75)",
        }}
      >
        <span className="font-semibold text-slate-700 uppercase tracking-wide text-sm">
          Additional Info &amp; Critical Wire Transactions
        </span>
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[700px] table-fixed text-sm border-collapse [&_td]:px-2 [&_td]:py-1.5">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "78%" }} />
          </colgroup>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.label}
                className={`bg-white ${index < rows.length - 1 || showWire ? "border-b" : ""}`}
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                <td
                  className="px-3 py-2 align-top border-r text-[#143c2e] text-sm font-medium mca-strong"
                  style={{ borderColor: "var(--ledgerx-border)" }}
                >
                  {row.label}
                </td>
                <td
                  className="px-3 py-2 align-middle text-sm font-medium text-[#000000]"
                  style={{ borderColor: "var(--ledgerx-border)", whiteSpace: "pre-wrap" }}
                >
                  {row.value}
                </td>
              </tr>
            ))}
            {showWire && (
              <Fragment>
                {/* The two sides sit side by side; the section heading above
                    covers them, so there is no separate band here. */}
                <tr className="bg-white">
                  <td
                    colSpan={2}
                    className="p-0 align-top"
                    style={{ padding: 0, borderTop: "1px solid var(--ledgerx-border)" }}
                  >
                    {/* A table (not flex/grid) so the two-column layout survives copy/paste into email. */}
                    <table className="w-full table-fixed border-collapse">
                      <tbody>
                        <tr>
                          {WIRE_SIDE_ORDER.map((side) => (
                            <td key={side} className="align-top" style={{ width: "50%", padding: "4px", verticalAlign: "top" }}>
                              <WirePreviewSide side={side} rows={wire[side]} />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </Fragment>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SOURCE_DROPDOWN_MAX_HEIGHT = 288; // max-h-72
const SOURCE_DROPDOWN_GAP = 4;

/**
 * Additional Info table — matches Offer / Leverage card styling on Financial Analysis.
 */
export default function AdditionalInfoSection({
  value = EMPTY_ADDITIONAL_INFO,
  onChange,
}) {
  const data = normalizeAdditionalInfo(value);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const [customSourceInput, setCustomSourceInput] = useState("");
  const [collapsedWireMonths, setCollapsedWireMonths] = useState({});
  const sourceFieldRef = useRef(null);
  const sourceTriggerRef = useRef(null);
  const sourceDropdownRef = useRef(null);

  const updateDropdownPosition = () => {
    const trigger = sourceTriggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = SOURCE_DROPDOWN_GAP;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward =
      spaceBelow < Math.min(SOURCE_DROPDOWN_MAX_HEIGHT, 200) &&
      spaceAbove > spaceBelow;
    const available = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(
      120,
      Math.min(SOURCE_DROPDOWN_MAX_HEIGHT, available)
    );
    const width = Math.min(Math.max(rect.width, 180), 420);

    if (openUpward) {
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight,
        zIndex: 60,
      });
    } else {
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width,
        top: rect.bottom + gap,
        maxHeight,
        zIndex: 60,
      });
    }
  };

  useEffect(() => {
    if (!showSourceDropdown) return undefined;

    updateDropdownPosition();

    const handleClickOutside = (e) => {
      const inField =
        sourceFieldRef.current && sourceFieldRef.current.contains(e.target);
      const inDropdown =
        sourceDropdownRef.current && sourceDropdownRef.current.contains(e.target);
      if (!inField && !inDropdown) {
        setShowSourceDropdown(false);
      }
    };
    const handleReposition = () => updateDropdownPosition();

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleReposition);
    // Capture scroll from nested containers as well as the page.
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [showSourceDropdown]);

  // Keep menu attached when selected chips wrap and change trigger height.
  useEffect(() => {
    if (!showSourceDropdown) return;
    updateDropdownPosition();
  }, [showSourceDropdown, data.sourceOfRevenue]);

  const updateField = (field, nextValue) => {
    if (typeof onChange !== "function") return;
    onChange({
      ...data,
      [field]: nextValue,
    });
  };

  // Wire transaction helpers (credit / debit sides, unlimited rows each).
  const wire = data.wire && typeof data.wire === "object" ? data.wire : { credit: [], debit: [] };
  const emptyWireRow = { date: "", amount: "", description: "" };
  const setWireSide = (side, rows) => updateField("wire", { ...wire, [side]: rows });
  const addWireRow = (side) => setWireSide(side, [...(wire[side] || []), { ...emptyWireRow }]);
  const changeWireRow = (side, i, field, val) =>
    setWireSide(side, (wire[side] || []).map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const removeWireRow = (side, i) => {
    const rows = wire[side] || [];
    const removed = rows[i];
    const nextRows = rows.filter((_, idx) => idx !== i);
    const positionId = String(removed?.positionId ?? "");
    if (positionId) {
      // Remember it, or the Positions sync would put the row straight back.
      const dismissed = Array.isArray(wire.positionWiresDismissed) ? wire.positionWiresDismissed : [];
      updateField("wire", {
        ...wire,
        [side]: nextRows,
        positionWiresDismissed: dismissed.includes(positionId) ? dismissed : [...dismissed, positionId],
      });
      return;
    }
    setWireSide(side, nextRows);
  };

  // US currency helpers.
  const parseWireAmount = (s) => {
    const n = parseFloat(String(s ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const formatWireAmount = (s) => {
    const raw = String(s ?? "").trim();
    if (raw === "") return "";
    const n = parseWireAmount(raw);
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const formatWireTotal = (n) =>
    "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const wireRowMonthKey = (r) =>
    /^\d{4}-\d{2}/.test(String(r.date || "")) ? String(r.date).slice(0, 7) : "Undated";

  /**
   * Hold a side's month grouping still while one of its date fields has focus.
   *
   * Chromium reports every step inside an open date picker — month arrows
   * included — as an `input` event, which React delivers as onChange. Regrouping
   * on that would move the row's <tr> under a different month's <Fragment>, so
   * React unmounts the focused <input> and mounts a new one, and the open picker
   * goes with it. Freezing each row's month key on focus keeps the element in
   * place for the whole interaction; the rows regroup on blur.
   */
  const [wireGroupFreeze, setWireGroupFreeze] = useState(null);
  const freezeWireGroups = (side) => {
    const keys = {};
    (wire[side] || []).forEach((r, idx) => {
      keys[idx] = wireRowMonthKey(r);
    });
    setWireGroupFreeze({ side, keys });
  };
  const unfreezeWireGroups = () => setWireGroupFreeze(null);

  // Group a side's rows by month (YYYY-MM) keeping each row's original index for editing.
  const wireMonthGroups = (side) => {
    const rows = wire[side] || [];
    const frozen =
      wireGroupFreeze && wireGroupFreeze.side === side ? wireGroupFreeze.keys : null;
    const groups = new Map();
    rows.forEach((r, idx) => {
      const key = frozen && frozen[idx] != null ? frozen[idx] : wireRowMonthKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ r, idx });
    });
    return [...groups.entries()].sort((a, b) =>
      a[0] === "Undated" ? 1 : b[0] === "Undated" ? -1 : a[0].localeCompare(b[0])
    );
  };
  const wireMonthLabel = (key) => {
    if (key === "Undated") return "Undated";
    const d = new Date(key + "-01T00:00:00");
    return isNaN(d.getTime()) ? key : d.toLocaleString("en-US", { month: "long", year: "numeric" });
  };
  const toggleWireMonth = (side, key) =>
    setCollapsedWireMonths((prev) => ({ ...prev, [`${side}:${key}`]: !prev[`${side}:${key}`] }));

  const toggleSource = (option) => {
    const selected = Array.isArray(data.sourceOfRevenue) ? data.sourceOfRevenue : [];
    const next = selected.includes(option)
      ? selected.filter((v) => v !== option)
      : [...selected, option];
    updateField("sourceOfRevenue", next);
  };

  const removeSource = (option) => {
    const selected = Array.isArray(data.sourceOfRevenue) ? data.sourceOfRevenue : [];
    updateField(
      "sourceOfRevenue",
      selected.filter((v) => v !== option)
    );
  };

  const commitCustomSource = () => {
    const trimmed = customSourceInput.trim();
    if (!trimmed) {
      setCustomSourceInput("");
      return;
    }
    const selected = Array.isArray(data.sourceOfRevenue) ? data.sourceOfRevenue : [];
    if (!selected.includes(trimmed)) {
      updateField("sourceOfRevenue", [...selected, trimmed]);
    }
    setCustomSourceInput("");
  };

  const selectedSources = Array.isArray(data.sourceOfRevenue) ? data.sourceOfRevenue : [];

  const sourceDropdown =
    showSourceDropdown &&
    dropdownStyle &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={sourceDropdownRef}
        className="overflow-hidden rounded-xl border bg-white shadow-xl text-sm overflow-y-auto"
        style={{
          ...dropdownStyle,
          borderColor: "var(--ledgerx-border)",
        }}
      >
        {SOURCE_OF_REVENUE_OPTIONS.map((opt) => {
          const isSelected = selectedSources.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleSource(opt)}
              className="flex w-full items-center justify-between gap-3 border-b last:border-b-0 px-4 py-2.5 text-left hover:bg-slate-50"
              style={{ borderColor: "rgba(148, 163, 184, 0.16)" }}
            >
              <span className="text-[13px] font-semibold text-slate-800">{opt}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  isSelected
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {isSelected ? "Selected" : "Select"}
              </span>
            </button>
          );
        })}
      </div>,
      document.body
    );

  return (
    <div
      className="w-full overflow-x-auto rounded-xl"
      style={{ border: "1px solid var(--ledgerx-border)" }}
    >
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 rounded-t-lg backdrop-blur-sm flex-wrap h-[40px] mca-section-bar mca-live-section-head"
        style={{
          borderColor: "var(--ledgerx-border)",
          backgroundColor: "rgba(174, 214, 239, 0.75)",
        }}
      >
        <span className="font-semibold text-slate-700 uppercase tracking-wide text-sm">
          Additional Info &amp; Critical Wire Transactions
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] table-fixed text-sm border-collapse [&_td]:px-2 [&_td]:py-1.5">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "78%" }} />
          </colgroup>
          <tbody>
            <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
              <td
                className="px-3 py-2 align-middle border-r text-[#143c2e] text-sm font-medium"
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                Source of revenue
              </td>
              <td className="px-3 py-2 align-middle" style={{ borderColor: "var(--ledgerx-border)" }}>
                <div className="flex w-full flex-col gap-1.5" ref={sourceFieldRef}>
                  <button
                    ref={sourceTriggerRef}
                    type="button"
                    onClick={() =>
                      setShowSourceDropdown((prev) => {
                        const next = !prev;
                        if (next) {
                          requestAnimationFrame(() => updateDropdownPosition());
                        } else {
                          setDropdownStyle(null);
                        }
                        return next;
                      })
                    }
                    className="flex min-h-[38px] w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-sm text-slate-800 bg-white focus:outline-none"
                    style={{ borderColor: "var(--ledgerx-border)" }}
                  >
                    {selectedSources.length > 0 ? (
                      selectedSources.map((name) => (
                        <span
                          key={name}
                          className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 shadow-sm border border-slate-200 text-xs"
                        >
                          <span>{name}</span>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSource(name);
                            }}
                            className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-700"
                          >
                            ✕
                          </span>
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 px-1 text-xs">Select source of revenue</span>
                    )}
                    <span className="ml-auto text-base text-slate-400">▾</span>
                  </button>
                  {sourceDropdown}
                  <input
                    type="text"
                    value={customSourceInput}
                    onChange={(e) => setCustomSourceInput(e.target.value)}
                    onBlur={commitCustomSource}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCustomSource();
                      }
                    }}
                    placeholder="+ Enter custom source of revenue"
                    className="w-full rounded border px-2 py-1 text-xs text-slate-600 bg-slate-50/80 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus:bg-white"
                    style={{ borderColor: "var(--ledgerx-border)" }}
                    aria-label="Enter custom source of revenue (optional)"
                  />
                </div>
              </td>
            </tr>

            <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
              <td
                className="px-3 py-2 align-middle border-r text-[#143c2e] text-sm font-medium"
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                Business Model
              </td>
              <td className="px-3 py-2 align-middle" style={{ borderColor: "var(--ledgerx-border)" }}>
                <input
                  type="text"
                  value={data.businessModel}
                  onChange={(e) => updateField("businessModel", e.target.value)}
                  placeholder="Enter business model"
                  className="w-full rounded border px-2 py-1.5 text-sm text-[#000000] font-medium bg-white focus:outline-none focus:ring-0"
                  style={{ borderColor: "var(--ledgerx-border)" }}
                />
              </td>
            </tr>

            <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
              <td
                className="px-3 py-2 align-middle border-r text-[#143c2e] text-sm font-medium"
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                Online Presence
              </td>
              <td className="px-3 py-2 align-middle" style={{ borderColor: "var(--ledgerx-border)" }}>
                <input
                  type="text"
                  value={data.onlinePresence}
                  onChange={(e) => updateField("onlinePresence", e.target.value)}
                  placeholder="Website or social media URL"
                  className="w-full rounded border px-2 py-1.5 text-sm text-[#000000] font-medium bg-white focus:outline-none focus:ring-0"
                  style={{ borderColor: "var(--ledgerx-border)" }}
                />
              </td>
            </tr>

            <tr className="bg-white border-b" style={{ borderColor: "var(--ledgerx-border)" }}>
              <td
                className="px-3 py-2 align-top border-r text-[#143c2e] text-sm font-medium"
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                Pros
              </td>
              <td className="px-3 py-2 align-middle" style={{ borderColor: "var(--ledgerx-border)" }}>
                <textarea
                  value={data.pros}
                  onChange={(e) => updateField("pros", e.target.value)}
                  placeholder="Enter pros"
                  rows={2}
                  className="w-full rounded border px-2 py-1.5 text-sm text-[#000000] font-medium bg-white focus:outline-none focus:ring-0 resize-y"
                  style={{ borderColor: "var(--ledgerx-border)", whiteSpace: "pre-wrap" }}
                />
              </td>
            </tr>

            <tr className="bg-white" style={{ borderColor: "var(--ledgerx-border)" }}>
              <td
                className="px-3 py-2 align-top border-r text-[#143c2e] text-sm font-medium"
                style={{ borderColor: "var(--ledgerx-border)" }}
              >
                Cons
              </td>
              <td className="px-3 py-2 align-middle" style={{ borderColor: "var(--ledgerx-border)" }}>
                <textarea
                  value={data.cons}
                  onChange={(e) => updateField("cons", e.target.value)}
                  placeholder="Enter cons"
                  rows={2}
                  className="w-full rounded border px-2 py-1.5 text-sm text-[#000000] font-medium bg-white focus:outline-none focus:ring-0 resize-y"
                  style={{ borderColor: "var(--ledgerx-border)", whiteSpace: "pre-wrap" }}
                />
              </td>
            </tr>

            {/* Wire — Credit & Debit transaction lists side by side, unlimited rows each side.
                Covered by the section heading above, so no separate band here. */}
            <tr className="bg-white">
              <td
                colSpan={2}
                className="p-0 align-top border-t"
                style={{ padding: 0, borderColor: "var(--ledgerx-border)" }}
              >
                <table className="w-full table-fixed border-collapse">
                  <tbody>
                    <tr>
                      {WIRE_SIDE_ORDER.map((side) => (
                        <td key={side} className="align-top" style={{ width: "50%", padding: "4px", verticalAlign: "top" }}>
                    <div
                      className={`rounded-lg overflow-hidden border mca-wire-card-${side}`}
                      style={{ borderColor: "var(--ledgerx-border)" }}
                    >
                    {/* Side label and the column header row below it share one tint→white band
                        painted by the card, so they read as a single header block. */}
                    <div className="relative px-3 py-2 mca-wire-bar" style={wireSideTabStyle(side)}>
                      <div className="text-xs font-semibold tracking-wide text-center">
                        {wireSideLabel(side)}
                      </div>
                      <div className="absolute inset-y-0 right-2 flex items-center">
                        <button
                          type="button"
                          onClick={() => addWireRow(side)}
                          title={`Add ${side}`}
                          aria-label={`Add ${side}`}
                          className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border text-sm font-semibold leading-none text-white hover:bg-white/20 focus:outline-none"
                          style={{ borderColor: "rgba(255, 255, 255, 0.9)" }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr
                          className="font-semibold text-slate-700 uppercase tracking-wide text-xs border-b mca-wire-head"
                          style={{ borderColor: "var(--ledgerx-border)" }}
                        >
                          <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)", width: "32%", minWidth: "116px" }}>Date</th>
                          <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)", width: "24%" }}>Amount</th>
                          <th className="text-left px-2 py-2 border" style={{ borderColor: "var(--ledgerx-border)" }}>Description</th>
                          <th className="border w-8" style={{ borderColor: "var(--ledgerx-border)" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(wire[side] || []).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="text-slate-400 px-2 py-1 border" style={{ borderColor: "var(--ledgerx-border)" }}>
                              No {side} wires. Click “+ Add {side}”.
                            </td>
                          </tr>
                        ) : (
                          wireMonthGroups(side).map(([monthKey, entries]) => {
                            const collapsed = !!collapsedWireMonths[`${side}:${monthKey}`];
                            const subtotal = entries.reduce((s, e) => s + parseWireAmount(e.r.amount), 0);
                            return (
                              <Fragment key={monthKey}>
                                {/* Month group header — click to collapse, shows count + subtotal */}
                                <tr
                                  className="cursor-pointer select-none"
                                  style={{ background: "var(--color-sky-50)" }}
                                  onClick={() => toggleWireMonth(side, monthKey)}
                                >
                                  <td className="border px-2 py-1 font-semibold text-slate-600" style={{ borderColor: "var(--ledgerx-border)" }}>
                                    <span className="inline-block w-3 text-slate-400">{collapsed ? "▸" : "▾"}</span>
                                    {wireMonthLabel(monthKey)}
                                    <span className="ml-1 text-slate-400 font-normal">({entries.length})</span>
                                  </td>
                                  <td className="border px-2 py-1 text-left font-semibold text-slate-700" style={{ borderColor: "var(--ledgerx-border)" }}>
                                    {formatWireTotal(subtotal)}
                                  </td>
                                  <td className="border px-2 py-1" style={{ borderColor: "var(--ledgerx-border)" }}></td>
                                  <td className="border" style={{ borderColor: "var(--ledgerx-border)" }}></td>
                                </tr>
                                {!collapsed &&
                                  entries.map(({ r, idx }) => (
                                    <tr key={idx}>
                                      {/* Cell padding lives on the input so it fills the cell edge to edge. */}
                                      <td className="border p-0" style={{ borderColor: "var(--ledgerx-border)" }}>
                                        {/* A plain native date field — the browser owns the picker.
                                            Focus freezes this side's month grouping so the element
                                            survives the onChange the picker fires while it is open.
                                            The calendar indicator is stretched over the whole field and
                                            made transparent: clicking anywhere in the cell is a click on
                                            the native indicator, so the browser opens the picker itself. */}
                                        <input
                                          type="date"
                                          value={r.date || ""}
                                          onChange={(e) => changeWireRow(side, idx, "date", e.target.value)}
                                          onFocus={() => freezeWireGroups(side)}
                                          onBlur={unfreezeWireGroups}
                                          aria-label="Pick date"
                                          className="relative block w-full text-xs px-2 py-1 bg-white text-left cursor-pointer focus:outline-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                          style={{ border: "none", fontSize: "inherit" }}
                                        />
                                      </td>
                                      <td className="border px-1 py-0.5" style={{ borderColor: "var(--ledgerx-border)" }}>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-slate-400 text-xs">$</span>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={r.amount || ""}
                                            onChange={(e) => changeWireRow(side, idx, "amount", e.target.value)}
                                            onBlur={(e) => changeWireRow(side, idx, "amount", formatWireAmount(e.target.value))}
                                            placeholder="0.00"
                                            className="w-full text-xs px-1 py-0.5 bg-white focus:outline-none text-left"
                                          />
                                        </div>
                                      </td>
                                      <td className="border px-1 py-0.5" style={{ borderColor: "var(--ledgerx-border)" }}>
                                        <input
                                          type="text"
                                          value={r.description || ""}
                                          onChange={(e) => changeWireRow(side, idx, "description", e.target.value)}
                                          placeholder="Description"
                                          className="w-full text-xs px-1 py-0.5 bg-white focus:outline-none"
                                        />
                                      </td>
                                      <td className="border text-center" style={{ borderColor: "var(--ledgerx-border)" }}>
                                        <button
                                          type="button"
                                          onClick={() => removeWireRow(side, idx)}
                                          title="Remove row"
                                          aria-label="Remove row"
                                          className="mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-[3px] border text-sm leading-none text-slate-500 hover:border-red-400 hover:text-red-600 focus:outline-none"
                                          style={{ borderColor: "var(--ledgerx-border)" }}
                                        >
                                          −
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                        </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
