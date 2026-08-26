/**
 * Raw FEMA National Flood Hazard Layer (NFHL) query response shapes (the
 * subset PARCELGRID reads).
 *
 * Endpoint:
 *   hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28
 * ("Flood Hazard Zones", the S_FLD_HAZ_AR layer). These types mirror the
 * ArcGIS Feature `query` JSON; they are the untrusted wire format and are
 * never exposed outside the parser.
 */

/** ArcGIS returns application errors as `{ error: {...} }` with HTTP 200. */
export interface ArcgisError {
  readonly code?: number;
  readonly message?: string;
}

export interface NfhlZoneAttributes {
  /** Flood zone designation, e.g. "AE", "X", "VE", "A". */
  readonly FLD_ZONE?: string;
  /** Zone subtype, e.g. "FLOODWAY", "AREA OF MINIMAL FLOOD HAZARD". */
  readonly ZONE_SUBTY?: string;
  /** Special Flood Hazard Area flag: "T" (true) / "F" (false). */
  readonly SFHA_TF?: string;
  /** Static base flood elevation; -9999 is the NFHL "not applicable" sentinel. */
  readonly STATIC_BFE?: number;
  /** DFIRM (map panel) id, e.g. "27053C". */
  readonly DFIRM_ID?: string;
  readonly [key: string]: string | number | undefined;
}

export interface NfhlFeature {
  readonly attributes?: NfhlZoneAttributes;
}

export interface NfhlResponse {
  readonly features?: NfhlFeature[];
  /** Present on API-level errors (still HTTP 200). */
  readonly error?: ArcgisError;
}
