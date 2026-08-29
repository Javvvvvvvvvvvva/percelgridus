import { describe, it, expect } from "vitest";
import {
  buildDecisionReport,
  renderTextReport,
} from "@/lib/report/index.js";
import type { SiteDueDiligence } from "@/lib/intake/index.js";
import {
  officialFact,
  officialRule,
  unresolved,
  createParcelIdentity,
  approvalBlockers,
} from "@/lib/jurisdiction/index.js";
import type { ByRightEnvelope, RuleCitation } from "@/lib/jurisdiction/index.js";
import { Area, Length, Money } from "@/lib/units/index.js";

const SRC = { label: "City of Minneapolis — Planning Primary Zoning", locator: "x", retrievalDate: "2026-08-26" };
const CITE: RuleCitation = {
  label: "City of Minneapolis UDO",
  locator: "x",
  retrievalDate: "2026-08-26",
  jurisdictionId: "us-mn-hennepin-minneapolis",
  ordinanceTitle: "Minneapolis Code Title 20",
  ordinanceSection: "§ 540.410 (Table 540-6)",
};

function envelope(): ByRightEnvelope {
  return {
    jurisdictionId: "us-mn-hennepin-minneapolis",
    zoningDistrict: officialFact("UN2", SRC),
    allowedUses: {
      ...officialRule(["single-family dwelling"], CITE, { verification: "unverified" }),
    },
    maxFar: unresolved("FAR", "planner", "supply the proposed use class"),
    maxLotCoverage: officialRule(0.45, CITE, { verification: "unverified" }),
    maxHeight: officialRule(Length.feet("35"), CITE, { verification: "unverified" }),
    minSetbacks: unresolved("setbacks", "planner", "yards are contextual"),
    minParkingStalls: unresolved("parking", "planner", "check Ch. 541"),
    overlays: [],
    discretionaryApprovals: [],
  };
}

function dueDiligence(): SiteDueDiligence {
  const identity = createParcelIdentity({
    apns: [{ system: "hennepin-county", value: "PID-1", kind: "PID" }],
    providerIds: [],
    normalizedAddress: "3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408",
  });
  const address = officialFact(
    {
      input: "3300 Aldrich Ave S",
      normalized: "3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408",
      point: { lng: -93.29, lat: 44.9428 },
    },
    SRC,
  );
  return {
    rawAddress: "3300 Aldrich Ave S, Minneapolis, MN",
    address,
    parcel: {
      identity,
      geometry: officialFact([[[0, 0]]], SRC),
      lotArea: officialFact(Area.squareFeet("4346"), SRC),
      ownerName: officialFact("Jane Doe", SRC),
    },
    siteId: identity.siteId,
    flood: officialFact({ femaZone: "X", inSfha: false }, SRC),
    terrain: unresolved("terrain", "surveyor", "sample a denser grid"),
    zoning: envelope(),
    persisted: true,
    blockers: [],
  };
}

describe("buildDecisionReport", () => {
  it("splits resolved facts from tracked gaps and carries provenance", () => {
    const r = buildDecisionReport(dueDiligence());

    const factLabels = r.facts.map((f) => f.label);
    expect(factLabels).toContain("Address");
    expect(factLabels).toContain("Zoning district");
    expect(factLabels).toContain("Max height");
    expect(factLabels).toContain("Flood hazard");
    expect(factLabels).toContain("Owner of record");

    const gapLabels = r.gaps.map((g) => g.label);
    expect(gapLabels).toContain("Max floor area ratio");
    expect(gapLabels).toContain("Terrain");
    expect(gapLabels).toContain("Min setbacks");

    // Height carries its ordinance source and unverified status.
    const height = r.facts.find((f) => f.label === "Max height");
    expect(height?.value).toBe("35 ft");
    expect(height?.verification).toBe("unverified");
    expect(height?.source).toContain("§ 540.410");

    // Flood is a plain official fact (no citation), formatted with the zone.
    const fl = r.facts.find((f) => f.label === "Flood hazard");
    expect(fl?.value).toBe("Zone X");
  });

  it("surfaces assessor facts (year built, value, tax, last sale) without blocking", () => {
    const dd = dueDiligence();
    const withAssessor: SiteDueDiligence = {
      ...dd,
      parcel: {
        ...dd.parcel!,
        yearBuilt: officialFact(1912, SRC),
        assessedValue: officialFact(Money.usd("512000"), SRC),
        annualPropertyTax: officialFact(Money.usd("6784.52"), SRC),
        lastSale: {
          ...officialFact(
            {
              date: "2021-04",
              price: Money.usd("415000"),
              saleCode: "SALE INCLUDES MORE THAN ONE PARCEL",
            },
            SRC,
          ),
          note: "SALE INCLUDES MORE THAN ONE PARCEL",
        },
      },
    };
    const r = buildDecisionReport(withAssessor);
    const byLabel = (l: string) => r.facts.find((f) => f.label === l);
    expect(byLabel("Year built")?.value).toBe("1912");
    expect(byLabel("Assessor taxable value")?.value).toBe("$512,000.00");
    expect(byLabel("Annual property tax")?.value).toBe("$6,784.52");
    expect(byLabel("Last recorded sale")?.value).toContain("$415,000.00");
    // The sale-code caveat rides along as the fact's note.
    expect(byLabel("Last recorded sale")?.note).toContain("MORE THAN ONE PARCEL");
    // Effective tax rate is derived exactly from value + tax: 6784.52/512000 ≈ 1.33%.
    expect(byLabel("Effective property tax rate")?.value).toBe(
      "1.33% (current assessment)",
    );
    // Assessor facts are machine-parsed and must not add approval blockers.
    const base = buildDecisionReport(dd);
    expect(r.blockers.length).toBe(base.blockers.length);
  });

  it("is not approvable while unverified rules or gaps remain", () => {
    const r = buildDecisionReport(dueDiligence());
    expect(r.approvable).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
    // The plain official facts (address, district, flood, owner) do NOT block;
    // the unverified rules (height/coverage/uses) and the gaps (FAR/terrain/
    // setbacks/parking) do.
    const expected = approvalBlockers([
      dueDiligence().zoning!.maxHeight,
      dueDiligence().zoning!.maxLotCoverage,
      dueDiligence().zoning!.allowedUses,
      dueDiligence().zoning!.maxFar,
      dueDiligence().zoning!.minSetbacks,
      dueDiligence().zoning!.minParkingStalls,
      dueDiligence().terrain!,
    ]);
    expect(r.blockers.length).toBe(expected.length);
    expect(r.summary).toContain("Preliminary reference only");
  });

  it("marks a fully-verified result as having no open blockers", () => {
    const dd = dueDiligence();
    const verified: SiteDueDiligence = {
      ...dd,
      terrain: officialFact(
        { meanSlopePct: 2, minElevation: Length.feet("800"), maxElevation: Length.feet("820") },
        SRC,
      ),
      zoning: {
        ...dd.zoning!,
        allowedUses: officialFact(["single-family dwelling"], SRC),
        maxFar: officialFact(0.5, SRC),
        maxLotCoverage: officialFact(0.45, SRC),
        maxHeight: officialFact(Length.feet("35"), SRC),
        minSetbacks: officialFact(
          { front: Length.feet("20"), side: Length.feet("5"), rear: Length.feet("5") },
          SRC,
        ),
        minParkingStalls: officialFact(0, SRC),
      },
    };
    const r = buildDecisionReport(verified);
    expect(r.approvable).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.summary).toContain("no open blockers");
  });
});

describe("renderTextReport", () => {
  it("renders a readable report with the decision, facts, and open items", () => {
    const text = renderTextReport(buildDecisionReport(dueDiligence()));
    expect(text).toContain("PARCELGRID");
    expect(text).toContain("3300 Aldrich Ave S");
    expect(text).toContain("NOT APPROVABLE");
    expect(text).toContain("Zoning district: UN2");
    expect(text).toContain("BLOCKS APPROVAL");
    expect(text).toContain("Max height: 35 ft");
  });
});
