/**
 * UsgsTerrainProvider — a HazardProvider (terrain) backed by the USGS
 * Elevation Point Query Service (EPQS), which serves the 3DEP elevation model.
 *
 * EPQS is a point service, so the provider samples the parcel — its vertices
 * plus an interior grid — fetches an elevation per point, and folds the samples
 * into a `TerrainSummary` (min/max elevation + a coarse slope estimate) in the
 * pure parser. `fetchImpl` is injected for testing without network and for a
 * proxy-aware fetch where egress is mediated.
 *
 * Network note: epqs.nationalmap.gov is reachable from an environment whose
 * egress policy allowlists the host, and the live smoke test
 * (src/tests/integrations/usgs-terrain.live.test.ts, gated on USGS_LIVE=1) has
 * been verified green end-to-end against a known Minneapolis parcel. The pure
 * parser and sampling are fully fixture-tested offline, and the live check
 * stays opt-in so the default suite is hermetic.
 */

import type { IsoDate } from "../../jurisdiction/evidence.js";
import type { Evidence, Unresolved } from "../../jurisdiction/evidence.js";
import type {
  HazardProvider,
  PolygonCoordinates,
  TerrainSummary,
} from "../../jurisdiction/providers.js";
import type { EpqsResponse, TerrainSample } from "./epqs-response.js";
import { parseTerrain, readEpqsElevation } from "./parse-terrain.js";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface UsgsTerrainConfig {
  /** Overridable for tests / mirrors. Defaults to the public EPQS v1 endpoint. */
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  /** Interior grid resolution per axis (nxn). Default 3 → up to 9 interior points. */
  readonly gridSize?: number;
  /** Hard cap on total sample points (vertices + grid). Default 24. */
  readonly maxSamples?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://epqs.nationalmap.gov/v1/json";

export class UsgsTerrainError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "UsgsTerrainError";
  }
}

export class UsgsTerrainProvider implements HazardProvider {
  readonly id = "us-usgs-3dep";
  readonly hazardKind = "terrain" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly gridSize: number;
  private readonly maxSamples: number;
  private readonly timeoutMs: number;

  constructor(config: UsgsTerrainConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.gridSize = Math.max(2, config.gridSize ?? 3);
    this.maxSamples = Math.max(2, config.maxSamples ?? 24);
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  buildUrl(lng: number, lat: number): string {
    const params = new URLSearchParams({
      x: String(lng),
      y: String(lat),
      units: "Meters",
      wkid: "4326",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  /** Candidate sample points: the outer-ring vertices plus an interior grid. */
  samplePoints(geometry: PolygonCoordinates): { lng: number; lat: number }[] {
    const outer = geometry[0] ?? [];
    const points: { lng: number; lat: number }[] = [];

    for (const v of outer) {
      if (v.length >= 2) points.push({ lng: v[0]!, lat: v[1]! });
    }

    const [minLng, minLat, maxLng, maxLat] = bbox(outer);
    if (Number.isFinite(minLng)) {
      const n = this.gridSize;
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          const lng = minLng + ((maxLng - minLng) * i) / n;
          const lat = minLat + ((maxLat - minLat) * j) / n;
          if (pointInRing(lng, lat, outer)) points.push({ lng, lat });
        }
      }
    }

    return dedupe(points).slice(0, this.maxSamples);
  }

  async terrain(
    geometry: PolygonCoordinates,
  ): Promise<Evidence<TerrainSummary> | Unresolved> {
    const points = this.samplePoints(geometry);
    const samples: TerrainSample[] = [];

    for (const p of points) {
      const elev = await this.fetchElevation(p.lng, p.lat);
      if (elev !== undefined) {
        samples.push({ lng: p.lng, lat: p.lat, elevationMeters: elev });
      }
    }

    return parseTerrain(samples, {
      retrievalDate: isoDate(this.now()),
      locator: this.baseUrl,
      subject: "the parcel",
    });
  }

  private async fetchElevation(
    lng: number,
    lat: number,
  ): Promise<number | undefined> {
    const url = this.buildUrl(lng, lat);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new UsgsTerrainError(
        `USGS EPQS request failed for (${lng}, ${lat})`,
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new UsgsTerrainError(
        `USGS EPQS returned HTTP ${response.status} for (${lng}, ${lat})`,
      );
    }

    let body: EpqsResponse;
    try {
      body = (await response.json()) as EpqsResponse;
    } catch (cause) {
      throw new UsgsTerrainError(
        `USGS EPQS returned non-JSON for (${lng}, ${lat})`,
        cause,
      );
    }

    return readEpqsElevation(body);
  }
}

function bbox(ring: number[][]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const v of ring) {
    if (v.length < 2) continue;
    minLng = Math.min(minLng, v[0]!);
    minLat = Math.min(minLat, v[1]!);
    maxLng = Math.max(maxLng, v[0]!);
    maxLat = Math.max(maxLat, v[1]!);
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** Ray-casting point-in-polygon on a single ring ([lng, lat] vertices). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function dedupe(
  points: { lng: number; lat: number }[],
): { lng: number; lat: number }[] {
  const seen = new Set<string>();
  const out: { lng: number; lat: number }[] = [];
  for (const p of points) {
    const key = `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function isoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
