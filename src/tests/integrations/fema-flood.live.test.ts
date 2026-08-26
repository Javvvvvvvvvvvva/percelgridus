/**
 * Live end-to-end smoke test for the FEMA NFHL flood provider.
 *
 * Opt-in only: this hits the real hazards.fema.gov service, so it runs only
 * when FEMA_LIVE=1 and the environment's egress policy allowlists that host.
 * The default suite stays offline and hermetic (see fema-flood.test.ts for the
 * fixture-backed tests); this proves the wire path — polygon-query build,
 * transport, JSON decode, and parse — against the live API.
 *
 *   FEMA_LIVE=1 pnpm test src/tests/integrations/fema-flood.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { FemaFloodProvider } from "@/lib/integrations/us-fema/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

const LIVE = process.env.FEMA_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A small polygon around a known Minneapolis parcel (Zone X on the FIRM).
const PARCEL: PolygonCoordinates = [
  [
    [-93.28956, 44.942744],
    [-93.290057, 44.942744],
    [-93.290056, 44.942837],
    [-93.289559, 44.942836],
    [-93.28956, 44.942744],
  ],
];

suite("FemaFloodProvider (live)", () => {
  it(
    "resolves a known parcel to an official flood-zone determination",
    async () => {
      const provider = new FemaFloodProvider();
      const result = await provider.flood(PARCEL);

      expect(isUnresolved(result)).toBe(false);
      if (!isEvidence(result)) throw new Error("expected a live determination");
      expect(result.provenance).toBe("official");
      expect(typeof result.value.femaZone).toBe("string");
      expect(result.value.femaZone.length).toBeGreaterThan(0);
      expect(typeof result.value.inSfha).toBe("boolean");
    },
    20_000,
  );
});
