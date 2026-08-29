import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FemaFloodProvider,
  FemaFloodError,
  parseFloodZones,
  type NfhlResponse,
} from "@/lib/integrations/us-fema/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

function fixture(name: string): NfhlResponse {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

const CTX = {
  retrievalDate: "2026-08-26",
  locator: "https://example/nfhl/query?geometry=...",
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

describe("parseFloodZones", () => {
  it("maps a minimal-hazard (X) zone to official evidence, not in SFHA", () => {
    const result = parseFloodZones(fixture("fema-flood-x"), CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.provenance).toBe("official");
    expect(result.confidence).toBe("high");
    expect(result.value.femaZone).toBe("X");
    expect(result.value.inSfha).toBe(false);
    expect(result.source?.label).toBe("FEMA National Flood Hazard Layer");
  });

  it("flags a Special Flood Hazard Area (AE) as inSfha", () => {
    const result = parseFloodZones(fixture("fema-flood-sfha"), CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.femaZone).toBe("AE");
    expect(result.value.inSfha).toBe(true);
  });

  it("returns Unresolved (approval-blocking) when no zone maps the parcel", () => {
    const result = parseFloodZones(fixture("fema-flood-unmapped"), CTX);
    expect(isUnresolved(result)).toBe(true);
    if (isUnresolved(result)) {
      expect(result.subject).toBe("flood zone");
      expect(result.blocksApproval).toBe(true);
    }
  });

  it("prefers the SFHA zone worst-case when a parcel spans zones", () => {
    const spanning: NfhlResponse = {
      features: [
        { attributes: { FLD_ZONE: "X", SFHA_TF: "F" } },
        { attributes: { FLD_ZONE: "AE", SFHA_TF: "T" } },
      ],
    };
    const result = parseFloodZones(spanning, CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.femaZone).toBe("AE");
    expect(result.value.inSfha).toBe(true);
    // Multi-zone parcels drop to medium confidence.
    expect(result.confidence).toBe("medium");
  });

  it("returns Unresolved on a service error", () => {
    const result = parseFloodZones(
      { error: { code: 400, message: "bad geometry" } },
      CTX,
    );
    expect(isUnresolved(result)).toBe(true);
  });
});

describe("FemaFloodProvider", () => {
  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it("sends the polygon-intersects query as a POST body, not in the URL", async () => {
    let calledUrl = "";
    let calledInit: { method?: string; body?: string } | undefined;
    const provider = new FemaFloodProvider({
      fetchImpl: async (url, init) => {
        calledUrl = url;
        calledInit = init;
        return okResponse(fixture("fema-flood-x"));
      },
      now: () => new Date("2026-08-26T00:00:00Z"),
    });

    const result = await provider.flood(SQUARE);
    // Geometry travels in the POST body; the URL stays the bare endpoint.
    expect(calledInit?.method).toBe("POST");
    expect(calledUrl).not.toContain("geometry");
    expect(calledInit?.body).toContain("geometryType=esriGeometryPolygon");
    expect(calledInit?.body).toContain("esriSpatialRelIntersects");
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.femaZone).toBe("X");
    expect(result.source?.locator).toBe(calledUrl);
  });

  it("keeps a many-vertex boundary out of the URL (avoids HTTP 414/431)", async () => {
    // A detailed polygon that, packed into a GET URL, would overflow the limit
    // that lakefront/riverfront parcels hit in production.
    const ring: number[][] = [];
    for (let i = 0; i < 600; i++) {
      ring.push([-93.29 + i * 1e-5, 44.94 + (i % 2) * 1e-5]);
    }
    ring.push([-93.29, 44.94]); // close the ring
    let calledUrl = "";
    const provider = new FemaFloodProvider({
      fetchImpl: async (url) => {
        calledUrl = url;
        return okResponse(fixture("fema-flood-x"));
      },
    });
    await provider.flood([ring]);
    // The URL is the bare endpoint; the ~15KB geometry is in the body instead.
    expect(calledUrl).toBe(
      "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
    );
    expect(calledUrl.length).toBeLessThan(120);
  });

  it("throws FemaFloodError on a non-OK HTTP status", async () => {
    const provider = new FemaFloodProvider({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    await expect(provider.flood(SQUARE)).rejects.toBeInstanceOf(FemaFloodError);
  });

  it("wraps a transport failure in FemaFloodError", async () => {
    const provider = new FemaFloodProvider({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await expect(provider.flood(SQUARE)).rejects.toBeInstanceOf(FemaFloodError);
  });
});
