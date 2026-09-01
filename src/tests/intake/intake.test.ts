import { describe, it, expect } from "vitest";
import { intakeSite, intakeSiteRouted, type IntakeDeps } from "@/lib/intake/index.js";
import { InMemorySiteRepository } from "@/lib/persistence/index.js";
import { JurisdictionRegistry } from "@/lib/jurisdiction/index.js";
import {
  createParcelIdentity,
  officialFact,
  polygonGeometry,
  unresolved,
} from "@/lib/jurisdiction/index.js";
import {
  MINNEAPOLIS_PENDING_FINANCE,
  MINNEAPOLIS_PENDING_TAX,
} from "@/lib/integrations/us-minneapolis/index.js";
import { Area, US_UNIT_PROFILE } from "@/lib/units/index.js";
import type {
  AddressProvider,
  ByRightEnvelope,
  HazardProvider,
  JurisdictionProfile,
  ParcelProvider,
  ParcelRecord,
  PolygonCoordinates,
  ZoningEvidenceProvider,
} from "@/lib/jurisdiction/index.js";
import { isEvidence, isUnresolved } from "@/lib/jurisdiction/index.js";

const SOURCE = { label: "test", locator: "test://x", retrievalDate: "2026-08-26" };
const GEOM: PolygonCoordinates = [
  [
    [-93.2905, 44.9427],
    [-93.29, 44.9427],
    [-93.29, 44.9428],
    [-93.2905, 44.9428],
    [-93.2905, 44.9427],
  ],
];

function resolvedParcel(withGeometry: boolean): ParcelRecord {
  const identity = createParcelIdentity({
    apns: [{ system: "hennepin-county-assessor", value: "PID-1", kind: "PID" }],
    providerIds: [],
    normalizedAddress: "300 S 4th St, Minneapolis, MN",
  });
  return {
    identity,
    geometry: withGeometry
      ? officialFact(polygonGeometry(GEOM), SOURCE)
      : unresolved("parcel geometry", "surveyor", "survey the lot"),
    lotArea: officialFact(Area.squareFeet("5000"), SOURCE),
    ownerName: officialFact("Jane Doe", SOURCE),
  };
}

function envelope(): ByRightEnvelope {
  return {
    jurisdictionId: "us-mn-hennepin-minneapolis",
    zoningDistrict: officialFact("UN2", SOURCE, { verification: "verified" }),
    allowedUses: unresolved("allowed uses", "planner", "check Table 545-1"),
    maxFar: unresolved("FAR", "planner", "supply use"),
    maxLotCoverage: unresolved("coverage", "planner", "x"),
    maxHeight: unresolved("height", "planner", "x"),
    minSetbacks: unresolved("setbacks", "planner", "x"),
    minParkingStalls: unresolved("parking", "planner", "x"),
    overlays: [],
    discretionaryApprovals: [],
  };
}

function profileWith(over: {
  address: AddressProvider["normalize"];
  parcel: ParcelProvider["byPoint"];
}): JurisdictionProfile {
  const addressProvider: AddressProvider = {
    id: "stub-address",
    normalize: over.address,
  };
  const parcelProvider: ParcelProvider = {
    id: "stub-parcel",
    byPoint: over.parcel,
    byIdentifier: async () => unresolved("parcel", "user", "x"),
  };
  const zoningProvider: ZoningEvidenceProvider = {
    id: "stub-zoning",
    jurisdictionId: "us-mn-hennepin-minneapolis",
    parserVersion: "test",
    envelopeFor: async () => envelope(),
    citationFor: () => ({
      label: "x",
      locator: "x",
      retrievalDate: "2026-08-26",
      jurisdictionId: "us-mn-hennepin-minneapolis",
      ordinanceTitle: "t",
      ordinanceSection: "s",
    }),
  };
  const flood: HazardProvider = {
    id: "stub-flood",
    hazardKind: "flood",
    flood: async () => officialFact({ femaZone: "X", inSfha: false }, SOURCE),
  };
  const terrain: HazardProvider = {
    id: "stub-terrain",
    hazardKind: "terrain",
    terrain: async () =>
      unresolved("terrain", "user", "USGS returned too few samples"),
  };
  return {
    countryCode: "US",
    stateCode: "MN",
    jurisdictionId: "us-mn-hennepin-minneapolis",
    displayName: "Minneapolis, Hennepin County, MN",
    units: US_UNIT_PROFILE,
    addressProvider,
    parcelProvider,
    zoningProvider,
    hazardProviders: [flood, terrain],
    financeProfile: MINNEAPOLIS_PENDING_FINANCE,
    taxProfile: MINNEAPOLIS_PENDING_TAX,
  };
}

function addressEvidence() {
  return officialFact(
    {
      input: "300 S 4th St",
      normalized: "300 S 4TH ST, MINNEAPOLIS, MN, 55415",
      point: { lng: -93.29, lat: 44.9427 },
    },
    SOURCE,
  );
}

describe("intakeSite", () => {
  it("runs address -> parcel -> hazards/zoning -> persist, then lists blockers", async () => {
    const repo = new InMemorySiteRepository();
    const deps: IntakeDeps = {
      profile: profileWith({
        address: async () => addressEvidence(),
        parcel: async () => resolvedParcel(true),
      }),
      repository: repo,
    };

    const dd = await intakeSite("300 S 4th St", deps);

    expect(isEvidence(dd.address)).toBe(true);
    expect(dd.parcel && !isUnresolved(dd.parcel)).toBe(true);
    expect(dd.siteId).toBeDefined();
    expect(dd.persisted).toBe(true);
    // Flood resolved (X), terrain Unresolved -> a blocker.
    expect(dd.flood && isEvidence(dd.flood)).toBe(true);
    expect(dd.terrain && isUnresolved(dd.terrain)).toBe(true);
    // Persisted under its UUID and findable by APN.
    expect(repo.getBySiteId(dd.siteId!)).toBeDefined();
    expect(
      repo.findByExternalIdentifier("hennepin-county-assessor", "PID-1")
        ?.identity.siteId,
    ).toBe(dd.siteId);
    // Blockers include the unresolved terrain and zoning gaps, not the verified
    // district or the resolved flood.
    const subjects = dd.blockers.map((b) => b.subject);
    expect(subjects).toContain("terrain");
    expect(subjects).toContain("allowed uses");
    expect(subjects).not.toContain("flood zone");
  });

  it("stops at an unresolvable address without persisting", async () => {
    const repo = new InMemorySiteRepository();
    const dd = await intakeSite("nowhere", {
      profile: profileWith({
        address: async () => unresolved("address", "user", "not matched"),
        parcel: async () => resolvedParcel(true),
      }),
      repository: repo,
    });
    expect(isUnresolved(dd.address)).toBe(true);
    expect(dd.parcel).toBeUndefined();
    expect(dd.persisted).toBe(false);
    expect(repo.list()).toHaveLength(0);
    expect(dd.blockers.map((b) => b.subject)).toContain("address");
  });

  it("stops at an unresolvable parcel without persisting", async () => {
    const repo = new InMemorySiteRepository();
    const dd = await intakeSite("300 S 4th St", {
      profile: profileWith({
        address: async () => addressEvidence(),
        parcel: async () => unresolved("parcel", "user", "no match"),
      }),
      repository: repo,
    });
    expect(dd.parcel && isUnresolved(dd.parcel)).toBe(true);
    expect(dd.persisted).toBe(false);
    expect(repo.list()).toHaveLength(0);
  });

  it("degrades a thrown hazard/zoning source failure to Unresolved, never throws", async () => {
    const repo = new InMemorySiteRepository();
    const base = profileWith({
      address: async () => addressEvidence(),
      parcel: async () => resolvedParcel(true),
    });
    const profile: JurisdictionProfile = {
      ...base,
      zoningProvider: {
        ...base.zoningProvider,
        envelopeFor: async () => {
          throw new Error("Minneapolis zoning returned HTTP 503");
        },
      },
      hazardProviders: [
        {
          id: "boom-flood",
          hazardKind: "flood",
          flood: async () => {
            throw new Error("FEMA NFHL request failed");
          },
        },
        {
          id: "boom-terrain",
          hazardKind: "terrain",
          terrain: async () => {
            throw new Error("USGS EPQS request failed");
          },
        },
      ],
    };

    // The whole point: a thrown source failure must not reject the pipeline.
    const dd = await intakeSite("300 S 4th St", { profile, repository: repo });

    expect(dd.persisted).toBe(true);
    expect(dd.flood && isUnresolved(dd.flood)).toBe(true);
    expect(dd.terrain && isUnresolved(dd.terrain)).toBe(true);
    expect(isUnresolved(dd.zoning!.zoningDistrict)).toBe(true);
    // Each transient failure is surfaced as an approval-blocking gap, and the
    // message marks it a source failure to retry (not a resolved "no data").
    if (dd.flood && isUnresolved(dd.flood)) {
      expect(dd.flood.requiredAction).toMatch(/could not be reached/);
      expect(dd.flood.requiredAction).toMatch(/FEMA NFHL request failed/);
    }
    const subjects = dd.blockers.map((b) => b.subject);
    expect(subjects).toContain("flood hazard");
    expect(subjects).toContain("terrain");
    expect(subjects).toContain("zoning district");
  });

  it("degrades a thrown address source failure to Unresolved without persisting", async () => {
    const repo = new InMemorySiteRepository();
    const dd = await intakeSite("300 S 4th St", {
      profile: profileWith({
        address: async () => {
          throw new Error("census geocoder 500");
        },
        parcel: async () => resolvedParcel(true),
      }),
      repository: repo,
    });
    expect(isUnresolved(dd.address)).toBe(true);
    if (isUnresolved(dd.address)) {
      expect(dd.address.requiredAction).toMatch(/could not be reached/);
    }
    expect(dd.persisted).toBe(false);
    expect(repo.list()).toHaveLength(0);
  });

  it("intakeSiteRouted routes an address to its jurisdiction and runs intake", async () => {
    const repo = new InMemorySiteRepository();
    const base = profileWith({
      address: async () => addressEvidence(),
      parcel: async () => resolvedParcel(true),
    });
    const profile = { ...base, placeNames: ["minneapolis"] };
    const registry = new JurisdictionRegistry();
    registry.register(profile);

    const dd = await intakeSiteRouted("300 S 4th St", {
      registry,
      repository: repo,
      addressProvider: profile.addressProvider,
    });
    // addressEvidence normalizes to "..., MINNEAPOLIS, MN, 55415" -> Minneapolis.
    expect(dd.jurisdictionId).toBe("us-mn-hennepin-minneapolis");
    expect(dd.jurisdictionName).toContain("Minneapolis");
    expect(dd.persisted).toBe(true);
    // The address was geocoded once and handed through (no second lookup).
    expect(dd.parcel && !isUnresolved(dd.parcel)).toBe(true);
  });

  it("intakeSiteRouted stops with a jurisdiction gap when no adapter serves the address", async () => {
    const base = profileWith({
      address: async () => addressEvidence(),
      parcel: async () => resolvedParcel(true),
    });
    const registry = new JurisdictionRegistry(); // empty — nothing covers it
    const dd = await intakeSiteRouted("300 S 4th St", {
      registry,
      repository: new InMemorySiteRepository(),
      addressProvider: base.addressProvider,
    });
    expect(dd.jurisdictionId).toBeUndefined();
    expect(dd.persisted).toBe(false);
    expect(dd.blockers.map((b) => b.subject)).toContain("jurisdiction");
  });

  it("treats a geometry-less parcel's hazards as gaps but still persists", async () => {
    const repo = new InMemorySiteRepository();
    const dd = await intakeSite("300 S 4th St", {
      profile: profileWith({
        address: async () => addressEvidence(),
        parcel: async () => resolvedParcel(false),
      }),
      repository: repo,
    });
    expect(dd.persisted).toBe(true);
    expect(dd.flood && isUnresolved(dd.flood)).toBe(true);
    expect(dd.terrain && isUnresolved(dd.terrain)).toBe(true);
    expect(dd.blockers.map((b) => b.subject)).toContain("flood hazard");
  });
});
