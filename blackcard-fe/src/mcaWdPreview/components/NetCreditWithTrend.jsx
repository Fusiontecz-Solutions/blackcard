// Trend arrow with color/size baked into SVG attributes (not CSS classes) so the
// PDF capture clone keeps it colored and on the same line as the value.
function TrendArrow({ up }) {
  const color = up ? "#059669" : "#ef4444";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", width: 14, height: 14, flexShrink: 0, verticalAlign: "-2px", marginLeft: 4 }}
    >
      {up ? (
        <path d="M12 20V4M5 11l7-7 7 7" />
      ) : (
        <path d="M12 4v16M5 13l7 7 7-7" />
      )}
    </svg>
  );
}

export default function NetCreditWithTrend({ value, hasTrend, diff }) {
  return (
    <span style={{ whiteSpace: "nowrap", display: "inline-block" }}>
      {value}
      {hasTrend && diff !== 0 && <TrendArrow up={diff > 0} />}
    </span>
  );
}
