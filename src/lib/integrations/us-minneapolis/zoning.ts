/**
 * MinneapolisZoningProvider — a ZoningEvidenceProvider backed by the City of
 * Minneapolis "Planning Primary Zoning" layer, the city's authoritative
 * primary-zoning-district dataset.
 *
 * What is sourced today is the zoning DISTRICT, resolved as an official fact by
 * a polygon-intersects query on the parcel geometry (so a split-zoned lot is
 * caught and returned Unresolved rather than mis-picked). The by-right NUMERIC
 * rules — FAR, height, setbacks, coverage, parking — plus allowed uses,
 * overlays, and discretionary approvals require the ordinance rule text, which
 * this adapter does not yet parse; they remain Unresolved and block approval
 * (README-US §2 "by-right reference, not legal maximum, until a professional
 * confirms"; §4 "missing evidence is visible product state"). Swapping in the
 * rule parser fills those fields in place with no downstream shape change.
 *
 * `fetchImpl` is injected for testing without network and for a proxy-aware
 * fetch where egress is mediated. Network note: the ArcGIS host is reachable
 * from an egress-allowlisted environment and the live smoke test
 * (src/tests/integrations/minneapolis-zoning.live.test.ts, gated on
 * MPLS_ZONING_LIVE=1) verifies the wire path; the default suite is offline.
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import type { RuleCitation } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  PolygonCoordinates,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";
import { buildEnvelope, parseZoningDistrict } from "./parse-zoning.js";
import type { ZoningQueryResponse } from "./zoning-response.js";
import {
  MINNEAPOLIS_JURISDICTION_ID,
  ZONING_OWNER,
  isoDate,
  minneapolisCitation,
} from "./zoning-shared.js";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MinneapolisZoningConfig {
  /** Overridable for tests / mirrors. Defaults to the public primary-zoning layer. */
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/" +
  "Planning_Primary_Zoning/FeatureServer/0/query";

const OUT_FIELDS = "Land_Use,Land_Use_Code";

/** Thrown on transport/HTTP failures (distinct from an Unresolved district). */
export class MinneapolisZoningError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "MinneapolisZoningError";
  }
}

export class MinneapolisZoningProvider implements ZoningEvidenceProvider {
  readonly id = "us-minneapolis-primary-zoning";
  readonly jurisdictionId = MINNEAPOLIS_JURISDICTION_ID;
  /** District is sourced; by-right rules are not yet parsed. */
  readonly parserVersion = "2026.08.0-district";

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: MinneapolisZoningConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** Build a polygon-intersection query URL from parcel rings (WGS84). */
  buildUrl(geometry: PolygonCoordinates): string {
    const esriPolygon = JSON.stringify({
      rings: geometry,
      spatialReference: { wkid: 4326 },
    });
    const params = new URLSearchParams({
      geometry: esriPolygon,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: OUT_FIELDS,
      returnGeometry: "false",
      f: "json",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  async envelopeFor(
    identity: ParcelIdentity,
    geometry?: PolygonCoordinates,
  ): Promise<ByRightEnvelope> {
    const subject = identity.normalizedAddress ?? `site ${identity.siteId}`;

    // Zoning district is a spatial fact; without geometry we cannot resolve it.
    if (geometry === undefined || geometry.length === 0) {
      return buildEnvelope(
        unresolved(
          "zoning district",
          ZONING_OWNER,
          `No parcel geometry supplied for ${subject}; resolve the parcel ` +
            `boundary first, then re-query the zoning district.`,
        ),
      );
    }

    const url = this.buildUrl(geometry);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new MinneapolisZoningError(
        "Minneapolis primary-zoning request failed",
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new MinneapolisZoningError(
        `Minneapolis primary-zoning returned HTTP ${response.status}`,
      );
    }

    let body: ZoningQueryResponse;
    try {
      body = (await response.json()) as ZoningQueryResponse;
    } catch (cause) {
      throw new MinneapolisZoningError(
        "Minneapolis primary-zoning returned non-JSON",
        cause,
      );
    }

    const district = parseZoningDistrict(body, {
      retrievalDate: isoDate(this.now()),
      locator: url,
      subject,
    });
    return buildEnvelope(district);
  }

  citationFor(section: string): RuleCitation {
    return minneapolisCitation(
      section,
      this.parserVersion,
      isoDate(this.now()),
    );
  }
}
