import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MinneapolisZoningProvider,
  MinneapolisZoningError,
  MinneapolisPendingZoningProvider,
  parseZoningDistrict,
  parseZoningEnvelope,
  type ZoningQueryResponse,
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

  it("builds a polygon-intersects query and resolves the district", async () => {
    let calledUrl = "";
    const provider = new MinneapolisZoningProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("mpls-zoning-un2"));
      },
      now: () => new Date("2026-08-26T00:00:00Z"),
    });

    const env = await provider.envelopeFor(identity(), SQUARE);
    expect(calledUrl).toContain("geometryType=esriGeometryPolygon");
    expect(calledUrl).toContain("esriSpatialRelIntersects");
    if (!isEvidence(env.zoningDistrict)) {
      throw new Error("expected a resolved district");
    }
    expect(env.zoningDistrict.value).toBe("UN2");
    expect(env.zoningDistrict.source?.locator).toBe(calledUrl);
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
