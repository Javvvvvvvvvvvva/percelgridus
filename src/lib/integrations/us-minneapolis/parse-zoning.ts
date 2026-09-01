/**
 * Pure parser: Minneapolis primary-zoning features -> a ByRightEnvelope whose
 * `zoningDistrict` is an official fact. `buildEnvelope` can merge the supported
 * Chapter 540 numeric rules while unsupported contextual fields stay
 * Unresolved (see zoning-shared).
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network. Split-zoned parcels matter: a lot that intersects
 * more than one primary district has no single by-right district, so the
 * district is returned as `Unresolved` (a human must determine the governing
 * district per the ordinance) rather than silently picking one.
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { EvidenceOrUnresolved } from "../../jurisdiction/evidence.js";
import type { ByRightEnvelope } from "../../jurisdiction/providers.js";
import type { BuiltFormNumericEnvelope } from "./built-form-rules.js";
import type { ZoningQueryResponse } from "./zoning-response.js";
import {
  MINNEAPOLIS_JURISDICTION_ID,
  ZONING_OWNER,
  pendingRuleGaps,
} from "./zoning-shared.js";

export interface ParseZoningContext {
  readonly retrievalDate: IsoDate;
  /** The full ArcGIS query URL, recorded as the source locator. */
  readonly locator: string;
  /** What was queried, for the Unresolved message (e.g. a parcel id). */
  readonly subject: string;
}

function source(ctx: ParseZoningContext): SourceRef {
  return {
    label: "City of Minneapolis — Planning Primary Zoning",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

function code(f: { attributes?: { Land_Use_Code?: string } }): string {
  return (f.attributes?.Land_Use_Code ?? "").trim();
}

/**
 * Resolve just the primary zoning district from the layer response. Official
 * fact on a clean single-district hit; Unresolved on error, no coverage, or a
 * split-zoned parcel.
 */
export function parseZoningDistrict(
  response: ZoningQueryResponse,
  ctx: ParseZoningContext,
): EvidenceOrUnresolved<string> {
  if (response.error !== undefined) {
    return unresolved(
      "zoning district",
      ZONING_OWNER,
      `Minneapolis primary-zoning query errored for ${ctx.subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }

  const features = (response.features ?? []).filter((f) => code(f).length > 0);

  if (features.length === 0) {
    return unresolved(
      "zoning district",
      ZONING_OWNER,
      `No Minneapolis primary-zoning district maps ${ctx.subject}. Confirm the ` +
        `parcel is within the city and re-check against the official zoning map.`,
    );
  }

  const distinct = [...new Set(features.map(code))];
  if (distinct.length > 1) {
    return unresolved(
      "zoning district",
      ZONING_OWNER,
      `${ctx.subject} spans more than one primary zoning district ` +
        `(${distinct.join(", ")}); a human must determine the governing ` +
        `district(s) and by-right envelope per the ordinance.`,
    );
  }

  const districtCode = distinct[0]!;
  const name = (features[0]!.attributes?.Land_Use ?? "").trim();
  const fact = officialFact(districtCode, source(ctx), {
    confidence: "high",
    verification: "machine-parsed",
  });
  // The typed value is the district code; carry the human name as a note.
  return name.length > 0 ? { ...fact, note: name } : fact;
}

/** Optional sourced fields the live adapter resolves, threaded into the envelope. */
export interface ResolvedEnvelopeFields {
  readonly allowedUses?: EvidenceOrUnresolved<readonly string[]>;
  readonly minParkingStalls?: EvidenceOrUnresolved<number>;
  readonly overlays?: readonly EvidenceOrUnresolved<string>[];
}

/**
 * Assemble a full by-right envelope from a resolved (or unresolved) primary
 * district and, optionally, the numeric standards the built form district
 * governs (height, FAR, lot coverage, setbacks — Chapter 540) plus any other
 * sourced fields (allowed uses, parking, overlays). Fields with no source —
 * discretionary approvals, and any standard not passed in — stay Unresolved.
 */
export function buildEnvelope(
  district: EvidenceOrUnresolved<string>,
  numeric?: BuiltFormNumericEnvelope,
  resolved: ResolvedEnvelopeFields = {},
): ByRightEnvelope {
  const gaps = pendingRuleGaps();
  return {
    jurisdictionId: MINNEAPOLIS_JURISDICTION_ID,
    zoningDistrict: district,
    allowedUses: resolved.allowedUses ?? gaps.allowedUses,
    maxFar: numeric?.maxFar ?? gaps.maxFar,
    maxLotCoverage: numeric?.maxLotCoverage ?? gaps.maxLotCoverage,
    maxHeight: numeric?.maxHeight ?? gaps.maxHeight,
    minSetbacks: numeric?.minSetbacks ?? gaps.minSetbacks,
    minParkingStalls: resolved.minParkingStalls ?? gaps.minParkingStalls,
    overlays: resolved.overlays ?? gaps.overlays,
    discretionaryApprovals: gaps.discretionaryApprovals,
  };
}

/** Convenience: parse a response straight into a full envelope. */
export function parseZoningEnvelope(
  response: ZoningQueryResponse,
  ctx: ParseZoningContext,
): ByRightEnvelope {
  return buildEnvelope(parseZoningDistrict(response, ctx));
}
