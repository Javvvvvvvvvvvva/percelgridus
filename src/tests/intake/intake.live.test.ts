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

      // byAddress resolves the parcel against the county's own address index
      // (robust to the geocoder point offset), so this known address completes
      // end to end and persists.
      expect(dd.parcel && !isUnresolved(dd.parcel)).toBe(true);
      expect(dd.persisted).toBe(true);
      expect(dd.siteId).toBeDefined();
      expect(repo.getBySiteId(dd.siteId!)).toBeDefined();
      if (dd.parcel && !isUnresolved(dd.parcel)) {
        expect(dd.parcel.identity.apns[0]?.value).toBe("0402824140132");
      }

      // Sourced by-right envelope: UN2 primary district, Interior 2 height.
      expect(dd.zoning).toBeDefined();
      expect(isEvidence(dd.zoning!.zoningDistrict)).toBe(true);
      if (isEvidence(dd.zoning!.zoningDistrict)) {
        expect(dd.zoning!.zoningDistrict.value).toBe("UN2");
      }
      if (isEvidence(dd.zoning!.maxHeight)) {
        expect(dd.zoning!.maxHeight.value.toFeet()).toBeCloseTo(35);
      }
      // The blocker sweep produced a decision-ready list.
      expect(dd.blockers.length).toBeGreaterThan(0);
    },
    45_000,
  );
});
