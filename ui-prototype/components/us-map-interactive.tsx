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
export function UsMapInteractive({
  states,
  supported,
}: {
  states: StateShape[];
  /** State names that route to a live search (currently just Minnesota). */
  supported: string[];
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
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1.3, letterSpacing: ".06em", opacity: 0.85 }}>
              {isSupported(hovered) ? "LIVE · HENNEPIN COUNTY" : "NOT YET SUPPORTED"}
            </span>
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
