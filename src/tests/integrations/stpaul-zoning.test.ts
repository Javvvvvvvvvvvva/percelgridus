import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  StPaulZoningProvider,
  StPaulZoningError,
  parseStPaulZoningDistrict,
  parseStPaulZoningEnvelope,
  createStPaulProfile,
  registerStPaul,
  RamseyPendingParcelProvider,
  SAINT_PAUL_JURISDICTION_ID,
  type StPaulZoningResponse,
} from "@/lib/integrations/us-stpaul/index.js";
import {
  approvalBlockers,
  isEvidence,
  isUnresolved,
  createParcelIdentity,
  JurisdictionRegistry,
  type EvidenceOrUnresolved,
} from "@/lib/jurisdiction/index.js";
import { registerMinneapolis } from "@/lib/integrations/us-minneapolis/index.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/index.js";

function fixture(name: string): StPaulZoningResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const CTX = {
  retrievalDate: "2026-08-30",
  locator: "https://example/stpaul/query",
  subject: "the parcel",
};

const SQUARE: PolygonCoordinates = [
  [
    [-93.0936, 44.9507],
    [-93.0931, 44.9507],
    [-93.0931, 44.9511],
    [-93.0936, 44.9511],
    [-93.0936, 44.9507],
  ],
];

const identity = () =>
  createParcelIdentity({
    apns: [],
    providerIds: [],
    normalizedAddress: "downtown Saint Paul",
  });

describe("parseStPaulZoningDistrict", () => {
  it("resolves a single district to an official fact with the name as a note", () => {
    const r = parseStPaulZoningDistrict(fixture("stpaul-zoning-b5"), CTX);
    if (!isEvidence(r)) throw new Error("expected evidence");
    expect(r.provenance).toBe("official");
    expect(r.confidence).toBe("high");
    expect(r.value).toBe("B5");
    expect(r.note).toBe("Central Business Service");
    expect(r.source?.label).toContain("Saint Paul");
  });

  it("returns Unresolved when no district maps the parcel", () => {
    const r = parseStPaulZoningDistrict(fixture("stpaul-zoning-none"), CTX);
    expect(isUnresolved(r)).toBe(true);
    if (isUnresolved(r)) expect(r.blocksApproval).toBe(true);
  });

  it("returns Unresolved and names both districts for a split-zoned parcel", () => {
    const r = parseStPaulZoningDistrict(fixture("stpaul-zoning-split"), CTX);
    expect(isUnresolved(r)).toBe(true);
    if (isUnresolved(r)) {
      expect(r.requiredAction).toContain("B5");
      expect(r.requiredAction).toContain("R4");
    }
  });

  it("returns Unresolved on a service error", () => {
    expect(isUnresolved(parseStPaulZoningDistrict(fixture("stpaul-zoning-error"), CTX))).toBe(true);
  });
});

describe("parseStPaulZoningEnvelope", () => {
  it("resolves the district but leaves every by-right rule Unresolved", () => {
    const env = parseStPaulZoningEnvelope(fixture("stpaul-zoning-b5"), CTX);
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
    expect(approvalBlockers([env.zoningDistrict, ...rules]).length).toBe(rules.length);
  });
});

describe("StPaulZoningProvider", () => {
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it("posts the geometry in the body (not the URL) and resolves the district", async () => {
    let calledUrl = "";
    let calledBody = "";
    const provider = new StPaulZoningProvider({
      fetchImpl: async (url, init) => {
        calledUrl = url;
        calledBody = init?.body ?? "";
        return okResponse(fixture("stpaul-zoning-b5"));
      },
      now: () => new Date("2026-08-30T00:00:00Z"),
    });
    const env = await provider.envelopeFor(identity(), SQUARE);
    expect(calledUrl).not.toContain("geometry");
    expect(calledBody).toContain("esriSpatialRelIntersects");
    if (!isEvidence(env.zoningDistrict)) throw new Error("expected a district");
    expect(env.zoningDistrict.value).toBe("B5");
    expect(env.zoningDistrict.source?.locator).toBe(calledUrl);
  });

  it("returns an Unresolved district without geometry, never a fetch", async () => {
    let fetched = false;
    const provider = new StPaulZoningProvider({
      fetchImpl: async () => {
        fetched = true;
        return okResponse(fixture("stpaul-zoning-b5"));
      },
    });
    const env = await provider.envelopeFor(identity());
    expect(fetched).toBe(false);
    expect(isUnresolved(env.zoningDistrict)).toBe(true);
  });

  it("throws StPaulZoningError on a non-OK HTTP status", async () => {
    const provider = new StPaulZoningProvider({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(provider.envelopeFor(identity(), SQUARE)).rejects.toBeInstanceOf(StPaulZoningError);
  });
});

describe("RamseyPendingParcelProvider", () => {
  it("resolves every lookup to an honest Unresolved (egress-pending)", async () => {
    const p = new RamseyPendingParcelProvider();
    const byPoint = await p.byPoint({ lng: -93.09, lat: 44.95 });
    expect(isUnresolved(byPoint)).toBe(true);
    if (isUnresolved(byPoint)) expect(byPoint.requiredAction).toMatch(/not reachable/);
    expect(isUnresolved(await p.byAddress!("x"))).toBe(true);
  });
});

describe("Saint Paul profile + multi-jurisdiction registry", () => {
  it("builds a contract-complete profile with the shared national providers", () => {
    const profile = createStPaulProfile();
    expect(profile.jurisdictionId).toBe(SAINT_PAUL_JURISDICTION_ID);
    expect(profile.stateCode).toBe("MN");
    expect(profile.displayName).toContain("Saint Paul");
    // Reuses the national hazard bundle (flood + terrain) and Census address.
    expect(profile.hazardProviders.map((h) => h.hazardKind).sort()).toEqual([
      "flood",
      "terrain",
    ]);
    expect(profile.zoningProvider.jurisdictionId).toBe(SAINT_PAUL_JURISDICTION_ID);
  });

  it("coexists with Minneapolis in one registry", () => {
    const registry = new JurisdictionRegistry();
    registerMinneapolis(registry);
    registerStPaul(registry);
    expect(registry.list()).toHaveLength(2);
    expect(registry.has(SAINT_PAUL_JURISDICTION_ID)).toBe(true);
    expect(registry.get(SAINT_PAUL_JURISDICTION_ID).displayName).toContain("Saint Paul");
    expect(registry.get("us-mn-hennepin-minneapolis").displayName).toContain("Minneapolis");
  });
});
