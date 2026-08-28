import Link from "next/link";
import { ThemeToggleButton } from "./theme-toggle-button";

export function Header({
  variant = "app",
  searchValue,
}: {
  variant?: "landing" | "app";
  searchValue?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: variant === "landing" ? "14px 24px" : "12px 24px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--ink)",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: "var(--blue)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 700,
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            PG
          </div>
          <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1 }}>
            PARCELGRID <span style={{ color: "var(--ink3)", fontWeight: 500 }}>US</span>
          </div>
        </Link>
        {variant === "app" && (
          <Link
            href="/search"
            style={{
              marginLeft: 10,
              padding: "5px 10px",
              border: "1px solid var(--line2)",
              borderRadius: 6,
              fontFamily: "var(--font-mono), monospace",
              fontSize: 12,
              lineHeight: 1,
              color: searchValue ? "var(--ink2)" : "var(--ink3)",
              minWidth: searchValue ? 340 : 260,
              whiteSpace: "nowrap",
              textDecoration: "none",
            }}
          >
            ⌕ {searchValue ?? "Search parcel…"}
          </Link>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {variant === "landing" && (
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 500,
              fontSize: 11,
              lineHeight: 1,
              color: "var(--ink3)",
              letterSpacing: ".06em",
            }}
          >
            PILOT · MINNEAPOLIS, MN
          </div>
        )}
        <ThemeToggleButton />
      </div>
    </div>
  );
}
