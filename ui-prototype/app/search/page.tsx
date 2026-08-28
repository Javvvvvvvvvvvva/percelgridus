"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/badge";
import { subjectParcel, recentLookups } from "@/lib/mock-data";
import { PRO_FORMA_DEFAULTS } from "@/lib/financials";

type Scenario = "current" | "redev";

export default function SearchPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario>("redev");
  const [address, setAddress] = useState(subjectParcel.address);

  const analyze = (addr: string) =>
    router.push(
      `/report?scenario=${scenario}&address=${encodeURIComponent(addr.trim())}`,
    );

  const tabStyle = (active: boolean): React.CSSProperties => ({
    cursor: "pointer",
    flex: 1,
    border: "none",
    borderRadius: 5,
    padding: "11px 12px",
    fontFamily: "var(--font-sans), sans-serif",
    fontWeight: active ? 600 : 500,
    fontSize: 13,
    lineHeight: 1,
    background: active ? "var(--blue)" : "transparent",
    color: active ? "#fff" : "var(--ink2)",
  });

  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="app" />

          <div className="pg-grid-search">
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <FieldLabel>Parcel address</FieldLabel>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "var(--panel)",
                    border: "1px solid var(--blue)",
                    borderRadius: 8,
                    padding: "16px 18px",
                    boxShadow: "0 0 0 3px var(--blue-bg)",
                  }}
                >
                  <span style={{ color: "var(--blue)", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 15, lineHeight: 1 }}>
                    ⌕
                  </span>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && address.trim()) analyze(address);
                    }}
                    placeholder="Street address, Minneapolis, MN"
                    style={{
                      flex: 1,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontFamily: "var(--font-sans), sans-serif",
                      fontWeight: 500,
                      fontSize: 19,
                      lineHeight: 1,
                      color: "var(--ink)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                  <Badge tone="blue">OFFICIAL</Badge>
                  Matched on the Hennepin County parcel layer (pilot: Minneapolis)
                </div>
              </div>

              <div className="pg-2col" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <FieldLabel>Expected acquisition price</FieldLabel>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 2,
                      background: "var(--panel)",
                      border: "1px solid var(--line2)",
                      borderRadius: 8,
                      padding: "14px 18px",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 22, lineHeight: 1, color: "var(--ink3)" }}>
                      $
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-sans), sans-serif",
                        fontWeight: 600,
                        fontSize: 28,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        letterSpacing: "-.02em",
                      }}
                    >
                      {PRO_FORMA_DEFAULTS.acquisitionPrice.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge tone="purple">USER ASSUMPTION</Badge>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                      Not verified against any listing or sale record.
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <FieldLabel>Scenario</FieldLabel>
                  <div style={{ display: "flex", background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 8, padding: 4, gap: 4 }}>
                    <button style={tabStyle(scenario === "current")} onClick={() => setScenario("current")}>
                      Current condition
                    </button>
                    <button style={tabStyle(scenario === "redev")} onClick={() => setScenario("redev")}>
                      Redevelopment
                    </button>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                    Redevelopment adds the by-right building envelope and pro forma.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button
                  onClick={() => analyze(address)}
                  style={{
                    cursor: "pointer",
                    border: "none",
                    background: "var(--blue)",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "16px 40px",
                    fontFamily: "var(--font-sans), sans-serif",
                    fontWeight: 600,
                    fontSize: 15,
                    lineHeight: 1,
                    letterSpacing: ".01em",
                  }}
                >
                  Analyze parcel
                </button>
                <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.5, color: "var(--ink3)", maxWidth: 340, textWrap: "pretty" }}>
                  Typical run: 4–9 s. Results are preliminary reference values requiring professional confirmation.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FieldLabel>Recent lookups</FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recentLookups.map((lookup) => (
                  <Link
                    key={lookup.address}
                    href={`/report?scenario=${scenario}&address=${encodeURIComponent(lookup.address + ", Minneapolis, MN")}`}
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 13, lineHeight: 1.3 }}>
                      {lookup.address}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)" }}>
                      <span>
                        {lookup.district} · {lookup.lotAreaSf.toLocaleString("en-US")} sf
                      </span>
                      <span>{lookup.openItems} open items</span>
                    </div>
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: 6, padding: "12px 14px", border: "1px dashed var(--line2)", borderRadius: 8, fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.5, color: "var(--ink3)" }}>
                Saved lookups keep the source snapshot taken at run time, so numbers stay auditable.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono), monospace",
        fontWeight: 500,
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: ".09em",
        textTransform: "uppercase",
        color: "var(--ink3)",
      }}
    >
      {children}
    </div>
  );
}
