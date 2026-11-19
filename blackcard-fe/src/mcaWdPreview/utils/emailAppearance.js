/**
 * Shared email-appearance baking for the preview copy pipeline.
 *
 * Extracted from the four preview modals, which each carried their own copy of
 * this logic. Keeping four duplicates meant a fix landed in some and not
 * others, and nothing was testable in isolation.
 *
 * Runs LAST in handleCopy — after cleanupEmailStyles and after
 * revealWatermarkThroughOrdinaryCells, both of which rewrite backgrounds.
 */
/* Email clients (Gmail, Outlook) drop CSS gradients and most text
   properties from pasted HTML, so anything that relies on them arrives
   blank — which is why the section bands pasted white and the uppercase
   headings pasted in mixed case.

   Bake both into the markup instead: flatten each gradient to the solid
   colour it averages to, and uppercase the text itself. The fade is lost
   (no email client can render it) but the colour and casing survive. */

/* Email colours are SAMPLED from the live gradient rather than hardcoded, so
   they track the design automatically. Hardcoded values drifted every time
   the band was retuned.

   The band is painted once by the card, with the title bar and header row
   transparent on top of it. For each of those rows we work out where it sits
   inside the card, read the gradient's alpha at that point, and blend it over
   the card's base colour — the same colour the browser is showing. */
function parseGradientStops(gradient) {
  const stops = [];
  const re = /rgba?\(([^)]+)\)\s*([\d.]+)px/g;
  let m;
  while ((m = re.exec(gradient))) {
    const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
    if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) continue;
    stops.push({
      r: parts[0], g: parts[1], b: parts[2],
      a: parts.length > 3 ? parts[3] : 1,
      pos: parseFloat(m[2]),
    });
  }
  return stops;
}

function sampleBandColor(cardEl, targetEl) {
  if (!cardEl || !targetEl) return null;
  const cs = window.getComputedStyle(cardEl);
  const stops = parseGradientStops(cs.getPropertyValue("background-image"));
  if (stops.length < 2) return null;

  const cardTop = cardEl.getBoundingClientRect().top;
  const rect = targetEl.getBoundingClientRect();
  /* Sample at 35% down the row, not the midpoint — the midpoint gives
     each row its average, which made the bar and header row land on similar
     mid tones and read as two flat blocks instead of a fade. */
  const y = rect.top - cardTop + rect.height * 0.35;

  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (y >= stops[i].pos && y <= stops[i + 1].pos) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = hi.pos - lo.pos;
  const t = span > 0 ? Math.max(0, Math.min(1, (y - lo.pos) / span)) : 0;
  const a = lo.a + (hi.a - lo.a) * t;
  const r = lo.r + (hi.r - lo.r) * t;
  const g = lo.g + (hi.g - lo.g) * t;
  const b = lo.b + (hi.b - lo.b) * t;

  // Blend over the card's own base colour.
  const baseM = /rgba?(([^)]+))/.exec(cs.getPropertyValue("background-color"));
  const base = baseM ? baseM[1].split(",").map((v) => parseFloat(v.trim())) : [255, 255, 255];
  const mix = (c, bc) => Math.round(c * a + (Number.isFinite(bc) ? bc : 255) * (1 - a));
  return `rgb(${mix(r, base[0])}, ${mix(g, base[1])}, ${mix(b, base[2])})`;
}

function flattenGradientToSolid(gradient) {
  // First colour stop in the gradient, blended over white at its own alpha.
  const m = /rgba?(([^)]+))/.exec(gradient || "");
  if (!m) return null;
  const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null;
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  // Half the stated alpha: a band is at full strength only at its very top,
  // so its own first stop over-states the average across the element.
  const eff = Math.max(0, Math.min(1, a * 0.5));
  const mix = (c) => Math.round(c * eff + 255 * (1 - eff));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function bakeEmailAppearance(origRoot, cloneRoot) {
  /* Pair elements by SELECTOR, not by walking both trees in parallel.
     handleCopy replaces the SVG charts with <img> in the clone before this
     runs, so the two trees diverge from the chart downwards — an index walk
     then matched the wrong nodes and every section below the chart (Bank
     Analysis, Leverage, Positions) was left uncoloured. Querying each class
     on both roots keeps the pairing correct regardless of structural edits. */
  const pairs = (sel) => {
    const live = origRoot.querySelectorAll(sel);
    const copy = cloneRoot.querySelectorAll(sel);
    const n = Math.min(live.length, copy.length);
    const out = [];
    for (let i = 0; i < n; i++) out.push([live[i], copy[i]]);
    return out;
  };
  
  const setSolid = (node, color) => {
    if (!node || !color) return;
    /* Keep any gradient the element already has — these clients do render
       them, and removing it was what flattened the white fade. Only the
       `background` shorthand is cleared, because it resets background-color
       when parsed; the colour below is the fallback beneath the gradient. */
    const existingGradient = node.style.backgroundImage;
    node.style.removeProperty("background");
    node.style.setProperty("background-color", color);
    if (existingGradient && existingGradient !== "none") {
      node.style.setProperty("background-image", existingGradient);
    }
    // Opt this element out of revealWatermarkThroughOrdinaryCells, which would
    // otherwise clear it again on the serialized clone.
    node.setAttribute("data-mca-keep-bg", "1");
  };
  
  /* Cards keep the band they draw on screen. It was previously cleared on the
     theory that email cannot render gradients and the colour had to move to the
     rows — but these clients do render them, so clearing it just removed the
     fade. The band only covers the top ~115px, exactly as in the tool, so the
     data rows below are unaffected and the watermark still shows through them. */
  cloneRoot
    .querySelectorAll(".mca-merged-card, .mca-wire-card-debit, .mca-wire-card-credit")
    .forEach((c) => {
      const gradient = c.style.backgroundImage;
      if (gradient && gradient !== "none") {
        c.style.removeProperty("background");
        c.style.setProperty("background-image", gradient);
        c.setAttribute("data-mca-keep-bg", "1");
      }
    });
  
  /* Fallbacks used when sampling the live gradient fails. These are the values
 measured off the real band (bar at 35% down = alpha 0.60, header row =
 alpha 0.10), NOT round numbers: the previous pair were too close together,
 so when the fallback kicked in the bar and header row came out the same
 flat blue and the fade disappeared. */
  /* Bank Analysis / Positions: the title bar and the MONTH row are ONE band.

     Same colour as the Additional Info bar (#aed6ef with a white veil over
     it), but the veil is split across the two rows instead of completing
     inside the bar: the bar runs 0 -> 0.38 and the header row picks up at
     0.38 and finishes at white. Both sit on the same #aed6ef base, so the
     fade reads as continuous across the pair rather than restarting.

     The hand-off value (0.38) is what makes them meet; changing one slice
     without the other reintroduces a visible step at the hairline. */
  const BAND_BASE = "#aed6ef";
  /* Veil raised ~20% so the band reads lighter: the bar now starts at 0.20
     white instead of 0, and the pair hands over at 0.55 instead of 0.38, so
     more of the fade happens sooner and the header row is nearly white by its
     bottom edge. The hand-over value must match between the two slices or a
     step appears at the hairline. */
  const BAR_VEIL =
    "linear-gradient(180deg," +
    " rgba(255,255,255,0.20) 0%," +
    " rgba(255,255,255,0.30) 45%," +
    " rgba(255,255,255,0.42) 75%," +
    " rgba(255,255,255,0.55) 100%)";
  const HEAD_VEIL =
    "linear-gradient(180deg," +
    " rgba(255,255,255,0.55) 0%," +
    " rgba(255,255,255,0.74) 40%," +
    " rgba(255,255,255,0.92) 72%," +
    " rgba(255,255,255,1) 100%)";

  /* Bars with no column-header row below them (Leverage, Notes — their bodies
     are label/value rows, not a table with a thead) have nowhere to hand the
     rest of the fade off to. Splitting the veil there left them ending at 0.55
     white: a block of flat blue with a hard edge against the first row. Those
     bars run the WHOLE fade inside themselves instead, so they reach white at
     their own bottom edge. Bars that do have a header row keep the two-slice
     split, which is what keeps Bank Analysis and Positions continuous. */
  const SOLO_VEIL =
    "linear-gradient(180deg," +
    " rgba(255,255,255,0.20) 0%," +
    " rgba(255,255,255,0.46) 38%," +
    " rgba(255,255,255,0.72) 64%," +
    " rgba(255,255,255,0.90) 84%," +
    " rgba(255,255,255,1) 100%)";

  cloneRoot.querySelectorAll(".mca-merged-bar").forEach((el) => {
    const card = el.closest(".mca-merged-card");
    const hasHead = !!(card && card.querySelector(".mca-merged-head-flat"));
    el.style.removeProperty("background");
    el.style.setProperty("background-color", BAND_BASE);
    el.style.setProperty("background-image", hasHead ? BAR_VEIL : SOLO_VEIL);
    el.setAttribute("data-mca-keep-bg", "1");
  });

  /* Centre every section heading in email too: Calibri 16px, centred.
     Baked inline because the copy pipeline rewrites class-driven styles. */
  cloneRoot
    .querySelectorAll(".mca-merged-bar, .mca-offer-bar, .mca-wire-bar, .mca-section-bar")
    .forEach((el) => {
      el.style.setProperty("font-family", 'Calibri, "Carlito", system-ui, sans-serif');
      el.style.setProperty("font-size", "16px");
      el.style.setProperty("text-align", "center");
      el.style.setProperty("justify-content", "center");
      el.querySelectorAll("*").forEach((child) => {
        child.style.setProperty("font-size", "16px");
        child.style.setProperty("text-align", "center");
      });
    });

  /* Column headers are Title Case, not caps: "Month", "Total Credit",
     "Start Date". The section bars above them stay uppercase, which is what
     gives the two levels their hierarchy. The source text is already written
     in Title Case, so this only has to stop the uppercase transform being
     applied — and strip it inline, because applyComputedStyles copies it. */
  cloneRoot
    .querySelectorAll(".mca-merged-head-flat th, .mca-wire-head th, thead th")
    .forEach((th) => {
      if (th.closest(".mca-merged-bar, .mca-offer-bar, .mca-section-bar")) return;
      th.style.setProperty("text-transform", "none");
      th.querySelectorAll("*").forEach((el) => el.style.setProperty("text-transform", "none"));
    });

  /* Keep the account-number note on one line in email too. */
  cloneRoot.querySelectorAll(".mca-merged-title-note").forEach((el) => {
    el.style.setProperty("white-space", "nowrap");
    el.style.setProperty("display", "inline");
  });

  cloneRoot.querySelectorAll(".mca-merged-head-flat").forEach((el) => {
    el.style.removeProperty("background");
    el.style.setProperty("background-color", BAND_BASE);
    el.style.setProperty("background-image", HEAD_VEIL);
    el.setAttribute("data-mca-keep-bg", "1");
  });
  cloneRoot.querySelectorAll(".mca-wire-bar, .mca-wire-head").forEach((el) => {
    const card = el.closest(".mca-wire-card-debit, .mca-wire-card-credit");
    if (!card) return;
    const debit = card.classList.contains("mca-wire-card-debit");
    /* Same two-slice recipe as the blue bands: ONE solid tint underneath both
       the bar and the header row, and the white veil on top carrying the fade
       across the pair. The previous version faded the TINT's alpha instead
       (rgba 1 -> 0.2) while sitting on an already-pale solid fallback, so the
       two ends composited to nearly the same colour and the bar pasted flat.
       Fading with white over a full-strength base is what makes the gradient
       actually visible, and it matches what the blue sections do. The veils
       are shared, so the wire bands lighten in step with them. */
    const base = debit ? "rgb(243, 191, 191)" : "rgb(184, 223, 196)";
    const isBar = el.classList.contains("mca-wire-bar");
    el.style.removeProperty("background");
    el.style.setProperty("background-color", base);
    el.style.setProperty("background-image", isBar ? BAR_VEIL : HEAD_VEIL);
    el.setAttribute("data-mca-keep-bg", "1");
  });
  
  /* Keep the gradient; add a solid only as a FALLBACK underneath.

     Earlier versions flattened every gradient to one solid colour on the
     assumption that no email client renders them. That is wrong for the
     clients in use here — the white fade was rendering before, and the
     flattening is what removed it. So the gradient stays exactly as the tool
     draws it, and background-color is set beneath it so anything that does
     drop gradients still shows the right colour instead of nothing.

     Marked keep-bg either way, so the reveal pass cannot clear it. */
  cloneRoot.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute("data-mca-keep-bg") === "1") return;
    const inline = el.getAttribute("style") || "";
    if (!/gradient/i.test(inline)) return;

    const gradient = el.style.backgroundImage || "";
    const own = el.style.backgroundColor || "";
    const transparent =
      !own || own === "transparent" || /rgba\([^)]*,\s*0\s*\)/.test(own);
    const fallback = transparent ? flattenGradientToSolid(gradient || inline) : own;

    if (fallback) el.style.setProperty("background-color", fallback);
    if (gradient && gradient !== "none") {
      el.style.setProperty("background-image", gradient);
    }
    el.setAttribute("data-mca-keep-bg", "1");
  });
  

  /* Rounded corners in email. On screen the card's `overflow: hidden` clips the
     table to its radius, but email clients do not support overflow clipping, so
     the square table corners show through a rounded card. Put the radius on the
     corner cells themselves. Clone-only: the on-screen rule that zeroes these
     (so the card does the clipping) is untouched. */
  for (const [live, card] of pairs(".mca-merged-card, .mca-wire-card-debit, .mca-wire-card-credit")) {
    const radius = window.getComputedStyle(live).getPropertyValue("border-top-left-radius") || "14px";
    const head = card.querySelector("thead tr:first-child");
    if (head) {
      const cells = head.children;
      if (cells.length) {
        cells[0].style.setProperty("border-top-left-radius", radius);
        cells[cells.length - 1].style.setProperty("border-top-right-radius", radius);
      }
    }
    const rows = card.querySelectorAll("tbody tr, tfoot tr");
    const lastRow = rows.length ? rows[rows.length - 1] : null;
    if (lastRow && lastRow.children.length) {
      const cells = lastRow.children;
      cells[0].style.setProperty("border-bottom-left-radius", radius);
      cells[cells.length - 1].style.setProperty("border-bottom-right-radius", radius);
    }
    // The title bar is the card's top edge when no thead precedes it.
    const bar = card.querySelector(".mca-merged-bar, .mca-wire-bar");
    if (bar) {
      bar.style.setProperty("border-top-left-radius", radius);
      bar.style.setProperty("border-top-right-radius", radius);
    }
    card.style.setProperty("border-radius", radius);
  }


  /* Client Name / Date / Risk / status chip on ONE line in email.
  
     Two things made this fail before: the row is flexbox (Gmail drops it), and
     the status chip is a SIBLING of .mca-headline, so rebuilding only the
     headline left the chip on its own line. Build from the whole row, one cell
     per field, and force nowrap down to the inner spans — otherwise the label
     itself ("Client Name:") still breaks across two lines. */
  for (const [, row] of pairs(".mca-headline-row")) {
    const doc = row.ownerDocument;
    /* Collect the fields, then the status chip LAST so it lands in the final,
       right-aligned cell. Gathered explicitly by class rather than relying on
       child order — the chip is a sibling of .mca-headline, and if it is missed
       it disappears from the email entirely. */
    const groups = [];
    let chip = null;
    for (const child of Array.from(row.children)) {
      if (child.classList?.contains("mca-headline-chip")) {
        chip = child;
      } else if (child.classList?.contains("mca-headline")) {
        for (const item of Array.from(child.children)) groups.push(item);
      } else {
        groups.push(child);
      }
    }
    if (chip) {
      /* Pin the chip's appearance with !important. applyGmailMobileResponsiveLayer
         tags this row "gmail-copy-meta" and then rewrites the style attribute of
         every descendant inside it, which stripped the chip's fill and left white
         text on a white background — present in the HTML but invisible. Inline
         !important survives that rewrite. */
      const chipBg = chip.style.backgroundColor || "#10b981";
      const chipFg = chip.style.color || "#ffffff";
      chip.setAttribute(
        "style",
        `${chip.getAttribute("style") || ""};background-color:${chipBg} !important;` +
          `color:${chipFg} !important;display:inline-block !important;` +
          "padding:4px 28px !important;font-weight:700 !important;white-space:nowrap !important;"
      );
      chip.setAttribute("data-mca-keep-bg", "1");
      /* Chip leads the row, ahead of Client Name. It used to be pushed last so
         it landed in the right-aligned cell; the spacer below now holds the
         right edge instead, so the chip can sit at the front. */
      groups.unshift(chip);
    }
    if (!groups.length) continue;
  
    const table = doc.createElement("table");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.setAttribute("border", "0");
    table.setAttribute("width", "100%");
    table.style.cssText = "border-collapse:collapse;background-color:transparent;width:100%;";
    const tr = doc.createElement("tr");
  
    groups.forEach((item, i) => {
      const last = i === groups.length - 1;
      const td = doc.createElement("td");
      td.style.cssText =
        "white-space:nowrap;vertical-align:middle;background-color:transparent;border:0;" +
        (last ? "text-align:left;padding:0;" : "text-align:left;padding:0 28px 0 0;");
      item.style.removeProperty("display");
      item.style.setProperty("white-space", "nowrap");
      /* Label and value are separate spans laid out with a flex gap, which email
         drops — without an explicit margin they run together as
         "CLIENT NAME:JIMMY SMITH'S...". Space the label and keep each on one line. */
      /* display:inline is essential. applyComputedStyles copies `display`, and a
         flex item's computed display is BLOCKIFIED — each span came through as
         display:block, so the label stacked above the value and the name wrapped
         over three lines. Force them back inline. */
      const spans = item.querySelectorAll("span");
      spans.forEach((el, idx) => {
        el.style.setProperty("display", "inline");
        el.style.setProperty("white-space", "nowrap");
        if (idx === 0 && spans.length > 1) el.style.setProperty("margin-right", "6px");
      });
      item.style.setProperty("display", "inline-block");
      item.style.setProperty("white-space", "nowrap");
      for (const el of item.querySelectorAll("*")) {
        el.style.setProperty("white-space", "nowrap");
      }
      td.appendChild(item);
      tr.appendChild(td);
    });
  
    /* Slack-absorbing spacer, after every real cell. Each cell is nowrap and
       shrink-to-fit, but the table is width:100%, so browsers share the
       leftover width out across ALL the cells — which is what pushed Date into
       the middle of the row and opened a gulf before the chip. One
       zero-content cell at width:100% swallows the slack instead, so the whole
       row packs left and stays tight. */
    if (groups.length > 1) {
      const spacer = doc.createElement("td");
      spacer.style.cssText =
        "width:100%;padding:0;border:0;background-color:transparent;font-size:1px;line-height:1px;";
      spacer.innerHTML = "&nbsp;";
      tr.appendChild(spacer);
    }

    table.appendChild(tr);
    row.textContent = "";
    row.style.setProperty("display", "block");
    row.style.setProperty("width", "100%");
    row.appendChild(table);
  }


  /* One clean outline per card in email. cleanupEmailStyles strips box-shadow
     (it is unreliable across clients), which left the cards edge-less once the
     page background went white. A 1px border is the part every client renders;
     the soft shadow is set too and is simply ignored where unsupported. */
  for (const [, c] of pairs('[class*="shadow"], .mca-merged-card, .mca-wire-card-debit, .mca-wire-card-credit')) {
    c.style.setProperty("border", "1px solid #d7dee8");
    c.style.setProperty("box-shadow", "0 1px 3px rgba(15, 23, 42, 0.08)");
  }



  /* Wire Debit/Credit bands. On screen the CARD paints these and the bar and
     header row are forced transparent (see .mca-wire-bar in globals.css), so
     there is no gradient on the bar itself to flatten — it has to be sampled
     from its card, exactly like the blue merged bars. Without this the whole
     wire panel pasted white, because the card is set to white above. */
  /* Bar and header row must be clearly apart. The previous pair were only ~20
     RGB units apart, so when sampling fell back the Debit/Credit bar and the
     DATE/AMOUNT row came out the same tone and the fade vanished — while the
     blue sections, whose fallbacks are ~40 apart, looked right. These match the
     widened band in globals.css (.mca-wire-card-debit / --credit). */

  /* Trend arrows and column tints.
  
     The arrows are react-icons SVGs; email clients drop inline SVG, so the
     Net Credit cells lost their up/down markers entirely. Swap each one for a
     text triangle in the same colour — a character every client renders.
  
     The NSF / Low Blc tint and the Net Credit tint come from CSS classes and
     custom properties; the final HTML pass rewrites any surviving var(--...)
     to a flat slate, which wiped the red. Set them here from the resolved
     computed colour instead. */
  for (const [live, c] of pairs("svg")) {
    const cls = String(live.getAttribute("class") || "");
    if (!/text-(emerald|green|red|rose)/.test(cls)) continue;
    const up = /emerald|green/.test(cls);
    const span = c.ownerDocument.createElement("span");
    span.textContent = up ? "▲" : "▼";
    span.style.cssText = `color:${up ? "#059669" : "#ef4444"};font-size:11px;line-height:1;` +
      "display:inline-block;vertical-align:middle;margin-left:4px;";
    c.replaceWith(span);
  }
  
  /* Walk the clone by class, and mark the result keep-bg.
     These tints are very pale — the alert fill resolves to roughly
     rgb(246,238,238) — so the watermark pass below, which clears opaque
     near-white fills, treated them as white and wiped them. The marker is
     what exempts them. Pairing is dropped too: the clone carries the
     classes, so there is nothing to misalign. */
  for (const sel of [".bank-alert-cell", ".bank-net-cell", ".bank-net-header"]) {
    const liveEls = origRoot.querySelectorAll(sel);
    const cloneEls = cloneRoot.querySelectorAll(sel);
    const n = Math.min(liveEls.length, cloneEls.length);
    for (let k = 0; k < n; k++) {
      const bg = window.getComputedStyle(liveEls[k]).getPropertyValue("background-color");
      if (!bg) continue;
      if (/rgba\([^)]*,\s*0\s*\)/.test(bg)) continue;
      setSolid(cloneEls[k], bg);
    }
  }

  // Uppercase is applied in CSS; email strips text-transform, so bake the text.

  /* Side-by-side sections: flex row -> table, so email keeps the real DOM.
     (Email clients drop flexbox; the PDF rasterises the DOM, which is why it
     matches the tool and email did not.)

     Scope matters. An earlier version converted ANY flex element with two
     children, which also split every CARD — a card is exactly two children, its
     title bar and its table — leaving the heading in one cell and the table in
     another. So:
       - only the slot's DIRECT child becomes the side-by-side row;
       - inner rows convert only when neither child is card-like (contains a
         table or a section bar), which is true of label/value rows such as
         "Existing Hold -> 26.49%" and false of the cards themselves. */
  const isCardLike = (el) =>
    Boolean(el.querySelector?.("table") || el.querySelector?.(".mca-merged-bar, .mca-wire-bar"));

  cloneRoot.querySelectorAll("[data-notes-preview-email-slot]").forEach((slot) => {
    const doc = slot.ownerDocument;

    const toTable = (row, sideBySide) => {
      const cells = Array.from(row.children);
      if (cells.length < 2) return;
      const table = doc.createElement("table");
      table.setAttribute("cellpadding", "0");
      table.setAttribute("cellspacing", "0");
      table.setAttribute("border", "0");
      table.setAttribute("width", "100%");
      table.style.cssText =
        "width:100%;border-collapse:separate;background-color:transparent;" +
        (sideBySide ? "border-spacing:12px 0;" : "border-spacing:0;");
      const tr = doc.createElement("tr");
      cells.forEach((cell, idx) => {
        const td = doc.createElement("td");
        td.setAttribute("valign", sideBySide ? "top" : "middle");
        const align = !sideBySide && idx === cells.length - 1 ? "right" : "left";
        td.style.cssText =
          `vertical-align:${sideBySide ? "top" : "middle"};text-align:${align};` +
          "background-color:transparent;border:0;padding:0;" +
          (sideBySide ? `width:${Math.floor(100 / cells.length)}%;` : "");
        cell.style.removeProperty("display");
        if (sideBySide) cell.style.setProperty("width", "100%");
        td.appendChild(cell);
        tr.appendChild(td);
      });
      table.appendChild(tr);
      /* Keep the row element and nest the table inside it, rather than
         replacing it. The row carries the styling — padding, the bottom border
         that separates each metric, the row height — and replacing it threw all
         of that away, which is why the Leverage rows came out cramped with no
         separators. */
      row.textContent = "";
      row.style.setProperty("display", "block");
      row.appendChild(table);
    };

    const outer = Array.from(slot.children).find(
      (ch) => (ch.style?.display || "").includes("flex") && ch.children.length >= 2
    );
    const innerRows = [];
    slot.querySelectorAll("*").forEach((el) => {
      if (el === outer) return;
      if (!(el.style?.display || "").includes("flex")) return;
      if (isCardLike(el)) { el.style.setProperty("display", "block"); return; }
      if (el.children.length === 2) innerRows.push(el);
      else el.style.setProperty("display", "block");
    });

    if (outer) toTable(outer, true);
    innerRows.forEach((row) => toTable(row, false));
  });

  /* Walk the CLONE only, by its own inline style.
     This used to pair every element ("*") between the live tree and the clone.
     By this point the chart has been swapped for an <img> and the headline
     rebuilt as a table, so the two trees hold different numbers of elements and
     the pairing drifts — which is why some bars uppercased and others did not
     (POSITIONS stayed sentence case while its column headers were fine).
     applyComputedStyles has already inlined text-transform on the clone, so the
     clone alone carries everything needed. */
  /* Type spec, baked inline because email ignores the preview stylesheet:
       table body cells   13px / 500
       column sub-headers 13px / 700 / Title Case
       section bars       16px / 700 / UPPER (text uppercased just below)
     Body cells are leaf cells only — layout cells that wrap a whole card
     (they contain a table or a bar) are skipped so card titles keep 16px.
     Applied in that order so headers and bars win over the cell pass. */
  const TYPE_BAR_SEL = ".mca-merged-bar, .mca-offer-bar, .mca-wire-bar, .mca-section-bar";
  const isTrendArrow = (el) => /^[▲▼]$/.test(String(el.textContent || "").trim());
  const setType = (el, size, weight) => {
    el.style.setProperty("font-size", size);
    el.style.setProperty("font-weight", weight);
  };

  cloneRoot.querySelectorAll("td").forEach((td) => {
    if (td.closest(TYPE_BAR_SEL) || td.closest(".chart-capture-area")) return;
    if (td.querySelector(`table, ${TYPE_BAR_SEL}`)) return;
    setType(td, "13px", "500");
    td.querySelectorAll("*").forEach((el) => {
      if (el.tagName === "IMG" || isTrendArrow(el)) return;
      setType(el, "13px", "500");
    });
  });

  cloneRoot
    .querySelectorAll(
      "th, th *, thead td, thead td *, .mca-merged-head-flat, .mca-merged-head-flat *, .mca-wire-head, .mca-wire-head *"
    )
    .forEach((el) => {
      if (el.closest(TYPE_BAR_SEL) || isTrendArrow(el)) return;
      setType(el, "13px", "700");
      el.style.setProperty("text-transform", "none");
      // Header text in the dark section-bar slate, as in the preview (globals.css).
      if (el.matches("th, td")) el.style.setProperty("color", "#334155");
    });

  /* Summary rows (AVERAGE / TOTAL) are bold, as in the preview; the
     "(MTD Not counted)" sub-label keeps its lighter weight. */
  cloneRoot
    .querySelectorAll(
      ".mca-summary-row > td, .mca-summary-row > td *, .bank-total-average-row > td, .bank-total-average-row > td *"
    )
    .forEach((el) => {
      if (el.tagName === "IMG" || isTrendArrow(el) || el.classList.contains("text-slate-500")) return;
      setType(el, "13px", "700");
    });

  /* Emphasised cells — those tagged .mca-strong (Additional Info labels, wire month rows, Approved values,
     Leverage labels). Weight only, so each keeps its size. Mirrors the
     preview rule in globals.css. */
  const STRONG_SEL = ".mca-strong";
  cloneRoot.querySelectorAll(STRONG_SEL).forEach((cell) => {
    if (cell.tagName === "TD" && cell.querySelector("table")) return;
    [cell, ...cell.querySelectorAll("*")].forEach((el) => {
      if (el.tagName === "IMG" || isTrendArrow(el) || el.classList.contains("text-slate-500")) return;
      el.style.setProperty("font-weight", "700");
    });
  });

  cloneRoot.querySelectorAll(TYPE_BAR_SEL).forEach((bar) => {
    setType(bar, "16px", "700");
    bar.querySelectorAll("*").forEach((el) => setType(el, "16px", "700"));
  });

  const upper = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = node.textContent.toUpperCase();
      }
    }
    el.style.removeProperty("text-transform");
  };

  cloneRoot.querySelectorAll('[style*="uppercase"]').forEach(upper);

  /* Belt and braces for the section bars: their uppercase comes from a CSS
     class, and if the inlining pass ever misses one the bar would paste in
     sentence case while everything around it is uppercase. */
  cloneRoot
    /* Every section heading, including the ones that style themselves inline
       and only got a class recently: Offer, Leverage, Additional Info, Remit
       (.mca-section-bar) alongside the merged and wire bars. Email strips
       text-transform, so the text itself must be uppercased. */
    .querySelectorAll(
      ".mca-merged-bar, .mca-offer-bar, .mca-wire-bar, .mca-section-bar"
    )
    .forEach((el) => {
      upper(el);
      el.querySelectorAll("span").forEach(upper);
    });
  
  /* Let the watermark through. Opaque near-white fills — inlined from computed
     styles, or added by the table conversions above — sit on top of the favicon
     watermark and hide it. revealWatermarkThroughOrdinaryCells does this too,
     but it runs before this function AND again afterwards from
     wrapCopiedPreviewHtml, so relying on its timing has broken twice already.
     Doing it here as the last step makes the result independent of ordering.

     Bands, the status chip and anything else marked keep-bg are preserved. */
  cloneRoot.querySelectorAll("*").forEach((el) => {
    if (el.getAttribute?.("data-mca-keep-bg") === "1") return;
    const bg = el.style?.backgroundColor || "";
    if (!bg) return;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
    if (!m) {
      if (/^#f{3,6}$/i.test(bg.trim())) el.style.setProperty("background-color", "transparent");
      return;
    }
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const nearWhite = r >= 244 && g >= 244 && b >= 244;
    if (a >= 0.95 && nearWhite) el.style.setProperty("background-color", "transparent");
  });

  /* Note lists. Runs HERE, last, on the clone only.
     The per-modal copy step normalises these too, but it runs early and later
     passes (cleanupEmailStyles, the Gmail layer) rewrite style attributes and
     undo it — the bullet kept ending up alone on its own line with the text
     beneath it.

     Two separate causes, both handled:
       - a block-level child inside the <li> pushes the text below the marker;
       - the editor stores a newline before the text and keeps white-space as
         pre/pre-wrap, so that newline renders as a real line break. */
  cloneRoot.querySelectorAll("ul, ol").forEach((list) => {
    list.style.setProperty("display", "block");
    list.style.setProperty("margin", "4px 0");
    list.style.setProperty("padding-left", "22px");
    list.style.setProperty("list-style-position", "outside");
    list.style.setProperty("list-style-type", list.tagName === "OL" ? "decimal" : "disc");
  });

  cloneRoot.querySelectorAll("li").forEach((li) => {
    li.style.setProperty("display", "list-item");
    li.style.setProperty("margin", "0");
    li.style.setProperty("padding", "0");
    li.style.setProperty("white-space", "normal");

    while (
      li.firstChild &&
      li.firstChild.nodeType === Node.TEXT_NODE &&
      !li.firstChild.textContent.trim()
    ) {
      li.removeChild(li.firstChild);
    }
    if (li.firstChild && li.firstChild.nodeType === Node.TEXT_NODE) {
      li.firstChild.textContent = li.firstChild.textContent.replace(/^\s+/, "");
    }

    li.querySelectorAll("*").forEach((el) => {
      if (el.tagName === "UL" || el.tagName === "OL" || el.tagName === "LI") return;
      el.style.setProperty("display", "inline");
      el.style.setProperty("margin", "0");
      el.style.setProperty("padding", "0");
      el.style.setProperty("white-space", "normal");
    });
  });

  /* Chart images. The chart is rasterised to a PNG for email, and an <img> does
     not inherit the card's rounded corners — the chart came through square
     while every other card was rounded. Give the image the same radius and
     outline. */
  cloneRoot
    .querySelectorAll(".chart-capture-area img, img[alt='Total Net Credit Trend'], .gmail-copy-chart img")
    .forEach((img) => {
      img.style.setProperty("border-radius", "14px");
      img.style.setProperty("border", "1px solid #d7dee8");
      img.style.setProperty("box-sizing", "border-box");
      img.style.setProperty("display", "block");
      img.style.setProperty("max-width", "100%");
    });

  /* Every rounded card, not just the merged ones.
     GMAIL_TEXT_GEOM_STRIP removes `overflow` from the copied styles, and email
     clients ignore overflow clipping regardless — so a card keeps its radius
     but can no longer clip the square table inside it, and the corners read as
     square. The Offer card and the Credits Trend card hit this. Apply the
     card's own radius to its corner cells and to its first/last block child. */
  cloneRoot.querySelectorAll("*").forEach((card) => {
    const r = card.style?.borderRadius;
    if (!r || r === "0px" || r === "0") return;
    if (card.tagName === "IMG" || card.tagName === "TD" || card.tagName === "TH") return;

    const table = card.querySelector("table");
    if (table) {
      const head = table.querySelector("thead tr:first-child");
      if (head?.children?.length) {
        head.children[0].style.setProperty("border-top-left-radius", r);
        head.children[head.children.length - 1].style.setProperty("border-top-right-radius", r);
      }
      const rows = table.querySelectorAll("tbody tr, tfoot tr");
      const last = rows.length ? rows[rows.length - 1] : null;
      if (last?.children?.length) {
        last.children[0].style.setProperty("border-bottom-left-radius", r);
        last.children[last.children.length - 1].style.setProperty("border-bottom-right-radius", r);
      }
    }

    const first = card.firstElementChild;
    if (first && first.tagName !== "TABLE") {
      first.style.setProperty("border-top-left-radius", r);
      first.style.setProperty("border-top-right-radius", r);
    }
    const lastChild = card.lastElementChild;
    if (lastChild && lastChild.tagName !== "TABLE") {
      lastChild.style.setProperty("border-bottom-left-radius", r);
      lastChild.style.setProperty("border-bottom-right-radius", r);
    }
  });

  /* Never leave light text on a cleared background.
     Runs last. Any element whose own text is white or near-white must keep a
     background dark enough to read against — otherwise it renders blank, which
     is what made the OFFER bar look empty in email (the word was there, white
     on white). Restores the colour the live element actually shows and marks it
     keep-bg so nothing clears it again. */
  const parseRgb = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v || "");
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };

  const liveByIndex = origRoot.querySelectorAll("*");
  const cloneByIndex = cloneRoot.querySelectorAll("*");
  cloneRoot.querySelectorAll("*").forEach((el) => {
    const fg = parseRgb(el.style?.color || "");
    if (!fg) return;
    const lightText = fg.r >= 230 && fg.g >= 230 && fg.b >= 230;
    if (!lightText) return;

    const bg = parseRgb(el.style?.backgroundColor || "");
    const transparentBg = !bg || bg.a < 0.3;
    const nearWhiteBg = bg && bg.r >= 230 && bg.g >= 230 && bg.b >= 230;
    if (!transparentBg && !nearWhiteBg) return;

    /* Find the matching live element to read its real background. Matching by
       class is unreliable here (these bars share classes), so fall back to a
       readable slate if no match is found — blank text is never acceptable. */
    let restored = null;
    for (let k = 0; k < cloneByIndex.length && k < liveByIndex.length; k++) {
      if (cloneByIndex[k] === el) {
        const liveBg = window.getComputedStyle(liveByIndex[k]).getPropertyValue("background-color");
        const parsed = parseRgb(liveBg);
        if (parsed && parsed.a >= 0.3 && !(parsed.r >= 230 && parsed.g >= 230 && parsed.b >= 230)) {
          restored = liveBg;
        }
        break;
      }
    }
    setSolid(el, restored || "rgb(71, 85, 105)");
  });
}
