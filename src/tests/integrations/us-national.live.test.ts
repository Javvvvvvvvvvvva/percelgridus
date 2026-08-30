/**
 * Live cross-state smoke test for the US national providers.
 *
 * Opt-in only (US_NATIONAL_LIVE=1): hits the real Census, FEMA, and USGS
 * services across three states outside the Minneapolis pilot, proving the
 * federal layer is genuinely national — a new jurisdiction reuses it unchanged.
 *
 *   US_NATIONAL_LIVE=1 pnpm test src/tests/integrations/us-national.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { createUsNationalProviders } from "@/lib/integrations/us-national/index.js";
import { isEvidence } from "@/lib/jurisdiction/index.js";
import type { PolygonCoordinates } from "@/lib/jurisdiction/index.js";

const LIVE = process.env.US_NATIONAL_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

const ADDRESSES = [
  "1600 Pennsylvania Ave NW, Washington, DC 20500",
  "100 Congress Ave, Austin, TX 78701",
  "1437 Bannock St, Denver, CO 80202",
];

suite("US national providers (live, cross-state)", () => {
  it(
    "geocodes and resolves flood + terrain for addresses in three states",
    async () => {
      const { addressProvider, hazardProviders } = createUsNationalProviders({
        usgs: { timeoutMs: 60_000 },
      });
      const flood = hazardProviders.find((h) => h.hazardKind === "flood")!;
      const terrain = hazardProviders.find((h) => h.hazardKind === "terrain")!;

      for (const address of ADDRESSES) {
        const norm = await addressProvider.normalize(address);
        if (!isEvidence(norm)) throw new Error(`geocode failed: ${address}`);
        const { lng, lat } = norm.value.point;
        const d = 0.00015;
        const ring: PolygonCoordinates = [
          [
            [lng - d, lat - d],
            [lng + d, lat - d],
            [lng + d, lat + d],
            [lng - d, lat + d],
            [lng - d, lat - d],
          ],
        ];
        const fl = await flood.flood!(ring);
        const tr = await terrain.terrain!(ring);
        // A real FEMA zone string and a real elevation come back everywhere.
        if (!isEvidence(fl)) throw new Error(`no flood zone: ${address}`);
        expect(fl.value.femaZone.length).toBeGreaterThan(0);
        if (!isEvidence(tr)) throw new Error(`no terrain: ${address}`);
        expect(tr.value.maxElevation.toFeet()).toBeGreaterThan(-100);
      }
    },
    120_000,
  );
});
