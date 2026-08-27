import { describe, it, expect } from "vitest";
import { intakeSite, type IntakeDeps } from "@/lib/intake/index.js";
import { InMemorySiteRepository } from "@/lib/persistence/index.js";
import {
  createParcelIdentity,
  officialFact,
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
      ? officialFact(GEOM, SOURCE)
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
