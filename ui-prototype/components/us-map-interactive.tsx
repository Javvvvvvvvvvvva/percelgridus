"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAP_VIEWBOX, type StateShape } from "@/lib/us-map";

/**
 * One real, interactive US map: hover a state to highlight it and see its
 * status, click a supported state to start an address search. Supported states
 * are tinted so they are discoverable; everything else is an honest "not yet
 * supported" (the pilot is Minneapolis / Hennepin County, MN).
 */
/** One city's coverage tier within a supported state. */
export interface CityCoverage {
  readonly city: string;
  /** "full" = parcel + zoning + hazards + tax; "zoning" = zoning live, parcels pending. */
  readonly tier: "full" | "zoning";
}

const TIER_LABEL: Record<CityCoverage["tier"], string> = {
  full: "Parcel · zoning · tax",
  zoning: "Zoning live · parcels pending",
};

export function UsMapInteractive({
  states,
  supported,
  coverage = {},
}: {
  states: StateShape[];
  /** State names that route to a live search (currently just Minnesota). */
  supported: string[];
  /** Per-state city coverage, shown in the tooltip and the coverage panel. */
  coverage?: Record<string, readonly CityCoverage[]>;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [notice, setNotice] = useState<string | null>(null);

  const isSupported = (name: string) => supported.includes(name);

  const fillFor = (name: string): string => {
    if (hovered === name) return isSupported(name) ? "var(--blue)" : "var(--ink3)";
    if (isSupported(name)) return "var(--blue-bg)";
    return "var(--map)";
  };
  const strokeFor = (name: string): string =>
    isSupported(name) ? "var(--blue)" : "var(--panel)";

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const onSelect = (name: string) => {
    if (isSupported(name)) {
      router.push("/search");
    } else {
      setNotice(name);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
        style={{ position: "relative", width: "100%" }}
      >
        <svg
          viewBox={MAP_VIEWBOX}
          role="img"
          aria-label="Map of the United States — click Minnesota to search a parcel"
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {states.map((s) => (
            <path
              key={s.name || s.d.slice(0, 12)}
              d={s.d}
              fill={fillFor(s.name)}
              stroke={strokeFor(s.name)}
              strokeWidth={isSupported(s.name) ? 1.6 : 1}
              style={{ cursor: "pointer", transition: "fill .12s ease" }}
              onMouseEnter={() => setHovered(s.name)}
              onClick={() => onSelect(s.name)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(s.name);
              }}
              aria-label={s.name}
            />
          ))}
        </svg>

        {hovered && (
          <div
            style={{
              position: "absolute",
              left: pos.x + 14,
              top: pos.y + 14,
              pointerEvents: "none",
              background: "var(--ink)",
              color: "var(--panel)",
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              maxWidth: 240,
              boxShadow: "0 8px 24px rgba(0,0,0,.18)",
              zIndex: 5,
            }}
          >
            <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>
              {hovered}
            </span>
            {isSupported(hovered) && coverage[hovered]?.length ? (
              coverage[hovered]!.map((c) => (
                <span key={c.city} style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1.35, letterSpacing: ".04em", opacity: 0.9 }}>
                  {c.city} · {TIER_LABEL[c.tier]}
                </span>
              ))
            ) : (
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1.3, letterSpacing: ".06em", opacity: 0.85 }}>
                {isSupported(hovered) ? "LIVE" : "NOT YET SUPPORTED"}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          fontFamily: "var(--font-mono), monospace",
          fontSize: 11,
          lineHeight: 1.4,
          color: "var(--ink3)",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--blue-bg)", border: "1px solid var(--blue)", marginRight: 6, verticalAlign: "-1px" }} />
          Click a highlighted state to search. Pilot: Minneapolis, Hennepin County, MN.
        </span>
        <button
          onClick={() => router.push("/search")}
          style={{
            cursor: "pointer",
            border: "none",
            background: "var(--blue)",
            color: "#fff",
            borderRadius: 8,
            padding: "10px 18px",
            fontFamily: "var(--font-sans), sans-serif",
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          Search a Minneapolis address →
        </button>
      </div>

      {/* City-level coverage — honest about what resolves where. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "stretch" }}>
        {supported.flatMap((state) =>
          (coverage[state] ?? []).map((c) => (
            <div
              key={state + c.city}
              style={{
                flex: "1 1 200px",
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{c.city}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: 9,
                    lineHeight: 1,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    padding: "3px 7px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                    color: c.tier === "full" ? "var(--green)" : "var(--orange)",
                    background: c.tier === "full" ? "var(--green-bg)" : "var(--orange-bg)",
                    border: `1px solid ${c.tier === "full" ? "var(--green)" : "var(--orange)"}`,
                  }}
                >
                  {c.tier === "full" ? "Full" : "Zoning"}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                {state} · {TIER_LABEL[c.tier]}
              </span>
            </div>
          )),
        )}
        <div
          style={{
            flex: "1 1 200px",
            background: "var(--panel2)",
            border: "1px dashed var(--line2)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: "var(--ink2)" }}>
            Nationwide
          </span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
            Parcels anywhere in the US with a Regrid token · zoning added per city
          </span>
        </div>
      </div>

      {notice && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "var(--orange-bg)",
            border: "1px solid var(--orange)",
            borderRadius: 8,
            padding: "12px 16px",
            fontFamily: "var(--font-sans), sans-serif",
            fontSize: 13,
            lineHeight: 1.4,
            color: "var(--ink2)",
          }}
        >
          <span>
            <strong style={{ color: "var(--orange)", fontWeight: 600 }}>{notice}</strong> isn't
            supported yet — the pilot covers Minneapolis, Hennepin County, MN. More
            jurisdictions are being added.
          </span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            style={{ cursor: "pointer", border: "none", background: "transparent", color: "var(--ink3)", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
