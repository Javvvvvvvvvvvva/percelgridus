import Link from "next/link";
import { Header } from "@/components/header";
import { buildUsMapData, MAP_VIEWBOX } from "@/lib/us-map";

export default function LandingPage() {
  const { states, statesFocus, focusTransform } = buildUsMapData("Minnesota");

  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="landing" />

          <div
            style={{
              padding: "64px 24px 40px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-sans), sans-serif",
                fontWeight: 600,
                fontSize: "clamp(32px, 5vw, 52px)",
                lineHeight: 1.06,
                letterSpacing: "-.035em",
                textAlign: "center",
                maxWidth: 900,
                textWrap: "balance",
              }}
            >
              Any U.S. parcel.
              <br />
              Sourced feasibility in seconds.
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 620,
                textAlign: "center",
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--ink2)",
                textWrap: "pretty",
              }}
            >
              Every number shows its source, confidence, and reviewer. Preliminary reference only — not a legal
              maximum.
            </p>
          </div>

          <div className="pg-landing-frames">
            <MapFrame label="(a) Default map" borderTone="line">
              <svg viewBox={MAP_VIEWBOX} style={{ width: "100%", height: "100%", display: "block" }}>
                {states.map((p, i) => (
                  <path key={i} d={p.d} fill="var(--map)" stroke="var(--panel)" strokeWidth={1.6} />
                ))}
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  bottom: 10,
                  fontFamily: "var(--font-mono), monospace",
                  fontWeight: 500,
                  fontSize: 10,
                  lineHeight: 1,
                  letterSpacing: ".08em",
                  color: "var(--ink3)",
                }}
              >
                SELECT A STATE
              </div>
            </MapFrame>

            <MapFrame label="(b) Hover — Minnesota" borderTone="blue">
              <svg viewBox={MAP_VIEWBOX} style={{ width: "100%", height: "100%", display: "block" }}>
                <g transform={focusTransform}>
                  {statesFocus.map((p, i) => (
                    <path
                      key={i}
                      d={p.d}
                      fill={p.isFocus ? "var(--map-hi)" : "var(--map)"}
                      stroke="var(--panel)"
                      strokeWidth={1.4}
                    />
                  ))}
                </g>
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "46%",
                  transform: "translate(-50%,-118%)",
                  background: "var(--ink)",
                  color: "var(--panel)",
                  borderRadius: 6,
                  padding: "8px 11px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  boxShadow: "var(--shadow)",
                }}
              >
                <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 12, lineHeight: 1.1 }}>
                  Minnesota
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontWeight: 500,
                    fontSize: 10,
                    lineHeight: 1.1,
                    opacity: 0.72,
                    letterSpacing: ".05em",
                  }}
                >
                  1 COUNTY LIVE · HENNEPIN
                </div>
              </div>
            </MapFrame>

            <MapFrame label="(c) Selected — address search" borderTone="line">
              <Link
                href="/search"
                style={{ position: "absolute", inset: 0, display: "block", color: "inherit", textDecoration: "none" }}
                aria-label="Search a Minneapolis address"
              >
                <svg viewBox={MAP_VIEWBOX} style={{ width: "100%", height: "100%", display: "block" }}>
                  <g transform={focusTransform}>
                    {statesFocus.map((p, i) => (
                      <path
                        key={i}
                        d={p.d}
                        fill={p.isFocus ? "var(--map-hi)" : "var(--map)"}
                        stroke="var(--panel)"
                        strokeWidth={1.4}
                      />
                    ))}
                  </g>
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    gap: 10,
                    padding: "0 18px 18px",
                    background: "linear-gradient(to bottom, transparent 22%, var(--panel) 78%)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontWeight: 600,
                      fontSize: 12,
                      lineHeight: 1,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--blue)",
                    }}
                  >
                    Minnesota selected
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "var(--panel2)",
                      border: "1px solid var(--line2)",
                      borderRadius: 8,
                      padding: "12px 14px",
                    }}
                  >
                    <span style={{ color: "var(--ink3)", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 13, lineHeight: 1 }}>
                      ⌕
                    </span>
                    <span style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 13, lineHeight: 1, color: "var(--ink3)" }}>
                      Search a Minneapolis address…
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                    Outside Hennepin County, results are unsupported.
                  </div>
                </div>
              </Link>
            </MapFrame>
          </div>

          <div style={{ display: "flex", justifyContent: "center", padding: "0 24px 40px" }}>
            <Link
              href="/search"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "var(--blue-bg)",
                color: "var(--blue)",
                borderRadius: 999,
                padding: "8px 16px",
                fontFamily: "var(--font-mono), monospace",
                fontWeight: 500,
                fontSize: 12,
                lineHeight: 1,
                letterSpacing: ".05em",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: "currentColor",
                  animation: "pgpulse 2.4s ease-in-out infinite",
                }}
              />
              CURRENTLY SUPPORTED · MINNEAPOLIS, HENNEPIN COUNTY, MN
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapFrame({
  label,
  borderTone,
  children,
}: {
  label: string;
  borderTone: "line" | "blue";
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
      <div
        style={{
          position: "relative",
          background: "var(--panel)",
          border: `1px solid ${borderTone === "blue" ? "var(--blue)" : "var(--line)"}`,
          borderRadius: 8,
          height: 300,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
