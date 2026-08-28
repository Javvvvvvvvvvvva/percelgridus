export type Tone = "blue" | "orange" | "gray" | "purple" | "red" | "green";

const toneVars: Record<Tone, { fg: string; bg: string }> = {
  blue: { fg: "var(--blue)", bg: "var(--blue-bg)" },
  orange: { fg: "var(--orange)", bg: "var(--orange-bg)" },
  gray: { fg: "var(--gray)", bg: "var(--gray-bg)" },
  purple: { fg: "var(--purple)", bg: "var(--purple-bg)" },
  red: { fg: "var(--red)", bg: "var(--red-bg)" },
  green: { fg: "var(--green)", bg: "var(--green-bg)" },
};

export function Badge({
  tone,
  solid = false,
  children,
}: {
  tone: Tone;
  solid?: boolean;
  children: React.ReactNode;
}) {
  const { fg, bg } = toneVars[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 4,
        background: solid ? fg : bg,
        color: solid ? "var(--panel)" : fg,
        font: "600 10px/1 var(--font-mono), monospace",
        letterSpacing: ".06em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Two-row provenance legend swatch, e.g. the key shown above "Grounded facts". */
export function LegendSwatch({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: toneVars[tone].fg,
        }}
      />
      {label}
    </span>
  );
}
