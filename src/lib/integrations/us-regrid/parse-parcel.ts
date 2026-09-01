/**
 * Pure parser: a Regrid parcel feature -> ParcelRecord.
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network and no API token. All provenance is stamped here:
 * a Regrid parcel is licensed, third-party aggregated data (a normalized
 * mirror of the county assessor record), so it uses the project's
 * `official`/`machine-parsed` provider-data provenance while carrying its
 * retrieval date and the token-stripped request URL as its locator.
 *
 * Field presence varies by county; each fact is emitted only when Regrid
 * carries a usable value, and a blank / zero is omitted rather than asserted as
 * $0 — the same discipline the Hennepin adapter follows.
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { EvidenceOrUnresolved, Unresolved } from "../../jurisdiction/evidence.js";
import { createParcelIdentity } from "../../jurisdiction/identifiers.js";
import type { SiteId } from "../../jurisdiction/identifiers.js";
import type {
  ParcelRecord,
  ParcelSale,
  ParcelGeometry,
  PolygonCoordinates,
  MultiPolygonCoordinates,
} from "../../jurisdiction/providers.js";
import { Area, Money } from "../../units/index.js";
import type {
  RegridFeature,
  RegridFields,
  RegridParcelsResponse,
} from "./parcel-response.js";

/** The provider system stamped onto Regrid identifiers. */
export const REGRID_SYSTEM = "regrid";
const SQFT_PER_ACRE = 43_560;

export interface ParseRegridContext {
  readonly siteId?: SiteId;
  readonly retrievalDate: IsoDate;
  /** The request URL WITHOUT the token, recorded as the source locator. */
  readonly locator: string;
}

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function source(ctx: ParseRegridContext): SourceRef {
  return {
    label: "Regrid — nationwide parcel data",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

/** Validate and preserve GeoJSON Polygon/MultiPolygon geometry in WGS84. */
function toGeometry(geometry: RegridFeature["geometry"]): ParcelGeometry | undefined {
  if (!geometry || geometry.coordinates == null) return undefined;
  const coords = geometry.coordinates as unknown;
  const isRing = (r: unknown): r is number[][] =>
    Array.isArray(r) &&
    r.length >= 4 &&
    r.every(
      (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number",
    );
  const isPolygon = (g: unknown): g is number[][][] =>
    Array.isArray(g) && g.length > 0 && isRing(g[0]);
  if (geometry.type === "MultiPolygon") {
    const polygons = Array.isArray(coords) ? coords : [];
    return polygons.length > 0 && polygons.every(isPolygon)
      ? { type: "MultiPolygon", coordinates: polygons as MultiPolygonCoordinates }
      : undefined;
  }
  return geometry.type === "Polygon" && isPolygon(coords)
    ? { type: "Polygon", coordinates: coords as PolygonCoordinates }
    : undefined;
}

function yearBuiltFact(
  raw: number | string | undefined,
  src: SourceRef,
  retrievalDate: IsoDate,
): EvidenceOrUnresolved<number> | undefined {
  const n = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof n !== "number" || !Number.isInteger(n)) return undefined;
  const currentYear = Number(retrievalDate.slice(0, 4));
  if (n < 1800 || n > currentYear + 1) return undefined;
  return officialFact(n, src, { confidence: "high" });
}

function moneyFact(
  raw: number | undefined,
  src: SourceRef,
): EvidenceOrUnresolved<Money> | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return officialFact(Money.usd(String(raw)), src, { confidence: "high" });
}

/** Regrid saledate is typically YYYY-MM-DD; keep YYYY-MM-DD or YYYY-MM, else undefined. */
function normalizeSaleDate(raw: string | undefined): string | undefined {
  const t = trimmed(raw);
  if (t === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(t);
  if (!m) return undefined;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return undefined;
  return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
}

function saleFact(
  fields: RegridFields,
  src: SourceRef,
): EvidenceOrUnresolved<ParcelSale> | undefined {
  const date = normalizeSaleDate(fields.saledate);
  const price = fields.saleprice;
  if (date === undefined || typeof price !== "number" || price <= 0) return undefined;
  const sale: ParcelSale = { date, price: Money.usd(String(price)) };
  return officialFact<ParcelSale>(sale, src, { confidence: "high" });
}

function lotArea(fields: RegridFields, src: SourceRef): EvidenceOrUnresolved<Area> {
  const sqft =
    typeof fields.ll_gissqft === "number" && fields.ll_gissqft > 0
      ? fields.ll_gissqft
      : typeof fields.ll_gisacre === "number" && fields.ll_gisacre > 0
        ? fields.ll_gisacre * SQFT_PER_ACRE
        : typeof fields.gisacre === "number" && fields.gisacre > 0
          ? fields.gisacre * SQFT_PER_ACRE
          : undefined;
  return sqft !== undefined
    ? officialFact(Area.squareFeet(String(Math.round(sqft))), src, { confidence: "high" })
    : unresolved(
        "lot area",
        "user",
        "Regrid returned no GIS area for this parcel. Confirm from the survey or plat.",
      );
}

/** Map one Regrid feature to a ParcelRecord (the caller has already selected it). */
export function parseRegridFeature(
  feature: RegridFeature,
  ctx: ParseRegridContext,
): ParcelRecord {
  const fields = feature.properties?.fields ?? {};
  const src = source(ctx);

  const apn = trimmed(fields.parcelnumb);
  const llUuid = trimmed(fields.ll_uuid);
  const path = trimmed(fields.path) ?? trimmed(feature.properties?.path);
  const address = trimmed(fields.address);

  const identity = createParcelIdentity({
    ...(ctx.siteId !== undefined ? { siteId: ctx.siteId } : {}),
    apns: apn !== undefined ? [{ system: REGRID_SYSTEM, value: apn, kind: "APN" }] : [],
    providerIds: [
      ...(llUuid !== undefined
        ? [{ system: REGRID_SYSTEM, value: llUuid, kind: "ll_uuid" }]
        : []),
      ...(path !== undefined
        ? [{ system: REGRID_SYSTEM, value: path, kind: "path" }]
        : []),
    ],
    ...(address !== undefined ? { normalizedAddress: address } : {}),
  });

  const parsedGeometry = toGeometry(feature.geometry);
  const geometry =
    parsedGeometry !== undefined
      ? officialFact<ParcelGeometry>(parsedGeometry, src, { confidence: "high" })
      : unresolved(
          "parcel geometry",
          "user",
          `Regrid parcel ${apn ?? llUuid ?? path ?? "(unknown)"} returned no polygon; re-query or confirm the identifier.`,
        );

  const owner = trimmed(fields.owner);
  const ownerName =
    owner !== undefined
      ? officialFact(owner, src, { confidence: "high" })
      : unresolved("owner name", "user", "Regrid returned no owner for this parcel; confirm from the deed.");

  const yearBuilt = yearBuiltFact(fields.yearbuilt, src, ctx.retrievalDate);
  const assessedValue = moneyFact(fields.parval, src);
  const annualPropertyTax = moneyFact(fields.taxamt, src);
  const lastSale = saleFact(fields, src);

  return {
    identity,
    geometry,
    lotArea: lotArea(fields, src),
    ownerName,
    ...(yearBuilt !== undefined ? { yearBuilt } : {}),
    ...(assessedValue !== undefined ? { assessedValue } : {}),
    ...(annualPropertyTax !== undefined ? { annualPropertyTax } : {}),
    ...(lastSale !== undefined ? { lastSale } : {}),
  };
}

/** Pick the single parcel a Regrid query resolved to, or an Unresolved. */
export function parseRegridResponse(
  response: RegridParcelsResponse,
  ctx: ParseRegridContext,
  subject: string,
): ParcelRecord | Unresolved {
  if (response.error !== undefined) {
    const message =
      typeof response.error === "string" ? response.error : response.error.message ?? "unknown error";
    return unresolved("parcel lookup", "user", `Regrid returned an error for ${subject}: ${message}.`);
  }
  const features = response.parcels?.features ?? [];
  if (features.length === 0) {
    return unresolved(
      "parcel match",
      "user",
      `No Regrid parcel found for ${subject}. Confirm the point/address falls on a parcel Regrid covers.`,
    );
  }
  if (features.length > 1) {
    return unresolved(
      "parcel match",
      "user",
      `Regrid returned multiple parcels for ${subject}. Select a parcel explicitly ` +
        `by its Regrid ll_uuid/path instead of accepting an arbitrary first result.`,
    );
  }
  return parseRegridFeature(features[0]!, ctx);
}
