/**
 * Minneapolis primary-district USE permissions (Chapter 545), scoped to the
 * by-right residential dwelling types.
 *
 * The authoritative source is § 545.100, Table 545-1 "Uses Allowed", a large
 * use × district matrix. Transcribing the whole table (six use groups, ~100
 * specific uses × 15 districts, with permitted/conditional marks and footnoted
 * lot-area conditions) reliably enough to VERIFY is not feasible here, and a
 * partial `allowedUses` list would mislead — a use absent from a short list
 * reads as "not allowed". So this module encodes only the one row that is
 * cleanly extractable AND independently corroborated: the standalone
 * "Single-, two- or three-family dwelling" row, whose permitted set matches the
 * well-documented Minneapolis 2040 reform (up to three units by right across the
 * Urban Neighborhood districts).
 *
 * The value is therefore honest about its scope: it answers "which 1–3 family
 * residential dwelling types are permitted by right here", not "every allowed
 * use". The Evidence note says so, and — like every sourced rule here — it is
 * `verification: "unverified"`, so it blocks approval until a professional
 * confirms it against the full Table 545-1 (README-US §2, §4).
 */

import { officialRule, unresolved } from "../../jurisdiction/evidence.js";
import type { EvidenceOrUnresolved } from "../../jurisdiction/evidence.js";
import { minneapolisCitation, ZONING_OWNER } from "./zoning-shared.js";

const USE_SECTION = "§ 545.100 (Table 545-1)";

/**
 * Primary districts where a NEW single-, two-, or three-family dwelling is
 * permitted (P) by right, verbatim from the standalone dwelling row of
 * Table 545-1. (Districts that show P only on the separate "existing on the
 * effective date" row are NOT included — that permits continuation, not new
 * construction.)
 */
const ONE_TO_THREE_FAMILY_BY_RIGHT: ReadonlySet<string> = new Set([
  "UN1",
  "UN2",
  "UN3",
  "RM1",
  "RM2",
  "CM1",
  "CM2",
]);

/** The 1–3 family dwelling types this module can attest to. */
const DWELLING_1_3_TYPES: readonly string[] = [
  "single-family dwelling",
  "two-family dwelling",
  "three-family dwelling",
];

const SCOPE_NOTE =
  "By-right 1–3 family residential dwelling types only (Table 545-1 dwelling " +
  "row). Other use groups (commercial, institutional, production, etc.), " +
  "multiple-family (4+ unit) dwellings, mixed-use dwellings, and conditional " +
  "uses are NOT enumerated here — consult the full Table 545-1.";

export interface AllowedUsesContext {
  readonly retrievalDate: string;
  readonly parserVersion: string;
}

/**
 * Resolve the by-right residential dwelling uses for a primary district code
 * (e.g. "UN2"). Official (but unverified, approval-blocking) when the district
 * permits 1–3 family dwellings; Unresolved otherwise (which still leaves the
 * broader use question open, per the scope note).
 */
export function resolveAllowedUses(
  primaryCode: string,
  ctx: AllowedUsesContext,
): EvidenceOrUnresolved<readonly string[]> {
  const code = primaryCode.trim().toUpperCase();
  if (!ONE_TO_THREE_FAMILY_BY_RIGHT.has(code)) {
    return unresolved(
      "allowed uses",
      ZONING_OWNER,
      `No new 1–3 family dwelling is permitted by right in the ${code} district ` +
        `per Table 545-1; the full set of allowed uses (other use groups, ` +
        `conditional uses) is not automated — confirm against § 545.100.`,
    );
  }
  const citation = minneapolisCitation(USE_SECTION, ctx.parserVersion, ctx.retrievalDate, {
    zoningDistrict: code,
    originalText: "Single-, two- or three-family dwelling: permitted (P)",
  });
  return {
    ...officialRule(DWELLING_1_3_TYPES, citation, {
      confidence: "medium",
      verification: "unverified",
    }),
    note: SCOPE_NOTE,
  };
}
