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
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
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
      // The built form district (Interior 2) resolves live and carries a sourced
      // by-right height (Table 540-6: 35 ft), as an unverified official rule.
      if (!isEvidence(env.maxHeight)) {
        throw new Error("expected a sourced height rule");
      }
      expect(env.maxHeight.provenance).toBe("official");
      expect(env.maxHeight.verification).toBe("unverified");
      expect(env.maxHeight.value.toFeet()).toBeCloseTo(35);
      // UN2 -> un-rm resolves Interior 2 lot coverage (45%) with no use input.
      if (!isEvidence(env.maxLotCoverage)) {
        throw new Error("expected a sourced lot coverage");
      }
      expect(env.maxLotCoverage.value).toBeCloseTo(0.45);
      // FAR needs the proposed use; Unresolved without it.
      expect(isUnresolved(env.maxFar)).toBe(true);

      // Supplying a use class resolves FAR live (residential 1-3 units -> 0.5).
      const withUse = await provider.envelopeFor(identity, PARCEL, {
        useClass: "single-family",
      });
      if (!isEvidence(withUse.maxFar)) {
        throw new Error("expected a sourced FAR");
      }
      expect(withUse.maxFar.value).toBe(0.5);

      // UN2 permits 1–3 family dwellings by right (§ 545.100, Table 545-1).
      if (!isEvidence(env.allowedUses)) {
        throw new Error("expected sourced allowed uses");
      }
      expect(env.allowedUses.value).toContain("three-family dwelling");

      // Parking minimum is a sourced citywide zero (Chapter 541).
      if (!isEvidence(env.minParkingStalls)) {
        throw new Error("expected a sourced parking rule");
      }
      expect(env.minParkingStalls.value).toBe(0);

      // Overlays resolve live from the City overlay layer. This inland UN2
      // parcel sits in no Chapter 551 overlay district — and, crucially, the
      // Floodplain background polygon must NOT false-positive it — so the field
      // resolves to an empty, non-blocking list rather than a gap.
      expect(env.overlays.every(isEvidence)).toBe(true);
      expect(env.overlays).toHaveLength(0);
    },
    30_000,
  );
});
