"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/header";
import { Badge } from "@/components/badge";
import { ParcelMap } from "@/components/parcel-map";
import { runLiveProForma, money } from "@/lib/proforma-live";
import type {
  ParcelSummary,
  EnvelopeSummary,
  ProFormaSeed,
  AssessmentSummary,
  ScenarioSeed,
} from "@/lib/parcelgrid";

export default function ProFormaClient({
  parcel,
  envelope,
  seed,
  assessment,
  openItemCount,
  parcelGeometry,
  floodLabel,
  overlayLabel,
  scenarios,
}: {
  parcel: ParcelSummary;
  envelope: EnvelopeSummary;
  seed: ProFormaSeed;
  assessment: AssessmentSummary | null;
  openItemCount: number;
  parcelGeometry: number[][][] | null;
  floodLabel: string | null;
  overlayLabel: string | null;
  scenarios: readonly ScenarioSeed[];
}) {
  const [rent, setRent] = useState(seed.rentPerUnitMonth);
  const [psf, setPsf] = useState(seed.hardCostPerGsf);
  const [cap, setCap] = useState(seed.exitCapRatePct);
  const acquisitionPrice = seed.acquisitionPrice;

  // Which redevelopment option is detailed below. Default to three-family (the
  // report's tier) when present, else the last (largest) option.
  const [selIdx, setSelIdx] = useState(() => {
    const i = scenarios.findIndex((s) => s.useClass === "three-family");
    return i >= 0 ? i : Math.max(0, scenarios.length - 1);
  });

  // Run the REAL library engine (src/lib/finance) for a given option's FAR/
  // coverage with the shared, slider-driven finance assumptions.
  const runFor = (s: {
    maxFar: number | null;
    maxLotCoveragePct: number | null;
  }) =>
    runLiveProForma({
      lotAreaSf: seed.lotAreaSf ?? 0,
      maxFar: s.maxFar ?? 0,
      maxLotCoverage: s.maxLotCoveragePct != null ? s.maxLotCoveragePct / 100 : 0,
      avgUnitGsf: seed.avgUnitGsf,
      softCostPct: seed.softCostPct,
      contingencyPct: seed.contingencyPct,
      vacancyPct: seed.vacancyPct,
      annualOpexPerUnit: seed.annualOpexPerUnit,
      acquisitionPrice,
      rentPerUnitMonth: rent,
      hardCostPerGsf: psf,
      exitCapRatePct: cap,
    });

  // Every option's feasibility, live with the sliders (same engine, so the
  // comparison is apples-to-apples).
  const comparisons = useMemo(
    () => scenarios.map((s) => ({ scenario: s, out: runFor(s) })),
    [scenarios, acquisitionPrice, rent, psf, cap, seed],
  );

  const hasScenarios = scenarios.length > 0;
  const active = hasScenarios ? scenarios[Math.min(selIdx, scenarios.length - 1)]! : null;
  const result = useMemo(
    () =>
      runFor(
        active ?? { maxFar: seed.maxFar, maxLotCoveragePct: seed.maxLotCoverage != null ? seed.maxLotCoverage * 100 : null },
      ),
    [active, acquisitionPrice, rent, psf, cap, seed],
  );

  const capLabel = `${cap.toFixed(1)}%`;
  const soft = `${Math.round((seed.softCostPct + seed.contingencyPct) * 100)}% soft+cont`;
  const noiNote = `${result.units ?? seed.units ?? "—"} units · ${Math.round(seed.vacancyPct * 100)}% vacancy · ${money(seed.annualOpexPerUnit * (result.units ?? seed.units ?? 0))} opex`;

  // Verdict + break-even copy derived from the engine's numbers (presentation).
  const verdictKicker = result.feasible
    ? "Preliminary — feasible at this price"
    : "Preliminary — not feasible at this price";
  const verdictHeadline =
    (result.feasible ? "Development profit +" : "Development loss −") + money(result.profit);
  const verdictSub =
    `Stabilized value ${money(result.stabilizedValue)} ` +
    `${result.feasible ? "exceeds" : "is below"} total capital in ${money(result.totalCapitalIn)}. ` +
    `At ${money(acquisitionPrice)} acquisition you would ${result.feasible ? "clear the cost basis" : "overpay"}.`;
  const breakevenNote = result.breakevenAchievable
    ? "Value minus development cost, at zero profit."
    : `Development cost alone exceeds stabilized value by ${money((result.developmentCost ?? 0) - (result.stabilizedValue ?? 0))}. No acquisition price — including $0 — makes this feasible at these assumptions.`;

  // Detail-panel figures follow the selected option when scenarios are present.
  const dispFar = active?.maxFar ?? parcel.maxFar;
  const dispBuildable = active?.buildableGsf ?? envelope.buildableGsf;
  const dispHeight = active?.maxHeightFt ?? envelope.maxHeightFt;
  const dispCoverage = active?.maxLotCoveragePct ?? parcel.maxLotCoveragePct;

  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="app" searchValue={parcel.address} />

          <div className="pg-summary-3col" style={{ borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
            <SummaryCell label="Expected acquisition price" value={money(acquisitionPrice)} badge={{ tone: "purple", label: "USER ASSUMPTION" }} />
            <SummaryCell label="Total development cost" value={money(result.developmentCost)} badge={{ tone: "gray", label: `ALGORITHM · ${soft}` }} />
            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 6, background: "var(--panel2)" }}>
              <CellLabel>Total capital in</CellLabel>
              <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 26, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>
                {money(result.totalCapitalIn)}
              </div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)" }}>acquisition + development</span>
            </div>
          </div>

          <div className="pg-grid-aside400">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {hasScenarios && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                      Redevelopment options — by-right
                    </div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)" }}>
                      pick one to detail below
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    {comparisons.map(({ scenario, out }, i) => {
                      const sel = i === Math.min(selIdx, scenarios.length - 1);
                      return (
                        <button
                          key={scenario.useClass}
                          onClick={() => setSelIdx(i)}
                          style={{
                            cursor: "pointer",
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            background: sel ? "var(--blue-bg)" : "var(--panel)",
                            border: `1px solid ${sel ? "var(--blue)" : "var(--line)"}`,
                            borderRadius: 8,
                            padding: "13px 15px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 14, lineHeight: 1.2 }}>{scenario.label}</span>
                            {sel ? <Badge tone="blue">SELECTED</Badge> : null}
                          </div>
                          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.45, color: "var(--ink3)" }}>
                            FAR {scenario.maxFar ?? "—"} · {scenario.units ?? "—"} units
                            <br />
                            {(scenario.buildableGsf ?? 0).toLocaleString("en-US")} GSF
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 18, lineHeight: 1.1, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: out.feasible ? "var(--green)" : "var(--red)" }}>
                              {out.feasible ? "+" : "−"}
                              {money(out.profit)}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1, letterSpacing: ".05em", color: out.feasible ? "var(--green)" : "var(--red)" }}>
                              {out.feasible ? "FEASIBLE" : "LOSS"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.5, color: "var(--ink3)" }}>
                    Same lot + assumptions; only the ordinance FAR tier (Table 540-2) differs. Move a slider and every option updates.
                  </div>
                </div>
              )}

              <div className="pg-3col">
                <StatTile label="Stabilized value" value={money(result.stabilizedValue)} note={`NOI ÷ cap rate ${capLabel}`} />
                <StatTile label="Stabilized NOI" value={money(result.noi)} note={noiNote} />
                <StatTile label="Yield on cost" value={result.yieldOnCostPct !== null ? `${result.yieldOnCostPct.toFixed(2)}%` : "—"} note="NOI ÷ development cost" />
              </div>

              <div
                style={{
                  borderRadius: 8,
                  padding: "20px 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  background: result.feasible ? "var(--green-bg)" : "var(--red-bg)",
                  border: `1px solid ${result.feasible ? "var(--green)" : "var(--red)"}`,
                  color: result.feasible ? "var(--green)" : "var(--red)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 11, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.85 }}>
                    {verdictKicker}
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 26, lineHeight: 1.15, letterSpacing: "-.025em", fontVariantNumeric: "tabular-nums" }}>
                    {verdictHeadline}
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>{verdictSub}</div>
                </div>
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                <div className="pg-lineitem-row" style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)", background: "var(--panel2)", fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  <div>Line item</div>
                  <div style={{ textAlign: "right" }}>Value</div>
                  <div style={{ textAlign: "right" }}>Provenance</div>
                </div>
                <LineItemRow label="Rent per unit / month" value={money(rent)} badge={{ tone: "purple", label: "USER ASSUMPTION" }} />
                <LineItemRow label="Hard cost per GSF" value={money(psf)} badge={{ tone: "purple", label: "USER ASSUMPTION" }} />
                <LineItemRow label="Exit cap rate" value={capLabel} badge={{ tone: "purple", label: "USER ASSUMPTION" }} />
                <LineItemRow
                  label={`Buildable area — FAR ${dispFar ?? "—"}${active ? ` (${active.label})` : ""}`}
                  value={`${(dispBuildable ?? 0).toLocaleString("en-US")} GSF`}
                  badge={{ tone: "orange", label: "OFFICIAL · UNVERIFIED" }}
                />
                <LineItemRow
                  label="Height / coverage caps"
                  value={`${dispHeight ?? "—"} ft · ${dispCoverage ?? "—"}%`}
                  badge={{ tone: "orange", label: "OFFICIAL · UNVERIFIED" }}
                  last
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ParcelMap
                  rings={parcelGeometry}
                  lotAreaSf={parcel.lotAreaSf}
                  floodLabel={floodLabel}
                  overlayLabel={overlayLabel}
                  address={parcel.address}
                  footprintFraction={parcel.maxLotCoveragePct !== null ? parcel.maxLotCoveragePct / 100 : null}
                  footprintLabel={parcel.maxLotCoveragePct !== null ? `${parcel.maxLotCoveragePct}% footprint` : undefined}
                  heightPx={220}
                  compact
                />
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                  {parcel.address} · {parcel.zoningDistrict ?? "—"} · {(parcel.lotAreaSf ?? 0).toLocaleString("en-US")} sq ft · shaded = by-right max footprint
                </div>
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                    Adjust assumptions
                  </div>
                  <Badge tone="purple">USER</Badge>
                </div>

                <SliderField label="Rent / unit / month" valueLabel={money(rent)} min={1600} max={3200} step={50} value={rent} onChange={setRent} minLabel="$1,600" maxLabel="$3,200" />
                <SliderField label="Hard cost / GSF" valueLabel={money(psf)} min={200} max={450} step={5} value={psf} onChange={setPsf} minLabel="$200" maxLabel="$450" />
                <SliderField label="Exit cap rate" valueLabel={capLabel} min={4} max={9} step={0.1} value={cap} onChange={setCap} minLabel="4.0%" maxLabel="9.0%" />

                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1, color: "var(--ink2)" }}>Break-even acquisition price</div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans), sans-serif",
                      fontWeight: 600,
                      fontSize: 22,
                      lineHeight: 1.1,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-.02em",
                      color: result.breakevenAchievable ? "var(--ink)" : "var(--red)",
                    }}
                  >
                    {result.breakevenAchievable ? money(result.breakevenAcquisitionPrice) : "Not achievable"}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.45, color: "var(--ink3)" }}>{breakevenNote}</div>
                </div>
              </div>

              {assessment && (assessment.assessedValue || assessment.lastSalePrice) && (
                <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                      Market reference — not inputs
                    </div>
                    <Badge tone="blue">OFFICIAL</Badge>
                  </div>
                  {assessment.assessedValue && (
                    <RefRow label="Assessor taxable value" value={assessment.assessedValue} />
                  )}
                  {assessment.annualPropertyTax && (
                    <RefRow label="Actual annual property tax" value={assessment.annualPropertyTax} />
                  )}
                  {assessment.lastSalePrice && (
                    <RefRow
                      label={`Last sale${assessment.lastSaleDate ? ` · ${assessment.lastSaleDate}` : ""}`}
                      value={assessment.lastSalePrice}
                      caveat={assessment.lastSaleCaveat}
                    />
                  )}
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.5, color: "var(--ink3)" }}>
                    Hennepin County Assessor — current assessment. Shown to sanity-check the acquisition assumption above; these do not drive the math.
                  </div>
                </div>
              )}

              <div style={{ background: "var(--panel2)", border: "1px dashed var(--line2)", borderRadius: 8, padding: "14px 16px", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.6, color: "var(--ink3)" }}>
                Moving a slider changes only USER ASSUMPTION values. Official and unverified inputs stay locked to their source snapshot.
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", background: "var(--panel2)", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.6, color: "var(--ink3)" }}>
            PRELIMINARY REFERENCE ONLY — This pro forma inherits {openItemCount} unresolved items from the current-condition report. Parking (Ch. 541) and overlay districts (Ch. 551) are now resolved; feasibility still cannot be relied upon until setbacks and discretionary approvals are confirmed by a licensed professional.
          </div>
        </div>
      </div>
    </div>
  );
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
      {children}
    </div>
  );
}

function SummaryCell({ label, value, badge }: { label: string; value: string; badge: { tone: "blue" | "orange" | "gray" | "purple" | "red" | "green"; label: string } }) {
  return (
    <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 6 }}>
      <CellLabel>{label}</CellLabel>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 26, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em" }}>{value}</div>
      <span style={{ alignSelf: "flex-start" }}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </span>
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 7 }}>
      <CellLabel>{label}</CellLabel>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 28, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.025em" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>{note}</div>
    </div>
  );
}

function LineItemRow({
  label,
  value,
  badge,
  last,
}: {
  label: string;
  value: string;
  badge: { tone: "blue" | "orange" | "gray" | "purple" | "red" | "green"; label: string };
  last?: boolean;
}) {
  return (
    <div className="pg-lineitem-row" style={{ padding: "12px 16px", borderBottom: last ? undefined : "1px solid var(--line)", alignItems: "center" }}>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 13, lineHeight: 1.3 }}>{label}</div>
      <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 13, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ textAlign: "right" }}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
    </div>
  );
}

function RefRow({
  label,
  value,
  caveat,
}: {
  label: string;
  value: string;
  caveat?: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.3, color: "var(--ink2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 13, lineHeight: 1.3, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
      </div>
      {caveat && (
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1.4, color: "var(--orange)" }}>⚠ {caveat}</span>
      )}
    </div>
  );
}

function SliderField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  minLabel,
  maxLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1, color: "var(--ink2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 15, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--blue)" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono), monospace", fontSize: 10, lineHeight: 1, color: "var(--ink3)" }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
