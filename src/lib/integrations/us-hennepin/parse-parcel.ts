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
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import { createParcelIdentity } from "../../jurisdiction/identifiers.js";
import type { SiteId } from "../../jurisdiction/identifiers.js";
import type {
  ParcelRecord,
  PolygonCoordinates,
} from "../../jurisdiction/providers.js";
import { Area } from "../../units/index.js";
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
      ? officialFact<PolygonCoordinates>(rings, src, { confidence: "high" })
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
      "The county parcel layer carries no building footprint. Source it from the municipal building layer or a site survey.",
      { blocksApproval: false },
    ),
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
