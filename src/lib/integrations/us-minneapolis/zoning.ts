/**
 * MinneapolisZoningProvider — a ZoningEvidenceProvider backed by two official
 * City of Minneapolis layers:
 *   - "Planning Primary Zoning"  → the primary (use) district, e.g. "UN2";
 *   - "Zoning Built Form"        → the built form district (Chapter 540), e.g.
 *     "Interior 2", which governs the numeric envelope.
 *
 * What is sourced today: both DISTRICTS, each resolved as an official fact by a
 * polygon-intersects query (so a split-zoned lot is caught and returned
 * Unresolved rather than mis-picked). The by-right NUMERIC standards (FAR,
 * height, setbacks, lot coverage) are keyed by the built form district and come
 * from the Chapter 540 rule table (built-form-rules) — currently empty because
 * the ordinance text is not reachable from this environment, so those fields
 * surface as Unresolved. Allowed uses, parking, overlays, and discretionary
 * approvals are likewise Unresolved. A sourced rule, once added, flows through
 * as an unverified (approval-blocking) preliminary reference — never a legal
 * maximum (README-US §2 "no safe nationwide hard-coded zoning engine"; §4).
 *
 * `fetchImpl` is injected for testing without network and for a proxy-aware
 * fetch where egress is mediated. Live smoke test:
 * src/tests/integrations/minneapolis-zoning.live.test.ts (MPLS_ZONING_LIVE=1).
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import { isEvidence } from "../../jurisdiction/evidence.js";
import type { RuleCitation } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  DevelopmentIntent,
  PolygonCoordinates,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";
import type { BuiltFormQueryResponse } from "./built-form-response.js";
import {
  primaryCategoryFromDistrict,
  resolveNumericEnvelope,
} from "./built-form-rules.js";
import type {
  BuiltFormNumericEnvelope,
  ZoningUseClass,
} from "./built-form-rules.js";
import { parseBuiltFormDistrict } from "./parse-built-form.js";
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
  /** Overridable built form layer endpoint. */
  readonly builtFormBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/" +
  "Planning_Primary_Zoning/FeatureServer/0/query";
const DEFAULT_BUILT_FORM_URL =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/" +
  "Planning_Zoning_Built_Form/FeatureServer/0/query";

const PRIMARY_OUT_FIELDS = "Land_Use,Land_Use_Code";
const BUILT_FORM_OUT_FIELDS = "Built_Form,Abbrv";

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
  /** Both districts are sourced; by-right numeric rules are not yet seeded. */
  readonly parserVersion = "2026.08.0-district";

  private readonly baseUrl: string;
  private readonly builtFormBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: MinneapolisZoningConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.builtFormBaseUrl = config.builtFormBaseUrl ?? DEFAULT_BUILT_FORM_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /** Build a polygon-intersection query URL from parcel rings (WGS84). */
  private buildQueryUrl(
    baseUrl: string,
    geometry: PolygonCoordinates,
    outFields: string,
  ): string {
    const esriPolygon = JSON.stringify({
      rings: geometry,
      spatialReference: { wkid: 4326 },
    });
    const params = new URLSearchParams({
      geometry: esriPolygon,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      returnGeometry: "false",
      f: "json",
    });
    return `${baseUrl}?${params.toString()}`;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (cause) {
      throw new MinneapolisZoningError(
        "Minneapolis zoning request failed",
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new MinneapolisZoningError(
        `Minneapolis zoning returned HTTP ${response.status}`,
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new MinneapolisZoningError(
        "Minneapolis zoning returned non-JSON",
        cause,
      );
    }
  }

  async envelopeFor(
    identity: ParcelIdentity,
    geometry?: PolygonCoordinates,
    intent?: DevelopmentIntent,
  ): Promise<ByRightEnvelope> {
    const subject = identity.normalizedAddress ?? `site ${identity.siteId}`;

    // Both districts are spatial facts; without geometry neither resolves.
    if (geometry === undefined || geometry.length === 0) {
      return buildEnvelope(
        unresolved(
          "zoning district",
          ZONING_OWNER,
          `No parcel geometry supplied for ${subject}; resolve the parcel ` +
            `boundary first, then re-query the zoning districts.`,
        ),
      );
    }

    const retrievalDate = isoDate(this.now());
    const primaryUrl = this.buildQueryUrl(
      this.baseUrl,
      geometry,
      PRIMARY_OUT_FIELDS,
    );
    const builtFormUrl = this.buildQueryUrl(
      this.builtFormBaseUrl,
      geometry,
      BUILT_FORM_OUT_FIELDS,
    );

    const [primaryBody, builtFormBody] = await Promise.all([
      this.fetchJson(primaryUrl) as Promise<ZoningQueryResponse>,
      this.fetchJson(builtFormUrl) as Promise<BuiltFormQueryResponse>,
    ]);

    const district = parseZoningDistrict(primaryBody, {
      retrievalDate,
      locator: primaryUrl,
      subject,
    });
    const builtForm = parseBuiltFormDistrict(builtFormBody, {
      retrievalDate,
      locator: builtFormUrl,
      subject,
    });

    // Numeric standards are keyed by the built form district; only compute them
    // when that district resolved cleanly. Coverage and FAR additionally need
    // the primary district category (derived from the resolved primary
    // district) and, for FAR, the proposed use class.
    let numeric: BuiltFormNumericEnvelope | undefined;
    if (isEvidence(builtForm)) {
      const primaryCategory = isEvidence(district)
        ? primaryCategoryFromDistrict(district.value)
        : undefined;
      numeric = resolveNumericEnvelope({
        builtFormDistrict: builtForm.value,
        ...(primaryCategory !== undefined ? { primaryCategory } : {}),
        ...(normalizeUseClass(intent?.useClass) !== undefined
          ? { useClass: normalizeUseClass(intent?.useClass)! }
          : {}),
        retrievalDate,
        parserVersion: this.parserVersion,
        owner: ZONING_OWNER,
      });
    }

    return buildEnvelope(district, numeric);
  }

  citationFor(section: string): RuleCitation {
    return minneapolisCitation(section, this.parserVersion, isoDate(this.now()));
  }
}

const USE_CLASSES: readonly ZoningUseClass[] = [
  "single-family",
  "two-family",
  "three-family",
  "institutional-civic",
  "other",
];

/** Narrow the jurisdiction-agnostic intent string to a known use class. */
function normalizeUseClass(useClass?: string): ZoningUseClass | undefined {
  if (useClass === undefined) return undefined;
  const c = useClass.trim().toLowerCase();
  return USE_CLASSES.find((u) => u === c);
}
