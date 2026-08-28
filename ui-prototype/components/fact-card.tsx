import { Badge, type Tone } from "./badge";

export function FactCard({
  label,
  value,
  sub,
  badges,
  source,
  span,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  badges: { tone: Tone; label: string }[];
  source: string;
  span?: boolean;
}) {
  return (
    <div
      style={{
        gridColumn: span ? "span 2" : undefined,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontWeight: 500,
          fontSize: 10,
          lineHeight: 1,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink3)",
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 24, lineHeight: 1.1, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.4, color: "var(--ink2)" }}>{sub}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {badges.map((b) => (
          <Badge key={b.label} tone={b.tone}>
            {b.label}
          </Badge>
        ))}
      </div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>{source}</div>
    </div>
  );
}
