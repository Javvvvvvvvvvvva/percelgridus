/**
 * Raw U.S. Census Geocoder response shapes (the subset PARCELGRID reads).
 *
 * Endpoint: geocoding.geo.census.gov/geocoder/geographies/onelineaddress
 * These types mirror the documented JSON; they are the untrusted wire format
 * and are never exposed outside the parser.
 *
 * Coordinate convention: Census returns `x` = longitude, `y` = latitude.
 */

export interface CensusCoordinates {
  readonly x: number; // longitude
  readonly y: number; // latitude
}

/** One geography row (a state, county, tract, or block). Keys vary by layer. */
export interface CensusGeographyEntry {
  readonly GEOID?: string;
  readonly NAME?: string;
  readonly STATE?: string;
  readonly COUNTY?: string;
  readonly TRACT?: string;
  readonly BLOCK?: string;
  readonly [key: string]: string | number | undefined;
}

/** Geography layers are keyed by human labels, e.g. "Census Blocks". */
export type CensusGeographies = Record<string, CensusGeographyEntry[]>;

export interface CensusAddressMatch {
  readonly matchedAddress?: string;
  readonly coordinates?: CensusCoordinates;
  readonly geographies?: CensusGeographies;
}

export interface CensusGeocodeResult {
  readonly input?: unknown;
  readonly addressMatches?: CensusAddressMatch[];
}

export interface CensusGeocodeResponse {
  readonly result?: CensusGeocodeResult;
  /** Present on API-level errors. */
  readonly errors?: unknown;
}
