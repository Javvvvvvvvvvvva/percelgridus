/**
 * RegridParcelProvider — a nationwide ParcelProvider backed by the Regrid
 * Parcels API (v2).
 *
 * This is the adapter that "breaks the wall" for coverage: one implementation,
 * ~150M parcels across all 50 states, because Regrid normalizes every county's
 * assessor record into one schema and one address/point API. Drop it into any
 * JurisdictionProfile in place of a bespoke county adapter and that
 * jurisdiction's parcels light up — no per-county GIS reverse-engineering.
 *
 * Requires an API token (Regrid is a paid service). The token travels in the
 * query string as Regrid's API expects, but it is stripped from the recorded
 * source locator so it never lands in a report, a log, or persisted provenance.
 * `fetchImpl` is injected for testing without network or a token; the pure
 * parser (parse-parcel) is fully fixture-tested. A live smoke test is opt-in on
 * REGRID_TOKEN (src/tests/integrations/regrid-parcels.live.test.ts).
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import type { ExternalIdentifier } from "../../jurisdiction/identifiers.js";
import type {
  GeoPoint,
  ParcelProvider,
  ParcelRecord,
} from "../../jurisdiction/providers.js";
import { REGRID_SYSTEM, parseRegridResponse } from "./parse-parcel.js";
import type { RegridParcelsResponse } from "./parcel-response.js";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface RegridParcelConfig {
  /** Regrid API token (required — Regrid is a paid service). */
  readonly token: string;
  /** Overridable for tests / mirrors. Defaults to the public v2 API. */
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://app.regrid.com/api/v2";

/** Thrown on transport/HTTP failures (distinct from a "no match" Unresolved). */
export class RegridParcelError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "RegridParcelError";
  }
}

export class RegridParcelProvider implements ParcelProvider {
  readonly id = "us-regrid-parcels";

  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: RegridParcelConfig) {
    if (!config.token || config.token.trim().length === 0) {
      throw new RegridParcelError("A Regrid API token is required.");
    }
    this.token = config.token;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      config.fetchImpl ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  private url(path: string, params: Record<string, string>): { full: string; locator: string } {
    const withToken = new URLSearchParams({ ...params, token: this.token });
    const redacted = new URLSearchParams({ ...params, token: "REDACTED" });
    const base = `${this.baseUrl}${path}`;
    return { full: `${base}?${withToken.toString()}`, locator: `${base}?${redacted.toString()}` };
  }

  private async fetchJson(full: string): Promise<RegridParcelsResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(full, { signal: controller.signal });
    } catch (cause) {
      throw new RegridParcelError("Regrid request failed", cause);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new RegridParcelError(`Regrid returned HTTP ${response.status}`);
    }
    try {
      return (await response.json()) as RegridParcelsResponse;
    } catch (cause) {
      throw new RegridParcelError("Regrid returned non-JSON", cause);
    }
  }

  private retrievalDate(): string {
    return this.now().toISOString().slice(0, 10);
  }

  async byPoint(point: GeoPoint): Promise<ParcelRecord | Unresolved> {
    const { full, locator } = this.url("/parcels/point", {
      lat: String(point.lat),
      lon: String(point.lng),
      // Ask for two so overlapping/stacked records surface as ambiguous. A
      // `limit=1` response cannot prove that the selected parcel is unique.
      limit: "2",
      return_geometry: "true",
      return_stacked: "true",
      return_zoning: "false",
      return_matched_buildings: "false",
    });
    const body = await this.fetchJson(full);
    return parseRegridResponse(body, { retrievalDate: this.retrievalDate(), locator }, `point (${point.lng}, ${point.lat})`);
  }

  async byAddress(normalizedAddress: string): Promise<ParcelRecord | Unresolved> {
    const { full, locator } = this.url("/parcels/address", {
      query: normalizedAddress,
      // Regrid address search can return similar addresses. Fetch a second
      // candidate so the parser can reject ambiguity instead of guessing.
      limit: "2",
      return_geometry: "true",
      return_zoning: "false",
      return_matched_buildings: "false",
    });
    const body = await this.fetchJson(full);
    return parseRegridResponse(body, { retrievalDate: this.retrievalDate(), locator }, normalizedAddress);
  }

  async byIdentifier(id: ExternalIdentifier): Promise<ParcelRecord | Unresolved> {
    // ll_uuid and path are distinct Regrid identifiers with distinct endpoints.
    // An assessor APN alone is not globally unique, so it is deliberately not
    // resolved here rather than guessing a parcel.
    const isRegrid = id.system === REGRID_SYSTEM;
    const isUuid = isRegrid && id.kind?.toLowerCase() === "ll_uuid";
    const isPath =
      isRegrid && (id.kind?.toLowerCase() === "path" || id.value.includes("/"));
    if (!isUuid && !isPath) {
      return unresolved(
        "parcel",
        "user",
        `Regrid resolves by its stable ll_uuid/path (or by point/address), not by ` +
          `the ${id.kind ?? "external"} identifier "${id.value}" alone; re-query by point or address.`,
      );
    }
    const { full, locator } = isUuid
      ? this.url(`/parcels/${encodeURIComponent(id.value)}`, {
          return_geometry: "true",
          return_zoning: "false",
          return_matched_buildings: "false",
        })
      : this.url("/parcels/path", {
          path: id.value,
          return_geometry: "true",
          return_zoning: "false",
          return_matched_buildings: "false",
        });
    const body = await this.fetchJson(full);
    return parseRegridResponse(
      body,
      { retrievalDate: this.retrievalDate(), locator },
      `${isUuid ? "ll_uuid" : "path"} ${id.value}`,
    );
  }
}
