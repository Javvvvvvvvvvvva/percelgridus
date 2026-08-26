/**
 * Live end-to-end smoke test for the U.S. Census Geocoder.
 *
 * Opt-in only: this hits the real geocoding.geo.census.gov host, so it runs
 * only when CENSUS_LIVE=1 and the environment's egress policy allowlists that
 * host. The default suite stays offline and hermetic (see census-geocoder.test.ts
 * for the fixture-backed parser tests); this test just proves the wire path —
 * URL build, transport, JSON decode, and parse — works against the live API.
 *
 *   CENSUS_LIVE=1 pnpm test src/tests/integrations/census-geocoder.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { CensusAddressProvider } from "@/lib/integrations/us-census/index.js";
import { isEvidence } from "@/lib/jurisdiction/evidence.js";

const LIVE = process.env.CENSUS_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A stable, well-known Census address (Census Bureau HQ) that the geocoder
// resolves to a single match.
const KNOWN_ADDRESS = "4600 Silver Hill Rd, Washington, DC 20233";

suite("CensusAddressProvider (live)", () => {
  it(
    "resolves a known address to official evidence with a point",
    async () => {
      const provider = new CensusAddressProvider();
      const result = await provider.normalize(KNOWN_ADDRESS);

      expect(isEvidence(result)).toBe(true);
      if (!isEvidence(result)) throw new Error("expected a live match");

      expect(result.provenance).toBe("official");
      expect(result.value.input).toBe(KNOWN_ADDRESS);
      expect(result.value.normalized.length).toBeGreaterThan(0);
      expect(Number.isFinite(result.value.point.lat)).toBe(true);
      expect(Number.isFinite(result.value.point.lng)).toBe(true);
      // Washington, DC area — sanity-bound the coordinates.
      expect(result.value.point.lat).toBeGreaterThan(38);
      expect(result.value.point.lat).toBeLessThan(39.5);
      expect(result.value.point.lng).toBeGreaterThan(-77.5);
      expect(result.value.point.lng).toBeLessThan(-76);
    },
    20_000,
  );
});
