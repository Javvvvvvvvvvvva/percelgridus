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
  builtFormNumericEnvelope,
  MINNEAPOLIS_BUILT_FORM_STANDARDS,
  type ZoningQueryResponse,
  type BuiltFormStandards,
  type BuiltFormRuleContext,
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

  it("resolves the built form district but keeps numeric rules Unresolved (table empty)", async () => {
    const provider = new MinneapolisZoningProvider({
      fetchImpl: routedFetch("mpls-zoning-un2", "mpls-built-form-i2"),
      now: () => new Date("2026-08-26T00:00:00Z"),
    });
    const env = await provider.envelopeFor(identity(), SQUARE);
    // No sourced Chapter 540 row today, so every numeric field is a tracked gap
    // whose action names the resolved built form district.
    expect(isUnresolved(env.maxHeight)).toBe(true);
    if (isUnresolved(env.maxHeight)) {
      expect(env.maxHeight.requiredAction).toContain("Interior 2");
      expect(env.maxHeight.requiredAction).toContain("Chapter 540");
    }
    expect(isUnresolved(env.maxFar)).toBe(true);
    expect(isUnresolved(env.maxLotCoverage)).toBe(true);
    expect(isUnresolved(env.minSetbacks)).toBe(true);
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

describe("builtFormNumericEnvelope", () => {
  const ctx: BuiltFormRuleContext = {
    builtFormDistrict: "Interior 2",
    retrievalDate: "2026-08-26",
    parserVersion: "test",
    owner: "local zoning professional",
  };

  it("ships an empty standards table (no fabricated by-right numbers)", () => {
    expect(Object.keys(MINNEAPOLIS_BUILT_FORM_STANDARDS)).toHaveLength(0);
  });

  it("yields Unresolved for every field when the district has no sourced row", () => {
    const env = builtFormNumericEnvelope(ctx);
    const fields: EvidenceOrUnresolved<unknown>[] = [
      env.maxFar,
      env.maxLotCoverage,
      env.maxHeight,
      env.minSetbacks,
    ];
    expect(fields.every(isUnresolved)).toBe(true);
    expect(approvalBlockers(fields).length).toBe(fields.length);
  });

  it("maps a sourced value to an unverified, approval-blocking official rule", () => {
    // Injected sourced standards prove the citation/Length machinery without
    // seeding the shipped (deliberately empty) table.
    const standards: BuiltFormStandards = {
      maxHeight: {
        value: { feet: 35, stories: 3 },
        section: "§ 540.410",
        originalText: "Interior 2 ... 35 feet",
        effectiveDate: "2024-01-01",
      },
      maxFar: { value: 0.5, section: "§ 540.430" },
    };
    const env = builtFormNumericEnvelope(ctx, standards);

    if (!isEvidence(env.maxHeight)) throw new Error("expected a rule");
    expect(env.maxHeight.provenance).toBe("official");
    expect(env.maxHeight.verification).toBe("unverified");
    expect(env.maxHeight.value.toFeet()).toBeCloseTo(35);
    expect(env.maxHeight.citation?.ordinanceSection).toBe("§ 540.410");
    expect(env.maxHeight.citation?.originalText).toContain("35 feet");
    expect(env.maxHeight.citation?.zoningDistrict).toBe("Interior 2");

    if (!isEvidence(env.maxFar)) throw new Error("expected a rule");
    expect(env.maxFar.value).toBe(0.5);

    // Unverified official rules still block approval; unsourced fields too.
    expect(approvalBlockers([env.maxHeight, env.maxFar, env.maxLotCoverage]).length).toBe(
      3,
    );
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
