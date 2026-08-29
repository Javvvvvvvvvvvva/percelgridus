/**
 * Live end-to-end smoke test for the Hennepin County parcel provider.
 *
 * Opt-in only: this hits the real gis.hennepin.us ArcGIS service, so it runs
 * only when HENNEPIN_LIVE=1 and the environment's egress policy allowlists
 * that host. The default suite stays offline and hermetic (see
 * hennepin-parcels.test.ts for the fixture-backed parser/provider tests); this
 * test proves the wire path — URL build, transport, JSON decode, and parse —
 * against the live API, for both lookup shapes.
 *
 *   HENNEPIN_LIVE=1 pnpm test src/tests/integrations/hennepin-parcels.live.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  HennepinParcelProvider,
  HENNEPIN_APN_SYSTEM,
} from "@/lib/integrations/us-hennepin/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/evidence.js";
import { findIdentifier } from "@/lib/jurisdiction/identifiers.js";

const LIVE = process.env.HENNEPIN_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

// A stable Minneapolis parcel (interior point + its Hennepin PID).
const KNOWN_POINT = { lng: -93.2898, lat: 44.942782 };
const KNOWN_PID = "0402824140132";

suite("HennepinParcelProvider (live)", () => {
  it(
    "byPoint resolves an interior point to a parcel with geometry and area",
    async () => {
      const provider = new HennepinParcelProvider();
      const record = await provider.byPoint(KNOWN_POINT);

      expect(isUnresolved(record)).toBe(false);
      if (isUnresolved(record)) throw new Error("expected a live parcel");

      expect(findIdentifier(record.identity, HENNEPIN_APN_SYSTEM)?.value).toBe(
        KNOWN_PID,
      );
      expect(isEvidence(record.geometry)).toBe(true);
      if (isEvidence(record.geometry)) {
        expect(record.geometry.value[0]!.length).toBeGreaterThanOrEqual(4);
      }
      if (isEvidence(record.lotArea)) {
        expect(record.lotArea.value.toSquareFeet()).toBeGreaterThan(0);
      }
      // Assessor facts resolve live when the parcel carries them. This known
      // parcel has an assessed value and an annual tax on record; assert their
      // shape without pinning volatile dollar amounts.
      if (record.assessedValue !== undefined && isEvidence(record.assessedValue)) {
        expect(record.assessedValue.value.toNumber()).toBeGreaterThan(0);
        expect(record.assessedValue.provenance).toBe("official");
      }
      if (
        record.annualPropertyTax !== undefined &&
        isEvidence(record.annualPropertyTax)
      ) {
        expect(record.annualPropertyTax.value.toNumber()).toBeGreaterThan(0);
      }
    },
    20_000,
  );

  it(
    "byIdentifier resolves a known PID to the same parcel",
    async () => {
      const provider = new HennepinParcelProvider();
      const record = await provider.byIdentifier({
        system: HENNEPIN_APN_SYSTEM,
        value: KNOWN_PID,
        kind: "PID",
      });

      if (isUnresolved(record)) throw new Error("expected a live parcel");
      expect(findIdentifier(record.identity, HENNEPIN_APN_SYSTEM)?.value).toBe(
        KNOWN_PID,
      );
    },
    20_000,
  );

  it(
    "byAddress resolves the same parcel from its address attributes",
    async () => {
      const provider = new HennepinParcelProvider();
      const record = await provider.byAddress(
        "3300 ALDRICH AVE S, MINNEAPOLIS, MN, 55408",
      );

      if (isUnresolved(record)) throw new Error("expected a live parcel");
      expect(findIdentifier(record.identity, HENNEPIN_APN_SYSTEM)?.value).toBe(
        KNOWN_PID,
      );
      expect(isEvidence(record.geometry)).toBe(true);
    },
    20_000,
  );
});
