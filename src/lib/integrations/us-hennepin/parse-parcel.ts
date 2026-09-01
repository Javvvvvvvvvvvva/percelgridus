/**
 * Pure parser: Hennepin County ArcGIS parcel feature -> ParcelRecord.
 *
 * Kept separate from the HTTP layer so it is fully unit-testable against
 * fixtures with no network. All provenance is stamped here: a county parcel
 * record is official government data, machine-parsed, carrying its retrieval
 * date and the exact query URL as its locator.
 *
 * Provenance boundary (README-US §1, §4): the county parcel layer carries the
 * lot geometry, recorded area, and assessor owner name, but NOT existing
 * building footprints. That gap is returned as an explicit `Unresolved`, never
 * as an empty polygon a caller might read as "no building".
 *
 * The layer also carries assessor attributes — year built, last recorded sale,
 * total taxable value, and the actual annual property tax. These are surfaced
 * as optional official facts (present only when the source has a usable value;
 * a blank or zero is omitted, never asserted as $0). The sale price carries its
 * assessor sale-code, so a multi-parcel sale is never misread as this parcel's
 * clean price.
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { isEvidence, officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import { createParcelIdentity } from "../../jurisdiction/identifiers.js";
import type { SiteId } from "../../jurisdiction/identifiers.js";
import type {
  ParcelRecord,
  ParcelSale,
} from "../../jurisdiction/providers.js";
import {
  polygonGeometry,
} from "../../jurisdiction/providers.js";
import type { EvidenceOrUnresolved } from "../../jurisdiction/evidence.js";
import { Area, Money } from "../../units/index.js";
import type {
  HennepinParcelFeature,
  HennepinParcelResponse,
} from "./parcel-response.js";

/** The issuing system stamped onto the parcel's APN (a Hennepin PID). */
export const HENNEPIN_APN_SYSTEM = "hennepin-county";

export interface ParseParcelContext {
  /** The internal PARCELGRID site id minted for this lookup. */
  readonly siteId: SiteId;
  readonly retrievalDate: IsoDate;
  /** The full ArcGIS query URL, recorded as the source locator. */
  readonly locator: string;
}

/** Collapse ArcGIS fixed-width padding to a clean value, or undefined. */
function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** The house-number / street / municipality parts of a normalized address. */
export interface AddressComponents {
  readonly houseNumber: number;
  readonly streetName: string;
  readonly municipality?: string;
}

/**
 * Parse a Census-normalized one-line address ("3300 ALDRICH AVE S, MINNEAPOLIS,
 * MN, 55408") into the parts the Hennepin parcel layer keys on. Returns
 * `undefined` when there is no leading integer house number to key on (e.g. a
 * fractional or unit-only address) — the caller then falls back rather than
 * guessing. This is a locator parse, not a geocode: it never invents a street.
 */
export function parseUsAddress(
  normalized: string,
): AddressComponents | undefined {
  const parts = normalized.split(",");
  const houseStreet = (parts[0] ?? "").trim();
  const m = /^(\d+)\s+(.+)$/.exec(houseStreet);
  if (!m) return undefined;
  const houseNumber = Number(m[1]);
  const streetName = m[2]!.trim();
  if (!Number.isInteger(houseNumber) || streetName.length === 0) {
    return undefined;
  }
  const municipality = trimmed(parts[1]);
  return {
    houseNumber,
    streetName,
    ...(municipality !== undefined ? { municipality } : {}),
  };
}

/**
 * Assessor year built, when it is a plausible four-digit year at or before the
 * retrieval year. A blank, "0000", or out-of-range value yields undefined — the
 * field is simply absent rather than asserted.
 */
function parseYearBuilt(
  raw: string | undefined,
  src: SourceRef,
  retrievalDate: IsoDate,
): EvidenceOrUnresolved<number> | undefined {
  const t = trimmed(raw);
  if (t === undefined || !/^\d{4}$/.test(t)) return undefined;
  const year = Number(t);
  const currentYear = Number(retrievalDate.slice(0, 4));
  if (year < 1800 || year > currentYear + 1) return undefined;
  return officialFact(year, src, { confidence: "high" });
}

/** A positive whole-dollar amount as an official Money fact, else undefined. */
function parseMoneyFact(
  raw: number | undefined,
  src: SourceRef,
): EvidenceOrUnresolved<Money> | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return officialFact(Money.usd(String(raw)), src, { confidence: "high" });
}

/** Normalize a Hennepin `YYYYMM` sale date to `YYYY-MM`, else undefined. */
function normalizeSaleDate(raw: string | undefined): string | undefined {
  const t = trimmed(raw);
  if (t === undefined || !/^\d{6}$/.test(t)) return undefined;
  const month = Number(t.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}`;
}

/**
 * Last recorded sale, when there is both a usable date and a positive price.
 * The sale-code caveat is carried on the value AND echoed as the fact's note,
 * so a multi-parcel sale is never read as this parcel's clean price.
 */
function parseLastSale(
  attrs: HennepinParcelFeature["attributes"],
  src: SourceRef,
): EvidenceOrUnresolved<ParcelSale> | undefined {
  const a = attrs ?? {};
  const date = normalizeSaleDate(a.SALE_DATE);
  const price = a.SALE_PRICE;
  if (date === undefined || typeof price !== "number" || price <= 0) {
    return undefined;
  }
  const saleCode = trimmed(a.SALE_CODE_NAME);
  const sale: ParcelSale = {
    date,
    price: Money.usd(String(price)),
    ...(saleCode !== undefined ? { saleCode } : {}),
  };
  const fact = officialFact<ParcelSale>(sale, src, { confidence: "high" });
  return saleCode !== undefined ? { ...fact, note: saleCode } : fact;
}

function source(ctx: ParseParcelContext): SourceRef {
  return {
    label: "Hennepin County GIS — County Parcels",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

/**
 * Map a single ArcGIS parcel feature to a `ParcelRecord`. The caller has
 * already selected the feature (e.g. the one intersecting a point, or the
 * one matching a PID); this function does no selection, only translation.
 */
export function parseParcelFeature(
  feature: HennepinParcelFeature,
  ctx: ParseParcelContext,
): ParcelRecord {
  const attrs = feature.attributes ?? {};
  const src = source(ctx);

  const pid = trimmed(attrs.PID);
  const houseNo = attrs.HOUSE_NO;
  const street = trimmed(attrs.STREET_NM);
  const munic = trimmed(attrs.MUNIC_NM);
  const zip = trimmed(attrs.ZIP_CD);
  const normalizedAddress =
    houseNo !== undefined && street !== undefined
      ? [`${houseNo} ${street}`, munic, zip].filter(Boolean).join(", ")
      : undefined;

  const identity = createParcelIdentity({
    siteId: ctx.siteId,
    apns:
      pid !== undefined
        ? [{ system: HENNEPIN_APN_SYSTEM, value: pid, kind: "PID" }]
        : [],
    providerIds: [],
    ...(normalizedAddress !== undefined ? { normalizedAddress } : {}),
  });

  // Geometry — ArcGIS rings are already [lng, lat] in WGS84 (outSR=4326).
  const rings = feature.geometry?.rings;
  const geometry =
    rings && rings.length > 0
      ? officialFact(polygonGeometry(rings), src, { confidence: "high" })
      : unresolved(
          "parcel geometry",
          "user",
          `Hennepin parcel ${pid ?? "(unknown PID)"} returned no polygon. Re-query the parcel or confirm the identifier.`,
        );

  // Lot area — the assessor's recorded PARCEL_AREA, in square feet.
  const rawArea = attrs.PARCEL_AREA;
  const lotArea =
    typeof rawArea === "number" && Number.isFinite(rawArea) && rawArea > 0
      ? officialFact(Area.squareFeet(rawArea), src, { confidence: "high" })
      : unresolved(
          "lot area",
          "user",
          `Hennepin parcel ${pid ?? "(unknown PID)"} had no recorded area. Confirm from the survey or plat.`,
        );

  const owner = trimmed(attrs.OWNER_NM);
  const ownerName =
    owner !== undefined
      ? officialFact(owner, src, { confidence: "high" })
      : unresolved(
          "owner name",
          "user",
          `Hennepin parcel ${pid ?? "(unknown PID)"} had no owner on record. Confirm from the deed.`,
        );

  const yearBuilt = parseYearBuilt(attrs.BUILD_YR, src, ctx.retrievalDate);
  const assessedValue = parseMoneyFact(attrs.TAXABLE_VAL_TOT, src);
  const annualPropertyTax = parseMoneyFact(attrs.TAX_TOT, src);
  const lastSale = parseLastSale(attrs, src);

  // The assessor's year-built tells us whether a structure exists (relevant for a
  // redevelopment: a standing building means demolition), even though the county
  // parcel layer carries no footprint polygon. Say which we know and which we don't.
  const builtYear =
    yearBuilt !== undefined && isEvidence(yearBuilt) ? yearBuilt.value : undefined;
  const footprintNote =
    builtYear !== undefined
      ? `An existing structure is on record (built ${builtYear}, per the assessor); ` +
        `its footprint polygon is not in the county parcel layer. Source the footprint ` +
        `from the municipal building layer or a site survey to size demolition/reuse.`
      : "The county parcel layer carries no building footprint. Source it from the " +
        "municipal building layer or a site survey.";

  return {
    identity,
    geometry,
    lotArea,
    ownerName,
    // The county parcel layer does not carry building footprints; that is a
    // known gap, not an absence of a structure.
    existingBuildingFootprint: unresolved(
      "existing building footprint",
      "user",
      footprintNote,
      { blocksApproval: false },
    ),
    // Optional assessor facts — present only when the source has a usable value.
    ...(yearBuilt !== undefined ? { yearBuilt } : {}),
    ...(assessedValue !== undefined ? { assessedValue } : {}),
    ...(annualPropertyTax !== undefined ? { annualPropertyTax } : {}),
    ...(lastSale !== undefined ? { lastSale } : {}),
  };
}

/**
 * Pick the single parcel a query resolved to. Returns `Unresolved` when the
 * service reported an error or matched nothing, so a caller never mistakes an
 * empty result for a parcel. When more than one feature is returned the first
 * is used and the record is flagged via its geometry/area confidence upstream;
 * callers that need strict uniqueness should query by PID.
 */
export function parseParcelResponse(
  response: HennepinParcelResponse,
  ctx: ParseParcelContext,
  subject: string,
): ParcelRecord | Unresolved {
  if (response.error !== undefined) {
    return unresolved(
      "parcel lookup",
      "user",
      `Hennepin parcel service returned an error for ${subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }

  const features = response.features ?? [];
  if (features.length === 0) {
    return unresolved(
      "parcel match",
      "user",
      `No Hennepin parcel found for ${subject}. Confirm the point falls on a parcel, or the identifier is a valid Hennepin PID.`,
    );
  }

  return parseParcelFeature(features[0]!, ctx);
}

/**
 * Resolve an address query to a single parcel. Unlike {@link parseParcelResponse}
 * (which takes the first of a spatial match), this enforces uniqueness by PID:
 * more than one distinct parcel for an address is ambiguous — a duplicate
 * address across parcels — and returns `Unresolved` rather than picking one.
 * Several rows sharing one PID (a multi-address parcel) resolve to that parcel.
 */
export function parseAddressMatch(
  response: HennepinParcelResponse,
  ctx: ParseParcelContext,
  subject: string,
): ParcelRecord | Unresolved {
  if (response.error !== undefined) {
    return unresolved(
      "parcel lookup",
      "user",
      `Hennepin parcel service returned an error for ${subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }
  const features = response.features ?? [];
  if (features.length === 0) {
    return unresolved(
      "parcel match",
      "user",
      `No Hennepin parcel matched ${subject} by address; the address may be ` +
        `outside Minneapolis, or spelled differently in the county layer.`,
    );
  }
  const distinctPids = new Set(
    features.map((f) => trimmed(f.attributes?.PID)).filter((p) => p !== undefined),
  );
  if (distinctPids.size > 1) {
    return unresolved(
      "parcel match",
      "user",
      `${subject} matched more than one Hennepin parcel ` +
        `(${[...distinctPids].join(", ")}); resolve which parcel by PID.`,
    );
  }
  return parseParcelFeature(features[0]!, ctx);
}
