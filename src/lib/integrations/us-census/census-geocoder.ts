/**
 * CensusAddressProvider — an AddressProvider backed by the U.S. Census
 * Bureau Geocoder (README-US national baseline: address normalization and
 * census geography; not proof a structure or parcel exists).
 *
 * The Census geocoder is free, keyless, and public. `fetchImpl` is injected
 * so the provider is testable without network and so a proxy-aware fetch can
 * be supplied in environments where outbound egress is mediated.
 *
 * Network note: in the current session outbound HTTPS to
 * geocoding.geo.census.gov is blocked by egress policy. The pure parser is
 * fully tested against fixtures; a live end-to-end check requires the host to
 * be allowlisted.
 */

import type { IsoDate } from "../../jurisdiction/evidence.js";
import type { Evidence, Unresolved } from "../../jurisdiction/evidence.js";
import type {
  AddressProvider,
  NormalizedAddress,
} from "../../jurisdiction/providers.js";
import type { CensusGeocodeResponse } from "./geocoder-response.js";
import { parseOnelineAddress } from "./parse-onelineaddress.js";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface CensusGeocoderConfig {
  /** Overridable for tests / mirrors. Defaults to the public endpoint. */
  readonly baseUrl?: string;
  /** Address-matching benchmark, e.g. "Public_AR_Current". */
  readonly benchmark?: string;
  /** Geography vintage, e.g. "Current_Current". */
  readonly vintage?: string;
  /** Injected fetch; defaults to global fetch. */
  readonly fetchImpl?: FetchLike;
  /** Injected clock for retrievalDate; defaults to today (UTC date). */
  readonly now?: () => Date;
  /** Per-request timeout in ms. Default 10000. */
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const DEFAULT_BENCHMARK = "Public_AR_Current";
const DEFAULT_VINTAGE = "Current_Current";

/** Thrown on transport/HTTP failures (distinct from a "no match" Unresolved). */
export class CensusGeocoderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "CensusGeocoderError";
  }
}

export class CensusAddressProvider implements AddressProvider {
  readonly id = "us-census-geocoder";

  private readonly baseUrl: string;
  private readonly benchmark: string;
  private readonly vintage: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: CensusGeocoderConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.benchmark = config.benchmark ?? DEFAULT_BENCHMARK;
    this.vintage = config.vintage ?? DEFAULT_VINTAGE;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) =>
        (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  buildUrl(rawAddress: string): string {
    const params = new URLSearchParams({
      address: rawAddress,
      benchmark: this.benchmark,
      vintage: this.vintage,
      format: "json",
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  async normalize(
    rawAddress: string,
  ): Promise<Evidence<NormalizedAddress> | Unresolved> {
    const url = this.buildUrl(rawAddress);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new CensusGeocoderError(
        `Census geocoder request failed for "${rawAddress}"`,
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new CensusGeocoderError(
        `Census geocoder returned HTTP ${response.status} for "${rawAddress}"`,
      );
    }

    let body: CensusGeocodeResponse;
    try {
      body = (await response.json()) as CensusGeocodeResponse;
    } catch (cause) {
      throw new CensusGeocoderError(
        `Census geocoder returned non-JSON for "${rawAddress}"`,
        cause,
      );
    }

    return parseOnelineAddress(body, {
      input: rawAddress,
      retrievalDate: isoDate(this.now()),
      locator: url,
    });
  }
}

function isoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
