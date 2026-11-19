import { WHITE_VEIL } from "./sectionBarStyles";

/**
 * Declined card for the preview modals, built from the live page's version.
 *
 * Previously each preview printed the decline as a bare line of text
 * ("Decline reason: ..."), which did not match the live page and read as an
 * afterthought next to the real sections. This is the live card — red outline,
 * pink title bar, "Reason:" beneath — rebuilt to the previews' own conventions
 * so it survives the copy-to-email pipeline:
 *
 *   - `mca-section-bar` on the title row, so it is centred, Calibri 16, bold
 *     and uppercased in email alongside OFFER / LEVERAGE / BANK ANALYSIS.
 *   - The shared WHITE_VEIL over the pink base, so the bar fades to white at
 *     its bottom edge like every other bar rather than ending on a hard line.
 *   - Everything that matters set inline. Class-driven colour is rewritten by
 *     the clipboard pipeline; inline values come through.
 *
 * The live page's Edit/Delete buttons are deliberately absent — a preview is
 * a read-only rendering.
 */
export default function DeclinedOfferPreviewCard({ reason }) {
  const text = String(reason || "").trim();
  return (
    <div
      className="w-full overflow-hidden mb-4 mca-declined-card"
      style={{
        border: "1px solid #ef4444",
        borderRadius: "14px",
        backgroundColor: "#ffffff",
      }}
    >
      <div
        className="px-4 py-2.5 mca-section-bar"
        style={{
          backgroundColor: "#f3bfbf",
          backgroundImage: WHITE_VEIL,
          color: "#0f172a",
          fontWeight: 700,
          /* Centred inline as well as by the .mca-section-bar rule. The rule
             centres a flex bar with justify-content, which does nothing once
             the copy pipeline flattens the layout for email — the title drifted
             off-centre there. text-align works in both. */
          display: "block",
          textAlign: "center",
        }}
      >
        <span style={{ textAlign: "center" }}>Declined</span>
      </div>
      <div
        className="px-4 py-2.5 text-[16px]"
        style={{ backgroundColor: "#ffffff", borderTop: "1px solid #f3bfbf" }}
      >
        <span style={{ fontWeight: 600, color: "#475569", marginRight: "6px" }}>
          Reason:
        </span>
        <span style={{ color: "#0f172a", whiteSpace: "pre-wrap" }}>
          {text || "No reason provided."}
        </span>
      </div>
    </div>
  );
}
