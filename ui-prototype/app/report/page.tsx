import Link from "next/link";
import { Header } from "@/components/header";
import { Badge, LegendSwatch } from "@/components/badge";
import { FactCard } from "@/components/fact-card";
import { ParcelMap } from "@/components/parcel-map";
import { getSiteAnalysis } from "@/lib/parcelgrid";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; address?: string }>;
}) {
  const { scenario, address } = await searchParams;
  const isRedev = scenario !== "current";

  // Real data from the PARCELGRID library (Census → Hennepin → FEMA → USGS →
  // zoning), replacing the design's static mock.
  const sa = await getSiteAnalysis(address);
  const subjectParcel = { ...sa.parcel, ward: null as string | null, builtForm: null as string | null };
  const openItems = sa.report.gaps.map((g) => ({
    title: g.label,
    detail: g.requiredAction || `Owner: ${g.owner} · ${g.subject}`,
    owner: g.owner,
  }));
  const TOTAL_OPEN_ITEMS = sa.openItemCount;
  const resolved = sa.resolved;

  // Map context chips — only shown when actually resolved.
  const floodLabel = sa.flood
    ? sa.flood.inSfha
      ? `SFHA · Zone ${sa.flood.zone}`
      : `Flood Zone ${sa.flood.zone}`
    : null;
  const overlayLabel =
    sa.overlays.resolved && sa.overlays.names.length ? sa.overlays.names.join(" · ") : null;

  const bannerHeadline = resolved
    ? `PRELIMINARY — ${TOTAL_OPEN_ITEMS} open items block approval`
    : "PARCEL UNRESOLVED — no analysis to show";
  const bannerSub = resolved
    ? "Nothing below is a legal maximum. Missing inputs are shown, never inferred."
    : "The address was located, but no parcel matched. Nothing is inferred in its place.";
  const bannerTag = resolved ? `${TOTAL_OPEN_ITEMS} BLOCKERS` : "UNRESOLVED";

  return (
    <div className="pg-page">
      <div className="pg-shell">
        <div className="pg-card">
          <Header variant="app" searchValue={subjectParcel.address} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 24px",
              background: "var(--orange-bg)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "var(--orange)",
                color: "var(--panel)",
                fontFamily: "var(--font-sans), sans-serif",
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              !
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 17, lineHeight: 1.2, color: "var(--orange)", letterSpacing: "-.01em" }}>
                {bannerHeadline}
              </div>
              <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.4, color: "var(--ink2)" }}>
                {bannerSub}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div style={{ padding: "7px 12px", border: "1px solid var(--line2)", borderRadius: 6, background: "var(--panel)", fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 11, lineHeight: 1, color: "var(--ink2)", letterSpacing: ".05em" }}>
                SNAPSHOT 2026-08-27
              </div>
              <div style={{ padding: "7px 12px", borderRadius: 6, background: "var(--orange)", color: "var(--panel)", fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 11, lineHeight: 1, letterSpacing: ".05em" }}>
                {bannerTag}
              </div>
            </div>
          </div>

          <div className="pg-grid-map">
            {/* LEFT — real parcel map + subject identity + open items */}
            <div className="pg-map-col">
              <ParcelMap
                rings={sa.parcelGeometry}
                lotAreaSf={subjectParcel.lotAreaSf}
                floodLabel={floodLabel}
                overlayLabel={overlayLabel}
                address={subjectParcel.address}
              />

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  Subject parcel
                </div>
                <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 20, lineHeight: 1.2, letterSpacing: "-.02em" }}>
                  {subjectParcel.address}
                </div>
                {sa.jurisdictionName ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, lineHeight: 1, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue)", borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap" }}>
                      Jurisdiction
                    </span>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink2)" }}>
                      {sa.jurisdictionName}
                    </span>
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: 16, fontFamily: "var(--font-mono), monospace", fontSize: 12, lineHeight: 1.5, color: "var(--ink2)", flexWrap: "wrap" }}>
                  <span>APN {subjectParcel.apn ?? "—"}</span>
                  <span>Owner: {subjectParcel.owner ?? (resolved ? "[on record]" : "—")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {resolved ? (
                    <>
                      <Badge tone="blue">OFFICIAL · VERIFIED</Badge>
                      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                        Hennepin County Assessor parcel record
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="orange">UNRESOLVED</Badge>
                      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                        No parcel matched this address
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  Open items
                </div>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 11, lineHeight: 1, color: "var(--orange)", letterSpacing: ".06em" }}>
                  BLOCKS APPROVAL
                </div>
              </div>

              <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
                {openItems.map((item, i) => (
                  <div
                    key={item.title}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "14px 16px",
                      borderBottom: i < openItems.length - 1 ? "1px solid var(--line)" : undefined,
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1.4, color: "var(--orange)", minWidth: 16 }}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 13, lineHeight: 1.35 }}>{item.title}</span>
                        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, lineHeight: 1, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", background: "var(--gray-bg)", border: "1px solid var(--line)", borderRadius: 4, padding: "3px 6px", whiteSpace: "nowrap" }}>
                          {item.owner}
                        </span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.5, color: "var(--ink3)" }}>{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  Reviewer — how blockers clear
                </div>
                <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.5, color: "var(--ink2)" }}>
                  Machine-parsed rules carry <strong style={{ color: "var(--orange)", fontWeight: 600 }}>UNVERIFIED</strong> until a licensed reviewer signs off — then they become <strong style={{ color: "var(--blue)", fontWeight: 600 }}>OFFICIAL · VERIFIED</strong>. This holds even when every value is present: approval never opens on data alone.
                </div>
                <button
                  style={{
                    cursor: "pointer",
                    alignSelf: "flex-start",
                    border: "1px solid var(--line2)",
                    background: "var(--panel)",
                    color: "var(--ink)",
                    borderRadius: 6,
                    padding: "9px 14px",
                    fontFamily: "var(--font-sans), sans-serif",
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                >
                  Request review
                </button>
              </div>

              {resolved && (
                <Link
                  href={`/envelope?address=${encodeURIComponent(subjectParcel.address)}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--blue)",
                    border: "1px solid var(--blue)",
                    borderRadius: 8,
                    padding: "15px 18px",
                    color: "#fff",
                    textDecoration: "none",
                    fontFamily: "var(--font-sans), sans-serif",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {isRedev
                    ? "Redevelopment — view build envelope & pro forma"
                    : "View redevelopment envelope & pro forma"}
                  <span aria-hidden>→</span>
                </Link>
              )}
            </div>

            {/* RIGHT — grounded facts */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 12, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                  Grounded facts
                </div>
                <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".06em", color: "var(--ink3)", flexWrap: "wrap" }}>
                  <LegendSwatch tone="blue" label="OFFICIAL" />
                  <LegendSwatch tone="orange" label="UNVERIFIED" />
                  <LegendSwatch tone="gray" label="ALGORITHM" />
                  <LegendSwatch tone="purple" label="USER ASSUMPTION" />
                </div>
              </div>

              {!resolved ? (
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "24px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 18, lineHeight: 1.25, letterSpacing: "-.01em" }}>
                    No parcel matched this address
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 13, lineHeight: 1.6, color: "var(--ink2)" }}>
                    {sa.unresolvedReason ??
                      "The address was located, but no Hennepin County parcel falls on that point."}
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 13, lineHeight: 1.6, color: "var(--ink2)" }}>
                    This is not a network or firewall error — the pipeline reached its sources and
                    found nothing to attach, so it shows nothing rather than inventing a lot area,
                    zoning, or tax figure.
                    {sa.candidates.length
                      ? " The address you entered isn't itself a parcel; the closest real parcels are below — pick one to analyze it."
                      : " Try a nearby street address, or confirm the parcel on the county parcel viewer."}
                  </div>

                  {sa.candidates.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                      <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                        Nearby parcels
                      </div>
                      {sa.candidates.map((c) => (
                        <Link
                          key={c.label + c.distanceMeters}
                          href={`/report?scenario=${scenario ?? "redev"}&address=${encodeURIComponent(c.address)}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            background: "var(--panel2)",
                            border: "1px solid var(--line)",
                            borderRadius: 8,
                            padding: "12px 14px",
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 14, lineHeight: 1.3 }}>
                            {c.label}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1, color: "var(--ink3)", whiteSpace: "nowrap" }}>
                              {Math.round(c.distanceMeters)} m away
                            </span>
                            <span aria-hidden style={{ color: "var(--blue)", fontWeight: 600 }}>→</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
                    <Badge tone="orange">UNRESOLVED</Badge>
                    <Badge tone="blue">SOURCES REACHED</Badge>
                  </div>
                </div>
              ) : (
              <div className="pg-2col">
                <FactCard
                  label="Lot area"
                  value={<>{(subjectParcel.lotAreaSf ?? 0).toLocaleString("en-US")} <span style={{ fontSize: 14, color: "var(--ink2)" }}>sq ft</span></>}
                  badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                  source="Hennepin County GIS parcel polygon"
                />
                <FactCard
                  label="Flood exposure"
                  value={sa.flood ? `Zone ${sa.flood.zone}` : "—"}
                  sub={sa.flood ? (sa.flood.inSfha ? "Special Flood Hazard Area" : "Not a Special Flood Hazard Area") : "Unresolved"}
                  badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                  source={sa.flood?.source ?? "FEMA National Flood Hazard Layer"}
                />
                <FactCard
                  label="Topography"
                  value={<>{sa.terrain ? `${sa.terrain.minFt}–${sa.terrain.maxFt}` : "—"} <span style={{ fontSize: 14, color: "var(--ink2)" }}>ft</span></>}
                  sub={sa.terrain ? `Mean slope ${sa.terrain.slopePct}% — coarse extent estimate` : "Unresolved"}
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "gray", label: "ALGORITHM · SLOPE" },
                  ]}
                  source={sa.terrain?.source ?? "USGS 3DEP (EPQS point samples)"}
                />
                <FactCard
                  label="Zoning district"
                  value={subjectParcel.zoningDistrict ?? "—"}
                  sub={subjectParcel.builtForm ? `${subjectParcel.zoningName} · Built form: ${subjectParcel.builtForm}` : (subjectParcel.zoningName ?? "")}
                  badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                  source="City of Minneapolis zoning + built-form GIS"
                />
                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink3)" }}>
                    Permitted uses (1–3 family)
                  </div>
                  <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 500, fontSize: 17, lineHeight: 1.3, letterSpacing: "-.01em" }}>
                    {sa.allowedUses && sa.allowedUses.length
                      ? sa.allowedUses
                          .map((u) => u.replace(/ dwelling$/, ""))
                          .join(", ") + " dwelling"
                      : "Unresolved"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {sa.allowedUses && sa.allowedUses.length ? (
                      <>
                        <Badge tone="blue">OFFICIAL</Badge>
                        <Badge tone="orange">UNVERIFIED</Badge>
                      </>
                    ) : (
                      <Badge tone="orange">UNRESOLVED</Badge>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.4, color: "var(--ink3)" }}>
                    City of Minneapolis §545.100 (Table 545-1) — machine-parsed
                  </div>
                </div>
                <FactCard
                  label="Maximum height"
                  value={<>{subjectParcel.maxHeightFt ?? "—"} <span style={{ fontSize: 14, color: "var(--ink2)" }}>ft</span></>}
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source="City of Minneapolis §540.410 — machine-parsed"
                />
                <FactCard
                  label="Maximum FAR"
                  value={subjectParcel.maxFar ?? "—"}
                  sub="Three-family dwelling tier"
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source="City of Minneapolis §540.110 — machine-parsed"
                />
                <FactCard
                  label="Maximum lot coverage"
                  value={<>{subjectParcel.maxLotCoveragePct ?? "—"}<span style={{ fontSize: 14, color: "var(--ink2)" }}>%</span></>}
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source="City of Minneapolis §540.910 — machine-parsed"
                />
                <FactCard
                  label="Overlay districts"
                  value={
                    sa.overlays.resolved
                      ? sa.overlays.names.length
                        ? sa.overlays.names.join(", ")
                        : "None apply"
                      : "Unresolved"
                  }
                  sub={sa.overlays.names.length ? "Chapter 551 overlay(s) intersect this parcel" : undefined}
                  badges={
                    sa.overlays.resolved
                      ? [{ tone: "blue", label: "OFFICIAL · VERIFIED" }]
                      : [{ tone: "orange", label: "UNVERIFIED" }]
                  }
                  source="City of Minneapolis overlay layer — Ch. 551"
                />
                <FactCard
                  label="Min. parking stalls"
                  value={sa.parking ? sa.parking.minStalls : "—"}
                  sub="Citywide parking-minimum elimination (2021)"
                  badges={[
                    { tone: "blue", label: "OFFICIAL" },
                    { tone: "orange", label: "UNVERIFIED" },
                  ]}
                  source={sa.parking?.source ? `City of Minneapolis ${sa.parking.source}` : "City of Minneapolis Chapter 541"}
                />

                {sa.assessment && (
                  <>
                    <FactCard
                      label="Year built"
                      value={sa.assessment.yearBuilt ?? "—"}
                      badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                      source="Hennepin County Assessor — BUILD_YR"
                    />
                    <FactCard
                      label="Assessor taxable value"
                      value={sa.assessment.assessedValue ?? "—"}
                      sub="Total taxable market value — current assessment"
                      badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                      source="Hennepin County Assessor — current"
                    />
                    <FactCard
                      label="Annual property tax"
                      value={sa.assessment.annualPropertyTax ?? "—"}
                      sub="Actual amount billed — current assessment"
                      badges={[{ tone: "blue", label: "OFFICIAL · VERIFIED" }]}
                      source="Hennepin County Assessor — current"
                    />
                    <FactCard
                      label="Effective tax rate"
                      value={
                        sa.assessment.effectiveTaxRatePct != null ? (
                          <>{sa.assessment.effectiveTaxRatePct}<span style={{ fontSize: 14, color: "var(--ink2)" }}>%</span></>
                        ) : (
                          "—"
                        )
                      }
                      sub="Current assessment only — a redevelopment is reassessed"
                      badges={[{ tone: "gray", label: "ALGORITHM · DERIVED" }]}
                      source="actual tax ÷ assessor taxable value"
                    />
                    {sa.assessment.lastSalePrice && (
                      <FactCard
                        label="Last recorded sale"
                        value={sa.assessment.lastSalePrice}
                        sub={`${sa.assessment.lastSaleDate ?? ""}${sa.assessment.lastSaleCaveat ? " · " + sa.assessment.lastSaleCaveat : ""}`}
                        badges={[{ tone: "blue", label: "OFFICIAL" }]}
                        source="Hennepin County Assessor — sale record"
                      />
                    )}
                  </>
                )}

                <div
                  style={{
                    gridColumn: "span 2",
                    background: "var(--orange-bg)",
                    border: "1px solid var(--orange)",
                    borderRadius: 8,
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500, fontSize: 10, lineHeight: 1, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--orange)" }}>
                      Minimum setbacks
                    </div>
                    <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 20, lineHeight: 1.1, color: "var(--orange)", letterSpacing: "-.01em" }}>
                      Unresolved
                    </div>
                    <div style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 12, lineHeight: 1.4, color: "var(--ink2)" }}>
                      Contextual front-yard rule depends on adjacent buildings — not automatable from published data.
                    </div>
                  </div>
                  <div style={{ display: "inline-flex", padding: "6px 12px", borderRadius: 5, background: "var(--orange)", color: "var(--panel)", fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: 11, lineHeight: 1, letterSpacing: ".06em", whiteSpace: "nowrap" }}>
                    BLOCKS APPROVAL
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>

          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--line)", background: "var(--panel2)", fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.6, color: "var(--ink3)" }}>
            PRELIMINARY REFERENCE ONLY — Values are derived from public sources at the snapshot time and machine-parsed ordinance text. They are not legal maximums, not a zoning determination, and not a substitute for review by a licensed professional or the City of Minneapolis.
          </div>
        </div>
      </div>
    </div>
  );
}
