import { describe, it, expect } from "vitest";
import {
  createUsRegridProfile,
  US_REGRID_JURISDICTION_ID,
  UnsupportedZoningProvider,
} from "@/lib/integrations/us-national/index.js";
import { isUnresolved } from "@/lib/jurisdiction/evidence.js";
import { asUuid } from "@/lib/jurisdiction/identifiers.js";
import type { SiteId } from "@/lib/jurisdiction/identifiers.js";
import { createParcelIdentity } from "@/lib/jurisdiction/identifiers.js";

const SITE_ID = asUuid("00000000-0000-4000-8000-0000000000aa") as SiteId;

describe("UnsupportedZoningProvider", () => {
  it("returns every by-right field Unresolved with a 'not yet covered' action", async () => {
    const provider = new UnsupportedZoningProvider({ jurisdictionId: "us-test" });
    const identity = createParcelIdentity({ siteId: SITE_ID, apns: [], providerIds: [] });
    const env = await provider.envelopeFor(identity);

    expect(env.jurisdictionId).toBe("us-test");
    for (const field of [
      env.zoningDistrict,
      env.allowedUses,
      env.maxFar,
      env.maxLotCoverage,
      env.maxHeight,
      env.minSetbacks,
      env.minParkingStalls,
    ]) {
      expect(isUnresolved(field)).toBe(true);
    }
    expect(env.overlays.every(isUnresolved)).toBe(true);
    expect(env.discretionaryApprovals.length).toBeGreaterThan(0);
    if (!isUnresolved(env.maxFar)) throw new Error("expected unresolved FAR");
    expect(env.maxFar.requiredAction).toMatch(/not yet covered/i);
  });
});

describe("createUsRegridProfile", () => {
  it("composes Regrid parcels + national hazards + unsupported zoning, token-gated", () => {
    const profile = createUsRegridProfile({ regridToken: "test-token" });
    expect(profile.jurisdictionId).toBe(US_REGRID_JURISDICTION_ID);
    expect(profile.stateCode).toBe("US");
    // Nationwide fallback — no placeNames, so address routing never matches it.
    expect(profile.placeNames).toBeUndefined();
    expect(profile.parcelProvider.id).toBe("us-regrid-parcels");
    expect(profile.zoningProvider.id).toBe("us-unsupported-zoning");
    // Address + flood + terrain are the shared national providers.
    expect(profile.hazardProviders.length).toBe(2);
  });

  it("requires a Regrid token (parcels cannot resolve without one)", () => {
    expect(() => createUsRegridProfile({ regridToken: "" })).toThrow();
  });
});
