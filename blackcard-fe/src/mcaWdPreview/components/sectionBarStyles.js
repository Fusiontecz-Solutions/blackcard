/**
 * Shared "section bar" gradients.
 *
 * Every coloured header bar in the tool (OFFER, Bank Analysis, Positions,
 * Leverage, the preview modals ...) is built the same way: a solid base colour
 * with a white veil laid over it that ramps from fully transparent at the top
 * to opaque white at the bottom edge.
 *
 * Mixing with a veil rather than interpolating between two hex colours is what
 * keeps the fade neutral — the old "colour -> #ffffff" two-stop version drifted
 * through a muddy mid-tone and read as a hard stripe. The stops below are
 * deliberately uneven so the ramp eases out instead of stepping, and the veil
 * stays under 15% through the first half of the bar so label text (white on
 * green, slate on blue) keeps its contrast.
 *
 * Keep this in sync with the `[style*="aed6ef"]` rule in app/globals.css, which
 * applies the same veil to bars that only set an inline background colour.
 */

/** Green used by the OFFER bar — the softer sage the design calls for. */
export const SECTION_GREEN = "#5f9a60";
/** Blue used by Bank Analysis / Positions / Leverage bars. */
export const SECTION_BLUE = "#aed6ef";
/** Wire-transaction side bars. */
export const SECTION_DEBIT = "#f3c9c9";
export const SECTION_CREDIT = "#c2e2cd";

export const WHITE_VEIL =
  "linear-gradient(180deg," +
  " rgba(255,255,255,0) 0%," +
  " rgba(255,255,255,0.04) 40%," +
  " rgba(255,255,255,0.14) 58%," +
  " rgba(255,255,255,0.34) 72%," +
  " rgba(255,255,255,0.62) 84%," +
  " rgba(255,255,255,0.86) 93%," +
  " rgba(255,255,255,1) 100%)";

function veiled(baseColor, textColor) {
  const style = {
    backgroundColor: baseColor,
    backgroundImage: WHITE_VEIL,
  };
  if (textColor) style.color = textColor;
  return style;
}

/**
 * OFFER bar — white text on green.
 *
 * Its veil stops at 70% rather than running all the way to white: the bottom
 * edge keeps a visible green tint instead of dissolving into the table, which
 * is what gives the bar a defined base.
 */
const GREEN_VEIL =
  "linear-gradient(180deg," +
  " rgba(255,255,255,0) 0%," +
  " rgba(255,255,255,0) 44%," +
  " rgba(255,255,255,0.12) 56%," +
  " rgba(255,255,255,0.30) 68%," +
  " rgba(255,255,255,0.50) 80%," +
  " rgba(255,255,255,0.62) 91%," +
  " rgba(255,255,255,0.70) 100%)";

export function greenBarStyle() {
  return {
    backgroundColor: SECTION_GREEN,
    backgroundImage: GREEN_VEIL,
  };
}

/** Bank Analysis / Positions / Leverage bars — dark text on blue. */
export function blueBarStyle() {
  return veiled(SECTION_BLUE);
}

/*
 * "Merged header" cards — Bank Analysis, Positions, Bank Total.
 *
 * The section title row and the column-header row read as ONE band: blue at the
 * top edge, fully white by the bottom of the column headers, with a hairline as
 * the only divider between them.
 *
 * Each row paints its OWN slice of that band rather than sitting transparently
 * on a gradient painted by the card. Transparent rows looked right on the main
 * page but came out plain white inside the preview modals — a table row is not a
 * reliable window onto its ancestor's background once blur layers, `bg-white/90`
 * utilities and the capture pipeline are in play. Painting per row removes that
 * dependency: the slices are tuned to butt up against each other (the title row
 * ends near 0.46 alpha, the header row picks up at 0.42 and fades out), so they
 * still read as one continuous band.
 *
 * Pixel stops rather than percentages, so the band looks the same no matter how
 * tall either row ends up.
 *
 * `overflow: hidden` is what clips the table to the card's rounded corners.
 */
export const MERGED_CARD_STYLE = {
  borderColor: "var(--ledgerx-border)",
  overflow: "hidden",
  backgroundColor: "#ffffff",
};

/** Section title row inside a merged card — top slice of the band. */
export const MERGED_TITLE_STYLE = {
  // Deliberately carries NO background. The band is painted once by the card
  // (.mca-merged-card); a gradient here too meant the bar faded to white across
  // its own height and the header row then restarted the fade — a visible step
  // at the hairline instead of one continuous band. The hairline and typography
  // live in .mca-merged-bar.
};

/** Column-header row inside a merged card — the band fading out to white. */
export const MERGED_THEAD_STYLE = {
  // No background — see MERGED_TITLE_STYLE. .mca-merged-head-flat keeps this row
  // transparent so the card's single band shows through it.
  borderColor: "var(--ledgerx-border)",
};

/**
 * Column-header row for a STICKY thead inside a merged card.
 *
 * A sticky header can't be transparent — the body would scroll visibly through
 * it — so it repaints the tail of the card gradient itself, picking up where the
 * ~48px title row left off, over an opaque white base.
 */
export const MERGED_STICKY_THEAD_STYLE = {
  // No background — see MERGED_TITLE_STYLE.
};

/** Debit / Credit side bars on the wire-transaction panels. */
export function sideBarStyle(side) {
  return side === "debit"
    ? veiled(SECTION_DEBIT, "#c02626")
    : veiled(SECTION_CREDIT, "#1b7a36");
}
