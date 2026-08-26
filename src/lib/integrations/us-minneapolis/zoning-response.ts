/**
 * Raw City of Minneapolis "Planning Primary Zoning" query response shapes (the
 * subset PARCELGRID reads).
 *
 * Endpoint:
 *   services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/
 *     Planning_Primary_Zoning/FeatureServer/0
 * The layer carries the city's official primary zoning district for each
 * mapped area (the 2024 Unified Development Ordinance district set: UN1-3,
 * RM1-3, CM1-4, DT1-2, PR1-2, TR1). These types mirror the ArcGIS Feature
 * `query` JSON; they are the untrusted wire format and never leave the parser.
 */

/** ArcGIS returns application errors as `{ error: {...} }` with HTTP 200. */
export interface ArcgisError {
  readonly code?: number;
  readonly message?: string;
}

export interface ZoningAttributes {
  /** District code, e.g. "UN2", "CM3", "DT1". */
  readonly Land_Use_Code?: string;
  /** District name, e.g. "Urban Neighborhood 2". */
  readonly Land_Use?: string;
  readonly [key: string]: string | number | undefined;
}

export interface ZoningFeature {
  readonly attributes?: ZoningAttributes;
}

export interface ZoningQueryResponse {
  readonly features?: ZoningFeature[];
  /** Present on API-level errors (still HTTP 200). */
  readonly error?: ArcgisError;
}
