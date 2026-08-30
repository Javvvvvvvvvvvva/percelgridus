/**
 * Raw Regrid Parcels API (v2) response shapes — the subset PARCELGRID reads.
 *
 * Regrid serves ~150M US parcels behind one address/point API, returning
 * GeoJSON whose per-feature `properties.fields` is a NORMALIZED, nationwide
 * schema (the same field names in every county). That normalization is exactly
 * why one adapter can cover all 50 states where a per-county GIS adapter cannot.
 *
 * These types mirror the documented v2 GeoJSON envelope. They are the untrusted
 * wire format and are never exposed past the parser. Field presence varies by
 * county, so every field is optional and the parser omits (never fabricates)
 * what a given county does not carry. The exact schema should be re-confirmed
 * against the live Regrid docs when an API token is wired in.
 */

/** GeoJSON geometry — Polygon rings, or MultiPolygon (array of polygons). */
export interface RegridGeometry {
  readonly type?: "Polygon" | "MultiPolygon" | string;
  /** Polygon: number[][][]; MultiPolygon: number[][][][]. WGS84 [lng,lat]. */
  readonly coordinates?: unknown;
}

/**
 * Regrid's normalized parcel fields (the subset we map). Names follow Regrid's
 * standardized schema; values are as the source emits them.
 */
export interface RegridFields {
  /** Assessor parcel number (APN). */
  readonly parcelnumb?: string;
  /** Regrid stable parcel id / path (e.g. "us/mn/hennepin/minneapolis/123"). */
  readonly ll_uuid?: string;
  readonly path?: string;
  /** Owner of record. */
  readonly owner?: string;
  /** Full site address as Regrid composed it. */
  readonly address?: string;
  readonly scity?: string;
  readonly szip?: string;
  /** Lot area — GIS-computed square feet and/or acres. */
  readonly ll_gissqft?: number;
  readonly ll_gisacre?: number;
  readonly gisacre?: number;
  /** Assessor attributes. */
  readonly yearbuilt?: number | string;
  /** Total assessed / market parcel value (dollars). */
  readonly parval?: number;
  readonly landval?: number;
  readonly improvval?: number;
  /** Annual tax billed, when carried. */
  readonly taxamt?: number;
  /** Last recorded sale. */
  readonly saleprice?: number;
  readonly saledate?: string;
  /** Zoning code, when Regrid carries it (resolved via the zoning provider). */
  readonly zoning?: string;
  readonly [key: string]: string | number | null | undefined;
}

export interface RegridFeatureProperties {
  readonly fields?: RegridFields;
  readonly headline?: string;
  readonly path?: string;
}

export interface RegridFeature {
  readonly type?: "Feature" | string;
  readonly geometry?: RegridGeometry | null;
  readonly properties?: RegridFeatureProperties;
}

/**
 * The v2 envelope: `{ parcels: { type:"FeatureCollection", features:[...] } }`.
 * Errors come back as `{ error: ... }` (string or object) with a non-2xx status
 * handled by the provider.
 */
export interface RegridParcelsResponse {
  readonly parcels?: {
    readonly type?: string;
    readonly features?: RegridFeature[];
  };
  readonly error?: string | { readonly message?: string };
}
