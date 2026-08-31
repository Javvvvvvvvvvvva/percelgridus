import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  HennepinParcelProvider,
  HennepinParcelError,
  parseParcelResponse,
  parseAddressMatch,
  parseUsAddress,
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

    // Assessor facts — official, machine-parsed, and NON-blocking (enrichment).
    if (!isEvidence(record.yearBuilt!)) throw new Error("expected year built");
    expect(record.yearBuilt!.value).toBe(1912);
    if (!isEvidence(record.assessedValue!)) throw new Error("expected value");
    expect(record.assessedValue!.value.format()).toBe("$512,000.00");
    if (!isEvidence(record.annualPropertyTax!)) throw new Error("expected tax");
    expect(record.annualPropertyTax!.value.format()).toBe("$6,784.52");

    // Last sale carries its sale-code caveat on the value AND as a note, so a
    // multi-parcel sale is never read as this parcel's clean price.
    if (!isEvidence(record.lastSale!)) throw new Error("expected last sale");
    expect(record.lastSale!.value.date).toBe("2021-04");
    expect(record.lastSale!.value.price.format()).toBe("$415,000.00");
    expect(record.lastSale!.value.saleCode).toContain("MORE THAN ONE PARCEL");
    expect(record.lastSale!.note).toContain("MORE THAN ONE PARCEL");
  });

  it("omits assessor facts rather than asserting zero/blank values", () => {
    const record = parseParcelResponse(
      {
        features: [
          {
            attributes: {
              PID: "1234567890123",
              PARCEL_AREA: 5000,
              BUILD_YR: "0000",
              SALE_PRICE: 0,
              TAXABLE_VAL_TOT: 0,
              TAX_TOT: 0,
            },
            geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          },
        ],
      },
      CTX,
      "point",
    );
    if (isUnresolved(record)) throw new Error("expected a parcel record");
    expect(record.yearBuilt).toBeUndefined();
    expect(record.assessedValue).toBeUndefined();
    expect(record.annualPropertyTax).toBeUndefined();
    expect(record.lastSale).toBeUndefined();
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

describe("parseUsAddress", () => {
  it("splits a Census-normalized address into house/street/municipality", () => {
    expect(
      parseUsAddress("3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408"),
    ).toEqual({
      houseNumber: 3300,
      streetName: "ALDRICH AVE S",
      municipality: "MINNEAPOLIS",
    });
  });

  it("returns undefined when there is no leading house number", () => {
    expect(parseUsAddress("ALDRICH AVE S, MINNEAPOLIS, MN")).toBeUndefined();
    expect(parseUsAddress("")).toBeUndefined();
  });
});

describe("parseAddressMatch", () => {
  it("resolves several rows sharing one PID to that parcel", () => {
    const record = parseAddressMatch(
      {
        features: [
          fixture("hennepin-parcel-match").features![0]!,
          fixture("hennepin-parcel-match").features![0]!,
        ],
      },
      CTX,
      'address "x"',
    );
    expect(isUnresolved(record)).toBe(false);
  });

  it("returns Unresolved (ambiguous) when the address hits distinct PIDs", () => {
    const a = fixture("hennepin-parcel-match").features![0]!;
    const b = {
      ...a,
      attributes: { ...a.attributes, PID: "9999999999999" },
    };
    const record = parseAddressMatch({ features: [a, b] }, CTX, 'address "x"');
    expect(isUnresolved(record)).toBe(true);
    if (isUnresolved(record)) {
      expect(record.requiredAction).toContain("more than one");
    }
  });
});

describe("HennepinParcelProvider", () => {
  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it("byAddress builds a house/street predicate and parses the match", async () => {
    let calledUrl = "";
    const provider = new HennepinParcelProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("hennepin-parcel-match"));
      },
      newSiteId: () => FIXED_SITE_ID,
    });

    const record = await provider.byAddress(
      "3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408",
    );
    // URLSearchParams encodes spaces as '+'; normalize for readability.
    const decoded = decodeURIComponent(calledUrl).replace(/\+/g, " ");
    expect(decoded).toContain("HOUSE_NO=3300");
    expect(decoded).toContain("UPPER(STREET_NM) LIKE 'ALDRICH AVE S%'");
    expect(decoded).toContain("UPPER(MUNIC_NM) LIKE 'MINNEAPOLIS%'");
    if (isUnresolved(record)) throw new Error("expected a record");
    expect(findIdentifier(record.identity, HENNEPIN_APN_SYSTEM)?.value).toBe(
      "0402824140132",
    );
  });

  it("byAddress returns Unresolved for an unparseable address, no fetch", async () => {
    let fetched = false;
    const provider = new HennepinParcelProvider({
      fetchImpl: async () => {
        fetched = true;
        return okResponse(fixture("hennepin-parcel-match"));
      },
    });
    const record = await provider.byAddress("PO Box 7, Minneapolis, MN");
    expect(fetched).toBe(false);
    expect(isUnresolved(record)).toBe(true);
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

describe("HennepinParcelProvider.nearby", () => {
  // The geocoded point for "1412 S 3rd St" (which is not itself a parcel).
  const POINT = { lng: -93.249237581048, lat: 44.972481680043 };

  const nearbyBody: HennepinParcelResponse = {
    features: [
      {
        // 1500 is farther up the block than 1414.
        attributes: {
          PID: "2702924430010",
          HOUSE_NO: 1500,
          STREET_NM: "3RD ST S            ",
          MUNIC_NM: "MINNEAPOLIS         ",
          ZIP_CD: "55454",
          LAT: 44.972_9,
          LON: -93.249_1,
        },
      },
      {
        attributes: {
          PID: "2702924430020",
          HOUSE_NO: 1414,
          STREET_NM: "3RD ST S            ",
          MUNIC_NM: "MINNEAPOLIS         ",
          ZIP_CD: "55454",
          LAT: 44.972_54,
          LON: -93.249_0,
        },
      },
    ],
  };

  it("returns nearby parcels as candidates, closest first, with a re-query address", async () => {
    let calledUrl = "";
    const provider = new HennepinParcelProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return { ok: true, status: 200, json: async () => nearbyBody };
      },
    });

    const candidates = await provider.nearby(POINT, { radiusMeters: 45, max: 6 });

    // The buffered spatial query carries the metre distance and point.
    expect(decodeURIComponent(calledUrl)).toContain("distance=45");
    expect(decodeURIComponent(calledUrl)).toContain("units=esriSRUnit_Meter");

    // 1414 is nearer than 1500, so it sorts first — no auto-selection, just order.
    expect(candidates.map((c) => c.label)).toEqual([
      "1414 3RD ST S, MINNEAPOLIS 55454",
      "1500 3RD ST S, MINNEAPOLIS 55454",
    ]);
    // The re-query address resolves the exact parcel via byAddress.
    expect(candidates[0]!.address).toBe("1414 3RD ST S, MINNEAPOLIS, MN 55454");
    expect(candidates[0]!.identifier).toEqual({
      system: HENNEPIN_APN_SYSTEM,
      value: "2702924430020",
      kind: "PID",
    });
    expect(candidates[0]!.distanceMeters).toBeLessThan(candidates[1]!.distanceMeters);
  });

  it("caps the list and drops rows with no house number or centroid", async () => {
    const provider = new HennepinParcelProvider({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            { attributes: { HOUSE_NO: 1414, STREET_NM: "3RD ST S", MUNIC_NM: "MINNEAPOLIS", LAT: 44.9725, LON: -93.249 } },
            { attributes: { STREET_NM: "NO NUMBER RD", LAT: 44.97, LON: -93.25 } }, // dropped: no house no.
          ],
        }),
      }),
    });
    const candidates = await provider.nearby(POINT, { max: 1 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.label).toContain("1414");
  });
});
