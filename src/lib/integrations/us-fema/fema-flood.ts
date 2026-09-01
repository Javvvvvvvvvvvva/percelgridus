/**
 * FemaFloodProvider — a HazardProvider (flood) backed by the FEMA National
 * Flood Hazard Layer (NFHL), the authoritative federal flood-map dataset.
 *
 * The parcel geometry is queried directly (polygon-intersects) so a lot that
 * straddles a flood boundary is caught; the pure parser aggregates the
 * intersecting zones worst-case. The query is issued as a POST with the
 * geometry in the request body — a detailed parcel boundary (many vertices, as
 * a lakefront or riverfront lot has) overflows the server's URL/header limits
 * as a GET and returns HTTP 414/431, which would abort the whole analysis.
 * `fetchImpl` is injected for testing without network and for a proxy-aware
 * fetch where egress is mediated.
 *
 * Network note: outbound HTTPS to hazards.fema.gov is reachable from an
 * environment whose egress policy allowlists that host, and the provider has
 * been live-verified end-to-end there. The pure parser is fully fixture-tested
 * and needs no network; the live smoke test
 * (src/tests/integrations/fema-flood.live.test.ts) is opt-in, gated on
 * FEMA_LIVE=1, so the default suite stays offline and hermetic.
 */

import type { IsoDate } from "../../jurisdiction/evidence.js";
import type { Evidence, Unresolved } from "../../jurisdiction/evidence.js";
import type {
  FloodHazard,
  HazardProvider,
  ParcelGeometryInput,
} from "../../jurisdiction/providers.js";
import { parcelGeometryRings } from "../../jurisdiction/providers.js";
import type { NfhlResponse } from "./nfhl-response.js";
import { parseFloodZones } from "./parse-flood.js";

interface FetchInit {
  readonly signal?: AbortSignal;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

type FetchLike = (
  url: string,
  init?: FetchInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface FemaFloodConfig {
  /** Overridable for tests / mirrors. Defaults to the public NFHL layer 28. */
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const OUT_FIELDS = "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID";

/** Thrown on transport/HTTP failures (distinct from a "no zone" Unresolved). */
export class FemaFloodError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "FemaFloodError";
  }
}

export class FemaFloodProvider implements HazardProvider {
  readonly id = "us-fema-nfhl";
  readonly hazardKind = "flood" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: FemaFloodConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /**
   * Build the polygon-intersection query as a form-encoded body from parcel
   * rings (WGS84). The geometry is sent in the POST body, never the URL: a
   * detailed parcel boundary (a lakefront or riverfront lot with many vertices)
   * overflows the server's URL/header limits and returns HTTP 414/431, which
   * would abort the whole site analysis. A POST body has no such limit.
   */
  queryBody(geometry: ParcelGeometryInput): string {
    const esriPolygon = JSON.stringify({
      rings: parcelGeometryRings(geometry),
      spatialReference: { wkid: 4326 },
    });
    return new URLSearchParams({
      geometry: esriPolygon,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: OUT_FIELDS,
      returnGeometry: "false",
      f: "json",
    }).toString();
  }

  async flood(
    geometry: ParcelGeometryInput,
  ): Promise<Evidence<FloodHazard> | Unresolved> {
    const body = this.queryBody(geometry);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (cause) {
      throw new FemaFloodError("FEMA NFHL request failed", cause);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new FemaFloodError(
        `FEMA NFHL returned HTTP ${response.status}`,
      );
    }

    let responseBody: NfhlResponse;
    try {
      responseBody = (await response.json()) as NfhlResponse;
    } catch (cause) {
      throw new FemaFloodError("FEMA NFHL returned non-JSON", cause);
    }

    return parseFloodZones(responseBody, {
      retrievalDate: isoDate(this.now()),
      locator: this.baseUrl,
      subject: "the parcel",
    });
  }
}

function isoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
