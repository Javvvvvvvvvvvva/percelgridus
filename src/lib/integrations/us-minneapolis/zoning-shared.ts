/**
 * Shared zoning constants and the pending-rule scaffold used by both the
 * live Minneapolis zoning adapter and the all-pending placeholder, so the two
 * produce identical citations and identical "not yet sourced" gaps.
 *
 * The division of labor is the honest boundary of what is sourced today:
 *   - the zoning DISTRICT is an official spatial fact (the city publishes it),
 *     resolved by the live adapter;
 *   - every by-right NUMERIC rule (FAR, height, setbacks, coverage, parking),
 *     the allowed-use list, overlays, and discretionary approvals require the
 *     ordinance rule text, which is NOT yet parsed — so they stay Unresolved
 *     and block approval (README-US §2, §4).
 */

import type { RuleCitation, Unresolved } from "../../jurisdiction/evidence.js";
import { unresolved } from "../../jurisdiction/evidence.js";

export const MINNEAPOLIS_JURISDICTION_ID = "us-mn-hennepin-minneapolis";

/** Who owns closing a zoning gap, echoed into every Unresolved. */
export const ZONING_OWNER = "local zoning professional";

/** Required action for the by-right rule gaps that are not yet parsed. */
export const ZONING_RULE_ACTION =
  "The automated adapter resolves the zoning district but does not yet parse " +
  "Minneapolis by-right rules; confirm this value against the City of " +
  "Minneapolis Unified Development Ordinance (Title 20).";

/**
 * The by-right envelope fields that are NOT yet sourced from the ordinance.
 * Shared so the live adapter (which fills in `zoningDistrict`) and the
 * all-pending placeholder surface exactly the same gaps for everything else.
 */
export interface PendingRuleGaps {
  readonly allowedUses: Unresolved;
  readonly maxFar: Unresolved;
  readonly maxLotCoverage: Unresolved;
  readonly maxHeight: Unresolved;
  readonly minSetbacks: Unresolved;
  readonly minParkingStalls: Unresolved;
  readonly overlays: readonly Unresolved[];
  readonly discretionaryApprovals: readonly Unresolved[];
}

export function pendingRuleGaps(): PendingRuleGaps {
  const gap = (subject: string): Unresolved =>
    unresolved(subject, ZONING_OWNER, ZONING_RULE_ACTION);
  return {
    allowedUses: gap("allowed uses"),
    maxFar: gap("maximum floor area ratio"),
    maxLotCoverage: gap("maximum lot coverage"),
    maxHeight: gap("maximum height"),
    minSetbacks: gap("minimum setbacks (front/side/rear)"),
    minParkingStalls: gap("minimum parking stalls"),
    overlays: [gap("overlay districts")],
    discretionaryApprovals: [gap("discretionary approvals / special reviews")],
  };
}

/**
 * Citation for a section of the Minneapolis ordinance. Documents the source
 * addressing every parsed rule carries. `opts` attaches the verbatim source
 * text, the section's effective date, and the built form / zoning district the
 * rule applies to, when known.
 */
export function minneapolisCitation(
  section: string,
  parserVersion: string,
  retrievalDate: string,
  opts: {
    originalText?: string;
    effectiveDate?: string;
    zoningDistrict?: string;
  } = {},
): RuleCitation {
  return {
    jurisdictionId: MINNEAPOLIS_JURISDICTION_ID,
    label: "City of Minneapolis Unified Development Ordinance",
    locator:
      "https://library.municode.com/mn/minneapolis/codes/code_of_ordinances",
    ordinanceTitle: "Minneapolis Code of Ordinances Title 20 (Zoning Code)",
    ordinanceSection: section,
    retrievalDate,
    parserVersion,
    ...(opts.originalText !== undefined
      ? { originalText: opts.originalText }
      : {}),
    ...(opts.effectiveDate !== undefined
      ? { effectiveDate: opts.effectiveDate }
      : {}),
    ...(opts.zoningDistrict !== undefined
      ? { zoningDistrict: opts.zoningDistrict }
      : {}),
  };
}

/** ISO date (yyyy-mm-dd) helper shared by the adapters. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
