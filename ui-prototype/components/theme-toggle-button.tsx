"use client";

import { useTheme } from "./theme-provider";

export function ThemeToggleButton({ compact = true }: { compact?: boolean }) {
  const { toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        aria-label="Toggle light and dark theme"
        style={{
          cursor: "pointer",
          width: 30,
          height: 30,
          border: "1px solid var(--line2)",
          background: "var(--panel2)",
          color: "var(--ink2)",
          borderRadius: 6,
          font: "500 12px/1 var(--font-mono), monospace",
        }}
      >
        ◐
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      style={{
        cursor: "pointer",
        border: "1px solid var(--line2)",
        background: "var(--panel)",
        color: "var(--ink2)",
        borderRadius: 6,
        padding: "9px 14px",
        font: "500 12px/1 var(--font-mono), monospace",
        letterSpacing: ".06em",
        textTransform: "uppercase",
      }}
    >
      Light / Dark
    </button>
  );
}
