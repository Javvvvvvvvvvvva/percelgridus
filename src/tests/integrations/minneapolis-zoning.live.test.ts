/**
 * Live end-to-end smoke test for the Minneapolis primary-zoning provider.
 *
 * Opt-in only: this hits the real City of Minneapolis ArcGIS service, so it
 * runs only when MPLS_ZONING_LIVE=1 and the environment's egress policy
 * allowlists that host. The default suite stays offline and hermetic (see
 * minneapolis-zoning.test.ts for the fixture-backed tests); this proves the
 * wire path — polygon-query build, transport, JSON decode, and parse — against
 * the live API for a known parcel that sits in the UN2 district.
 *
 *   MPLS_ZONING_LIVE=1 pnpm test src/tests/integrations/minneapolis-zoning.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { MinneapolisZoningProvider } from "@/lib/integrations/us-minneapolis/index.js";
import { isEvidence } from "@/lib/jurisdiction/evidence.js";
import { createParcelIdentity } from "@/lib/jurisdiction/identifiers.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/providers.js";

const LIVE = process.env.MPLS_ZONING_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A small polygon around a known Minneapolis parcel in the UN2 district.
const PARCEL: PolygonCoordinates = [
  [
    [-93.28985, 44.942677],
    [-93.289561, 44.942677],
    [-93.289561, 44.942889],
    [-93.28985, 44.942889],
    [-93.28985, 44.942677],
  ],
];

suite("MinneapolisZoningProvider (live)", () => {
  it(
    "resolves a known parcel to an official zoning district",
    async () => {
      const provider = new MinneapolisZoningProvider();
      const identity = createParcelIdentity({
        apns: [],
        providerIds: [],
        normalizedAddress: "known UN2 parcel",
      });

      const env = await provider.envelopeFor(identity, PARCEL);

      if (!isEvidence(env.zoningDistrict)) {
        throw new Error("expected a live district determination");
      }
      expect(env.zoningDistrict.provenance).toBe("official");
      expect(env.zoningDistrict.value).toBe("UN2");
      // By-right rules are not sourced yet — they must stay Unresolved.
      expect("kind" in env.maxFar && env.maxFar.kind === "unresolved").toBe(
        true,
      );
    },
    20_000,
  );
});
