/**
 * Raw USGS Elevation Point Query Service (EPQS) response shapes, plus the
 * sample tuple the terrain parser consumes.
 *
 * Endpoint: epqs.nationalmap.gov/v1/json?x=<lng>&y=<lat>&units=Meters&wkid=4326
 * Backed by USGS 3DEP. The `value` field is the elevation at the point; EPQS
 * returns a sentinel (a large negative number, or a non-numeric string) when a
 * point falls outside 3DEP coverage. These types are the untrusted wire format
 * and are never exposed outside the parser.
 */

/** One EPQS point response. `value` may arrive as a number or a string. */
export interface EpqsResponse {
  readonly value?: number | string;
  readonly location?: { readonly x?: number; readonly y?: number };
  readonly rasterId?: string | number;
  readonly resolution?: number;
}

/** A resolved elevation sample: a point plus its elevation in meters. */
export interface TerrainSample {
  readonly lng: number;
  readonly lat: number;
  readonly elevationMeters: number;
}
