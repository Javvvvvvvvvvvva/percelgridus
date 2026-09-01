/**
 * MinneapolisZoningProvider — a ZoningEvidenceProvider backed by two official
 * City of Minneapolis layers:
 *   - "Planning Primary Zoning"  → the primary (use) district, e.g. "UN2";
 *   - "Zoning Built Form"        → the built form district (Chapter 540), e.g.
 *     "Interior 2", which governs the numeric envelope.
 *
 * What is sourced today: both DISTRICTS, each resolved as an official fact by a
 * polygon-intersects query (so a split-zoned lot is caught and returned
 * Unresolved rather than mis-picked). FAR, lot coverage, and height are keyed
 * by the built-form/primary district tables in `built-form-rules`; contextual
 * setbacks remain Unresolved. Selected residential uses (§ 545.100) and the
 * citywide-zero parking minimum (Chapter 541) are sourced; overlays (Ch. 551) are
 * resolved from the City overlay layer as spatial facts (a clean set of misses
 * resolves the field to "no overlays apply"); discretionary approvals stay
 * Unresolved. A sourced rule, once added, flows through
 * as an unverified (approval-blocking) preliminary reference — never a legal
 * maximum (README-US §2 "no safe nationwide hard-coded zoning engine"; §4).
 *
 * `fetchImpl` is injected for testing without network and for a proxy-aware
 * fetch where egress is mediated. Live smoke test:
 * src/tests/integrations/minneapolis-zoning.live.test.ts (MPLS_ZONING_LIVE=1).
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import { isEvidence } from "../../jurisdiction/evidence.js";
import type { RuleCitation, SourceRef } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  DevelopmentIntent,
  ParcelGeometryInput,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";
import { parcelGeometryRings } from "../../jurisdiction/providers.js";
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
import { resolveAllowedUses } from "./use-rules.js";
import { resolveMinParkingStalls } from "./parking-rules.js";
import {
  MINNEAPOLIS_OVERLAY_LAYERS,
  overlaysFromProbes,
  overlaysUnavailable,
} from "./overlays.js";
import type {
  OverlayCountResponse,
  OverlayLayer,
  OverlayProbe,
} from "./overlays.js";
import type { EvidenceOrUnresolved } from "../../jurisdiction/evidence.js";
import type { ZoningQueryResponse } from "./zoning-response.js";
import {
  MINNEAPOLIS_JURISDICTION_ID,
  ZONING_OWNER,
  isoDate,
  minneapolisCitation,
} from "./zoning-shared.js";

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

export interface MinneapolisZoningConfig {
  /** Overridable for tests / mirrors. Defaults to the public primary-zoning layer. */
  readonly baseUrl?: string;
  /** Overridable built form layer endpoint. */
  readonly builtFormBaseUrl?: string;
  /** Overridable overlay FeatureServer (its sublayers are queried per overlay). */
  readonly overlayBaseUrl?: string;
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
/** The overlay FeatureServer root; each Chapter 551 sublayer is queried under it. */
const DEFAULT_OVERLAY_BASE_URL =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/" +
  "Planning_Zoning_Overlay/FeatureServer";

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
  /** Districts plus the currently supported Chapter 540/541/545/551 rules. */
  readonly parserVersion = "2026.09.0-envelope";

  private readonly baseUrl: string;
  private readonly builtFormBaseUrl: string;
  private readonly overlayBaseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(config: MinneapolisZoningConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.builtFormBaseUrl = config.builtFormBaseUrl ?? DEFAULT_BUILT_FORM_URL;
    this.overlayBaseUrl = config.overlayBaseUrl ?? DEFAULT_OVERLAY_BASE_URL;
    const injected = config.fetchImpl;
    this.fetchImpl =
      injected ??
      ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.now = config.now ?? (() => new Date());
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /**
   * Build a polygon-intersection query as a form-encoded POST body from parcel
   * rings (WGS84). The geometry goes in the body, never the URL: a detailed
   * parcel boundary (a lakefront or riverfront lot with many vertices) overflows
   * the server's URL/header limits as a GET and returns HTTP 414/431, which
   * would abort the whole analysis.
   */
  private queryBody(geometry: ParcelGeometryInput, outFields: string): string {
    const esriPolygon = JSON.stringify({
      rings: parcelGeometryRings(geometry),
      spatialReference: { wkid: 4326 },
    });
    return new URLSearchParams({
      geometry: esriPolygon,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields,
      returnGeometry: "false",
      f: "json",
    }).toString();
  }

  /**
   * Build a count-only polygon-intersection query body for one overlay sublayer.
   * Presence (count > 0) is all the overlay resolution needs; the overlay's
   * name comes from the transcribed sublayer set, so no attributes are fetched.
   *
   * The `SYMBOL_NAM IS NOT NULL` filter is essential, not cosmetic: the
   * Floodplain sublayer carries FIRM-panel BACKGROUND polygons (the Zone X
   * "minimal hazard" coverage that blankets most of the city) as features with
   * a null designation, so a bare intersects-count would false-positive nearly
   * every parcel into a floodplain overlay. Requiring a non-null designation
   * name keeps only genuine overlay features; the clean sublayers all populate
   * SYMBOL_NAM, so the filter is harmless there.
   */
  private overlayCountBody(geometry: ParcelGeometryInput): string {
    const esriPolygon = JSON.stringify({
      rings: parcelGeometryRings(geometry),
      spatialReference: { wkid: 4326 },
    });
    return new URLSearchParams({
      geometry: esriPolygon,
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      where: "SYMBOL_NAM IS NOT NULL",
      returnCountOnly: "true",
      f: "json",
    }).toString();
  }

  /**
   * Probe every Chapter 551 overlay sublayer for intersection with the parcel.
   * Returns one official/machine-parsed fact per overlay that applies (possibly
   * an empty, non-blocking list — "no overlay districts apply"). Degrades to a
   * single Unresolved gap if any sublayer query fails, so the absence of an
   * overlay is never asserted without having checked.
   */
  private async resolveOverlays(
    geometry: ParcelGeometryInput,
    retrievalDate: string,
  ): Promise<readonly EvidenceOrUnresolved<string>[]> {
    const source: SourceRef = {
      label: "City of Minneapolis — Planning Zoning Overlay",
      locator: this.overlayBaseUrl,
      retrievalDate,
    };
    try {
      const body = this.overlayCountBody(geometry);
      const probes = await Promise.all(
        MINNEAPOLIS_OVERLAY_LAYERS.map(
          async (layer: OverlayLayer): Promise<OverlayProbe> => {
            const url = `${this.overlayBaseUrl}/${layer.layerId}/query`;
            const response = (await this.fetchJson(
              url,
              body,
            )) as OverlayCountResponse;
            return { name: layer.name, response };
          },
        ),
      );
      return overlaysFromProbes(probes, source);
    } catch (cause) {
      return overlaysUnavailable(
        cause instanceof Error ? cause.message : "overlay query failed",
      );
    }
  }

  /** GET `url`, or POST `body` (form-encoded) when supplied. */
  private async fetchJson(url: string, body?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, {
        signal: controller.signal,
        ...(body !== undefined
          ? {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            }
          : {}),
      });
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
    geometry?: ParcelGeometryInput,
    intent?: DevelopmentIntent,
  ): Promise<ByRightEnvelope> {
    const subject = identity.normalizedAddress ?? `site ${identity.siteId}`;

    // Both districts are spatial facts; without geometry neither resolves.
    if (geometry === undefined || parcelGeometryRings(geometry).length === 0) {
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
    const primaryBodyReq = this.queryBody(geometry, PRIMARY_OUT_FIELDS);
    const builtFormBodyReq = this.queryBody(geometry, BUILT_FORM_OUT_FIELDS);

    // Districts and overlays are all spatial queries; run them concurrently.
    // Each posts its geometry in the request body (never the URL), so a detailed
    // parcel boundary cannot overflow the URL limit. resolveOverlays never
    // throws (it degrades to an Unresolved gap), so a flaky overlay sublayer
    // cannot fail the district resolution.
    const [primaryBody, builtFormBody, overlays] = await Promise.all([
      this.fetchJson(this.baseUrl, primaryBodyReq) as Promise<ZoningQueryResponse>,
      this.fetchJson(
        this.builtFormBaseUrl,
        builtFormBodyReq,
      ) as Promise<BuiltFormQueryResponse>,
      this.resolveOverlays(geometry, retrievalDate),
    ]);

    const district = parseZoningDistrict(primaryBody, {
      retrievalDate,
      locator: this.baseUrl,
      subject,
    });
    const builtForm = parseBuiltFormDistrict(builtFormBody, {
      retrievalDate,
      locator: this.builtFormBaseUrl,
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

    // Allowed uses come from the primary (use) district, § 545.100.
    let allowedUses: EvidenceOrUnresolved<readonly string[]> | undefined;
    if (isEvidence(district)) {
      allowedUses = resolveAllowedUses(district.value, {
        retrievalDate,
        parserVersion: this.parserVersion,
      });
    }

    // Minimum off-street parking is citywide-zero (Chapter 541 reform), so it
    // resolves independently of the district or use — the same for every parcel.
    const minParkingStalls = resolveMinParkingStalls({
      retrievalDate,
      parserVersion: this.parserVersion,
    });

    return buildEnvelope(district, numeric, {
      ...(allowedUses !== undefined ? { allowedUses } : {}),
      minParkingStalls,
      overlays,
    });
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
