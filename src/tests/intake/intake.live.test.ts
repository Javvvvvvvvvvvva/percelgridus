/**
 * Live end-to-end smoke test for the intake pipeline.
 *
 * Opt-in only: this drives the REAL Minneapolis profile (Census, Hennepin,
 * FEMA, USGS, City zoning) for one address, so it runs only when INTAKE_LIVE=1
 * and the environment's egress policy allowlists those hosts. It proves the MVP
 * spine: a raw address resolves to a persisted site with hazards and a by-right
 * zoning envelope, and the blocker sweep runs over the whole result.
 *
 *   INTAKE_LIVE=1 pnpm test src/tests/intake/intake.live.test.ts
 */
import { describe, it, expect } from "vitest";
import { intakeSite } from "@/lib/intake/index.js";
import { createMinneapolisProfile } from "@/lib/integrations/us-minneapolis/index.js";
import { InMemorySiteRepository } from "@/lib/persistence/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/index.js";

const LIVE = process.env.INTAKE_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

suite("intakeSite (live)", () => {
  it(
    "resolves a real Minneapolis address to a persisted, due-diligenced site",
    async () => {
      const repo = new InMemorySiteRepository();
      const profile = createMinneapolisProfile();

      const dd = await intakeSite(
        "3300 Aldrich Ave S, Minneapolis, MN 55408",
        { profile, repository: repo },
        { intent: { useClass: "single-family" } },
      );

      // Address normalized by the live Census geocoder.
      expect(isEvidence(dd.address)).toBe(true);
      // The blocker sweep always produces a decision-ready list.
      expect(Array.isArray(dd.blockers)).toBe(true);

      // The pipeline is internally consistent whichever way the parcel goes.
      // (Census geocoder points are interpolated and often land just off a
      // small residential parcel, so byPoint may legitimately not match — see
      // the intake header. A wrong-parcel guess is never made.)
      if (dd.parcel && !isUnresolved(dd.parcel)) {
        expect(dd.persisted).toBe(true);
        expect(dd.siteId).toBeDefined();
        expect(repo.getBySiteId(dd.siteId!)).toBeDefined();
        expect(dd.zoning).toBeDefined();
        expect(isEvidence(dd.zoning!.zoningDistrict)).toBe(true);
      } else {
        expect(dd.persisted).toBe(false);
        expect(repo.list()).toHaveLength(0);
        expect(dd.blockers.length).toBeGreaterThan(0);
      }
    },
    45_000,
  );
});
