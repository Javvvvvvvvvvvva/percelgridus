import { describe, it, expect } from "vitest";
import {
  UsgsTerrainProvider,
  UsgsTerrainError,
  parseTerrain,
  readEpqsElevation,
  type TerrainSample,
} from "@/lib/integrations/us-usgs/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

const CTX = {
  retrievalDate: "2026-08-26",
  locator: "https://epqs.nationalmap.gov/v1/json",
  subject: "the parcel",
};

// ~100m square in Minneapolis.
const SQUARE: PolygonCoordinates = [
  [
    [-93.2905, 44.9427],
    [-93.2895, 44.9427],
    [-93.2895, 44.9437],
    [-93.2905, 44.9437],
    [-93.2905, 44.9427],
  ],
];

describe("readEpqsElevation", () => {
  it("reads a numeric elevation", () => {
    expect(readEpqsElevation({ value: 265.3 })).toBeCloseTo(265.3);
  });
  it("reads a stringified elevation", () => {
    expect(readEpqsElevation({ value: "265.3" })).toBeCloseTo(265.3);
  });
  it("rejects the no-data sentinel", () => {
    expect(readEpqsElevation({ value: -1000000 })).toBeUndefined();
    expect(readEpqsElevation({ value: "unknown" })).toBeUndefined();
    expect(readEpqsElevation({})).toBeUndefined();
  });
});

describe("parseTerrain", () => {
  it("folds samples into min/max elevation and a coarse slope", () => {
    const samples: TerrainSample[] = [
      { lng: -93.2905, lat: 44.9427, elevationMeters: 250 },
      { lng: -93.2895, lat: 44.9437, elevationMeters: 260 },
      { lng: -93.29, lat: 44.9432, elevationMeters: 255 },
    ];
    const result = parseTerrain(samples, CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.provenance).toBe("official");
    expect(result.value.minElevation.toMeters()).toBe(250);
    expect(result.value.maxElevation.toMeters()).toBe(260);
    // 10 m of relief over a ~130 m diagonal → a few percent, and positive.
    expect(result.value.meanSlopePct).toBeGreaterThan(0);
    expect(result.value.meanSlopePct).toBeLessThan(20);
    expect(result.note).toContain("3DEP");
  });

  it("reports zero slope when samples are effectively co-located", () => {
    const samples: TerrainSample[] = [
      { lng: -93.29, lat: 44.9432, elevationMeters: 250 },
      { lng: -93.29, lat: 44.9432, elevationMeters: 251 },
    ];
    const result = parseTerrain(samples, CTX);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.meanSlopePct).toBe(0);
  });

  it("returns Unresolved when fewer than two samples are valid", () => {
    const result = parseTerrain(
      [{ lng: -93.29, lat: 44.94, elevationMeters: 250 }],
      CTX,
    );
    expect(isUnresolved(result)).toBe(true);
    if (isUnresolved(result)) expect(result.subject).toBe("terrain");
  });
});

describe("UsgsTerrainProvider", () => {
  it("samplePoints returns ring vertices plus interior grid points", () => {
    const provider = new UsgsTerrainProvider({ gridSize: 3 });
    const pts = provider.samplePoints(SQUARE);
    // 4 distinct corners (closing vertex deduped) + interior grid points.
    expect(pts.length).toBeGreaterThan(4);
    // Every point lies within the square's bounds.
    for (const p of pts) {
      expect(p.lng).toBeGreaterThanOrEqual(-93.2905);
      expect(p.lng).toBeLessThanOrEqual(-93.2895);
    }
  });

  it("terrain samples EPQS per point and summarizes", async () => {
    // Elevation rises with longitude so min/max differ deterministically.
    const provider = new UsgsTerrainProvider({
      gridSize: 3,
      fetchImpl: async (url) => {
        const x = Number(new URL(url).searchParams.get("x"));
        const elev = 250 + (x + 93.2905) * 10000; // ~0..10 m across the square
        return { ok: true, status: 200, json: async () => ({ value: elev }) };
      },
      now: () => new Date("2026-08-26T00:00:00Z"),
    });

    const result = await provider.terrain(SQUARE);
    if (!isEvidence(result)) throw new Error("expected evidence");
    expect(result.value.maxElevation.toMeters()).toBeGreaterThan(
      result.value.minElevation.toMeters(),
    );
    expect(result.source?.label).toContain("3DEP");
  });

  it("drops no-data points and returns Unresolved if too few remain", async () => {
    const provider = new UsgsTerrainProvider({
      gridSize: 2,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ value: -1000000 }),
      }),
    });
    const result = await provider.terrain(SQUARE);
    expect(isUnresolved(result)).toBe(true);
  });

  it("wraps a transport failure in UsgsTerrainError", async () => {
    const provider = new UsgsTerrainProvider({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    await expect(provider.terrain(SQUARE)).rejects.toBeInstanceOf(
      UsgsTerrainError,
    );
  });
});
