/**
 * Provider interfaces — the country/jurisdiction adapter boundary.
 *
 * README-US §"Proposed adapter boundary" and §"U.S. data strategy". Each
 * provider is a seam behind which a concrete integration (Census Geocoder,
 * Regrid/ATTOM, FEMA NFHL, USGS 3DEP, or a jurisdiction GIS) is plugged in.
 * The Korean integrations (VWorld, MOLIT, Kakao) implement the *same shapes*
 * for the KR profile and are never imported here.
 *
 * Every returned fact is wrapped in Evidence so provenance, source, and
 * verification status travel with the value. Missing data is returned as
 * Unresolved, never as a zero or a null that a caller silently defaults.
 */

import type { Area, Length, Money } from "../units/index.js";
import type {
  Evidence,
  EvidenceOrUnresolved,
  RuleCitation,
  Unresolved,
} from "./evidence.js";
import type { ExternalIdentifier, ParcelIdentity } from "./identifiers.js";

/** A GeoJSON-style polygon ring set in WGS84 (lng, lat). */
export type PolygonCoordinates = number[][][];

export interface GeoPoint {
  readonly lng: number;
  readonly lat: number;
}

// ─────────────────────────── Address ───────────────────────────

export interface NormalizedAddress {
  readonly input: string;
  readonly normalized: string;
  readonly point: GeoPoint;
  /** Census geography (state/county/tract/block) when available. */
  readonly censusGeoid?: string;
}

export interface AddressProvider {
  readonly id: string; // e.g. "us-census-geocoder"
  normalize(
    rawAddress: string,
  ): Promise<Evidence<NormalizedAddress> | Unresolved>;
}

// ─────────────────────────── Parcel ───────────────────────────

export interface ParcelRecord {
  readonly identity: ParcelIdentity;
  readonly geometry: EvidenceOrUnresolved<PolygonCoordinates>;
  readonly lotArea: EvidenceOrUnresolved<Area>;
  readonly ownerName: EvidenceOrUnresolved<string>;
  /** Existing structure footprint(s), if the provider reports them. */
  readonly existingBuildingFootprint?: EvidenceOrUnresolved<PolygonCoordinates>;
}

export interface ParcelProvider {
  readonly id: string; // e.g. "regrid", "attom"
  /** Look up a parcel by a resolved address point. */
  byPoint(point: GeoPoint): Promise<ParcelRecord | Unresolved>;
  /** Look up a parcel by an external identifier (e.g. an APN). */
  byIdentifier(id: ExternalIdentifier): Promise<ParcelRecord | Unresolved>;
}

// ─────────────────────────── Zoning evidence ───────────────────────────

/**
 * A by-right envelope, expressed as evidence-bearing rules. Deliberately
 * says "by-right reference", never "legal maximum" (README-US §2), and
 * unknown constraints surface as Unresolved so they block approval.
 */
export interface ByRightEnvelope {
  readonly jurisdictionId: string;
  readonly zoningDistrict: EvidenceOrUnresolved<string>;
  readonly allowedUses: EvidenceOrUnresolved<readonly string[]>;
  readonly maxFar: EvidenceOrUnresolved<number>;
  readonly maxLotCoverage: EvidenceOrUnresolved<number>; // 0..1
  readonly maxHeight: EvidenceOrUnresolved<Length>;
  readonly minSetbacks: EvidenceOrUnresolved<{
    front: Length;
    side: Length;
    rear: Length;
  }>;
  readonly minParkingStalls: EvidenceOrUnresolved<number>;
  readonly overlays: readonly EvidenceOrUnresolved<string>[];
  /** Discretionary approvals / special reviews that gate by-right status. */
  readonly discretionaryApprovals: readonly Unresolved[];
}

export interface ZoningEvidenceProvider {
  readonly id: string; // e.g. "minneapolis-zoning-adapter@2026.08"
  readonly jurisdictionId: string;
  /** The adapter's own rule-parser version, echoed into RuleCitation. */
  readonly parserVersion: string;
  /**
   * Resolve the by-right envelope for a parcel. Zoning is a spatial fact, so
   * the parcel geometry (as produced by {@link ParcelProvider} in
   * `ParcelRecord.geometry`) is passed the same way {@link HazardProvider}
   * takes it. It is optional: without geometry an adapter that needs a spatial
   * lookup returns the district as `Unresolved` rather than guessing.
   */
  envelopeFor(
    identity: ParcelIdentity,
    geometry?: PolygonCoordinates,
  ): Promise<ByRightEnvelope>;
  /** Citation template the adapter stamps onto each parsed rule. */
  citationFor(section: string): RuleCitation;
}

// ─────────────────────────── Hazards ───────────────────────────

export interface FloodHazard {
  readonly femaZone: string; // e.g. "AE", "X"
  readonly inSfha: boolean; // Special Flood Hazard Area
}

export interface TerrainSummary {
  readonly meanSlopePct: number;
  readonly minElevation: Length;
  readonly maxElevation: Length;
}

export interface HazardProvider {
  readonly id: string; // e.g. "fema-nfhl", "usgs-3dep"
  readonly hazardKind: "flood" | "terrain";
  flood?(
    geometry: PolygonCoordinates,
  ): Promise<Evidence<FloodHazard> | Unresolved>;
  terrain?(
    geometry: PolygonCoordinates,
  ): Promise<Evidence<TerrainSummary> | Unresolved>;
}

// ─────────────────────────── Finance & tax ───────────────────────────

/**
 * Default financial assumptions for a jurisdiction, each carried as
 * evidence so a pro forma can show whether a number is a dated market
 * source or an explicit user assumption (README-US Phase US-3).
 */
export interface FinanceAssumptionProfile {
  readonly currency: "USD";
  readonly hardCostPerGsf: EvidenceOrUnresolved<Money>;
  readonly softCostPct: EvidenceOrUnresolved<number>;
  readonly contingencyPct: EvidenceOrUnresolved<number>;
  readonly constructionLoanRate: EvidenceOrUnresolved<number>;
  readonly permanentLoanRate: EvidenceOrUnresolved<number>;
  readonly exitCapRate: EvidenceOrUnresolved<number>;
  readonly vacancyPct: EvidenceOrUnresolved<number>;
}

/** U.S. tax estimate inputs — property tax and transfer assumptions. */
export interface TaxEstimateProfile {
  readonly propertyTaxRatePct: EvidenceOrUnresolved<number>;
  readonly transferTaxRatePct: EvidenceOrUnresolved<number>;
}
