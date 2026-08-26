import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CensusAddressProvider,
  CensusGeocoderError,
  parseOnelineAddress,
  type CensusGeocodeResponse,
} from "@/lib/integrations/us-census/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";

function fixture(name: string): CensusGeocodeResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const CTX = {
  input: "3300 Aldrich Ave S, Minneapolis, MN 55408",
  retrievalDate: "2026-08-26",
  locator: "https://example/geocode?address=...",
};

describe("parseOnelineAddress", () => {
  it("maps a match to official evidence with x/y as lng/lat", () => {
    const result = parseOnelineAddress(fixture("census-onelineaddress-match"), CTX);
    expect(isEvidence(result)).toBe(true);
    if (!isEvidence(result)) throw new Error("expected evidence");

    expect(result.provenance).toBe("official");
    expect(result.confidence).toBe("high");
    expect(result.verification).toBe("machine-parsed");
    expect(result.source?.retrievalDate).toBe("2026-08-26");

    const addr = result.value;
    expect(addr.normalized).toBe("3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408");
    expect(addr.point).toEqual({ lng: -93.290245, lat: 44.938251 });
    expect(addr.censusGeoid).toBe("270531053001004");
    expect(addr.input).toBe(CTX.input);
  });

  it("returns an approval-blocking Unresolved when there is no match", () => {
    const result = parseOnelineAddress(
      fixture("census-onelineaddress-nomatch"),
      CTX,
    );
    expect(isUnresolved(result)).toBe(true);
    if (!isUnresolved(result)) throw new Error("expected unresolved");
    expect(result.subject).toBe("address match");
    expect(result.blocksApproval).toBe(true);
  });

  it("is Unresolved when a match lacks usable coordinates", () => {
    const broken: CensusGeocodeResponse = {
      result: {
        addressMatches: [{ matchedAddress: "X" }],
      },
    };
    expect(isUnresolved(parseOnelineAddress(broken, CTX))).toBe(true);
  });

  it("downgrades confidence to medium on multiple matches", () => {
    const base = fixture("census-onelineaddress-match");
    const first = base.result!.addressMatches![0]!;
    const multi: CensusGeocodeResponse = {
      result: { addressMatches: [first, first] },
    };
    const result = parseOnelineAddress(multi, CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.confidence).toBe("medium");
  });
});

describe("CensusAddressProvider", () => {
  it("builds a request URL with benchmark, vintage, and format", () => {
    const provider = new CensusAddressProvider();
    const url = provider.buildUrl("1 Main St");
    expect(url).toContain("geographies/onelineaddress");
    expect(url).toContain("benchmark=Public_AR_Current");
    expect(url).toContain("vintage=Current_Current");
    expect(url).toContain("format=json");
    expect(url).toContain("address=1+Main+St");
  });

  it("normalizes through an injected fetch and stamps the request URL as source", async () => {
    const body = fixture("census-onelineaddress-match");
    let calledUrl = "";
    const provider = new CensusAddressProvider({
      now: () => new Date("2026-08-26T12:00:00Z"),
      fetchImpl: async (url) => {
        calledUrl = url;
        return { ok: true, status: 200, json: async () => body };
      },
    });

    const result = await provider.normalize(CTX.input);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.point.lat).toBe(44.938251);
    expect(result.source?.locator).toBe(calledUrl);
    expect(result.source?.retrievalDate).toBe("2026-08-26");
  });

  it("throws CensusGeocoderError on a non-OK HTTP status", async () => {
    const provider = new CensusAddressProvider({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(provider.normalize("1 Main St")).rejects.toBeInstanceOf(
      CensusGeocoderError,
    );
  });

  it("wraps a transport failure in CensusGeocoderError", async () => {
    const provider = new CensusAddressProvider({
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
    });
    await expect(provider.normalize("1 Main St")).rejects.toBeInstanceOf(
      CensusGeocoderError,
    );
  });
});
