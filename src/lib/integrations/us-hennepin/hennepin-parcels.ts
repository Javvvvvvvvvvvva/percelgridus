/**
 * HennepinParcelProvider — a ParcelProvider backed by Hennepin County GIS
 * (the "County Parcels" layer of the LAND_PROPERTY MapServer).
 *
 * Why the county, not an aggregator: PARCELGRID is provenance-first, and the
 * county assessor GIS is the *system of record* for Hennepin parcels —
 * Regrid/ATTOM re-publish county data downstream, so they lag and can diverge.
 * The county service is free and keyless, so it is live-verifiable end-to-end.
 *
 * `fetchImpl` is injected so the provider is testable without network and so a
 * proxy-aware fetch can be supplied where outbound egress is mediated. Node's
 * global `fetch` (undici) does not honor HTTPS_PROXY automatically; inject a
 * proxy-aware fetch via `fetchImpl` in a proxy-mediated environment.
 *
 * Network note: outbound HTTPS to gis.hennepin.us is reachable from an
 * environment whose egress policy allowlists that host, and the provider has
 * been live-verified end-to-end there (byPoint and byIdentifier). The pure
 * parser is fully fixture-tested and needs no network; the live smoke test
 * (src/tests/integrations/hennepin-parcels.live.test.ts) is opt-in, gated on
 * HENNEPIN_LIVE=1, so the default suite stays offline and hermetic.
 */

import type { IsoDate } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import { unresolved } from "../../jurisdiction/evidence.js";
import { newUuid } from "../../jurisdiction/identifiers.js";
import type { ExternalIdentifier, SiteId } from "../../jurisdiction/identifiers.js";
import type {
  GeoPoint,
  ParcelProvider,
  ParcelRecord,
} from "../../jurisdiction/providers.js";
import type { HennepinParcelResponse } from "./parcel-response.js";
import {
  parseAddressMatch,
  parseParcelResponse,
  parseUsAddress,
} from "./parse-parcel.js";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface HennepinParcelConfig {
  /** Overridable for tests / mirrors. Defaults to the public County Parcels layer. */
  readonly baseUrl?: string;
  /** Injected fetch; defaults to global fetch. */
  readonly fetchImpl?: FetchLike;
  /** Injected clock for retrievalDate; defaults to today (UTC date). */
  readonly now?: () => Date;
  /** Injected site-id factory; defaults to a fresh PARCELGRID UUID per lookup. */
  readonly newSiteId?: () => SiteId;
  /** Per-request timeout in ms. Default 10000. */
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1/query";

/** The attributes the parser reads; requested explicitly to keep payloads small. */
const OUT_FIELDS =
  "PID,PID_TEXT,OWNER_NM,HOUSE_NO,STREET_NM,MUNIC_NM,ZIP_CD,PARCEL_AREA,LAT,LON," +
  "BUILD_YR,SALE_DATE,SALE_PRICE,SALE_CODE_NAME,TAXABLE_VAL_TOT,TAX_TOT";

/** Thrown on transport/HTTP failures (distinct from a "no match" Unresolved). */
export class HennepinParcelError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "HennepinParcelError";
  }
}

export class HennepinParcelProvider implements ParcelProvider {
  readonly id = "us-hennepin-parcels";

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly newSiteId: () => SiteId;
  private readonly timeoutMs: number;

  constructor(config: HennepinParcelConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.newSiteId = config.newSiteId ?? (() => newUuid());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** Build a point-intersection query URL (geometry in WGS84 lng,lat). */
  buildPointUrl(point: GeoPoint): string {
    const params = new URLSearchParams({
      geometry: `${point.lng},${point.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: OUT_FIELDS,
      returnGeometry: "true",
      f: "json",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  /** Build a PID-equality query URL. */
  buildIdentifierUrl(pid: string): string {
    const params = new URLSearchParams({
      where: `PID='${escapeSqlLiteral(pid)}'`,
      outSR: "4326",
      outFields: OUT_FIELDS,
      returnGeometry: "true",
      f: "json",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  async byPoint(point: GeoPoint): Promise<ParcelRecord | Unresolved> {
    const url = this.buildPointUrl(point);
    const body = await this.fetchJson(url, `point (${point.lng}, ${point.lat})`);
    return parseParcelResponse(body, this.contextFor(url), `point (${point.lng}, ${point.lat})`);
  }

  async byIdentifier(id: ExternalIdentifier): Promise<ParcelRecord | Unresolved> {
    const url = this.buildIdentifierUrl(id.value);
    const label = `${id.kind ?? "id"} "${id.value}"`;
    const body = await this.fetchJson(url, label);
    return parseParcelResponse(body, this.contextFor(url), label);
  }

  /**
   * Build an address-attribute query URL. House number is exact; street and
   * municipality use a prefix LIKE to tolerate the layer's fixed-width padding.
   */
  buildAddressUrl(a: {
    houseNumber: number;
    streetName: string;
    municipality?: string;
  }): string {
    const clauses = [
      `HOUSE_NO=${a.houseNumber}`,
      `UPPER(STREET_NM) LIKE '${escapeSqlLiteral(a.streetName.toUpperCase())}%'`,
    ];
    if (a.municipality !== undefined) {
      clauses.push(
        `UPPER(MUNIC_NM) LIKE '${escapeSqlLiteral(a.municipality.toUpperCase())}%'`,
      );
    }
    const params = new URLSearchParams({
      where: clauses.join(" AND "),
      outSR: "4326",
      outFields: OUT_FIELDS,
      returnGeometry: "true",
      f: "json",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  async byAddress(
    normalizedAddress: string,
  ): Promise<ParcelRecord | Unresolved> {
    const parsed = parseUsAddress(normalizedAddress);
    if (parsed === undefined) {
      return unresolved(
        "parcel match",
        "user",
        `Could not parse a house number and street from "${normalizedAddress}"; ` +
          `look the parcel up by PID or a point instead.`,
      );
    }
    const url = this.buildAddressUrl(parsed);
    const label = `address "${normalizedAddress}"`;
    const body = await this.fetchJson(url, label);
    return parseAddressMatch(body, this.contextFor(url), label);
  }

  private contextFor(url: string): {
    siteId: SiteId;
    retrievalDate: IsoDate;
    locator: string;
  } {
    return {
      siteId: this.newSiteId(),
      retrievalDate: isoDate(this.now()),
      locator: url,
    };
  }

  private async fetchJson(
    url: string,
    subject: string,
  ): Promise<HennepinParcelResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new HennepinParcelError(
        `Hennepin parcel request failed for ${subject}`,
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new HennepinParcelError(
        `Hennepin parcel service returned HTTP ${response.status} for ${subject}`,
      );
    }

    try {
      return (await response.json()) as HennepinParcelResponse;
    } catch (cause) {
      throw new HennepinParcelError(
        `Hennepin parcel service returned non-JSON for ${subject}`,
        cause,
      );
    }
  }
}

/** Escape a single-quoted ArcGIS SQL literal (double any embedded quote). */
function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function isoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
