/**
 * Live smoke test for the Saint Paul principal-zoning provider.
 *
 * Opt-in only (STPAUL_ZONING_LIVE=1): hits the real City of Saint Paul ArcGIS
 * Online layer, proving the second jurisdiction's zoning adapter resolves a real
 * district end to end. The default suite stays offline (see the fixture-backed
 * tests in stpaul-zoning.test.ts).
 *
 *   STPAUL_ZONING_LIVE=1 pnpm test src/tests/integrations/stpaul-zoning.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { StPaulZoningProvider } from "@/lib/integrations/us-stpaul/index.js";
import { isEvidence, isUnresolved, createParcelIdentity } from "@/lib/jurisdiction/index.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/index.js";

const LIVE = process.env.STPAUL_ZONING_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A small polygon in downtown Saint Paul (Central Business Service, B5).
const DOWNTOWN: PolygonCoordinates = [
  [
    [-93.0936, 44.9507],
    [-93.0931, 44.9507],
    [-93.0931, 44.9511],
    [-93.0936, 44.9511],
    [-93.0936, 44.9507],
  ],
];

suite("StPaulZoningProvider (live)", () => {
  it(
    "resolves a real Saint Paul principal zoning district",
    async () => {
      const provider = new StPaulZoningProvider();
      const identity = createParcelIdentity({
        apns: [],
        providerIds: [],
        normalizedAddress: "downtown Saint Paul",
      });
      const env = await provider.envelopeFor(identity, DOWNTOWN);

      if (!isEvidence(env.zoningDistrict)) {
        throw new Error("expected a live district determination");
      }
      expect(env.zoningDistrict.provenance).toBe("official");
      expect(env.zoningDistrict.value.length).toBeGreaterThan(0);
      expect(env.zoningDistrict.source?.label).toContain("Saint Paul");
      // By-right rules remain honestly Unresolved (ordinance not parsed).
      expect(isUnresolved(env.maxFar)).toBe(true);
      expect(isUnresolved(env.minSetbacks)).toBe(true);
    },
    30_000,
  );
});
