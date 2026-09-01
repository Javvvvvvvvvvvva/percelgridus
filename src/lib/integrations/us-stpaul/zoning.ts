/**
 * StPaulZoningProvider — a ZoningEvidenceProvider backed by the City of Saint
 * Paul "Principal Zoning" layer on ArcGIS Online.
 *
 * What is sourced today: the principal (use) DISTRICT, resolved as an official
 * fact by a polygon-intersects query (a split-zoned lot is caught and returned
 * Unresolved rather than mis-picked). The by-right NUMERIC standards, allowed
 * uses, overlays, and discretionary approvals require the Saint Paul Legislative
 * Code (Title VIII / Chapter 66), which is not parsed here — so they surface as
 * Unresolved. This is exactly the honesty boundary the Minneapolis adapter
 * started at; a sourced rule, once added, flows through as an unverified
 * (approval-blocking) preliminary reference.
 *
 * The geometry is sent in a POST body (never the URL) for the same reason the
 * Minneapolis and FEMA adapters do: a detailed parcel boundary overflows the
 * URL limit as a GET. `fetchImpl` is injected for testing without network.
 * Live smoke test: src/tests/integrations/stpaul-zoning.live.test.ts
 * (STPAUL_ZONING_LIVE=1).
 */

import type { RuleCitation } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  DevelopmentIntent,
  ParcelGeometryInput,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";
import { parcelGeometryRings } from "../../jurisdiction/providers.js";
import { unresolved } from "../../jurisdiction/evidence.js";
import {
  SAINT_PAUL_JURISDICTION_ID,
  ST_PAUL_ZONING_OWNER,
  buildStPaulEnvelope,
  parseStPaulZoningDistrict,
} from "./parse-zoning.js";
import type { StPaulZoningResponse } from "./zoning-response.js";

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

export interface StPaulZoningConfig {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://services1.arcgis.com/9meaaHE3uiba0zr8/arcgis/rest/services/" +
  "PrincipalZoning_TEST/FeatureServer/6/query";

const OUT_FIELDS = "Zoning,Zoning_Name,Zoning_Description";

/** Thrown on transport/HTTP failures (distinct from an Unresolved district). */
export class StPaulZoningError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "StPaulZoningError";
  }
}

export class StPaulZoningProvider implements ZoningEvidenceProvider {
  readonly id = "us-stpaul-principal-zoning";
  readonly jurisdictionId = SAINT_PAUL_JURISDICTION_ID;
  /** Only the district is sourced; by-right numeric rules are not yet seeded. */
  readonly parserVersion = "2026.08.0-district";

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: StPaulZoningConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl =
      config.fetchImpl ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  private queryBody(geometry: ParcelGeometryInput): string {
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

  private async fetchJson(body: string): Promise<unknown> {
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
      throw new StPaulZoningError("Saint Paul zoning request failed", cause);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new StPaulZoningError(
        `Saint Paul zoning returned HTTP ${response.status}`,
      );
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new StPaulZoningError("Saint Paul zoning returned non-JSON", cause);
    }
  }

  async envelopeFor(
    identity: ParcelIdentity,
    geometry?: ParcelGeometryInput,
    _intent?: DevelopmentIntent,
  ): Promise<ByRightEnvelope> {
    const subject = identity.normalizedAddress ?? `site ${identity.siteId}`;
    if (geometry === undefined || parcelGeometryRings(geometry).length === 0) {
      return buildStPaulEnvelope(
        unresolved(
          "zoning district",
          ST_PAUL_ZONING_OWNER,
          `No parcel geometry supplied for ${subject}; resolve the parcel ` +
            `boundary first, then re-query the zoning district.`,
        ),
      );
    }
    const retrievalDate = this.now().toISOString().slice(0, 10);
    const body = await this.fetchJson(this.queryBody(geometry));
    const district = parseStPaulZoningDistrict(body as StPaulZoningResponse, {
      retrievalDate,
      locator: this.baseUrl,
      subject,
    });
    return buildStPaulEnvelope(district);
  }

  citationFor(section: string): RuleCitation {
    return {
      jurisdictionId: SAINT_PAUL_JURISDICTION_ID,
      label: "Saint Paul Legislative Code",
      locator: "https://library.municode.com/mn/st._paul/codes/code_of_ordinances",
      ordinanceTitle: "Saint Paul Legislative Code, Title VIII (Zoning Code)",
      ordinanceSection: section,
      retrievalDate: this.now().toISOString().slice(0, 10),
      parserVersion: this.parserVersion,
    };
  }
}
