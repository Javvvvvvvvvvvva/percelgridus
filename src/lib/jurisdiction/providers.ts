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

/** A recorded sale, with the price carrying its sale-code caveat. */
export interface ParcelSale {
  /** Sale date, normalized to `YYYY-MM` (or `YYYY-MM-DD` when the day is known). */
  readonly date: string;
  readonly price: Money;
  /**
   * The assessor's sale-code description, when present — e.g. "SALE INCLUDES
   * MORE THAN ONE PARCEL", which flags that the price is not attributable to
   * this parcel alone. Callers must not read the price as a clean per-parcel
   * value without checking this.
   */
  readonly saleCode?: string;
}

export interface ParcelRecord {
  readonly identity: ParcelIdentity;
  readonly geometry: EvidenceOrUnresolved<PolygonCoordinates>;
  readonly lotArea: EvidenceOrUnresolved<Area>;
  readonly ownerName: EvidenceOrUnresolved<string>;
  /** Existing structure footprint(s), if the provider reports them. */
  readonly existingBuildingFootprint?: EvidenceOrUnresolved<PolygonCoordinates>;
  /** Assessor year the primary structure was built, when on record. */
  readonly yearBuilt?: EvidenceOrUnresolved<number>;
  /** Assessor total taxable market value, when on record. */
  readonly assessedValue?: EvidenceOrUnresolved<Money>;
  /** Actual total annual property tax billed, when on record. */
  readonly annualPropertyTax?: EvidenceOrUnresolved<Money>;
  /** Last recorded sale, when on record (price carries its sale-code caveat). */
  readonly lastSale?: EvidenceOrUnresolved<ParcelSale>;
}

export interface ParcelProvider {
  readonly id: string; // e.g. "regrid", "attom"
  /** Look up a parcel by a resolved address point. */
  byPoint(point: GeoPoint): Promise<ParcelRecord | Unresolved>;
  /** Look up a parcel by an external identifier (e.g. an APN). */
  byIdentifier(id: ExternalIdentifier): Promise<ParcelRecord | Unresolved>;
  /**
   * Look up a parcel by a normalized address string, matched against the
   * authority's own address attributes. Preferred over {@link byPoint} where a
   * geocoded point is interpolated and may land off the lot; the adapter
   * returns `Unresolved` rather than guessing when the address is ambiguous or
   * unparseable. Optional — not every parcel source exposes an address index.
   */
  byAddress?(normalizedAddress: string): Promise<ParcelRecord | Unresolved>;
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

/**
 * The proposed development, to the extent the by-right envelope depends on it.
 * Some standards (e.g. floor area ratio) are conditional on the building's use;
 * without it those fields resolve to `Unresolved`. `useClass` is a
 * jurisdiction-interpreted string so the core stays country-agnostic.
 */
export interface DevelopmentIntent {
  readonly useClass?: string;
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
   * lookup returns the district as `Unresolved` rather than guessing. `intent`
   * carries the proposed building where a standard depends on it (e.g. FAR);
   * without it, use-conditional fields resolve to `Unresolved`.
   */
  envelopeFor(
    identity: ParcelIdentity,
    geometry?: PolygonCoordinates,
    intent?: DevelopmentIntent,
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
