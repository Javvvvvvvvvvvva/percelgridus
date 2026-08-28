import Link from "next/link";
import { Header } from "@/components/header";
import { Badge } from "@/components/badge";
import { getSiteAnalysis } from "@/lib/parcelgrid";

export default async function EnvelopePage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  const sa = await getSiteAnalysis(address);
  const subjectParcel = sa.parcel;
  const envelope = sa.envelope;
  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="app" searchValue={subjectParcel.address} />

          <div className="pg-grid-aside480">
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  Site diagram — by-right envelope
                </div>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)" }}>
                  Schematic · not survey-accurate
                </div>
              </div>

              <div style={{ position: "relative", background: "var(--panel2)", borderRadius: 6, padding: 28, display: "grid", placeItems: "center", minHeight: 340 }}>
                <div style={{ position: "relative", width: 420, maxWidth: "100%", height: 270, border: "2px solid var(--ink2)", borderRadius: 2, background: "var(--panel)" }}>
                  <div style={{ position: "absolute", top: -22, left: 0, fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 11, lineHeight: 1, color: "var(--ink2)" }}>
                    LOT {(subjectParcel.lotAreaSf ?? 0).toLocaleString("en-US")} SF
                  </div>
                  <div style={{ position: "absolute", inset: 26, border: "1px dashed var(--orange)", borderRadius: 2 }} />
                  <div
                    style={{
                      position: "absolute",
                      top: 32,
                      left: 32,
                      right: 32,
                      bottom: 32,
                      background: "var(--blue-bg)",
                      border: "1.5px solid var(--blue)",
                      borderRadius: 2,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 15, lineHeight: 1.2, color: "var(--blue)", fontVariantNumeric: "tabular-nums" }}>
                      {(envelope.maxFootprintSf ?? 0).toLocaleString("en-US")} sf footprint
                    </div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 11, lineHeight: 1, color: "var(--blue)", opacity: 0.8 }}>
                      {subjectParcel.maxLotCoveragePct ?? "—"}% LOT COVERAGE
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: -24, display: "flex", justifyContent: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 11, lineHeight: 1, color: "var(--orange)" }}>
                      SETBACK LINE — UNVERIFIED
                    </span>
                  </div>
                </div>

                <div style={{ position: "absolute", right: 28, top: 28, bottom: 28, width: 96, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
                  <div style={{ display: "flex", flexDirection: "column-reverse", gap: 3 }}>
                    {["L1", "L2", "L3"].map((level) => (
                      <div
                        key={level}
                        style={{
                          height: 52,
                          background: "var(--blue-bg)",
                          border: "1px solid var(--blue)",
                          borderRadius: 2,
                          display: "grid",
                          placeItems: "center",
                          fontFamily: "var(--font-mono), monospace",
                          fontWeight: 500,
                          fontSize: 10,
                          lineHeight: 1,
                          color: "var(--blue)",
                        }}
                      >
                        {level}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid var(--line2)", paddingTop: 6, fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1.3, color: "var(--ink2)", textAlign: "center" }}>
                    {envelope.maxHeightFt ?? "—"} FT CAP
                    <br />≈ 3 STORIES
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 0, borderTop: "2px solid var(--ink2)" }} />
                  Parcel boundary — official
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 14, height: 0, borderTop: "1px dashed var(--orange)" }} />
                  Assumed setback — unverified
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 10, background: "var(--blue-bg)", border: "1px solid var(--blue)" }} />
                  Max footprint — algorithm
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "var(--gray-bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.5, color: "var(--ink2)" }}>
                Vacant-or-redevelop reading: <strong style={{ color: "var(--ink)", fontWeight: 600 }}>this is the most you could build by right</strong> if the parcel were cleared today, before setbacks and parking are resolved.
              </div>

              <div className="pg-2col">
                <EnvelopeStat
                  label="Buildable floor area"
                  value={(envelope.buildableGsf ?? 0).toLocaleString("en-US")}
                  unit="GSF"
                  badges={[
                    { tone: "gray", label: "ALGORITHM" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source={`${(subjectParcel.lotAreaSf ?? 0).toLocaleString("en-US")} sf × FAR ${subjectParcel.maxFar} · §540.110`}
                />
                <EnvelopeStat
                  label="Max footprint"
                  value={(envelope.maxFootprintSf ?? 0).toLocaleString("en-US")}
                  unit="sf"
                  badges={[
                    { tone: "gray", label: "ALGORITHM" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source={`${subjectParcel.maxLotCoveragePct ?? "—"}% lot coverage · §540.910`}
                />
                <EnvelopeStat
                  label="Max height"
                  value={String(envelope.maxHeightFt ?? "—")}
                  unit="ft"
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source="§540.410 — machine-parsed"
                />
                <EnvelopeStat
                  label="Indicative units"
                  value={String(envelope.indicativeUnits ?? "—")}
                  unit="units"
                  badges={[{ tone: "purple", label: "USER ASSUMPTION" }]}
                  source={`@ ${envelope.gsfPerUnit.toLocaleString("en-US")} GSF/unit · conflicts with 3-family use cap`}
                />
              </div>

              <div style={{ background: "var(--orange-bg)", border: "1px solid var(--orange)", borderRadius: 8, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 4, background: "var(--orange)", color: "var(--panel)", fontFamily: "var(--font-sans), sans-serif", fontWeight: 700, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>
                  !
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 13, lineHeight: 1.3, color: "var(--orange)" }}>
                    Envelope is provisional
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.5, color: "var(--ink2)" }}>
                    Setbacks unresolved and parking unevaluated — the real footprint can only shrink from here, never grow.
                  </div>
                </div>
              </div>

              <Link
                href="/proforma"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--blue-bg)",
                  border: "1px solid var(--blue)",
                  borderRadius: 8,
                  padding: "14px 16px",
                  color: "var(--blue)",
                  textDecoration: "none",
                  fontFamily: "var(--font-sans), sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Continue to pro forma / feasibility
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvelopeStat({
  label,
  value,
  unit,
  badges,
  source,
}: {
  label: string;
  value: string;
  unit: string;
  badges: { tone: "blue" | "orange" | "gray" | "purple" | "red" | "green"; label: string }[];
  source: string;
}) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 26, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>
        {value} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink2)" }}>{unit}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
