/**
 * Minneapolis off-street parking minimum (Chapter 541).
 *
 * Minneapolis eliminated minimum off-street vehicle-parking requirements
 * CITYWIDE — the first large U.S. city to do so — effective 2021, building on
 * the Minneapolis 2040 comprehensive plan. Under the Unified Development
 * Ordinance there is no district- or use-specific minimum number of car stalls:
 * the required minimum is zero everywhere in the city.
 *
 * That makes this the one by-right numeric standard that resolves without any
 * table lookup or spatial context: it is the same value for every parcel. So
 * `minParkingStalls` becomes a SOURCED official rule of 0 rather than an
 * Unresolved gap. Like every parsed rule in this adapter it is
 * `verification: "unverified"` — a preliminary reference the approval gate still
 * routes to a professional to confirm against the live ordinance text, never a
 * silently-authoritative value (README-US §2, §4).
 *
 * Scope note: this is the MINIMUM required vehicle-parking count only. It does
 * not speak to maximum parking limits, bicycle-parking or accessible-stall
 * requirements, loading, or transportation-demand-management provisions that
 * larger projects can still trigger elsewhere in Chapter 541.
 */

import { officialRule } from "../../jurisdiction/evidence.js";
import type { Evidence } from "../../jurisdiction/evidence.js";
import { minneapolisCitation } from "./zoning-shared.js";

const PARKING_SECTION = "Chapter 541 (Off-Street Parking, Loading, and Mobility)";

const PARKING_ORIGINAL_TEXT =
  "No minimum number of off-street vehicle parking spaces is required for any " +
  "use in any zoning district (citywide elimination of parking minimums, 2021).";

const PARKING_SCOPE_NOTE =
  "Minimum required off-street VEHICLE stalls only. Maximum parking limits, " +
  "bicycle and accessible-stall requirements, loading, and transportation " +
  "demand management (Chapter 541) are not enumerated here.";

export interface MinParkingContext {
  readonly retrievalDate: string;
  readonly parserVersion: string;
}

/**
 * Resolve the by-right minimum off-street vehicle parking stalls for a
 * Minneapolis parcel. Always 0 — the citywide reform removed all minimums — so
 * this needs neither the district nor the proposed use. Official but unverified,
 * so it remains an approval-blocking preliminary reference until confirmed.
 */
export function resolveMinParkingStalls(ctx: MinParkingContext): Evidence<number> {
  const citation = minneapolisCitation(
    PARKING_SECTION,
    ctx.parserVersion,
    ctx.retrievalDate,
    { originalText: PARKING_ORIGINAL_TEXT },
  );
  return {
    ...officialRule(0, citation, {
      confidence: "high",
      verification: "unverified",
    }),
    note: PARKING_SCOPE_NOTE,
  };
}
