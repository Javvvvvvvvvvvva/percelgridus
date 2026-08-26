/**
 * Pure parser: Census geocoder JSON -> Evidence<NormalizedAddress> | Unresolved.
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network. All provenance is stamped here: a geocode is
 * official government data, machine-parsed, carrying its retrieval date.
 */

import type { IsoDate } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { Evidence, Unresolved } from "../../jurisdiction/evidence.js";
import type { NormalizedAddress } from "../../jurisdiction/providers.js";
import type { CensusGeocodeResponse } from "./geocoder-response.js";

/** The most specific geography we surface (a 15-digit block GEOID). */
const BLOCK_LAYER = "Census Blocks";

export interface ParseContext {
  readonly input: string;
  readonly retrievalDate: IsoDate;
  /** The full request URL (benchmark/vintage included) recorded as source. */
  readonly locator: string;
}

export function parseOnelineAddress(
  response: CensusGeocodeResponse,
  ctx: ParseContext,
): Evidence<NormalizedAddress> | Unresolved {
  const matches = response.result?.addressMatches ?? [];

  if (matches.length === 0) {
    return unresolved(
      "address match",
      "user",
      `Census returned no match for "${ctx.input}". Refine or correct the address.`,
    );
  }

  const best = matches[0]!;
  const coords = best.coordinates;

  if (
    !best.matchedAddress ||
    !coords ||
    !Number.isFinite(coords.x) ||
    !Number.isFinite(coords.y)
  ) {
    return unresolved(
      "address coordinates",
      "user",
      `Census match for "${ctx.input}" lacked usable coordinates. Verify the address.`,
    );
  }

  const censusGeoid = best.geographies?.[BLOCK_LAYER]?.[0]?.GEOID;

  const normalized: NormalizedAddress = {
    input: ctx.input,
    normalized: best.matchedAddress,
    point: { lng: coords.x, lat: coords.y },
    ...(censusGeoid !== undefined ? { censusGeoid } : {}),
  };

  const multiple = matches.length > 1;

  return officialFact(
    normalized,
    {
      label: "U.S. Census Bureau Geocoder",
      locator: ctx.locator,
      retrievalDate: ctx.retrievalDate,
    },
    {
      confidence: multiple ? "medium" : "high",
      verification: "machine-parsed",
    },
  );
}
