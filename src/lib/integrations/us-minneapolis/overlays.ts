/**
 * Minneapolis overlay districts (Chapter 551), resolved from the City's
 * "Planning Zoning Overlay" layer as spatial facts.
 *
 * Overlays are the one remaining by-right envelope field that is a SPATIAL
 * question, not a rule-text transcription: whether a parcel falls inside an
 * overlay district is published as GIS geometry, exactly like the primary and
 * built-form districts. So — unlike the numeric standards, which stay
 * `unverified` pending human confirmation of the ordinance text — a clean
 * spatial hit resolves to an `official`/`machine-parsed` fact, and a clean set
 * of misses resolves the field to "no overlay districts apply" (an empty,
 * non-blocking list) rather than an open gap.
 *
 * The layer publishes each overlay type as its own sublayer; this module holds
 * the transcribed sublayer set. "Split Zoning" (sublayer 7 of the service) is
 * deliberately excluded: it flags parcels split across primary districts, which
 * the primary-zoning parser already surfaces as Unresolved — it is not a
 * Chapter 551 overlay district and would double-report.
 *
 * Presence is resolved from features with a non-null designation only (the
 * provider's query filters `SYMBOL_NAM IS NOT NULL`): the Floodplain sublayer
 * embeds FIRM-panel background polygons (Zone X "minimal hazard" coverage that
 * blankets most of the city) as null-designation features, which a bare
 * intersects-count would mistake for a floodplain-overlay designation on nearly
 * every parcel. Regulatory flood risk is in any case surfaced separately by the
 * FEMA flood hazard fact; this field answers only the city overlay-district
 * question.
 *
 * Honesty boundary (README-US §2, §4): overlay PRESENCE is a fact, but the
 * development implications an overlay carries (e.g. Shoreland/Floodplain/MRCCA
 * standards) are not modeled here; a professional must still apply them. When
 * the overlay query cannot be completed (no geometry, transport/HTTP failure),
 * the field degrades to a single Unresolved gap — absence is never asserted
 * without having checked.
 */

import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type {
  EvidenceOrUnresolved,
  SourceRef,
} from "../../jurisdiction/evidence.js";
import { ZONING_OWNER } from "./zoning-shared.js";

/** One overlay sublayer of the Planning Zoning Overlay FeatureServer. */
export interface OverlayLayer {
  /** Sublayer id in the FeatureServer, e.g. 10 for Floodplain. */
  readonly layerId: number;
  /** Canonical overlay-district name, carried as the resolved fact's value. */
  readonly name: string;
}

/**
 * The Chapter 551 overlay sublayers, transcribed from the published
 * Planning_Zoning_Overlay FeatureServer (layer order as of 2026-08). Sublayer 7
 * ("Split Zoning") is intentionally omitted — see the module header.
 */
export const MINNEAPOLIS_OVERLAY_LAYERS: readonly OverlayLayer[] = [
  { layerId: 0, name: "Transitional Parking Overlay District" },
  { layerId: 1, name: "Downtown Housing Overlay District" },
  { layerId: 2, name: "Downtown Parking Overlay District" },
  { layerId: 3, name: "Downtown Shelter Overlay District" },
  { layerId: 4, name: "Harmon Area Overlay District" },
  { layerId: 5, name: "Linden Hills Overlay District" },
  { layerId: 6, name: "University Area Overlay District" },
  { layerId: 8, name: "Airport Overlay District" },
  { layerId: 9, name: "Shoreland Overlay District" },
  { layerId: 10, name: "Floodplain Overlay District" },
  { layerId: 11, name: "Mississippi River Critical Area Overlay District" },
];

export const OVERLAY_SECTION = "Chapter 551 (Overlay Districts)";

/** Minimal shape of an ArcGIS `returnCountOnly` query response. */
export interface OverlayCountResponse {
  readonly count?: number;
  readonly error?: { readonly message?: string };
}

/** One resolved sublayer probe: does this overlay intersect the parcel? */
export interface OverlayProbe {
  readonly name: string;
  readonly response: OverlayCountResponse;
}

function overlayGap(reason: string): EvidenceOrUnresolved<string>[] {
  return [
    unresolved(
      "overlay districts",
      ZONING_OWNER,
      `Overlay districts could not be resolved from the City overlay layer ` +
        `(${reason}); confirm against the official zoning map and Minneapolis ` +
        `Code Chapter 551 before relying on the absence of an overlay.`,
    ),
  ];
}

/**
 * Turn the per-sublayer count probes into the envelope's `overlays` list.
 *
 * - Any probe carrying a service error → the whole field is Unresolved (we
 *   cannot honestly assert which overlays do or do not apply).
 * - Otherwise → one `official`/`machine-parsed` fact per intersecting overlay,
 *   possibly an empty list ("no overlay districts apply"), which does not block.
 */
export function overlaysFromProbes(
  probes: readonly OverlayProbe[],
  source: SourceRef,
): readonly EvidenceOrUnresolved<string>[] {
  const errored = probes.find((p) => p.response.error !== undefined);
  if (errored !== undefined) {
    return overlayGap(errored.response.error?.message ?? "query error");
  }
  return probes
    .filter((p) => (p.response.count ?? 0) > 0)
    .map((p) =>
      officialFact(p.name, source, {
        confidence: "high",
        verification: "machine-parsed",
      }),
    );
}

/** The Unresolved fallback when no geometry is available to query. */
export function overlaysWithoutGeometry(): readonly EvidenceOrUnresolved<string>[] {
  return overlayGap("no parcel geometry supplied");
}

/** The Unresolved fallback when the overlay query cannot be completed. */
export function overlaysUnavailable(
  reason: string,
): readonly EvidenceOrUnresolved<string>[] {
  return overlayGap(reason);
}
