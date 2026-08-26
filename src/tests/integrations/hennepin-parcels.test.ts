import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HennepinParcelProvider,
  HennepinParcelError,
  parseParcelResponse,
  HENNEPIN_APN_SYSTEM,
  type HennepinParcelResponse,
} from "@/lib/integrations/us-hennepin/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import { asUuid, findIdentifier } from "@/lib/jurisdiction/identifiers.js";
import type { SiteId } from "@/lib/jurisdiction/identifiers.js";

function fixture(name: string): HennepinParcelResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const FIXED_SITE_ID = asUuid("00000000-0000-4000-8000-000000000001") as SiteId;

const CTX = {
  siteId: FIXED_SITE_ID,
  retrievalDate: "2026-08-26",
  locator: "https://example/query?geometry=...",
};

describe("parseParcelResponse", () => {
  it("maps a matched parcel to a ParcelRecord with official evidence", () => {
    const record = parseParcelResponse(
      fixture("hennepin-parcel-match"),
      CTX,
      "point (-93.2898, 44.942782)",
    );
    if (isUnresolved(record)) throw new Error("expected a parcel record");

    // Internal id is the injected UUID; the county PID is a source APN.
    expect(record.identity.siteId).toBe(FIXED_SITE_ID);
    const apn = findIdentifier(record.identity, HENNEPIN_APN_SYSTEM);
    expect(apn?.value).toBe("0402824140132");
    expect(apn?.kind).toBe("PID");
    expect(record.identity.normalizedAddress).toBe(
      "3300 ALDRICH AVE S, MINNEAPOLIS, 55408",
    );

    // Geometry — official, WGS84 rings passed through as [lng, lat].
    expect(isEvidence(record.geometry)).toBe(true);
    if (!isEvidence(record.geometry)) throw new Error("expected geometry");
    expect(record.geometry.provenance).toBe("official");
    expect(record.geometry.value[0]!.length).toBe(5);
    expect(record.geometry.value[0]![0]![0]).toBeCloseTo(-93.2895, 3);

    // Lot area — assessor PARCEL_AREA read as square feet.
    if (!isEvidence(record.lotArea)) throw new Error("expected lot area");
    expect(record.lotArea.provenance).toBe("official");
    expect(record.lotArea.value.toSquareFeet()).toBeCloseTo(4346.61, 1);

    // Owner name — trimmed of ArcGIS fixed-width padding.
    if (!isEvidence(record.ownerName)) throw new Error("expected owner");
    expect(record.ownerName.value).toBe("PARCELGRID TEST OWNER");

    // The county layer carries no building footprint: an explicit,
    // non-blocking gap rather than an empty polygon.
    expect(isUnresolved(record.existingBuildingFootprint!)).toBe(true);
    if (isUnresolved(record.existingBuildingFootprint!)) {
      expect(record.existingBuildingFootprint!.blocksApproval).toBe(false);
    }

    // Source locator is the query URL, with a retrieval date.
    expect(record.geometry.source?.retrievalDate).toBe("2026-08-26");
  });

  it("returns Unresolved when no parcel matches", () => {
    const record = parseParcelResponse(
      fixture("hennepin-parcel-nomatch"),
      CTX,
      "point (-93.30, 44.95)",
    );
    expect(isUnresolved(record)).toBe(true);
    if (isUnresolved(record)) {
      expect(record.subject).toBe("parcel match");
      expect(record.blocksApproval).toBe(true);
    }
  });

  it("returns Unresolved when the service reports an error", () => {
    const errored: HennepinParcelResponse = {
      error: { code: 400, message: "Invalid geometry" },
    };
    const record = parseParcelResponse(errored, CTX, 'PID "bad"');
    expect(isUnresolved(record)).toBe(true);
    if (isUnresolved(record)) expect(record.subject).toBe("parcel lookup");
  });

  it("surfaces missing area/owner as Unresolved, not zero", () => {
    const record = parseParcelResponse(
      {
        features: [
          { attributes: { PID: "1234567890123" }, geometry: { rings: [[[0, 0]]] } },
        ],
      },
      CTX,
      'PID "1234567890123"',
    );
    if (isUnresolved(record)) throw new Error("expected a record");
    expect(isUnresolved(record.lotArea)).toBe(true);
    expect(isUnresolved(record.ownerName)).toBe(true);
    expect(isEvidence(record.geometry)).toBe(true);
  });
});

describe("HennepinParcelProvider", () => {
  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it("byPoint builds an intersects query and parses the result", async () => {
    let calledUrl = "";
    const provider = new HennepinParcelProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("hennepin-parcel-match"));
      },
      now: () => new Date("2026-08-26T00:00:00Z"),
      newSiteId: () => FIXED_SITE_ID,
    });

    const record = await provider.byPoint({ lng: -93.2898, lat: 44.942782 });
    expect(calledUrl).toContain("geometryType=esriGeometryPoint");
    expect(calledUrl).toContain("esriSpatialRelIntersects");
    expect(calledUrl).toContain("inSR=4326");
    if (isUnresolved(record)) throw new Error("expected a record");
    expect(record.identity.siteId).toBe(FIXED_SITE_ID);
    expect(findIdentifier(record.identity, HENNEPIN_APN_SYSTEM)?.value).toBe(
      "0402824140132",
    );
    // The locator recorded on the evidence is the actual query URL.
    if (isEvidence(record.geometry)) {
      expect(record.geometry.source?.locator).toBe(calledUrl);
    }
  });

  it("byIdentifier builds a PID-equality query and escapes quotes", async () => {
    let calledUrl = "";
    const provider = new HennepinParcelProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("hennepin-parcel-match"));
      },
      newSiteId: () => FIXED_SITE_ID,
    });

    await provider.byIdentifier({
      system: HENNEPIN_APN_SYSTEM,
      value: "0402824140132",
      kind: "PID",
    });
    // URLSearchParams percent-encodes the quotes; assert the decoded predicate.
    expect(decodeURIComponent(calledUrl)).toContain(
      "where=PID='0402824140132'",
    );
  });

  it("throws HennepinParcelError on a non-OK HTTP status", async () => {
    const provider = new HennepinParcelProvider({
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    await expect(
      provider.byPoint({ lng: -93, lat: 44 }),
    ).rejects.toBeInstanceOf(HennepinParcelError);
  });

  it("wraps a transport failure in HennepinParcelError", async () => {
    const provider = new HennepinParcelProvider({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await expect(
      provider.byIdentifier({ system: HENNEPIN_APN_SYSTEM, value: "x" }),
    ).rejects.toBeInstanceOf(HennepinParcelError);
  });
});
