/**
 * Pure functions for USGS 3DEP terrain: read an EPQS point response, and
 * fold a set of elevation samples into Evidence<TerrainSummary> | Unresolved.
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network.
 *
 * Provenance honesty (README-US §1): the elevations are official 3DEP samples,
 * but `meanSlopePct` is a *coarse* estimate from the sampled extent — the ratio
 * of the elevation range to the horizontal span of the samples, not a DEM
 * gradient. That is recorded in the evidence note so a caller never treats the
 * slope as a surveyed figure.
 */

import type { Evidence, IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { unresolved } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import type { TerrainSummary } from "../../jurisdiction/providers.js";
import { Length } from "../../units/index.js";
import type { EpqsResponse, TerrainSample } from "./epqs-response.js";

/** EPQS marks "no data" with a large negative sentinel; guard generously. */
const NO_DATA_THRESHOLD = -1_000_000;

/**
 * Read the elevation (meters) from an EPQS response, or `undefined` when the
 * point has no usable 3DEP value.
 */
export function readEpqsElevation(response: EpqsResponse): number | undefined {
  const raw = response.value;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (n === undefined || !Number.isFinite(n) || n <= NO_DATA_THRESHOLD) {
    return undefined;
  }
  return n;
}

export interface ParseTerrainContext {
  readonly retrievalDate: IsoDate;
  /** A stable locator for the elevation source (the EPQS endpoint / dataset). */
  readonly locator: string;
  readonly subject: string;
}

/** Equirectangular-approximation distance in meters between two lng/lat points. */
function metersBetween(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const R = 6_371_000; // mean Earth radius, m
  const toRad = (d: number) => (d * Math.PI) / 180;
  const meanLat = toRad((a.lat + b.lat) / 2);
  const dx = toRad(b.lng - a.lng) * Math.cos(meanLat) * R;
  const dy = toRad(b.lat - a.lat) * R;
  return Math.hypot(dx, dy);
}

/** The horizontal span of the samples: the diagonal of their bounding box. */
function horizontalSpanMeters(samples: readonly TerrainSample[]): number {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const s of samples) {
    minLng = Math.min(minLng, s.lng);
    minLat = Math.min(minLat, s.lat);
    maxLng = Math.max(maxLng, s.lng);
    maxLat = Math.max(maxLat, s.lat);
  }
  return metersBetween(
    { lng: minLng, lat: minLat },
    { lng: maxLng, lat: maxLat },
  );
}

export function parseTerrain(
  samples: readonly TerrainSample[],
  ctx: ParseTerrainContext,
): Evidence<TerrainSummary> | Unresolved {
  const valid = samples.filter((s) => Number.isFinite(s.elevationMeters));

  if (valid.length < 2) {
    return unresolved(
      "terrain",
      "user",
      `USGS 3DEP returned fewer than two elevation samples for ${ctx.subject}. Sample a denser grid or confirm the parcel is within 3DEP coverage.`,
    );
  }

  let minM = Infinity;
  let maxM = -Infinity;
  for (const s of valid) {
    minM = Math.min(minM, s.elevationMeters);
    maxM = Math.max(maxM, s.elevationMeters);
  }

  const span = horizontalSpanMeters(valid);
  const relief = maxM - minM;
  // Coarse slope estimate; 0 when the samples are effectively co-located.
  const meanSlopePct = span > 0.5 ? (relief / span) * 100 : 0;

  const summary: TerrainSummary = {
    meanSlopePct,
    minElevation: Length.meters(minM),
    maxElevation: Length.meters(maxM),
  };

  const src: SourceRef = {
    label: "USGS 3DEP (EPQS point samples)",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };

  return {
    value: summary,
    provenance: "official",
    confidence: "medium",
    verification: "machine-parsed",
    source: src,
    note: `Elevations are USGS 3DEP point samples (${valid.length} points); meanSlopePct is a coarse estimate from the sampled extent, not a DEM gradient.`,
  };
}
