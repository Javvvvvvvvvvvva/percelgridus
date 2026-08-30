/**
 * Pure parser: City of Saint Paul principal-zoning features -> a ByRightEnvelope
 * whose `zoningDistrict` is an official spatial fact and whose by-right numeric
 * rules are Unresolved (not yet parsed from the Saint Paul Legislative Code).
 *
 * This is deliberately the same honesty boundary Minneapolis started at: the
 * DISTRICT is published as GIS geometry and resolves cleanly; every by-right
 * NUMERIC rule (FAR, height, setbacks, coverage, parking), the allowed-use list,
 * overlays, and discretionary approvals require the ordinance text (Saint Paul
 * Legislative Code, Title VIII / Chapter 66), which is not parsed here — so they
 * stay Unresolved and block approval (README-US §2, §4). A split-zoned parcel
 * has no single by-right district, so the district itself returns Unresolved
 * rather than silently picking one.
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type {
  EvidenceOrUnresolved,
  Unresolved,
} from "../../jurisdiction/evidence.js";
import type { ByRightEnvelope } from "../../jurisdiction/providers.js";
import type { StPaulZoningResponse } from "./zoning-response.js";

export const SAINT_PAUL_JURISDICTION_ID = "us-mn-ramsey-saint-paul";

/** Who owns closing a Saint Paul zoning gap, echoed into every Unresolved. */
export const ST_PAUL_ZONING_OWNER = "local zoning professional";

const RULE_ACTION =
  "The automated adapter resolves the Saint Paul zoning district but does not " +
  "yet parse its by-right rules; confirm this value against the Saint Paul " +
  "Legislative Code, Title VIII (Zoning Code).";

export interface ParseStPaulZoningContext {
  readonly retrievalDate: IsoDate;
  /** The FeatureServer query URL (recorded as the source locator). */
  readonly locator: string;
  /** What was queried, for the Unresolved message (e.g. a parcel id/address). */
  readonly subject: string;
}

function source(ctx: ParseStPaulZoningContext): SourceRef {
  return {
    label: "City of Saint Paul — Principal Zoning",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

function code(f: { attributes?: { Zoning?: string } }): string {
  return (f.attributes?.Zoning ?? "").trim();
}

/**
 * Resolve just the principal zoning district from the layer response. Official
 * fact on a clean single-district hit; Unresolved on error, no coverage, or a
 * split-zoned parcel.
 */
export function parseStPaulZoningDistrict(
  response: StPaulZoningResponse,
  ctx: ParseStPaulZoningContext,
): EvidenceOrUnresolved<string> {
  if (response.error !== undefined) {
    return unresolved(
      "zoning district",
      ST_PAUL_ZONING_OWNER,
      `Saint Paul principal-zoning query errored for ${ctx.subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }

  const features = (response.features ?? []).filter((f) => code(f).length > 0);
  if (features.length === 0) {
    return unresolved(
      "zoning district",
      ST_PAUL_ZONING_OWNER,
      `No Saint Paul principal-zoning district maps ${ctx.subject}. Confirm the ` +
        `parcel is within the city and re-check against the official zoning map.`,
    );
  }

  const distinct = [...new Set(features.map(code))];
  if (distinct.length > 1) {
    return unresolved(
      "zoning district",
      ST_PAUL_ZONING_OWNER,
      `${ctx.subject} spans more than one principal zoning district ` +
        `(${distinct.join(", ")}); a human must determine the governing ` +
        `district(s) and by-right envelope per the ordinance.`,
    );
  }

  const districtCode = distinct[0]!;
  const name = (features[0]!.attributes?.Zoning_Name ?? "").trim();
  const fact = officialFact(districtCode, source(ctx), {
    confidence: "high",
    verification: "machine-parsed",
  });
  return name.length > 0 ? { ...fact, note: name } : fact;
}

function gap(subject: string): Unresolved {
  return unresolved(subject, ST_PAUL_ZONING_OWNER, RULE_ACTION);
}

/**
 * Assemble a full by-right envelope from a resolved (or unresolved) principal
 * district. Every by-right numeric rule, the allowed uses, overlays, and
 * discretionary approvals stay Unresolved pending the ordinance.
 */
export function buildStPaulEnvelope(
  district: EvidenceOrUnresolved<string>,
): ByRightEnvelope {
  return {
    jurisdictionId: SAINT_PAUL_JURISDICTION_ID,
    zoningDistrict: district,
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

/** Convenience: parse a response straight into a full envelope. */
export function parseStPaulZoningEnvelope(
  response: StPaulZoningResponse,
  ctx: ParseStPaulZoningContext,
): ByRightEnvelope {
  return buildStPaulEnvelope(parseStPaulZoningDistrict(response, ctx));
}
