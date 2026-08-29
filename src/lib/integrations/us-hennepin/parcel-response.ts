/**
 * Raw Hennepin County ArcGIS parcel-query response shapes (the subset
 * PARCELGRID reads).
 *
 * Endpoint:
 *   gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1
 * ("County Parcels"). These types mirror the ArcGIS Feature `query` JSON; they
 * are the untrusted wire format and are never exposed outside the parser.
 *
 * Coordinate convention: with outSR=4326 the service returns ring vertices as
 * [x, y] = [longitude, latitude].
 */

/** ArcGIS returns application errors as `{ error: {...} }` with HTTP 200. */
export interface ArcgisError {
  readonly code?: number;
  readonly message?: string;
  readonly details?: unknown;
}

/** The attribute subset requested via outFields. Values are as the source
 *  emits them: strings are fixed-width and space-padded; numbers are raw. */
export interface HennepinParcelAttributes {
  readonly PID?: string;
  readonly PID_TEXT?: string;
  readonly OWNER_NM?: string;
  readonly HOUSE_NO?: number;
  readonly STREET_NM?: string;
  readonly MUNIC_NM?: string;
  readonly ZIP_CD?: string;
  /** Assessor's recorded parcel area, in square feet. */
  readonly PARCEL_AREA?: number;
  readonly LAT?: number;
  readonly LON?: number;
  /** Assessor year the primary structure was built (string, e.g. "2015"). */
  readonly BUILD_YR?: string;
  /** Last recorded sale date as `YYYYMM` (e.g. "201502"). */
  readonly SALE_DATE?: string;
  /** Last recorded sale price, whole dollars. */
  readonly SALE_PRICE?: number;
  /** Sale-code caveat, e.g. "SALE INCLUDES MORE THAN ONE PARCEL". */
  readonly SALE_CODE_NAME?: string;
  /** Assessor total taxable market value, whole dollars. */
  readonly TAXABLE_VAL_TOT?: number;
  /** Actual total annual property tax billed, dollars. */
  readonly TAX_TOT?: number;
  readonly [key: string]: string | number | undefined;
}

/** An esriGeometryPolygon: an array of rings, each a list of [lng, lat]. */
export interface EsriPolygon {
  readonly rings?: number[][][];
}

export interface HennepinParcelFeature {
  readonly attributes?: HennepinParcelAttributes;
  readonly geometry?: EsriPolygon;
}

export interface HennepinParcelResponse {
  readonly features?: HennepinParcelFeature[];
  readonly spatialReference?: { readonly wkid?: number };
  /** Present on API-level errors (still HTTP 200). */
  readonly error?: ArcgisError;
}
