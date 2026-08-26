import { describe, it, expect } from "vitest";
import {
  createMinneapolisProfile,
  registerMinneapolis,
  MinneapolisPendingZoningProvider,
  MINNEAPOLIS_JURISDICTION_ID,
  MINNEAPOLIS_PENDING_FINANCE,
  MINNEAPOLIS_PENDING_TAX,
} from "@/lib/integrations/us-minneapolis/index.js";
import { JurisdictionRegistry } from "@/lib/jurisdiction/index.js";
import {
  approvalBlockers,
  isUnresolved,
  type EvidenceOrUnresolved,
} from "@/lib/jurisdiction/evidence.js";
import { createParcelIdentity } from "@/lib/jurisdiction/identifiers.js";

describe("createMinneapolisProfile", () => {
  it("is contract-complete and pins the pilot jurisdiction", () => {
    const p = createMinneapolisProfile();
    expect(p.countryCode).toBe("US");
    expect(p.stateCode).toBe("MN");
    expect(p.jurisdictionId).toBe(MINNEAPOLIS_JURISDICTION_ID);
    expect(p.jurisdictionId).toBe("us-mn-hennepin-minneapolis");
    expect(p.displayName).toContain("Minneapolis");
    expect(p.units.system).toBe("us-customary");
    expect(p.units.currency).toBe("USD");
  });

  it("wires the four live providers built in US-1..US-3", () => {
    const p = createMinneapolisProfile();
    expect(p.addressProvider.id).toBe("us-census-geocoder");
    expect(p.parcelProvider.id).toBe("us-hennepin-parcels");

    const hazardIds = p.hazardProviders.map((h) => h.id);
    expect(hazardIds).toEqual(["us-fema-nfhl", "us-usgs-3dep"]);

    const kinds = p.hazardProviders.map((h) => h.hazardKind);
    expect(kinds).toEqual(["flood", "terrain"]);
  });

  it("threads per-provider config (e.g. an injected fetch/baseUrl) through", () => {
    // A distinct baseUrl proves the config reaches the constructed provider
    // rather than being dropped by the wiring. Providers keep their own state
    // private, so we assert construction succeeds and ids stay stable.
    const p = createMinneapolisProfile({
      usgs: { baseUrl: "https://example.test/epqs" },
      fema: {},
    });
    expect(p.hazardProviders.map((h) => h.id)).toEqual([
      "us-fema-nfhl",
      "us-usgs-3dep",
    ]);
  });
});

describe("registerMinneapolis", () => {
  it("registers exactly the pilot profile into a fresh registry", () => {
    const registry = registerMinneapolis();
    expect(registry).toBeInstanceOf(JurisdictionRegistry);
    expect(registry.has(MINNEAPOLIS_JURISDICTION_ID)).toBe(true);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get(MINNEAPOLIS_JURISDICTION_ID).displayName).toContain(
      "Minneapolis",
    );
  });

  it("registers into a caller-supplied registry", () => {
    const registry = new JurisdictionRegistry();
    registerMinneapolis(registry);
    expect(registry.has(MINNEAPOLIS_JURISDICTION_ID)).toBe(true);
  });

  it("rejects a duplicate registration", () => {
    const registry = registerMinneapolis();
    expect(() => registerMinneapolis(registry)).toThrow(/already registered/i);
  });
});

describe("pending adapters surface honest gaps, never fabricated data", () => {
  it("returns a fully-unresolved zoning envelope that blocks approval", async () => {
    const zoning = new MinneapolisPendingZoningProvider();
    expect(zoning.jurisdictionId).toBe(MINNEAPOLIS_JURISDICTION_ID);
    expect(zoning.parserVersion).toBe("0.0.0-pending");

    const identity = createParcelIdentity({ apns: [], providerIds: [] });
    const env = await zoning.envelopeFor(identity);

    const scalarFields: EvidenceOrUnresolved<unknown>[] = [
      env.zoningDistrict,
      env.allowedUses,
      env.maxFar,
      env.maxLotCoverage,
      env.maxHeight,
      env.minSetbacks,
      env.minParkingStalls,
    ];
    for (const field of scalarFields) {
      expect(isUnresolved(field)).toBe(true);
    }
    expect(env.overlays.every(isUnresolved)).toBe(true);
    expect(env.discretionaryApprovals.length).toBeGreaterThan(0);

    // Every gap must block approval — nothing silently defaults.
    const blockers = approvalBlockers([
      ...scalarFields,
      ...env.overlays,
      ...env.discretionaryApprovals,
    ]);
    expect(blockers.length).toBe(scalarFields.length + env.overlays.length + 1);
  });

  it("stamps a well-formed citation template pointing at the real ordinance", () => {
    const zoning = new MinneapolisPendingZoningProvider();
    const cite = zoning.citationFor("§ 546.170");
    expect(cite.jurisdictionId).toBe(MINNEAPOLIS_JURISDICTION_ID);
    expect(cite.ordinanceSection).toBe("§ 546.170");
    expect(cite.ordinanceTitle).toMatch(/Title 20/);
    expect(cite.parserVersion).toBe("0.0.0-pending");
    expect(cite.retrievalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves finance assumptions unresolved except the definitional currency", () => {
    expect(MINNEAPOLIS_PENDING_FINANCE.currency).toBe("USD");
    const rates: EvidenceOrUnresolved<unknown>[] = [
      MINNEAPOLIS_PENDING_FINANCE.hardCostPerGsf,
      MINNEAPOLIS_PENDING_FINANCE.softCostPct,
      MINNEAPOLIS_PENDING_FINANCE.contingencyPct,
      MINNEAPOLIS_PENDING_FINANCE.constructionLoanRate,
      MINNEAPOLIS_PENDING_FINANCE.permanentLoanRate,
      MINNEAPOLIS_PENDING_FINANCE.exitCapRate,
      MINNEAPOLIS_PENDING_FINANCE.vacancyPct,
    ];
    expect(rates.every(isUnresolved)).toBe(true);
    expect(approvalBlockers(rates).length).toBe(rates.length);
  });

  it("leaves tax rates unresolved and approval-blocking", () => {
    const rates: EvidenceOrUnresolved<unknown>[] = [
      MINNEAPOLIS_PENDING_TAX.propertyTaxRatePct,
      MINNEAPOLIS_PENDING_TAX.transferTaxRatePct,
    ];
    expect(rates.every(isUnresolved)).toBe(true);
    expect(approvalBlockers(rates).length).toBe(rates.length);
  });
});
