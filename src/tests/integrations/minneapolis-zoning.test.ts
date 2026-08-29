import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MinneapolisZoningProvider,
  MinneapolisZoningError,
  MinneapolisPendingZoningProvider,
  parseZoningDistrict,
  parseZoningEnvelope,
  parseBuiltFormDistrict,
  resolveAllowedUses,
  resolveMinParkingStalls,
  resolveNumericEnvelope,
  primaryCategoryFromDistrict,
  MINNEAPOLIS_BUILT_FORM_STANDARDS,
  type ZoningQueryResponse,
  type NumericEnvelopeContext,
} from "@/lib/integrations/us-minneapolis/index.js";
import {
  approvalBlockers,
  isEvidence,
  isUnresolved,
  type EvidenceOrUnresolved,
} from "@/lib/jurisdiction/evidence.js";
import { createParcelIdentity } from "@/lib/jurisdiction/identifiers.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

function fixture(name: string): ZoningQueryResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const CTX = {
  retrievalDate: "2026-08-26",
  locator: "https://example/zoning/query?geometry=...",
  subject: "the parcel",
};

const SQUARE: PolygonCoordinates = [
  [
    [-93.2905, 44.9427],
    [-93.29, 44.9427],
    [-93.29, 44.9428],
    [-93.2905, 44.9428],
    [-93.2905, 44.9427],
  ],
];

describe("parseZoningDistrict", () => {
  it("resolves a single district to an official fact with the name as a note", () => {
    const result = parseZoningDistrict(fixture("mpls-zoning-un2"), CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.provenance).toBe("official");
    expect(result.confidence).toBe("high");
    expect(result.value).toBe("UN2");
    expect(result.note).toBe("Urban Neighborhood 2");
    expect(result.source?.label).toContain("Minneapolis");
    expect(result.source?.locator).toBe(CTX.locator);
  });

  it("returns Unresolved (approval-blocking) when no district maps the parcel", () => {
    const result = parseZoningDistrict(fixture("mpls-zoning-none"), CTX);
    expect(isUnresolved(result)).toBe(true);
    if (isUnresolved(result)) {
      expect(result.subject).toBe("zoning district");
      expect(result.blocksApproval).toBe(true);
    }
  });

  it("returns Unresolved and names both districts for a split-zoned parcel", () => {
    const result = parseZoningDistrict(fixture("mpls-zoning-split"), CTX);
    expect(isUnresolved(result)).toBe(true);
    if (isUnresolved(result)) {
      expect(result.requiredAction).toContain("UN2");
      expect(result.requiredAction).toContain("CM3");
    }
  });

  it("returns Unresolved on a service error", () => {
    const result = parseZoningDistrict(fixture("mpls-zoning-error"), CTX);
    expect(isUnresolved(result)).toBe(true);
  });
});

describe("parseZoningEnvelope", () => {
  it("resolves the district but leaves every by-right rule Unresolved", () => {
    const env = parseZoningEnvelope(fixture("mpls-zoning-un2"), CTX);
    expect(isEvidence(env.zoningDistrict)).toBe(true);

    const rules: EvidenceOrUnresolved<unknown>[] = [
      env.allowedUses,
      env.maxFar,
      env.maxLotCoverage,
      env.maxHeight,
      env.minSetbacks,
      env.minParkingStalls,
      ...env.overlays,
      ...env.discretionaryApprovals,
    ];
    expect(rules.every(isUnresolved)).toBe(true);
    // The district is sourced, so it is NOT among the blockers; every rule is.
    expect(approvalBlockers([env.zoningDistrict, ...rules]).length).toBe(
      rules.length,
    );
  });
});

describe("MinneapolisZoningProvider", () => {
  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
  const identity = () =>
    createParcelIdentity({
      apns: [],
      providerIds: [],
      normalizedAddress: "300 S 4th St, Minneapolis, MN",
    });

  // Route each of the two queries to its fixture by inspecting the URL.
  const routedFetch =
    (primary: string, builtForm: string) => async (url: string) => {
      const name = url.includes("Planning_Zoning_Built_Form")
        ? builtForm
        : primary;
      return okResponse(fixture(name));
    };

  it("queries both layers and resolves the primary district", async () => {
    let primaryUrl = "";
    const provider = new MinneapolisZoningProvider({
      fetchImpl: async (url) => {
        if (!url.includes("Planning_Zoning_Built_Form")) primaryUrl = url;
        return okResponse(
          fixture(
            url.includes("Planning_Zoning_Built_Form")
              ? "mpls-built-form-i2"
              : "mpls-zoning-un2",
          ),
        );
      },
      now: () => new Date("2026-08-26T00:00:00Z"),
    });

    const env = await provider.envelopeFor(identity(), SQUARE);
    expect(primaryUrl).toContain("geometryType=esriGeometryPolygon");
    expect(primaryUrl).toContain("esriSpatialRelIntersects");
    if (!isEvidence(env.zoningDistrict)) {
      throw new Error("expected a resolved district");
    }
    expect(env.zoningDistrict.value).toBe("UN2");
    expect(env.zoningDistrict.source?.locator).toBe(primaryUrl);
  });

  it("resolves height and (via primary category) lot coverage; FAR waits on use", async () => {
    const provider = new MinneapolisZoningProvider({
      fetchImpl: routedFetch("mpls-zoning-un2", "mpls-built-form-i2"),
      now: () => new Date("2026-08-26T00:00:00Z"),
    });
    const env = await provider.envelopeFor(identity(), SQUARE);
    // Interior 2 height (35 ft) — an unverified official rule.
    if (!isEvidence(env.maxHeight)) throw new Error("expected a height rule");
    expect(env.maxHeight.value.toFeet()).toBeCloseTo(35);
    // UN2 -> un-rm category resolves Interior 2 coverage (45%) with no use input.
    if (!isEvidence(env.maxLotCoverage)) throw new Error("expected coverage");
    expect(env.maxLotCoverage.value).toBeCloseTo(0.45);
    // FAR needs the proposed use, not supplied here.
    expect(isUnresolved(env.maxFar)).toBe(true);
    expect(isUnresolved(env.minSetbacks)).toBe(true);
    // UN2 permits 1–3 family dwellings by right (§ 545.100).
    if (!isEvidence(env.allowedUses)) throw new Error("expected allowed uses");
    expect(env.allowedUses.value).toContain("three-family dwelling");
    // Parking minimum is a sourced citywide zero (Chapter 541), not a gap.
    if (!isEvidence(env.minParkingStalls)) {
      throw new Error("expected a parking rule");
    }
    expect(env.minParkingStalls.value).toBe(0);
    expect(env.minParkingStalls.citation?.ordinanceSection).toContain("541");
  });

  it("resolves FAR when the development intent supplies a use class", async () => {
    const provider = new MinneapolisZoningProvider({
      fetchImpl: routedFetch("mpls-zoning-un2", "mpls-built-form-i2"),
      now: () => new Date("2026-08-26T00:00:00Z"),
    });
    const env = await provider.envelopeFor(identity(), SQUARE, {
      useClass: "single-family",
    });
    // Interior 2, UN/RM, residential 1-3 units -> FAR 0.5.
    if (!isEvidence(env.maxFar)) throw new Error("expected a FAR rule");
    expect(env.maxFar.value).toBe(0.5);
    expect(env.maxFar.verification).toBe("unverified");
  });

  it("returns an Unresolved district without geometry, never a fetch", async () => {
    let fetched = false;
    const provider = new MinneapolisZoningProvider({
      fetchImpl: async () => {
        fetched = true;
        return okResponse(fixture("mpls-zoning-un2"));
      },
    });
    const env = await provider.envelopeFor(identity());
    expect(fetched).toBe(false);
    expect(isUnresolved(env.zoningDistrict)).toBe(true);
  });

  it("throws MinneapolisZoningError on a non-OK HTTP status", async () => {
    const provider = new MinneapolisZoningProvider({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(
      provider.envelopeFor(identity(), SQUARE),
    ).rejects.toBeInstanceOf(MinneapolisZoningError);
  });

  it("wraps a transport failure in MinneapolisZoningError", async () => {
    const provider = new MinneapolisZoningProvider({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await expect(
      provider.envelopeFor(identity(), SQUARE),
    ).rejects.toBeInstanceOf(MinneapolisZoningError);
  });

  it("emits a well-formed citation template", () => {
    const provider = new MinneapolisZoningProvider({
      now: () => new Date("2026-08-26T00:00:00Z"),
    });
    const cite = provider.citationFor("§ 546.10");
    expect(cite.jurisdictionId).toBe("us-mn-hennepin-minneapolis");
    expect(cite.ordinanceSection).toBe("§ 546.10");
    expect(cite.parserVersion).toBe("2026.08.0-district");
    expect(cite.retrievalDate).toBe("2026-08-26");
  });
});

describe("parseBuiltFormDistrict", () => {
  const ctx = {
    retrievalDate: "2026-08-26",
    locator: "https://example/built-form/query?geometry=...",
    subject: "the parcel",
  };

  it("resolves a single built form district as an official fact", () => {
    const result = parseBuiltFormDistrict(fixture("mpls-built-form-i2"), ctx);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.provenance).toBe("official");
    expect(result.value).toBe("Interior 2");
    expect(result.note).toBe("BFI2");
  });

  it("returns Unresolved for no coverage and for a split parcel", () => {
    expect(isUnresolved(parseBuiltFormDistrict(fixture("mpls-built-form-none"), ctx))).toBe(
      true,
    );
    const split = parseBuiltFormDistrict(fixture("mpls-built-form-split"), ctx);
    expect(isUnresolved(split)).toBe(true);
    if (isUnresolved(split)) {
      expect(split.requiredAction).toContain("Interior 2");
      expect(split.requiredAction).toContain("Corridor 4");
    }
  });
});

describe("primaryCategoryFromDistrict", () => {
  it("maps UN/RM to un-rm and the CM/DT/PR/TR group to other", () => {
    expect(primaryCategoryFromDistrict("UN2")).toBe("un-rm");
    expect(primaryCategoryFromDistrict("RM1")).toBe("un-rm");
    expect(primaryCategoryFromDistrict("CM3")).toBe("other");
    expect(primaryCategoryFromDistrict("DT1")).toBe("other");
    expect(primaryCategoryFromDistrict("PR2")).toBe("other");
    expect(primaryCategoryFromDistrict("TR1")).toBe("other");
    expect(primaryCategoryFromDistrict("???")).toBeUndefined();
  });
});

describe("resolveNumericEnvelope", () => {
  const base = {
    builtFormDistrict: "Interior 2",
    retrievalDate: "2026-08-26",
    parserVersion: "test",
    owner: "local zoning professional",
  } satisfies Omit<NumericEnvelopeContext, "primaryCategory" | "useClass">;

  it("seeds height for Interior 2 (Table 540-6, 35 ft)", () => {
    expect(
      MINNEAPOLIS_BUILT_FORM_STANDARDS["Interior 2"]?.maxHeight?.value.feet,
    ).toBe(35);
    const env = resolveNumericEnvelope(base);
    if (!isEvidence(env.maxHeight)) throw new Error("expected a height rule");
    expect(env.maxHeight.verification).toBe("unverified");
    expect(env.maxHeight.value.toFeet()).toBeCloseTo(35);
    expect(env.maxHeight.citation?.ordinanceSection).toContain("540.410");
  });

  it("resolves lot coverage from primary category alone (no use needed)", () => {
    const env = resolveNumericEnvelope({ ...base, primaryCategory: "un-rm" });
    if (!isEvidence(env.maxLotCoverage)) throw new Error("expected coverage");
    expect(env.maxLotCoverage.value).toBeCloseTo(0.45); // Interior 2, UN/RM = 45%
    expect(env.maxLotCoverage.citation?.ordinanceSection).toContain("540.910");
    // The "other" category column is 100%.
    const other = resolveNumericEnvelope({ ...base, primaryCategory: "other" });
    if (!isEvidence(other.maxLotCoverage)) throw new Error("expected coverage");
    expect(other.maxLotCoverage.value).toBeCloseTo(1.0);
  });

  it("keeps coverage Unresolved when the primary category is unknown", () => {
    const env = resolveNumericEnvelope(base); // no primaryCategory
    expect(isUnresolved(env.maxLotCoverage)).toBe(true);
  });

  it("resolves FAR only with both primary category and use class", () => {
    // Interior 2, UN/RM: residential 1-3 units -> 0.5, all other -> 0.8.
    const sf = resolveNumericEnvelope({
      ...base,
      primaryCategory: "un-rm",
      useClass: "single-family",
    });
    if (!isEvidence(sf.maxFar)) throw new Error("expected FAR");
    expect(sf.maxFar.value).toBe(0.5);
    expect(sf.maxFar.citation?.ordinanceSection).toContain("540.110");

    const office = resolveNumericEnvelope({
      ...base,
      primaryCategory: "un-rm",
      useClass: "other",
    });
    if (!isEvidence(office.maxFar)) throw new Error("expected FAR");
    expect(office.maxFar.value).toBe(0.8);
  });

  it("keeps FAR Unresolved when use class is missing, listing the tiers", () => {
    const env = resolveNumericEnvelope({ ...base, primaryCategory: "un-rm" });
    expect(isUnresolved(env.maxFar)).toBe(true);
    if (isUnresolved(env.maxFar)) {
      expect(env.maxFar.requiredAction).toContain("use");
      expect(env.maxFar.requiredAction).toContain("0.5");
    }
  });

  it("applies Interior 3 per-unit-count FAR tiers", () => {
    const mk = (useClass: "two-family" | "three-family") =>
      resolveNumericEnvelope({
        ...base,
        builtFormDistrict: "Interior 3",
        primaryCategory: "un-rm",
        useClass,
      }).maxFar;
    const two = mk("two-family");
    const three = mk("three-family");
    if (!isEvidence(two) || !isEvidence(three)) throw new Error("expected FAR");
    expect(two.value).toBe(0.6);
    expect(three.value).toBe(0.7);
  });

  it("yields Unresolved for a district with no sourced rows (Transit 30A)", () => {
    const env = resolveNumericEnvelope({
      ...base,
      builtFormDistrict: "Transit 30A",
      primaryCategory: "un-rm",
      useClass: "other",
    });
    const fields: EvidenceOrUnresolved<unknown>[] = [
      env.maxFar,
      env.maxLotCoverage,
      env.maxHeight,
      env.minSetbacks,
    ];
    expect(fields.every(isUnresolved)).toBe(true);
    expect(approvalBlockers(fields).length).toBe(fields.length);
  });

  it("leaves setbacks Unresolved (yards are contextual, not automated)", () => {
    const env = resolveNumericEnvelope({
      ...base,
      primaryCategory: "un-rm",
      useClass: "other",
    });
    expect(isUnresolved(env.minSetbacks)).toBe(true);
  });
});

describe("resolveAllowedUses", () => {
  const ctx = { retrievalDate: "2026-08-26", parserVersion: "test" };

  it("attests 1–3 family dwellings by right in UN districts (an unverified rule)", () => {
    for (const code of ["UN1", "UN2", "UN3", "RM1", "RM2", "CM1", "CM2"]) {
      const r = resolveAllowedUses(code, ctx);
      if (!isEvidence(r)) throw new Error(`expected evidence for ${code}`);
      expect(r.verification).toBe("unverified");
      expect(r.value).toContain("single-family dwelling");
      expect(r.value).toContain("three-family dwelling");
      expect(r.citation?.ordinanceSection).toContain("545.100");
      // The note must scope the answer to residential dwellings.
      expect(r.note).toContain("1–3 family");
    }
  });

  it("returns Unresolved where new 1–3 family is not permitted by right", () => {
    for (const code of ["RM3", "CM3", "DT1", "PR1", "TR1"]) {
      const r = resolveAllowedUses(code, ctx);
      expect(isUnresolved(r)).toBe(true);
    }
  });
});

describe("resolveMinParkingStalls", () => {
  const ctx = { retrievalDate: "2026-08-26", parserVersion: "test" };

  it("resolves a citywide zero minimum as an unverified official rule (Ch. 541)", () => {
    const r = resolveMinParkingStalls(ctx);
    expect(isEvidence(r)).toBe(true);
    expect(r.provenance).toBe("official");
    expect(r.value).toBe(0);
    // Sourced but not human-confirmed, so it still routes through the gate.
    expect(r.verification).toBe("unverified");
    expect(r.citation?.ordinanceSection).toContain("541");
    // Scoped to minimum vehicle stalls, not bike/accessible/loading/TDM.
    expect(r.note).toContain("VEHICLE");
    // Independent of district or use — the reform is citywide.
    expect(resolveMinParkingStalls(ctx).value).toBe(0);
  });

  it("is an approval blocker until confirmed (unverified), like every parsed rule", () => {
    const r = resolveMinParkingStalls(ctx);
    expect(approvalBlockers([r]).length).toBe(1);
  });
});

describe("MinneapolisPendingZoningProvider", () => {
  it("leaves the district Unresolved even with geometry (no source wired)", async () => {
    const provider = new MinneapolisPendingZoningProvider();
    expect(provider.parserVersion).toBe("0.0.0-pending");
    const env = await provider.envelopeFor(
      createParcelIdentity({ apns: [], providerIds: [] }),
      SQUARE,
    );
    expect(isUnresolved(env.zoningDistrict)).toBe(true);
  });
});
