/**
 * Live end-to-end smoke test for the USGS 3DEP terrain provider.
 *
 * Opt-in only: this hits the real epqs.nationalmap.gov service. Unlike the
 * Census/Hennepin/FEMA hosts, EPQS is NOT reachable from the current
 * census-allowlisted egress environment (proxy 403), so this test is expected
 * to be run only where that host is allowlisted (or a proxy-aware fetch is
 * injected). It is gated on USGS_LIVE=1 and skipped by default.
 *
 *   USGS_LIVE=1 pnpm test src/tests/integrations/usgs-terrain.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { UsgsTerrainProvider } from "@/lib/integrations/us-usgs/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

const LIVE = process.env.USGS_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A small polygon around a known Minneapolis parcel.
const PARCEL: PolygonCoordinates = [
  [
    [-93.28956, 44.942744],
    [-93.290057, 44.942744],
    [-93.290056, 44.942837],
    [-93.289559, 44.942836],
    [-93.28956, 44.942744],
  ],
];

suite("UsgsTerrainProvider (live)", () => {
  it(
    "resolves a known parcel to a terrain summary with real elevations",
    async () => {
      const provider = new UsgsTerrainProvider();
      const result = await provider.terrain(PARCEL);

      expect(isUnresolved(result)).toBe(false);
      if (!isEvidence(result)) throw new Error("expected a live summary");
      // Minneapolis sits around 250 m; bound generously.
      expect(result.value.minElevation.toMeters()).toBeGreaterThan(150);
      expect(result.value.maxElevation.toMeters()).toBeLessThan(400);
      expect(result.value.maxElevation.toMeters()).toBeGreaterThanOrEqual(
        result.value.minElevation.toMeters(),
      );
      expect(result.value.meanSlopePct).toBeGreaterThanOrEqual(0);
    },
    30_000,
  );
});
