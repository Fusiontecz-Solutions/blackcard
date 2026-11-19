import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { DocumentLayout, DocumentLayoutPlacement } from './convert-docusign-template-export';

/**
 * "No Debt Settlement Companies" rider — rendered with pdf-lib and inserted as
 * page 3 of every main contract. All main-contract placements on page >= 3 are
 * shifted down one page, and the rider's own tabs (initials, signatures,
 * merchant / guarantor names, agreement date) are added on page 3.
 *
 * Font size auto-shrinks until the whole rider fits one Letter page, so text
 * never overlaps.
 */

/** Fallback position when the contract's Terms and Conditions page can't be detected. */
export const ANTI_DEBT_RIDER_PAGE_NUMBER = 3;

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 36;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 28;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
/** x of the first initial box on a line — same as the contract's page initials. */
const INITIALS_FIRST_X = 110;
/**
 * Text/date tab top = line top minus this. DocuSign draws the 9pt prefill with its
 * baseline ~12pt below the tab top; this puts it just above the rider's underline.
 */
const TEXT_TAB_RAISE = 6;
/** Must match OWNER2_INITIAL_OFFSET_X in build-envelope-from-layout.ts. */
const OWNER2_COPY_OFFSET_X = 108;
/** Widest x an owner-1 initial box may start at so its owner-2 copy (+108) and the box fit on the page. */
const MAX_PRIMARY_INITIAL_X = PAGE_W - OWNER2_COPY_OFFSET_X - 60;

type Run = { text: string; bold?: boolean; color?: 'red' };
type Para = Run[];

const WARNING_HEAD = 'IMPORTANT WARNING – READ BEFORE SIGNING';
const WARNING_BODY =
  "PURCHASER WILL NEVER NEGOTIATE WITH ANY DEBT SETTLEMENT COMPANY – UNDER ANY CIRCUMSTANCES. IF YOU STOP OR REDIRECT PAYMENTS AT A SETTLEMENT COMPANY'S DIRECTION, PURCHASER WILL SUE YOU, YOUR GUARANTOR, AND THE SETTLEMENT COMPANY FOR ALL LOSSES, ATTORNEYS' FEES AND COSTS. YOU WILL ALSO BE RESPONSIBLE FOR ALL OF PURCHASER'S ATTORNEYS' FEES AND COSTS.";

const RECORDS_LEFT: Para[] = [
  [
    { text: 'Conviction:', bold: true },
    { text: ' U.S. v. Bezrukov ("Corporate Restructure, Inc.," W.D.N.Y.) induced businesses to stop paying and pay him instead. He was sentenced in 2019 to ' },
    { text: '66 months in prison', bold: true },
    { text: ' and about $1.2M in restitution (U.S. Attorney, via btpm.org, 7/25/2019).' },
  ],
  [
    { text: 'Guilty plea:', bold: true },
    { text: ' U.S. v. Csantaveri (MCA Cure LLC et al., D.N.J.) told merchants to stop paying funders and pay his firms instead. About $3M of the roughly $3.7M collected was diverted. He ' },
    { text: 'pleaded guilty to wire-fraud conspiracy', bold: true },
    { text: ' in May 2026 (deBanked, 5/2026).' },
  ],
];

const RECORDS_RIGHT: Para[] = [
  [
    { text: 'Settlement:', bold: true },
    { text: ' In Yellowstone & Everest v. Corporate Bailout / Protection Legal Group (N.Y. Sup. Ct.), the defendants ' },
    { text: 'paid $500,000', bold: true },
    { text: ' to end the tortious-interference claims (deBanked, 6/2018).' },
  ],
  [
    { text: 'Court ruling:', bold: true },
    { text: ' In NewCo Capital v. MCA Resolve (N.Y. Cty., Index 650008/2024), the court on 1/13/2026 let claims for interference, conversion, conspiracy and punitive damages proceed against the firm, and let claims proceed against its attorney. These are allegations, not yet proven.' },
  ],
];

const NOTICE: Para = [
  { text: 'NOTICE TO ANY DEBT SETTLEMENT COMPANY:', bold: true },
  { text: ' Purchaser does ' },
  { text: 'not', bold: true },
  { text: ' recognize, communicate with, or negotiate with Debt Settlement Companies, under any circumstances. You are on notice of this Agreement and this Rider. Any contact from you to Purchaser, or any delivery of this Rider to you, establishes your ' },
  { text: 'knowledge', bold: true },
  { text: ' of this contract. If you induce, advise, or assist any Prohibited Act, Purchaser will pursue you, your principals, and any participating attorney for tortious interference, aiding and abetting, conversion, fraud, deceptive practices, civil conspiracy, and all resulting losses, fees, and costs.' },
];

/** `initials: true` → a "Merchant Initials / Guarantor Initials" line is drawn under the section. */
const SECTIONS: Array<{ para: Para; initials?: boolean }> = [
  {
    para: [
      { text: '1. DEFINITIONS. "Debt Settlement Company"', bold: true },
      { text: ' means any person or entity, however named (including any "debt settlement," "debt relief," "debt negotiation," "debt resolution," "restructuring," "MCA relief," "business consulting," or "credit counseling" firm or program), with its affiliates, agents, referral partners, and any attorney or law firm working at its referral or direction or sharing fees or marketing with it, that for compensation offers or undertakes to (a) negotiate, settle, reduce, restructure, or delay Merchant\'s obligations under the Agreement or similar agreements; (b) advise or direct Merchant to stop, reduce, block, divert, or redirect Receivables or Remittances; or (c) collect or hold Merchant\'s funds for a purported future settlement. ' },
      { text: '"Independent Counsel"', bold: true },
      { text: ' means a licensed attorney in good standing who (i) is retained under a written engagement made directly with Merchant, (ii) personally advises and communicates with Merchant, and (iii) is not referred by, paid by, sharing fees with, or acting at the direction of a Debt Settlement Company. Any attorney failing any of these three conditions is treated as part of the Debt Settlement Company.' },
    ],
  },
  {
    para: [
      { text: '2. REPRESENTATION AND COVENANT.', bold: true },
      { text: ' Merchant and Guarantor each represent that neither has engaged, enrolled with, or paid any Debt Settlement Company, and covenant that, while any part of the Purchased Amount remains undelivered, neither will engage, authorize, pay, or act on the instructions of one.' },
    ],
  },
  {
    initials: true,
    para: [
      { text: '3. PURCHASER WILL NEVER NEGOTIATE WITH A DEBT SETTLEMENT COMPANY.', bold: true },
      { text: ' In no way, shape, or form, and under no circumstances, will Purchaser communicate, negotiate, or settle with a Debt Settlement Company. Purchaser has no obligation to respond to any proposal, demand, power of attorney, "authorization to communicate," or "cease communication" letter from one, and any such authorization has no effect against Purchaser. Purchaser may keep communicating directly with Merchant and Guarantor. Once it receives written notice that Merchant is represented by Independent Counsel, Purchaser will direct communications to that counsel as the law and professional rules require. No modification or settlement binds Purchaser unless signed by its authorized officer and by Merchant or its Independent Counsel. Merchant may request reconciliation or adjustment directly from Purchaser at any time, at no charge.' },
    ],
  },
  {
    para: [
      { text: '4. EVENTS OF DEFAULT.', bold: true },
      { text: ' Each is an Event of Default (a "Prohibited Act"): (a) breach of Section 2; (b) at the direction, recommendation, or with the assistance of a Debt Settlement Company, (i) revoking or limiting any ACH or remittance authorization, (ii) stopping, blocking, or reversing an authorized Remittance, (iii) closing, changing, or freezing the designated account, opening a new account, or redirecting processor settlements to keep Receivables from Purchaser, or (iv) disputing an authorized debit as unauthorized, including Nacha returns R10 or R29 or signing a statement of unauthorized debit; (c) transferring Receivables or funds to a Debt Settlement Company or an "escrow," "savings," or "dedicated" account it controls or arranges; or (d) giving one the Agreement or Purchaser\'s account information. A decline in Receivables, a reduced Remittance after reconciliation, retaining Independent Counsel, or filing bankruptcy is ' },
      { text: 'not', bold: true },
      { text: ', by itself, an Event of Default under this Rider.' },
    ],
  },
  {
    initials: true,
    para: [
      { text: '5. REMEDIES – PURCHASER WILL SUE.', bold: true },
      { text: ' On a Prohibited Act, Purchaser will pursue every remedy available under the Agreement, the Guaranty, and law, against Merchant and Guarantor ' },
      { text: 'and', bold: true },
      { text: ' against the Debt Settlement Company. Merchant and Guarantor are ' },
      { text: 'jointly and severally liable', bold: true },
      { text: ' for (a) amounts recoverable under the Agreement on an Event of Default; (b) all actual losses caused by the Prohibited Act, including returned-item, bank, and processing fees and the cost of tracing diverted Receivables; and (c) attorneys\' fees, costs, and expenses as provided in Section 6. These amounts are compensatory, not a penalty. Recovery will not exceed actual damages plus such fees and costs, and nothing is counted twice. Purchaser may also seek injunctive relief. Guarantor\'s guaranty of performance covers every term of this Rider.' },
    ],
  },
  {
    initials: true,
    para: [
      { text: '6. ATTORNEYS\' FEES AND COSTS. On any breach of this Rider, including any Prohibited Act or breach of the Section 2 covenant, Merchant and Guarantor, jointly and severally, shall pay Purchaser all reasonable attorneys\' fees, costs, and expenses incurred in enforcing this Rider and the Agreement, whether or not suit is filed.', bold: true },
      { text: ' This includes fees in litigation, arbitration, appeals, bankruptcy proceedings (to the extent allowed by the Bankruptcy Code), and collection efforts, and in any action against a Debt Settlement Company arising from the breach. These fees are recoverable even if the breach is partial or later cured, and they are in addition to all other amounts owed. They are limited to fees and costs actually incurred; no fixed percentage or penalty applies.' },
    ],
  },
  {
    para: [
      { text: '7. NOTICE TO THIRD PARTIES; COOPERATION.', bold: true },
      { text: ' Merchant agrees Purchaser may send this Rider to any Debt Settlement Company as notice of the Agreement and that inducing or assisting a Prohibited Act causes its breach. Within five (5) business days of request, Merchant shall deliver copies of every agreement with, and written communication from, any Debt Settlement Company. Purchaser reserves all claims against any third party.' },
    ],
  },
  {
    para: [
      { text: '8. ACKNOWLEDGMENT.', bold: true },
      { text: ' Merchant confirms that it read the Warning above, that it is not relying on any statement by a Debt Settlement Company, and that it had the opportunity to review this Rider with Independent Counsel.' },
    ],
  },
  {
    para: [
      { text: '9. RIGHTS NOT RESTRICTED.', bold: true },
      { text: ' Nothing here prohibits or penalizes (a) consulting or retaining Independent Counsel; (b) filing bankruptcy or seeking relief under the U.S. Bankruptcy Code, which governs Purchaser\'s rights in any such case; (c) communicating with any court, regulator, or law enforcement; (d) requesting reconciliation or adjustment; or (e) asserting any claim or defense in court.' },
    ],
  },
  {
    para: [
      { text: '10. CONSTRUCTION.', bold: true },
      { text: ' This Rider does not change the transaction\'s nature as a sale and purchase of future Receivables. It does not make delivery of Receivables absolute or make the transaction a loan; words such as "debt" and "settlement" only describe how third parties market themselves. Unenforceable parts will be enforced to the extent permitted, and the rest remains in effect. The Agreement\'s governing-law, venue, and dispute-resolution terms apply.' },
    ],
  },
];

type Fonts = { regular: PDFFont; bold: PDFFont };
type Colors = { black: RGB; red: RGB; redFill: RGB; grayFill: RGB; gray: RGB };

/** Tab anchors captured while drawing (top-left coordinates, DocuSign style). */
type RiderAnchors = {
  sectionInitials: Array<{ merchantX: number; guarantorX: number; yTop: number }>;
  footerInitialX: number;
  footerInitialYTop: number;
  agreementDate: { x: number; yTop: number; w: number };
  merchantName: { x: number; yTop: number; w: number };
  guarantorName: { x: number; yTop: number; w: number };
  sigMerchantBusinessName: { x: number; yTop: number; w: number };
  sigMerchantBy: { x: number; yTop: number };
  sigMerchantName: { x: number; yTop: number; w: number };
  sigMerchantDate: { x: number; yTop: number };
  sigGuarantor: { x: number; yTop: number };
  sigGuarantorName: { x: number; yTop: number; w: number };
  sigGuarantorDate: { x: number; yTop: number };
};

/** Word-wrap a list of styled runs into lines of runs that fit `width`. */
function wrapRuns(runs: Para, fonts: Fonts, size: number, width: number): Run[][] {
  type Word = { text: string; bold?: boolean; color?: 'red'; spaceBefore: boolean };
  const words: Word[] = [];
  let pendingSpace = false;
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        pendingSpace = true;
        continue;
      }
      words.push({ text: part, bold: run.bold, color: run.color, spaceBefore: pendingSpace });
      pendingSpace = false;
    }
  }
  const lines: Run[][] = [];
  let line: Run[] = [];
  let lineW = 0;
  const spaceW = fonts.regular.widthOfTextAtSize(' ', size);
  for (const w of words) {
    const f = w.bold ? fonts.bold : fonts.regular;
    const ww = f.widthOfTextAtSize(w.text, size);
    const lead = line.length && w.spaceBefore ? spaceW : 0;
    if (line.length && lineW + lead + ww > width) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
    const prefix = line.length && w.spaceBefore ? ' ' : '';
    line.push({ text: prefix + w.text, bold: w.bold, color: w.color });
    lineW += (prefix ? spaceW : 0) + ww;
  }
  if (line.length) lines.push(line);
  return lines;
}

function lineWidth(line: Run[], fonts: Fonts, size: number): number {
  return line.reduce((s, r) => s + (r.bold ? fonts.bold : fonts.regular).widthOfTextAtSize(r.text, size), 0);
}

/**
 * Lay out (and optionally draw) the rider. Returns the bottom `cursor` (top-down
 * coordinate). Called once per candidate font size to find the largest that fits.
 */
function layoutRider(
  page: PDFPage | null,
  fonts: Fonts,
  colors: Colors,
  size: number,
  purchaserName: string,
): { bottom: number; anchors: RiderAnchors } {
  const lh = size * 1.22; // line height
  const gap = size * 0.55; // paragraph gap
  let y = MARGIN_TOP; // top-down cursor

  const pdfY = (topDown: number) => PAGE_H - topDown;

  const drawLine = (line: Run[], x: number, top: number, color?: RGB, sz: number = size) => {
    if (!page) return;
    let cx = x;
    for (const r of line) {
      const f = r.bold ? fonts.bold : fonts.regular;
      page.drawText(r.text, {
        x: cx,
        y: pdfY(top + sz),
        size: sz,
        font: f,
        color: r.color === 'red' ? colors.red : color ?? colors.black,
      });
      cx += f.widthOfTextAtSize(r.text, sz);
    }
  };

  const drawPara = (
    para: Para,
    x: number,
    width: number,
    opts: { center?: boolean; color?: RGB; justify?: boolean; size?: number } = {},
  ) => {
    const sz = opts.size ?? size;
    const lines = wrapRuns(para, fonts, sz, width);
    for (const line of lines) {
      const w = lineWidth(line, fonts, sz);
      const lx = opts.center ? x + (width - w) / 2 : x;
      drawLine(line, lx, y, opts.color, sz);
      y += sz * 1.22;
    }
  };

  const hLine = (x1: number, x2: number, top: number) => {
    if (!page) return;
    page.drawLine({
      start: { x: x1, y: pdfY(top) },
      end: { x: x2, y: pdfY(top) },
      thickness: 0.5,
      color: colors.black,
    });
  };

  const label = (text: string, x: number, top: number, bold = false) => {
    const f = bold ? fonts.bold : fonts.regular;
    if (page) page.drawText(text, { x, y: pdfY(top + size), size, font: f, color: colors.black });
    return x + f.widthOfTextAtSize(text, size);
  };

  // ── Title ─────────────────────────────────────────────────────────────
  const titleSize = size + 3.5;
  const title = 'RIDER: NO DEBT SETTLEMENT COMPANIES – NOTICE, COVENANT AND REMEDIES';
  const titleW = fonts.bold.widthOfTextAtSize(title, titleSize);
  if (page) {
    page.drawText(title, {
      x: (PAGE_W - titleW) / 2,
      y: pdfY(y + titleSize),
      size: titleSize,
      font: fonts.bold,
      color: colors.black,
    });
  }
  y += titleSize * 1.35;

  // ── Intro sentence with inline blanks (matches the source rider) ──────
  type Seg = string | { blank: number; fill?: string; key?: 'date' | 'merchant' | 'guarantor' };
  const blankAnchors: Record<string, { x: number; yTop: number; w: number }> = {};
  const segWidth = (seg: Seg) =>
    typeof seg === 'string' ? fonts.regular.widthOfTextAtSize(seg, size) : seg.blank;
  const drawSegLine = (segs: Seg[]) => {
    const total = segs.reduce((sum, seg) => sum + segWidth(seg), 0);
    let cx = MARGIN_X + (CONTENT_W - total) / 2;
    for (const seg of segs) {
      if (typeof seg === 'string') {
        label(seg, cx, y);
      } else {
        hLine(cx + 1, cx + seg.blank - 1, y + size + 1.5);
        if (seg.fill) label(seg.fill, cx + 3, y);
        if (seg.key) blankAnchors[seg.key] = { x: cx + 2, yTop: y - TEXT_TAB_RAISE, w: seg.blank - 4 };
      }
      cx += segWidth(seg);
    }
    y += lh * 1.6;
  };
  const blankW = 130;
  drawSegLine([
    'This Rider is part of the Revenue Purchase Agreement dated ',
    { blank: 80, key: 'date' },
    ' (the "Agreement") between ',
    { blank: blankW, fill: purchaserName || '' },
  ]);
  drawSegLine([
    '("Purchaser") and ',
    { blank: blankW, key: 'merchant' },
    ' ("Merchant"), guaranteed by ',
    { blank: blankW, key: 'guarantor' },
    ' ("Guarantor"). Capitalized terms not',
  ]);
  drawSegLine(['defined here have their meanings in the Agreement.']);
  const agreementDate = blankAnchors.date;
  const merchantName = blankAnchors.merchant;
  const guarantorName = blankAnchors.guarantor;
  y += gap * 0.6;

  // ── Warning box ───────────────────────────────────────────────────────
  const pad = 5;
  const boxTop = y;
  const innerX = MARGIN_X + pad;
  const innerW = CONTENT_W - pad * 2;
  // measure first, then draw background, then text
  const headSize = size + 4.5;
  const bodySize = size + 2.4;
  const recSize = size + 0.6;
  const recLh = recSize * 1.22;
  const measureBox = () => {
    const headLines = 1;
    const bodyLines = wrapRuns([{ text: WARNING_BODY, bold: true }], fonts, bodySize, innerW).length;
    const colW = (innerW - 10) / 2;
    const bulletIndent = recSize * 0.9;
    const colLines = (paras: Para[]) =>
      paras.reduce((s, p) => s + wrapRuns(p, fonts, recSize, colW - bulletIndent).length, 0);
    const recLines = Math.max(colLines(RECORDS_LEFT), colLines(RECORDS_RIGHT));
    return (
      pad +
      headSize * 1.3 * headLines +
      bodyLines * bodySize * 1.22 +
      gap * 0.6 +
      recLh +
      recLines * recLh +
      pad
    );
  };
  const boxH = measureBox();
  if (page) {
    page.drawRectangle({
      x: MARGIN_X,
      y: pdfY(boxTop + boxH),
      width: CONTENT_W,
      height: boxH,
      color: colors.redFill,
      borderColor: colors.red,
      borderWidth: 2,
    });
  }
  y = boxTop + pad;
  const headW = fonts.bold.widthOfTextAtSize(WARNING_HEAD, headSize);
  if (page) {
    // simple warning triangles on both sides of the heading
    const drawTri = (cx: number) => {
      const t = y + 0.5;
      const b = y + headSize;
      const h = headSize * 0.58;
      page.drawSvgPath(`M ${cx} ${t} L ${cx - h} ${b} L ${cx + h} ${b} Z`, {
        x: 0,
        y: PAGE_H,
        borderColor: colors.red,
        borderWidth: 1.1,
      });
      const bang = '!';
      const bs = headSize * 0.62;
      page.drawText(bang, {
        x: cx - fonts.bold.widthOfTextAtSize(bang, bs) / 2,
        y: pdfY(b - 1),
        size: bs,
        font: fonts.bold,
        color: colors.red,
      });
    };
    const hx = (PAGE_W - headW) / 2;
    page.drawText(WARNING_HEAD, {
      x: hx,
      y: pdfY(y + headSize),
      size: headSize,
      font: fonts.bold,
      color: colors.red,
    });
    drawTri(hx - headSize * 1.1);
    drawTri(hx + headW + headSize * 1.1);
  }
  y += headSize * 1.3;
  drawPara([{ text: WARNING_BODY, bold: true }], innerX, innerW, { center: true, size: bodySize });
  y += gap * 0.6;
  drawLine(
    [{ text: 'What public records show about "debt settlement / MCA restructuring" firms:', bold: true, color: 'red' }],
    innerX,
    y,
    undefined,
    recSize,
  );
  y += recLh;
  const colTop = y;
  const colW = (innerW - 10) / 2;
  const bulletIndent = recSize * 0.9;
  const drawColumn = (paras: Para[], cx: number) => {
    y = colTop;
    for (const p of paras) {
      const lines = wrapRuns(p, fonts, recSize, colW - bulletIndent);
      lines.forEach((line, i) => {
        if (i === 0 && page) {
          page.drawCircle({
            x: cx + bulletIndent * 0.35,
            y: pdfY(y + recSize * 0.6),
            size: recSize * 0.16,
            color: colors.black,
          });
        }
        drawLine(line, cx + bulletIndent, y, undefined, recSize);
        y += recLh;
      });
    }
    return y;
  };
  const leftEnd = drawColumn(RECORDS_LEFT, innerX);
  const rightEnd = drawColumn(RECORDS_RIGHT, innerX + colW + 10);
  y = Math.max(leftEnd, rightEnd, boxTop + boxH - pad);
  y = boxTop + boxH + gap;

  // ── Notice box ────────────────────────────────────────────────────────
  const noticeLines = wrapRuns(NOTICE, fonts, size, innerW);
  const noticeH = pad * 2 + noticeLines.length * lh - (lh - size) ;
  const noticeTop = y;
  if (page) {
    page.drawRectangle({
      x: MARGIN_X,
      y: pdfY(noticeTop + noticeH),
      width: CONTENT_W,
      height: noticeH,
      color: colors.grayFill,
      borderColor: colors.black,
      borderWidth: 1,
    });
  }
  y = noticeTop + pad - (lh - size) / 2;
  drawPara(NOTICE, innerX, innerW);
  y = noticeTop + noticeH + gap;

  // ── Sections ──────────────────────────────────────────────────────────
  const sectionInitials: RiderAnchors['sectionInitials'] = [];
  for (const section of SECTIONS) {
    drawPara(section.para, MARGIN_X, CONTENT_W);
    if (section.initials) {
      // "Merchant Initials ____  Guarantor Initials ____" line, left-aligned like
      // the contract's own initials (x=110). Every initial box keeps room on its
      // right for the owner-2 copy that envelope build adds at +108pt
      // (OWNER2_INITIAL_OFFSET_X), so no box can land off the page.
      y += size * 0.5;
      const top = y;
      const gLabel = 'Guarantor Initials';
      const mLabel = 'Merchant Initials';
      const gLabelW = fonts.bold.widthOfTextAtSize(gLabel, size);
      const mBlankX = INITIALS_FIRST_X;
      const mBlankEnd = mBlankX + OWNER2_COPY_OFFSET_X + 92;
      const gLabelX = mBlankEnd + 14;
      const gBlankX = gLabelX + gLabelW + 6;
      const baseline = top + size * 1.9;
      label(mLabel, MARGIN_X, baseline - size, true);
      hLine(mBlankX, mBlankEnd, baseline + 1);
      label(gLabel, gLabelX, baseline - size, true);
      hLine(gBlankX, PAGE_W - MARGIN_X, baseline + 1);
      sectionInitials.push({
        merchantX: mBlankX + 2,
        guarantorX: gBlankX + 2,
        yTop: baseline - 20,
      });
      y = baseline + size * 0.6;
    }
    y += gap * 0.6;
  }

  // ── Signature block ───────────────────────────────────────────────────
  y += gap;
  const sigRow = Math.max(lh * 2.3, 24); // room for DocuSign signature tabs
  const leftX = MARGIN_X;
  const rightX = 400;
  const sigTop = y;
  label('MERCHANT AND GUARANTOR', leftX, y, true);
  const afterHead = fonts.bold.widthOfTextAtSize('MERCHANT AND GUARANTOR', size);
  label(' (signed by the owner in both capacities)', leftX + afterHead, y);
  label('PURCHASER', rightX, y, true);
  y += sigRow * 0.75;

  // Row 1: business name | purchaser company
  let r1 = y + size;
  let lx = label('Business Name (Merchant): ', leftX, y);
  const sigMerchantBusinessName = { x: lx, yTop: y - TEXT_TAB_RAISE, w: rightX - 20 - lx };
  hLine(lx, rightX - 20, r1 + 1.5);
  let rx = label('Company Name: ', rightX, y);
  label(purchaserName || '', rx + 1, y);
  hLine(rx, PAGE_W - MARGIN_X, r1 + 1.5);
  y += sigRow;

  // Row 2: By (signature) / Name / Title / Date  |  By / Name
  r1 = y + size;
  lx = label('By: ', leftX, y);
  const sigMerchantBy = { x: lx + 4, yTop: y - 16 };
  hLine(lx, lx + 95, r1 + 1.5);
  lx += 100;
  lx = label('Name: ', lx, y);
  const sigMerchantName = { x: lx, yTop: y - TEXT_TAB_RAISE, w: 85 };
  hLine(lx, lx + 85, r1 + 1.5);
  lx += 90;
  lx = label('Title: ', lx, y);
  label('Owner', lx + 2, y);
  hLine(lx, lx + 40, r1 + 1.5);
  lx += 45;
  lx = label('Date: ', lx, y);
  const sigMerchantDate = { x: lx + 1, yTop: y - TEXT_TAB_RAISE };
  hLine(lx, rightX - 20, r1 + 1.5);
  rx = label('By: ', rightX, y);
  hLine(rx, rx + 70, r1 + 1.5);
  rx += 75;
  rx = label('Name: ', rx, y);
  hLine(rx, PAGE_W - MARGIN_X, r1 + 1.5);
  y += size + 2;
  label('(on behalf of Merchant)', leftX + 18, y);
  y += sigRow - size - 2;

  // Row 3: Guarantor signature / printed name / date  |  Title / Date
  r1 = y + size;
  lx = label('Individually, as Guarantor: ', leftX, y);
  const sigGuarantor = { x: lx + 4, yTop: y - 16 };
  hLine(lx, lx + 95, r1 + 1.5);
  lx += 100;
  lx = label('Printed Name: ', lx, y);
  const sigGuarantorName = { x: lx, yTop: y - TEXT_TAB_RAISE, w: 75 };
  hLine(lx, lx + 75, r1 + 1.5);
  lx += 80;
  lx = label('Date: ', lx, y);
  const sigGuarantorDate = { x: lx + 1, yTop: y - TEXT_TAB_RAISE };
  hLine(lx, rightX - 20, r1 + 1.5);
  rx = label('Title: ', rightX, y);
  hLine(rx, rx + 70, r1 + 1.5);
  rx += 75;
  rx = label('Date: ', rx, y);
  hLine(rx, PAGE_W - MARGIN_X, r1 + 1.5);
  y += lh;
  void sigTop;

  // ── Footer initials (matches the contract's per-page initials) ────────
  const footerLabel = 'Merchant Initials';
  // Same spot as the contract's own page initials (x=110, y=718).
  const footerBlankX = INITIALS_FIRST_X;
  const FOOTER_INITIAL_Y_TOP = 718;
  const footerBaseline = FOOTER_INITIAL_Y_TOP + 20;
  label(footerLabel, MARGIN_X, footerBaseline - size, true);
  hLine(footerBlankX, footerBlankX + OWNER2_COPY_OFFSET_X + 92, footerBaseline + 1);

  return {
    // reserve the footer band (initial tab ≈ 22pt tall)
    bottom: y,
    anchors: {
      sectionInitials,
      footerInitialX: footerBlankX + 2,
      footerInitialYTop: footerBaseline - 20,
      agreementDate,
      merchantName,
      guarantorName,
      sigMerchantBusinessName,
      sigMerchantBy,
      sigMerchantName,
      sigMerchantDate,
      sigGuarantor,
      sigGuarantorName,
      sigGuarantorDate,
    },
  };
}

/** Render the rider as a standalone one-page PDF and return its tab anchors. */
export async function renderAntiDebtSettlementRiderPdf(
  purchaserName = '',
): Promise<{ pdf: Buffer; anchors: RiderAnchors }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const colors: Colors = {
    black: rgb(0, 0, 0),
    red: rgb(0.8, 0, 0),
    redFill: rgb(1, 0.92, 0.92),
    grayFill: rgb(0.95, 0.95, 0.95),
    gray: rgb(0.4, 0.4, 0.4),
  };

  // Largest font size whose layout fits above the footer band → no overlap.
  const limit = 712; // content must end above the footer initial tab (y=718)
  let size = 8;
  while (size > 5 && layoutRider(null, fonts, colors, size, purchaserName).bottom > limit) {
    size -= 0.1;
  }

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const { anchors } = layoutRider(page, fonts, colors, size, purchaserName);
  return { pdf: Buffer.from(await doc.save()), anchors };
}

function riderPlacements(
  anchors: RiderAnchors,
  documentId: string,
  pageNumber: number,
): DocumentLayoutPlacement[] {
  const page = String(pageNumber);
  const r = (n: number) => String(Math.round(n));
  const base = { documentId, pageNumber: page, signerRole: 'Signer', signerParty: 'primary' as const };
  const out: DocumentLayoutPlacement[] = [];

  const text = (id: string, variable: string, a: { x: number; yTop: number; w: number }) =>
    out.push({
      ...base,
      id,
      type: 'text',
      variable,
      x: r(a.x),
      y: r(a.yTop),
      width: r(a.w),
      height: '12',
      optional: true,
      sourceTabLabel: `${variable}_rider`,
    });
  const tab = (id: string, type: 'signature' | 'initial' | 'date', x: number, yTop: number) => {
    if (type === 'initial' && x > MAX_PRIMARY_INITIAL_X) {
      throw new Error(`Rider initial "${id}" at x=${x} would put the owner-2 copy off the page.`);
    }
    out.push({
      ...base,
      id,
      type,
      slot: `${type}_rider_${r(x)}_${r(yTop)}`,
      x: r(x),
      y: r(yTop),
      optional: false,
      sourceTabLabel: `rider_${id}`,
    });
  };

  text('rider_agreement_date', 'agreement_date', anchors.agreementDate);
  text('rider_merchant_name', 'client_legal_name', anchors.merchantName);
  text('rider_guarantor_name', 'owner1_guarantor_name', anchors.guarantorName);
  text('rider_sig_business_name', 'client_legal_name', anchors.sigMerchantBusinessName);
  text('rider_sig_merchant_name', 'owner1_guarantor_name', anchors.sigMerchantName);
  text('rider_sig_guarantor_name', 'owner1_guarantor_name', anchors.sigGuarantorName);

  anchors.sectionInitials.forEach((s, i) => {
    tab(`rider_init_m${i}`, 'initial', s.merchantX, s.yTop);
    tab(`rider_init_g${i}`, 'initial', s.guarantorX, s.yTop);
  });
  tab('rider_init_footer', 'initial', anchors.footerInitialX, anchors.footerInitialYTop);
  tab('rider_sig_merchant', 'signature', anchors.sigMerchantBy.x, anchors.sigMerchantBy.yTop);
  tab('rider_sig_guarantor', 'signature', anchors.sigGuarantor.x, anchors.sigGuarantor.yTop);
  tab('rider_date_merchant', 'date', anchors.sigMerchantDate.x, anchors.sigMerchantDate.yTop);
  tab('rider_date_guarantor', 'date', anchors.sigGuarantorDate.x, anchors.sigGuarantorDate.yTop);
  return out;
}

/**
 * 1-based page number where the rider goes: right after the opening agreement
 * section, i.e. before the first page (after page 1) whose text has
 * "TERMS AND CONDITIONS OF ...". Falls back to page 3 when no such page is found.
 */
export async function findAntiDebtRiderPageNumber(pdf: Buffer): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const pages: string[] = [];
    await pdfParse(pdf, {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
      }) => {
        const tc = await pageData.getTextContent();
        const text = tc.items.map((it) => it.str).join(' ');
        pages.push(text);
        return text;
      },
    });
    const norm = (t: string) => t.replace(/\s+/g, ' ').toUpperCase();
    // Texas Alliance loan agreement: page 1 is the cover/summary, rider follows it.
    if (/COMMERCIAL LOAN AND SECURITY AGREEMENT/.test(norm(pages[0] || ''))) return 2;
    for (let i = 1; i < pages.length; i += 1) {
      // The section heading ("TERMS AND CONDITIONS OF MERCHANT AGREEMENT"), not the
      // quoted reference to it in the opening agreement text.
      if (/TERMS AND CONDITIONS OF/.test(norm(pages[i]))) return i + 1;
    }
  } catch (err) {
    console.warn('[Rider] could not detect Terms and Conditions page, using default:', err);
  }
  return ANTI_DEBT_RIDER_PAGE_NUMBER;
}

async function insertRiderPage(mainPdf: Buffer, purchaserName: string) {
  const { PDFDocument } = await import('pdf-lib');
  const mainDoc = await PDFDocument.load(mainPdf);
  const pageCount = mainDoc.getPageCount();
  const pageNumber = Math.min(await findAntiDebtRiderPageNumber(mainPdf), pageCount + 1);
  const { pdf, anchors } = await renderAntiDebtSettlementRiderPdf(purchaserName);
  const riderDoc = await PDFDocument.load(pdf);
  const [riderPage] = await mainDoc.copyPages(riderDoc, [0]);
  mainDoc.insertPage(pageNumber - 1, riderPage);
  return { pdf: Buffer.from(await mainDoc.save()), pageNumber, anchors };
}

/**
 * Insert the rider before the contract's Terms and Conditions (page 3 in the
 * standard contracts) and shift every later placement down one page.
 */
export async function insertAntiDebtSettlementRider<
  T extends DocumentLayout & { documentBase64: string },
>(layout: T, options: { purchaserName?: string } = {}): Promise<T> {
  if ((layout as T & { antiDebtRiderInserted?: boolean }).antiDebtRiderInserted) return layout;
  const main = Buffer.from(layout.documentBase64, 'base64');
  const { PDFDocument } = await import('pdf-lib');
  if ((await PDFDocument.load(main)).getPageCount() < 1) return layout;

  const { pdf, pageNumber, anchors } = await insertRiderPage(main, options.purchaserName || '');
  const documentId = layout.document?.documentId || '1';
  const shifted = layout.placements.map((p) => {
    const n = parseInt(String(p.pageNumber || '1'), 10) || 1;
    return n >= pageNumber ? { ...p, pageNumber: String(n + 1) } : p;
  });

  return {
    ...layout,
    documentBase64: pdf.toString('base64'),
    document: {
      ...layout.document,
      pageCount: layout.document?.pageCount ? layout.document.pageCount + 1 : undefined,
    },
    placements: [...shifted, ...riderPlacements(anchors, documentId, pageNumber)],
    antiDebtRiderInserted: true,
  };
}

/** Insert the rider into a raw contract PDF buffer (template preview downloads). */
export async function insertAntiDebtRiderIntoPdfBuffer(
  buf: Buffer,
  purchaserName = '',
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  if ((await PDFDocument.load(buf)).getPageCount() < 1) return buf;
  return (await insertRiderPage(buf, purchaserName)).pdf;
}
