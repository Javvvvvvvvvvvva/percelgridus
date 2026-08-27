/**
 * Raw City of Minneapolis "Zoning Built Form" query response shapes.
 *
 * Endpoint:
 *   services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/
 *     Planning_Zoning_Built_Form/FeatureServer/0
 *
 * Minneapolis separates the PRIMARY (use) district — Planning_Primary_Zoning,
 * e.g. "UN2" — from the BUILT FORM overlay district (Chapter 540), which is what
 * actually governs the numeric envelope: height, floor area ratio, setbacks, and
 * lot coverage. A parcel therefore carries both; the built form district is the
 * correct key for the by-right numeric standards.
 *
 * The 14 built form districts are: Interior 1/2/3, Corridor 3/4/6, Core 50,
 * Transit 10/15/20/30A/30B, Production, and Parks.
 */

/** ArcGIS returns application errors as `{ error: {...} }` with HTTP 200. */
export interface ArcgisError {
  readonly code?: number;
  readonly message?: string;
}

export interface BuiltFormAttributes {
  /** Full district name, e.g. "Interior 2". */
  readonly Built_Form?: string;
  /** Abbreviation, e.g. "BFI2". */
  readonly Abbrv?: string;
  readonly [key: string]: string | number | undefined;
}

export interface BuiltFormFeature {
  readonly attributes?: BuiltFormAttributes;
}

export interface BuiltFormQueryResponse {
  readonly features?: BuiltFormFeature[];
  readonly error?: ArcgisError;
}
