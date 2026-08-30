import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RegridParcelProvider,
  RegridParcelError,
  parseRegridResponse,
  REGRID_SYSTEM,
  type RegridParcelsResponse,
} from "@/lib/integrations/us-regrid/index.js";
import { createStPaulProfile } from "@/lib/integrations/us-stpaul/index.js";
import { isEvidence, isUnresolved, findIdentifier } from "@/lib/jurisdiction/index.js";

function fixture(name: string): RegridParcelsResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const CTX = {
  retrievalDate: "2026-08-30",
  locator: "https://app.regrid.com/api/v2/parcels/point?lat=44.9&lon=-93.2&token=REDACTED",
};

describe("parseRegridResponse", () => {
  it("maps a matched parcel with geometry, area, owner, and assessor facts", () => {
    const rec = parseRegridResponse(fixture("regrid-parcel-match"), CTX, "point");
    if (isUnresolved(rec)) throw new Error("expected a parcel record");

    expect(findIdentifier(rec.identity, REGRID_SYSTEM)?.value).toBe("3302924110099");
    expect(rec.identity.providerIds[0]?.value).toBe("abc-123-uuid");
    expect(rec.identity.normalizedAddress).toContain("2320 COLFAX");

    if (!isEvidence(rec.geometry)) throw new Error("expected geometry");
    expect(rec.geometry.provenance).toBe("official");
    expect(rec.geometry.value[0]!.length).toBe(5);

    if (!isEvidence(rec.lotArea)) throw new Error("expected lot area");
    expect(rec.lotArea.value.toSquareFeet()).toBeCloseTo(8825, 0);
    if (!isEvidence(rec.ownerName)) throw new Error("expected owner");
    expect(rec.ownerName.value).toBe("REGRID TEST OWNER");

    if (!isEvidence(rec.yearBuilt!)) throw new Error("expected year built");
    expect(rec.yearBuilt!.value).toBe(2015);
    if (!isEvidence(rec.assessedValue!)) throw new Error("expected value");
    expect(rec.assessedValue!.value.format()).toBe("$3,658,000.00");
    if (!isEvidence(rec.annualPropertyTax!)) throw new Error("expected tax");
    expect(rec.annualPropertyTax!.value.format()).toBe("$69,198.00");
    if (!isEvidence(rec.lastSale!)) throw new Error("expected sale");
    expect(rec.lastSale!.value.date).toBe("2015-02-01");
    expect(rec.lastSale!.value.price.format()).toBe("$950,000.00");

    // Source locator is token-stripped (never carries the API token).
    expect(rec.geometry.source?.locator).toContain("token=REDACTED");
  });

  it("derives area from acres, takes the first polygon of a MultiPolygon, and omits blank facts", () => {
    const rec = parseRegridResponse(fixture("regrid-parcel-acresonly"), CTX, "point");
    if (isUnresolved(rec)) throw new Error("expected a parcel record");
    if (!isEvidence(rec.geometry)) throw new Error("expected geometry");
    expect(rec.geometry.value[0]!.length).toBe(5); // unwrapped from MultiPolygon
    if (!isEvidence(rec.lotArea)) throw new Error("expected area");
    expect(rec.lotArea.value.toSquareFeet()).toBeCloseTo(0.25 * 43560, 0);
    // "0000" year, $0 value/sale are omitted, never asserted.
    expect(rec.yearBuilt).toBeUndefined();
    expect(rec.assessedValue).toBeUndefined();
    expect(rec.lastSale).toBeUndefined();
    // Owner is trimmed of trailing padding.
    if (!isEvidence(rec.ownerName)) throw new Error("expected owner");
    expect(rec.ownerName.value).toBe("ACRE OWNER");
  });

  it("returns Unresolved on no match and on a service error", () => {
    expect(isUnresolved(parseRegridResponse(fixture("regrid-parcel-nomatch"), CTX, "x"))).toBe(true);
    const err = parseRegridResponse(fixture("regrid-parcel-error"), CTX, "x");
    expect(isUnresolved(err)).toBe(true);
    if (isUnresolved(err)) expect(err.requiredAction).toContain("Invalid token");
  });
});

describe("RegridParcelProvider", () => {
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

  it("requires an API token", () => {
    expect(() => new RegridParcelProvider({ token: "" })).toThrow(RegridParcelError);
  });

  it("byPoint sends the token in the query but strips it from the recorded locator", async () => {
    let calledUrl = "";
    const provider = new RegridParcelProvider({
      token: "secret-token-123",
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("regrid-parcel-match"));
      },
      now: () => new Date("2026-08-30T00:00:00Z"),
    });
    const rec = await provider.byPoint({ lng: -93.29, lat: 44.9428 });
    if (isUnresolved(rec)) throw new Error("expected a parcel");
    // The real request carries the token...
    expect(calledUrl).toContain("token=secret-token-123");
    expect(calledUrl).toContain("/parcels/point");
    // ...but the provenance locator never does.
    if (!isEvidence(rec.geometry)) throw new Error("expected geometry");
    expect(rec.geometry.source?.locator).not.toContain("secret-token-123");
    expect(rec.geometry.source?.locator).toContain("token=REDACTED");
  });

  it("byAddress queries the address endpoint", async () => {
    let calledUrl = "";
    const provider = new RegridParcelProvider({
      token: "t",
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("regrid-parcel-match"));
      },
    });
    await provider.byAddress("2320 Colfax Ave S, Minneapolis, MN");
    expect(calledUrl).toContain("/parcels/address");
    expect(decodeURIComponent(calledUrl).replace(/\+/g, " ")).toContain("2320 Colfax");
  });

  it("byIdentifier resolves a Regrid path but not a bare APN", async () => {
    const provider = new RegridParcelProvider({
      token: "t",
      fetchImpl: async () => okResponse(fixture("regrid-parcel-match")),
    });
    const byPath = await provider.byIdentifier({ system: REGRID_SYSTEM, value: "us/mn/hennepin/x", kind: "path" });
    expect(isUnresolved(byPath)).toBe(false);
    const byApn = await provider.byIdentifier({ system: "county-assessor", value: "12345", kind: "APN" });
    expect(isUnresolved(byApn)).toBe(true);
  });

  it("throws RegridParcelError on a non-OK HTTP status", async () => {
    const provider = new RegridParcelProvider({
      token: "t",
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    });
    await expect(provider.byPoint({ lng: 0, lat: 0 })).rejects.toBeInstanceOf(RegridParcelError);
  });
});

describe("Saint Paul profile wiring", () => {
  it("uses the pending placeholder without a token, Regrid with one", () => {
    expect(createStPaulProfile().parcelProvider.id).toBe("us-ramsey-parcels-pending");
    expect(createStPaulProfile({ regridToken: "tok" }).parcelProvider.id).toBe("us-regrid-parcels");
  });
});
