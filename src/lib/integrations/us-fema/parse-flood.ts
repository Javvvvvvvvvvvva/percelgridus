/**
 * Pure parser: FEMA NFHL flood-zone features -> Evidence<FloodHazard> | Unresolved.
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network. A parcel can straddle more than one flood zone, so
 * the parser aggregates conservatively (README-US: facts drive a due-diligence
 * decision, so the *worst* applicable hazard wins):
 *
 *   - If any intersecting zone is a Special Flood Hazard Area (SFHA), the
 *     result is that SFHA zone, inSfha = true.
 *   - Otherwise the first zone is reported, inSfha = false.
 *   - No intersecting zone at all is `Unresolved` (unmapped / outside NFHL
 *     coverage), which blocks approval — an unknown flood status is never
 *     silently read as "not in a flood zone".
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { Evidence, Unresolved } from "../../jurisdiction/evidence.js";
import type { FloodHazard } from "../../jurisdiction/providers.js";
import type { NfhlResponse, NfhlZoneAttributes } from "./nfhl-response.js";

export interface ParseFloodContext {
  readonly retrievalDate: IsoDate;
  /** The full ArcGIS query URL, recorded as the source locator. */
  readonly locator: string;
  /** What was queried, for the Unresolved message (e.g. a parcel id). */
  readonly subject: string;
}

/** NFHL encodes the SFHA flag as the strings "T" / "F". */
function isSfha(attrs: NfhlZoneAttributes): boolean {
  return (attrs.SFHA_TF ?? "").trim().toUpperCase() === "T";
}

function source(ctx: ParseFloodContext): SourceRef {
  return {
    label: "FEMA National Flood Hazard Layer",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

export function parseFloodZones(
  response: NfhlResponse,
  ctx: ParseFloodContext,
): Evidence<FloodHazard> | Unresolved {
  if (response.error !== undefined) {
    return unresolved(
      "flood zone",
      "user",
      `FEMA NFHL returned an error for ${ctx.subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }

  const features = (response.features ?? []).filter(
    (f) => (f.attributes?.FLD_ZONE ?? "").trim().length > 0,
  );

  if (features.length === 0) {
    return unresolved(
      "flood zone",
      "user",
      `No FEMA flood zone maps ${ctx.subject}. The parcel may be outside NFHL coverage; confirm with a FIRM panel or a floodplain manager.`,
    );
  }

  // Worst-case: any SFHA zone takes precedence over a minimal-hazard zone.
  const sfha = features.find((f) => isSfha(f.attributes ?? {}));
  const chosen = sfha ?? features[0]!;
  const attrs = chosen.attributes ?? {};
  const zone = (attrs.FLD_ZONE ?? "").trim();

  const distinctZones = new Set(
    features.map((f) => (f.attributes?.FLD_ZONE ?? "").trim()),
  );
  const spansMultiple = distinctZones.size > 1;

  const value: FloodHazard = {
    femaZone: zone,
    inSfha: isSfha(attrs),
  };

  // A parcel spanning more than one zone is reported at reduced confidence:
  // the aggregate (worst-case) answer is correct, but the on-parcel split
  // needs a human read of the FIRM panel.
  return officialFact(value, source(ctx), {
    confidence: spansMultiple ? "medium" : "high",
  });
}
