/**
 * Live smoke test for the Regrid parcel provider.
 *
 * Opt-in only, and requires a real token: runs when REGRID_TOKEN is set (and the
 * environment's egress allowlists app.regrid.com). Proves the nationwide adapter
 * resolves a real parcel by point outside the Hennepin pilot — the switch that
 * lights up parcels in any state once a token + egress are in place.
 *
 *   REGRID_TOKEN=... pnpm test src/tests/integrations/regrid-parcels.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { RegridParcelProvider } from "@/lib/integrations/us-regrid/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/index.js";

const TOKEN = process.env.REGRID_TOKEN;
const suite = TOKEN ? describe : describe.skip;

suite("RegridParcelProvider (live)", () => {
  it(
    "resolves a real parcel by point (Denver, CO — outside the pilot county)",
    async () => {
      const provider = new RegridParcelProvider({ token: TOKEN!, timeoutMs: 30_000 });
      // 1437 Bannock St, Denver CO (the Denver City & County Building area).
      const rec = await provider.byPoint({ lng: -104.9903, lat: 39.739 });
      if (isUnresolved(rec)) throw new Error("expected a live parcel");
      expect(isEvidence(rec.geometry)).toBe(true);
      if (isEvidence(rec.lotArea)) {
        expect(rec.lotArea.value.toSquareFeet()).toBeGreaterThan(0);
      }
      // Provenance never leaks the token.
      if (isEvidence(rec.geometry)) {
        expect(rec.geometry.source?.locator).not.toContain(TOKEN!);
      }
    },
    30_000,
  );
});
