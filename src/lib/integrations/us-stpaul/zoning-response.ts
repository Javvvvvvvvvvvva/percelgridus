/**
 * Raw City of Saint Paul "Principal Zoning" ArcGIS query-response shapes (the
 * subset PARCELGRID reads). Untrusted wire format, never exposed past the parser.
 *
 * Endpoint (ArcGIS Online, City of Saint Paul org 9meaaHE3uiba0zr8):
 *   services1.arcgis.com/.../PrincipalZoning_TEST/FeatureServer/6
 */

export interface StPaulZoningAttributes {
  /** District code, e.g. "B5", "R4", "T2". */
  readonly Zoning?: string;
  /** Human district name, e.g. "Central Business Service". */
  readonly Zoning_Name?: string;
  /** Ordinance addressing, e.g. "_ARTIV66.400.BUDI" (Chapter 66). */
  readonly Zoning_Description?: string;
  readonly [key: string]: string | number | null | undefined;
}

export interface StPaulZoningFeature {
  readonly attributes?: StPaulZoningAttributes;
}

export interface StPaulZoningResponse {
  readonly features?: StPaulZoningFeature[];
  readonly error?: { readonly code?: number; readonly message?: string };
}
