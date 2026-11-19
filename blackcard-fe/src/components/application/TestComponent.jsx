import { useState, useRef, useCallback, useMemo } from "react";

// ─── DESIGN TOKENS ───
const C = {
  bg: "#0B0E14", bgCard: "#111621", bgCardHover: "#161C2A", bgSurface: "#0E1219",
  border: "#1C2333", borderActive: "#2A3654",
  text: "#E4E8F1", textMuted: "#6B7A99", textDim: "#3D4A66",
  accent: "#4F8CFF", accentGlow: "rgba(79,140,255,0.15)",
  green: "#34D399", greenBg: "rgba(52,211,153,0.1)",
  yellow: "#FBBF24", yellowBg: "rgba(251,191,36,0.1)",
  orange: "#FB923C", orangeBg: "rgba(251,146,60,0.1)",
  red: "#F87171", redBg: "rgba(248,113,113,0.1)",
  purple: "#A78BFA", purpleBg: "rgba(167,139,250,0.1)",
  cyan: "#22D3EE", cyanBg: "rgba(34,211,238,0.1)",
};
const fmt = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n) => (n * 100).toFixed(1) + "%";

// ─── ICON ───
const Icon = ({ name, size = 18, color = C.textMuted }) => {
  const d = {
    pipeline:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    list:<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    search:<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    plus:<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    chart:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    users:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    dollar:<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    file:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    chevron:<><polyline points="9 18 15 12 9 6"/></>,
    chevronDown:<><polyline points="6 9 12 15 18 9"/></>,
    bell:<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    home:<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    briefcase:<><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    layers:<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    x:<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check:<><polyline points="20 6 9 17 4 12"/></>,
    clock:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    activity:<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    eye:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    send:<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    download:<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    alertTriangle:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    repeat:<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    zap:<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    printer:<><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
    creditCard:<><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    inbox:<><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    checkCircle:<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    xCircle:<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
    edit:<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    clipboard:<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    mail:<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    paperclip:<><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></>,
    reply:<><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
    trash:<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    copy:<><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    calendar:<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    filePlus:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></>,
    tag:<><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d[name]||null}</svg>;
};

// ─── SHARED UI ───
const Badge = ({ label, color, bg }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
);
const StatCard = ({ label, value, sub, icon, color }) => (
  <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", flex: 1, minWidth: 145, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 12, right: 14, opacity: 0.12 }}><Icon name={icon} size={30} color={color}/></div>
    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color, marginTop: 3, fontWeight: 500 }}>{sub}</div>}
  </div>
);
const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, background: C.bgCard, borderRadius: 10, border: `1px solid ${C.border}`, padding: 3, flexWrap: "wrap" }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        padding: "7px 13px", border: "none", borderRadius: 8, cursor: "pointer",
        background: active === t.id ? C.accent : "transparent",
        color: active === t.id ? "#fff" : C.textMuted,
        fontSize: 12, fontWeight: 600, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5
      }}>
        <Icon name={t.icon} size={13} color={active === t.id ? "#fff" : C.textMuted}/>
        {t.label}
        {t.count != null && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: active === t.id ? "rgba(255,255,255,0.2)" : C.border, color: active === t.id ? "#fff" : C.textDim }}>{t.count}</span>}
      </button>
    ))}
  </div>
);
const ProgressBar = ({ value, max, color = C.accent, height = 6 }) => (
  <div style={{ height, background: C.border, borderRadius: height, overflow: "hidden", flex: 1 }}>
    <div style={{ height: "100%", width: `${Math.min((value/max)*100,100)}%`, background: color, borderRadius: height, transition: "width 0.4s ease" }}/>
  </div>
);
const Btn = ({ children, primary, danger, small, disabled, onClick, style: sx }) => (
  <button disabled={disabled} onClick={onClick} style={{
    padding: small ? "6px 10px" : "9px 16px", border: primary || danger ? "none" : `1px solid ${C.border}`,
    borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    background: danger ? C.red : primary ? C.accent : C.bgCard,
    color: primary || danger ? "#fff" : C.textMuted, fontSize: small ? 11 : 12,
    fontWeight: 600, transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 5,
    opacity: disabled ? 0.4 : 1, ...sx
  }}>{children}</button>
);
const Input = ({ label, value, onChange, placeholder, textarea, type = "text", style: sx }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...sx }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    {textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={5}
        style={{ background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }}/>
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }}/>
    )}
  </div>
);
const Select = ({ label, value, onChange, options, style: sx }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...sx }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px",
      color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer",
      WebkitAppearance: "none", MozAppearance: "none", appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7A99' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center"
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// Modal
const Modal = ({ title, open, onClose, children, width = 560 }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}/>
      <div style={{ position: "relative", width, maxHeight: "85vh", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", animation: "fadeUp 0.2s ease" }}>
        <style>{`@keyframes fadeUp { from { transform: translateY(12px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>
          <div onClick={onClose} style={{ cursor: "pointer", padding: 4 }}><Icon name="x" size={16} color={C.textMuted}/></div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── DATA ───
// ═══════════════════════════════════════════════════════════════
const INITIAL_TEMPLATES = [
  { id: "tpl-1", name: "Purchase Agreement", category: "contract", variables: ["{{merchant_name}}", "{{business_name}}", "{{advance_amount}}", "{{factor_rate}}", "{{payback_amount}}", "{{daily_payment}}", "{{term_months}}"], body: "This Purchase Agreement is entered into between FusionMCA (\"Purchaser\") and {{merchant_name}} (\"Merchant\"), operating as {{business_name}}.\n\nPurchaser agrees to purchase future receivables in the amount of {{advance_amount}} at a factor rate of {{factor_rate}}, for a total payback of {{payback_amount}}.\n\nDaily payment shall be {{daily_payment}} for an estimated term of {{term_months}} months.\n\nMerchant acknowledges this is not a loan but a purchase of future receivables.", status: "active", lastEdited: "2026-03-10" },
  { id: "tpl-2", name: "Personal Guarantee", category: "contract", variables: ["{{merchant_name}}", "{{owner_ssn_last4}}", "{{advance_amount}}"], body: "I, {{merchant_name}}, personally guarantee the obligations of the business under the Purchase Agreement for the advance amount of {{advance_amount}}.\n\nSSN (last 4): {{owner_ssn_last4}}\n\nI understand that this guarantee survives any default.", status: "active", lastEdited: "2026-03-08" },
  { id: "tpl-3", name: "Welcome Email", category: "email", variables: ["{{merchant_name}}", "{{business_name}}", "{{agent_name}}", "{{advance_amount}}"], body: "Dear {{merchant_name}},\n\nWelcome to FusionMCA! Your application for {{business_name}} has been received.\n\nYour agent {{agent_name}} will guide you through the process. Requested advance: {{advance_amount}}.\n\nBest regards,\nFusionMCA Operations", status: "active", lastEdited: "2026-03-12" },
  { id: "tpl-4", name: "Funding Confirmation", category: "email", variables: ["{{merchant_name}}", "{{advance_amount}}", "{{daily_payment}}", "{{funded_date}}"], body: "Dear {{merchant_name}},\n\nGreat news! Your merchant cash advance of {{advance_amount}} has been funded on {{funded_date}}.\n\nYour daily payment of {{daily_payment}} will begin in 2 business days.\n\nThank you for choosing FusionMCA.", status: "active", lastEdited: "2026-03-14" },
  { id: "tpl-5", name: "Missed Payment Notice", category: "email", variables: ["{{merchant_name}}", "{{missed_date}}", "{{daily_payment}}", "{{remaining_balance}}"], body: "Dear {{merchant_name}},\n\nWe were unable to process your scheduled payment of {{daily_payment}} on {{missed_date}}.\n\nYour remaining balance is {{remaining_balance}}. Please ensure sufficient funds are available.\n\nRegards,\nFusionMCA Collections", status: "active", lastEdited: "2026-03-16" },
  { id: "tpl-6", name: "Payoff Confirmation", category: "email", variables: ["{{merchant_name}}", "{{payoff_amount}}", "{{payoff_date}}"], body: "Dear {{merchant_name}},\n\nThis confirms your account has been paid in full as of {{payoff_date}}. Total payoff: {{payoff_amount}}.\n\nThank you for your business.\n\nBest,\nFusionMCA", status: "active", lastEdited: "2026-03-18" },
];

const INITIAL_EMAILS = [
  { id: "em-1", to: "maria@greenleaf.com", toName: "Maria Santos", subject: "Welcome to FusionMCA – Green Leaf Landscaping", template: "tpl-3", status: "delivered", sentAt: "2026-03-15 10:22 AM", openedAt: "2026-03-15 11:45 AM" },
  { id: "em-2", to: "david@techfix.com", toName: "David Chen", subject: "Your Advance Has Been Funded!", template: "tpl-4", status: "delivered", sentAt: "2026-03-18 2:10 PM", openedAt: "2026-03-18 3:30 PM" },
  { id: "em-3", to: "frank@downtowndeli.com", toName: "Frank Russo", subject: "Missed Payment Notice – Downtown Deli Co", template: "tpl-5", status: "delivered", sentAt: "2026-03-15 9:00 AM", openedAt: null },
  { id: "em-4", to: "isabella@bellasalon.com", toName: "Isabella Cruz", subject: "Payoff Confirmation – Bella's Salon & Spa", template: "tpl-6", status: "sent", sentAt: "2026-03-20 4:15 PM", openedAt: null },
  { id: "em-5", to: "jake@cloudnine.com", toName: "Jake Miller", subject: "URGENT: Missed Payment Notice", template: "tpl-5", status: "bounced", sentAt: "2026-03-14 8:30 AM", openedAt: null },
  { id: "em-6", to: "raj@metroquickmart.com", toName: "Raj Patel", subject: "Welcome to FusionMCA", template: "tpl-3", status: "queued", sentAt: null, openedAt: null },
];

// Generate repayment schedule for a deal
const generateSchedule = (id, deal, merchant, amount, factor, dailyPmt, startDate, totalPayments, paidCount, missedDays) => {
  const payments = [];
  const start = new Date(startDate);
  let payNum = 0;
  for (let i = 0; payNum < totalPayments; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    payNum++;
    const dateStr = d.toISOString().split("T")[0];
    const today = new Date("2026-03-22");
    const isPast = d <= today;
    const isMissed = missedDays.includes(payNum);
    let status = "scheduled";
    if (isPast && !isMissed) status = "paid";
    else if (isPast && isMissed) status = "failed";
    else if (!isPast && d.toDateString() === today.toDateString()) status = "due_today";
    else if (!isPast) {
      const diff = Math.ceil((d - today) / 86400000);
      status = diff <= 5 ? "upcoming" : "scheduled";
    }
    payments.push({ payNum, date: dateStr, amount: dailyPmt, status, refId: `ACH-${id}-${String(payNum).padStart(3,"0")}` });
  }
  return { id, deal, merchant, advanceAmount: amount, factor, paybackAmount: Math.round(amount * factor), dailyPayment: dailyPmt, startDate, totalPayments, payments };
};

const MISSED_DELI = [58,59,60,61,62,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89];
const MISSED_VAPES = Array.from({length:28}, (_,i) => i+42);

const INITIAL_SCHEDULES = [
  generateSchedule("R-3001", "Atlas Auto Repair", "Tom Wilson", 60000, 1.38, 329, "2026-01-10", 252, 50, []),
  generateSchedule("R-3002", "Sunrise Bakery", "Kim Nguyen", 25000, 1.45, 144, "2025-11-01", 252, 201, []),
  generateSchedule("R-3003", "Downtown Deli Co", "Frank Russo", 30000, 1.50, 179, "2025-12-15", 252, 65, MISSED_DELI),
  generateSchedule("R-3004", "Bella's Salon & Spa", "Isabella Cruz", 45000, 1.42, 254, "2025-09-20", 252, 200, [120]),
  generateSchedule("R-3005", "CloudNine Vapes", "Jake Miller", 40000, 1.55, 246, "2025-12-01", 252, 70, MISSED_VAPES),
];

const emailStatusMap = {
  queued: { label: "Queued", color: C.textMuted, bg: "rgba(107,122,153,0.1)" },
  sent: { label: "Sent", color: C.accent, bg: C.accentGlow },
  delivered: { label: "Delivered", color: C.green, bg: C.greenBg },
  opened: { label: "Opened", color: C.cyan, bg: C.cyanBg },
  bounced: { label: "Bounced", color: C.red, bg: C.redBg },
  failed: { label: "Failed", color: C.red, bg: C.redBg },
};
const paymentStatusMap = {
  paid: { label: "Paid", color: C.green, bg: C.greenBg },
  failed: { label: "Failed / NSF", color: C.red, bg: C.redBg },
  due_today: { label: "Due Today", color: C.yellow, bg: C.yellowBg },
  upcoming: { label: "Upcoming", color: C.cyan, bg: C.cyanBg },
  scheduled: { label: "Scheduled", color: C.textMuted, bg: "rgba(107,122,153,0.08)" },
  reversed: { label: "Reversed", color: C.orange, bg: C.orangeBg },
  waived: { label: "Waived", color: C.purple, bg: C.purpleBg },
  manual: { label: "Manual", color: C.accent, bg: C.accentGlow },
};

// ═══════════════════════════════════════════════════════════════
// ─── TEMPLATES VIEW ───
// ═══════════════════════════════════════════════════════════════
const TemplatesView = () => {
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [newTpl, setNewTpl] = useState({ name: "", category: "contract", body: "", variables: "" });

  const filtered = filterCat === "all" ? templates : templates.filter(t => t.category === filterCat);

  const addTemplate = () => {
    const vars = newTpl.variables.split(",").map(v => v.trim()).filter(Boolean);
    const tpl = { id: `tpl-${Date.now()}`, name: newTpl.name, category: newTpl.category, variables: vars, body: newTpl.body, status: "active", lastEdited: "2026-03-22" };
    setTemplates(prev => [...prev, tpl]);
    setNewTpl({ name: "", category: "contract", body: "", variables: "" });
    setShowAdd(false);
    setSelected(tpl);
  };

  const deleteTemplate = (id) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 16, height: "100%" }}>
        {/* List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {["all", "contract", "email"].map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)} style={{
                padding: "5px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600,
                background: filterCat === cat ? C.accent : C.bgSurface, color: filterCat === cat ? "#fff" : C.textMuted,
                textTransform: "capitalize"
              }}>{cat === "all" ? "All Templates" : cat}</button>
            ))}
            <Btn small primary onClick={() => setShowAdd(true)} style={{ marginLeft: "auto" }}><Icon name="plus" size={12} color="#fff"/>New Template</Btn>
          </div>
          {filtered.map(t => (
            <div key={t.id} onClick={() => setSelected(t)} style={{
              background: selected?.id === t.id ? C.bgCardHover : C.bgCard, border: `1px solid ${selected?.id === t.id ? C.accent : C.border}`,
              borderRadius: 10, padding: 14, cursor: "pointer", transition: "all 0.15s"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name={t.category === "contract" ? "file" : "mail"} size={14} color={t.category === "contract" ? C.yellow : C.cyan}/>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.name}</span>
                </div>
                <Badge label={t.category} color={t.category === "contract" ? C.yellow : C.cyan} bg={t.category === "contract" ? C.yellowBg : C.cyanBg}/>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.variables.slice(0,4).map((v,i) => (
                  <span key={i} style={{ fontSize: 10, color: C.purple, background: C.purpleBg, padding: "1px 6px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
                ))}
                {t.variables.length > 4 && <span style={{ fontSize: 10, color: C.textDim }}>+{t.variables.length - 4} more</span>}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Last edited: {t.lastEdited}</div>
            </div>
          ))}
        </div>

        {/* Preview / Edit */}
        <div style={{ width: 380, flexShrink: 0, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (
            <>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selected.name}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => { const copy = { ...selected, id: `tpl-${Date.now()}`, name: selected.name + " (Copy)" }; setTemplates(p => [...p, copy]); setSelected(copy); }}><Icon name="copy" size={12} color={C.textMuted}/></Btn>
                    <Btn small danger onClick={() => deleteTemplate(selected.id)}><Icon name="trash" size={12} color="#fff"/></Btn>
                  </div>
                </div>
                <Badge label={selected.category} color={selected.category === "contract" ? C.yellow : C.cyan} bg={selected.category === "contract" ? C.yellowBg : C.cyanBg}/>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Variables</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
                  {selected.variables.map((v,i) => (
                    <span key={i} style={{ fontSize: 11, color: C.purple, background: C.purpleBg, padding: "2px 8px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${C.purple}30` }}>{v}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Template Body</div>
                <div style={{ background: "#fff", borderRadius: 8, padding: 20, color: "#1a1a1a", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif" }}>
                  {selected.body.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                    part.startsWith("{{") ? <span key={i} style={{ background: "#E8E0FF", color: "#6B46C1", padding: "1px 4px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{part}</span> : <span key={i}>{part}</span>
                  )}
                </div>
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                <Btn style={{ flex: 1 }}><Icon name="edit" size={13} color={C.textMuted}/>Edit Template</Btn>
                <Btn primary style={{ flex: 1 }}><Icon name="copy" size={13} color="#fff"/>Use in Email</Btn>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textDim, gap: 8 }}>
              <Icon name="file" size={36} color={C.textDim}/><div style={{ fontSize: 13 }}>Select a template to preview</div>
            </div>
          )}
        </div>
      </div>

      {/* Add Template Modal */}
      <Modal title="Create New Template" open={showAdd} onClose={() => setShowAdd(false)} width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Template Name" value={newTpl.name} onChange={v => setNewTpl(p => ({ ...p, name: v }))} placeholder="e.g. Default Notice"/>
          <Select label="Category" value={newTpl.category} onChange={v => setNewTpl(p => ({ ...p, category: v }))} options={[{ value: "contract", label: "Contract" }, { value: "email", label: "Email" }]}/>
          <Input label="Variables (comma separated)" value={newTpl.variables} onChange={v => setNewTpl(p => ({ ...p, variables: v }))} placeholder="{{merchant_name}}, {{amount}}"/>
          <Input label="Template Body" textarea value={newTpl.body} onChange={v => setNewTpl(p => ({ ...p, body: v }))} placeholder="Write your template content. Use {{variable}} placeholders..."/>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn primary disabled={!newTpl.name || !newTpl.body} onClick={addTemplate}><Icon name="plus" size={13} color="#fff"/>Create Template</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── EMAILS VIEW ───
// ═══════════════════════════════════════════════════════════════
const EmailsView = () => {
  const [emails, setEmails] = useState(INITIAL_EMAILS);
  const [selected, setSelected] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [compose, setCompose] = useState({ to: "", toName: "", subject: "", body: "", template: "" });
  const templates = INITIAL_TEMPLATES.filter(t => t.category === "email");

  const filtered = filterStatus === "all" ? emails : emails.filter(e => e.status === filterStatus);

  const handleTemplateSelect = (tplId) => {
    const tpl = INITIAL_TEMPLATES.find(t => t.id === tplId);
    if (tpl) {
      setCompose(p => ({ ...p, template: tplId, body: tpl.body, subject: tpl.name === "Welcome Email" ? "Welcome to FusionMCA" : tpl.name }));
    }
  };

  const sendEmail = () => {
    const em = {
      id: `em-${Date.now()}`, to: compose.to, toName: compose.toName || compose.to,
      subject: compose.subject, template: compose.template || null,
      status: "queued", sentAt: new Date().toLocaleString("en-US"), openedAt: null
    };
    setEmails(prev => [em, ...prev]);
    setCompose({ to: "", toName: "", subject: "", body: "", template: "" });
    setShowCompose(false);
  };

  const delivered = emails.filter(e => e.status === "delivered").length;
  const opened = emails.filter(e => e.openedAt).length;
  const bounced = emails.filter(e => e.status === "bounced").length;

  return (
    <>
      <div style={{ display: "flex", gap: 16, height: "100%" }}>
        {/* List */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            {["all","queued","sent","delivered","bounced"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: "5px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                background: filterStatus === s ? C.accent : C.bgSurface, color: filterStatus === s ? "#fff" : C.textMuted
              }}>{s}</button>
            ))}
            <Btn small primary onClick={() => setShowCompose(true)} style={{ marginLeft: "auto" }}><Icon name="edit" size={12} color="#fff"/>Compose</Btn>
          </div>

          {/* Stats mini */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1, background: C.bgSurface, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textDim }}>Sent</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.accent }}>{emails.length}</div>
            </div>
            <div style={{ flex: 1, background: C.bgSurface, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textDim }}>Delivered</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{delivered}</div>
            </div>
            <div style={{ flex: 1, background: C.bgSurface, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textDim }}>Open Rate</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.cyan }}>{emails.length > 0 ? Math.round((opened / emails.length) * 100) : 0}%</div>
            </div>
            <div style={{ flex: 1, background: C.bgSurface, borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textDim }}>Bounced</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.red }}>{bounced}</div>
            </div>
          </div>

          {filtered.map(em => {
            const s = emailStatusMap[em.status];
            return (
              <div key={em.id} onClick={() => setSelected(em)} style={{
                background: selected?.id === em.id ? C.bgCardHover : C.bgCard, border: `1px solid ${selected?.id === em.id ? C.accent : C.border}`,
                borderRadius: 10, padding: 14, cursor: "pointer", transition: "all 0.15s"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{em.toName}</span>
                  <Badge label={s.label} color={s.color} bg={s.bg}/>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>{em.subject}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textDim }}>
                  <span>{em.to}</span>
                  {em.sentAt && <span style={{ marginLeft: "auto" }}>{em.sentAt}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview */}
        <div style={{ width: 380, flexShrink: 0, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selected ? (() => {
            const s = emailStatusMap[selected.status];
            const tpl = INITIAL_TEMPLATES.find(t => t.id === selected.template);
            return (
              <>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{selected.subject}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge label={s.label} color={s.color} bg={s.bg}/>
                    {selected.openedAt && <span style={{ fontSize: 11, color: C.cyan }}>Opened {selected.openedAt}</span>}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  <div style={{ marginBottom: 16 }}>
                    {[{ k: "To", v: `${selected.toName} <${selected.to}>` }, { k: "Sent", v: selected.sentAt || "Queued" }, { k: "Template", v: tpl?.name || "None" }, { k: "Status", v: s.label }].map((r,i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.textMuted }}>{r.k}</span>
                        <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                  {tpl && (
                    <div style={{ background: "#fff", borderRadius: 8, padding: 20, color: "#1a1a1a", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {tpl.body.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                        part.startsWith("{{") ? <span key={i} style={{ background: "#E8E0FF", color: "#6B46C1", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>{part}</span> : <span key={i}>{part}</span>
                      )}
                    </div>
                  )}
                  {/* Tracking Timeline */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Delivery Timeline</div>
                    {[
                      selected.sentAt && { time: selected.sentAt, text: "Email sent", color: C.accent },
                      selected.status === "delivered" && { time: selected.sentAt, text: "Delivered to inbox", color: C.green },
                      selected.openedAt && { time: selected.openedAt, text: "Opened by recipient", color: C.cyan },
                      selected.status === "bounced" && { time: selected.sentAt, text: "Bounced — invalid address", color: C.red },
                    ].filter(Boolean).map((evt,i,arr) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: evt.color, marginTop: 4 }}/>
                          {i < arr.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, marginTop: 4 }}/>}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: C.text }}>{evt.text}</div>
                          <div style={{ fontSize: 11, color: C.textDim }}>{evt.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                  <Btn style={{ flex: 1 }}><Icon name="reply" size={13} color={C.textMuted}/>Resend</Btn>
                  <Btn primary style={{ flex: 1 }}><Icon name="send" size={13} color="#fff"/>Forward</Btn>
                </div>
              </>
            );
          })() : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textDim, gap: 8 }}>
              <Icon name="mail" size={36} color={C.textDim}/><div style={{ fontSize: 13 }}>Select an email to preview</div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      <Modal title="Compose Email" open={showCompose} onClose={() => setShowCompose(false)} width={580}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Select label="Use Template (optional)" value={compose.template} onChange={handleTemplateSelect}
            options={[{ value: "", label: "— No template —" }, ...templates.map(t => ({ value: t.id, label: t.name }))]}/>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="Recipient Name" value={compose.toName} onChange={v => setCompose(p => ({...p, toName: v}))} placeholder="Maria Santos" style={{ flex: 1 }}/>
            <Input label="Email Address" value={compose.to} onChange={v => setCompose(p => ({...p, to: v}))} placeholder="merchant@email.com" style={{ flex: 1 }}/>
          </div>
          <Input label="Subject" value={compose.subject} onChange={v => setCompose(p => ({...p, subject: v}))} placeholder="Subject line..."/>
          <Input label="Message Body" textarea value={compose.body} onChange={v => setCompose(p => ({...p, body: v}))} placeholder="Write your message or select a template above..."/>
          {compose.body && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Preview</div>
              <div style={{ background: "#fff", borderRadius: 8, padding: 16, color: "#1a1a1a", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto" }}>
                {compose.body.split(/(\{\{[^}]+\}\})/).map((part, i) =>
                  part.startsWith("{{") ? <span key={i} style={{ background: "#E8E0FF", color: "#6B46C1", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>{part}</span> : <span key={i}>{part}</span>
                )}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <Btn onClick={() => setShowCompose(false)}>Cancel</Btn>
            <Btn primary disabled={!compose.to || !compose.subject || !compose.body} onClick={sendEmail}><Icon name="send" size={13} color="#fff"/>Send Email</Btn>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── REPAYMENTS VIEW ───
// ═══════════════════════════════════════════════════════════════
const RepaymentsView = () => {
  const [schedules, setSchedules] = useState(INITIAL_SCHEDULES);
  const [selectedAcct, setSelectedAcct] = useState(null);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(null);
  const [newPayment, setNewPayment] = useState({ amount: "", date: "2026-03-22", note: "" });
  const [updateStatus, setUpdateStatus] = useState("paid");

  const acct = selectedAcct ? schedules.find(s => s.id === selectedAcct) : null;

  // Overview calculations
  const allPayments = schedules.flatMap(s => s.payments.map(p => ({ ...p, dealId: s.id, deal: s.deal })));
  const today = "2026-03-22";
  const overdue = allPayments.filter(p => p.status === "failed");
  const dueToday = allPayments.filter(p => p.status === "due_today");
  const upcoming = allPayments.filter(p => p.status === "upcoming");
  const totalCollectedToday = dueToday.length * (acct?.dailyPayment || 250);

  const overdueByDeal = {};
  overdue.forEach(p => {
    if (!overdueByDeal[p.deal]) overdueByDeal[p.deal] = { deal: p.deal, count: 0, amount: 0 };
    overdueByDeal[p.deal].count++;
    overdueByDeal[p.deal].amount += p.amount;
  });

  // Filtered payments for selected account
  const filteredPayments = acct ? (paymentFilter === "all" ? acct.payments : acct.payments.filter(p => p.status === paymentFilter)) : [];

  // Update a payment status
  const handleUpdatePayment = () => {
    if (!showUpdateModal || !selectedAcct) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== selectedAcct) return s;
      return { ...s, payments: s.payments.map(p => p.refId === showUpdateModal.refId ? { ...p, status: updateStatus } : p) };
    }));
    setShowUpdateModal(null);
  };

  // Add manual payment
  const handleAddPayment = () => {
    if (!selectedAcct || !newPayment.amount) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== selectedAcct) return s;
      const np = { payNum: s.payments.length + 1, date: newPayment.date, amount: Number(newPayment.amount), status: "manual", refId: `MAN-${s.id}-${Date.now()}` };
      return { ...s, payments: [...s.payments, np] };
    }));
    setNewPayment({ amount: "", date: "2026-03-22", note: "" });
    setShowAddPayment(false);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 16, height: "100%" }}>
        {/* Left: Account selector + Overview */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Overview Cards */}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Today's Overview</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: C.yellowBg, borderRadius: 8, padding: 10, border: `1px solid ${C.yellow}25` }}>
                <div style={{ fontSize: 10, color: C.yellow }}>Due Today</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow }}>{dueToday.length}</div>
              </div>
              <div style={{ background: C.redBg, borderRadius: 8, padding: 10, border: `1px solid ${C.red}25` }}>
                <div style={{ fontSize: 10, color: C.red }}>Overdue</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.red }}>{overdue.length}</div>
              </div>
              <div style={{ background: C.cyanBg, borderRadius: 8, padding: 10, border: `1px solid ${C.cyan}25` }}>
                <div style={{ fontSize: 10, color: C.cyan }}>Upcoming (5d)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.cyan }}>{upcoming.length}</div>
              </div>
              <div style={{ background: C.greenBg, borderRadius: 8, padding: 10, border: `1px solid ${C.green}25` }}>
                <div style={{ fontSize: 10, color: C.green }}>Expected Today</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{fmt(dueToday.reduce((a,p) => a + p.amount, 0))}</div>
              </div>
            </div>
          </div>

          {/* Overdue Summary */}
          {Object.values(overdueByDeal).length > 0 && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.red}30`, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.red, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Overdue by Deal</div>
              {Object.values(overdueByDeal).map((d,i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, color: C.text }}>{d.deal}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Badge label={`${d.count} missed`} color={C.red} bg={C.redBg}/>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>{fmt(d.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Account Selector */}
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Accounts</div>
          {schedules.map(s => {
            const paid = s.payments.filter(p => p.status === "paid" || p.status === "manual").length;
            const failed = s.payments.filter(p => p.status === "failed").length;
            const progress = paid / s.totalPayments;
            const active = selectedAcct === s.id;
            return (
              <div key={s.id} onClick={() => { setSelectedAcct(s.id); setPaymentFilter("all"); }} style={{
                background: active ? C.bgCardHover : C.bgCard, border: `1px solid ${active ? C.accent : C.border}`,
                borderRadius: 10, padding: 12, cursor: "pointer", transition: "all 0.15s"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.deal}</span>
                  {failed > 0 && <Badge label={`${failed} NSF`} color={C.red} bg={C.redBg}/>}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{s.merchant} · {fmt(s.dailyPayment)}/day</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ProgressBar value={paid} max={s.totalPayments} color={failed > 5 ? C.red : C.green} height={4}/>
                  <span style={{ fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>{paid}/{s.totalPayments}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Payment Schedule */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {acct ? (
            <>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{acct.deal}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{acct.merchant} · Advance: {fmt(acct.advanceAmount)} · Payback: {fmt(acct.paybackAmount)} · {acct.factor}x</div>
                </div>
                <Btn primary onClick={() => setShowAddPayment(true)}><Icon name="plus" size={13} color="#fff"/>Add Payment</Btn>
              </div>

              {/* Quick Stats */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "Paid", count: acct.payments.filter(p => p.status==="paid"||p.status==="manual").length, color: C.green },
                  { label: "Failed", count: acct.payments.filter(p => p.status==="failed").length, color: C.red },
                  { label: "Due Today", count: acct.payments.filter(p => p.status==="due_today").length, color: C.yellow },
                  { label: "Upcoming", count: acct.payments.filter(p => p.status==="upcoming").length, color: C.cyan },
                  { label: "Remaining", count: acct.payments.filter(p => p.status==="scheduled").length, color: C.textMuted },
                ].map((s,i) => (
                  <button key={i} onClick={() => setPaymentFilter(paymentFilter === s.label.toLowerCase().replace(/ /g,"_") ? "all" : s.label.toLowerCase().replace(/ /g,"_"))} style={{
                    flex: 1, background: C.bgCard, border: `1px solid ${paymentFilter === s.label.toLowerCase().replace(/ /g,"_") ? s.color : C.border}`,
                    borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "center", transition: "all 0.15s"
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{s.label}</div>
                  </button>
                ))}
              </div>

              {/* Filter bar */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {["all","paid","failed","due_today","upcoming","scheduled","manual","waived"].map(f => (
                  <button key={f} onClick={() => setPaymentFilter(f)} style={{
                    padding: "4px 10px", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600, textTransform: "capitalize",
                    background: paymentFilter === f ? C.accent : C.bgSurface, color: paymentFilter === f ? "#fff" : C.textDim
                  }}>{f.replace(/_/g," ")}</button>
                ))}
              </div>

              {/* Payments Table */}
              <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.bgCard }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bgCard, zIndex: 1 }}>
                      {["#","Date","Amount","Status","Ref ID","Actions"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: C.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p, idx) => {
                      const ps = paymentStatusMap[p.status] || paymentStatusMap.scheduled;
                      const isOverdue = p.status === "failed";
                      return (
                        <tr key={p.refId} style={{ borderBottom: `1px solid ${C.border}`, background: isOverdue ? `${C.red}08` : p.status === "due_today" ? `${C.yellow}08` : "transparent" }}>
                          <td style={{ padding: "9px 12px", color: C.textDim, fontWeight: 500 }}>{p.payNum}</td>
                          <td style={{ padding: "9px 12px", color: C.text }}>{p.date}</td>
                          <td style={{ padding: "9px 12px", color: C.accent, fontWeight: 600 }}>{fmt(p.amount)}</td>
                          <td style={{ padding: "9px 12px" }}><Badge label={ps.label} color={ps.color} bg={ps.bg}/></td>
                          <td style={{ padding: "9px 12px", color: C.textDim, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{p.refId}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {(p.status !== "paid" && p.status !== "manual") && (
                              <Btn small onClick={(e) => { e.stopPropagation(); setShowUpdateModal(p); setUpdateStatus(p.status === "failed" ? "paid" : "paid"); }}>
                                <Icon name="edit" size={11} color={C.textMuted}/>Update
                              </Btn>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPayments.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No payments match this filter</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textDim, gap: 8 }}>
              <Icon name="calendar" size={48} color={C.textDim}/>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Select an account</div>
              <div style={{ fontSize: 12 }}>Choose a merchant from the left to view their full repayment schedule</div>
            </div>
          )}
        </div>
      </div>

      {/* Add Payment Modal */}
      <Modal title="Add Manual Payment" open={showAddPayment} onClose={() => setShowAddPayment(false)} width={420}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 10, background: C.accentGlow, borderRadius: 8, fontSize: 12, color: C.accent }}>
            Adding payment to: <strong>{acct?.deal}</strong> · Daily: {acct ? fmt(acct.dailyPayment) : "—"}
          </div>
          <Input label="Payment Amount" type="number" value={newPayment.amount} onChange={v => setNewPayment(p => ({...p, amount: v}))} placeholder={acct?.dailyPayment.toString() || "0"}/>
          <Input label="Date" type="date" value={newPayment.date} onChange={v => setNewPayment(p => ({...p, date: v}))}/>
          <Input label="Note (optional)" value={newPayment.note} onChange={v => setNewPayment(p => ({...p, note: v}))} placeholder="e.g. Catch-up payment, wire transfer"/>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <Btn onClick={() => setShowAddPayment(false)}>Cancel</Btn>
            <Btn primary disabled={!newPayment.amount} onClick={handleAddPayment}><Icon name="plus" size={13} color="#fff"/>Add Payment</Btn>
          </div>
        </div>
      </Modal>

      {/* Update Status Modal */}
      <Modal title="Update Payment Status" open={!!showUpdateModal} onClose={() => setShowUpdateModal(null)} width={420}>
        {showUpdateModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 10, background: C.bgSurface, borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.textMuted }}>Payment #{showUpdateModal.payNum}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{showUpdateModal.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                <span style={{ color: C.textMuted }}>Amount</span>
                <span style={{ color: C.accent, fontWeight: 600 }}>{fmt(showUpdateModal.amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                <span style={{ color: C.textMuted }}>Ref ID</span>
                <span style={{ color: C.textDim, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{showUpdateModal.refId}</span>
              </div>
            </div>
            <Select label="New Status" value={updateStatus} onChange={setUpdateStatus} options={[
              { value: "paid", label: "Paid" }, { value: "failed", label: "Failed / NSF" },
              { value: "reversed", label: "Reversed" }, { value: "waived", label: "Waived" },
              { value: "scheduled", label: "Rescheduled" },
            ]}/>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <Btn onClick={() => setShowUpdateModal(null)}>Cancel</Btn>
              <Btn primary onClick={handleUpdatePayment}><Icon name="check" size={13} color="#fff"/>Update Status</Btn>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── MAIN OPERATIONS MODULE ───
// ═══════════════════════════════════════════════════════════════
const OPS_TABS = [
  { id: "repayments", label: "Repayments", icon: "calendar", count: 5 },
  { id: "templates", label: "Templates", icon: "filePlus", count: INITIAL_TEMPLATES.length },
  { id: "emails", label: "Emails", icon: "mail", count: INITIAL_EMAILS.length },
  { id: "contracts", label: "Contracts", icon: "file" },
  { id: "funding", label: "Funding", icon: "zap" },
  { id: "payoffs", label: "Payoffs", icon: "inbox" },
];

const OperationsModule = () => {
  const [opsTab, setOpsTab] = useState("repayments");

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Daily Collections" value={fmt(329+144+179+254)} sub="4 accounts due today" icon="dollar" color={C.green}/>
        <StatCard label="Total Overdue" value={fmt(MISSED_DELI.length * 179 + MISSED_VAPES.length * 246)} sub={`${MISSED_DELI.length + MISSED_VAPES.length} missed payments`} icon="alertTriangle" color={C.red}/>
        <StatCard label="Emails Sent" value={INITIAL_EMAILS.length.toString()} sub={`${INITIAL_EMAILS.filter(e=>e.openedAt).length} opened`} icon="mail" color={C.cyan}/>
        <StatCard label="Templates" value={INITIAL_TEMPLATES.length.toString()} sub="2 categories" icon="filePlus" color={C.purple}/>
      </div>

      <TabBar tabs={OPS_TABS} active={opsTab} onChange={setOpsTab}/>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {opsTab === "repayments" && <RepaymentsView/>}
        {opsTab === "templates" && <TemplatesView/>}
        {opsTab === "emails" && <EmailsView/>}
        {opsTab === "contracts" && <PlaceholderTab icon="file" label="Contracts" desc="Contract management — see previous build"/>}
        {opsTab === "funding" && <PlaceholderTab icon="zap" label="Funding" desc="Funding checklist & wire initiation — see previous build"/>}
        {opsTab === "payoffs" && <PlaceholderTab icon="inbox" label="Payoffs" desc="Payoff letter generation — see previous build"/>}
      </div>
    </div>
  );
};

const PlaceholderTab = ({ icon, label, desc }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: C.textDim, gap: 10 }}>
    <Icon name={icon} size={40} color={C.textDim}/>
    <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 12 }}>{desc}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// ─── APP SHELL ───
// ═══════════════════════════════════════════════════════════════
const NAV = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "deals", label: "Deal Pipeline", icon: "pipeline" },
  { id: "leads", label: "Leads", icon: "activity" },
  { id: "underwriting", label: "Underwriting", icon: "shield" },
  { id: "agents", label: "Agents / ISO", icon: "users" },
  { id: "syndication", label: "Syndication", icon: "layers" },
  { id: "operations", label: "Operations", icon: "briefcase" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "admin", label: "Admin", icon: "settings" },
];

export default function TestComponent() {
  const [activeNav, setActiveNav] = useState("operations");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      {/* SIDEBAR */}
      <div style={{ width: sidebarCollapsed ? 60 : 220, minWidth: sidebarCollapsed ? 60 : 220, background: C.bgSurface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", transition: "all 0.25s ease", overflow: "hidden" }}>
        <div style={{ padding: sidebarCollapsed ? "20px 12px" : "20px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>F</div>
          {!sidebarCollapsed && <div><div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>FusionCRM</div><div style={{ fontSize: 10, color: C.textDim, letterSpacing: 0.5, textTransform: "uppercase" }}>MCA Platform</div></div>}
        </div>
        <div style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(item => (
            <div key={item.id} onClick={() => setActiveNav(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: sidebarCollapsed ? "10px 12px" : "9px 12px",
              borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
              background: activeNav === item.id ? C.accentGlow : "transparent", color: activeNav === item.id ? C.accent : C.textMuted,
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
            }}>
              <Icon name={item.icon} size={18} color={activeNav === item.id ? C.accent : C.textMuted}/>
              {!sidebarCollapsed && <span style={{ fontSize: 13, fontWeight: activeNav === item.id ? 600 : 500 }}>{item.label}</span>}
            </div>
          ))}
        </div>
        {!sidebarCollapsed && (
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg, ${C.green}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>JZ</div>
            <div><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Jaz</div><div style={{ fontSize: 10, color: C.textDim }}>Admin</div></div>
          </div>
        )}
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.bgSurface }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{NAV.find(n => n.id === activeNav)?.label || "Dashboard"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", width: 240 }}>
              <Icon name="search" size={14}/>
              <input placeholder="Search..." style={{ background: "none", border: "none", color: C.text, fontSize: 13, outline: "none", width: "100%", fontFamily: "inherit" }}/>
            </div>
            <div style={{ cursor: "pointer", padding: 6, borderRadius: 8, background: C.bgCard, border: `1px solid ${C.border}`, position: "relative" }}>
              <Icon name="bell" size={16}/>
              <div style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: C.red }}/>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeNav === "operations" ? <OperationsModule/> : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.textDim, gap: 12 }}>
              <Icon name={NAV.find(n => n.id === activeNav)?.icon || "home"} size={48} color={C.textDim}/>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{NAV.find(n => n.id === activeNav)?.label}</div>
              <div style={{ fontSize: 13 }}>Navigate to Operations to see the full module</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
