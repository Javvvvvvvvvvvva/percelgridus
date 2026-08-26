/**
 * Identifiers — internal keys vs. source records.
 *
 * README-US contract: "The internal project ID must be a PARCELGRID UUID.
 * APN, assessor parcel ID, provider IDs, and addresses are source records,
 * not universal primary keys."
 *
 * This replaces the Korean prototype's PNU-as-parcel-id coupling
 * (`projects.parcel_id = "1132010500102810023"`). In the U.S. profile the
 * primary key is an opaque UUID and every external identifier is carried
 * beside it as attributed source data — because APNs are reassigned on lot
 * splits/merges, differ across county systems, and are not unique across
 * jurisdictions.
 */

/** Branded UUID so a raw string can't be passed where an internal id is required. */
export type Uuid = string & { readonly __brand: "PARCELGRID-UUID" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asUuid(value: string): Uuid {
  if (!UUID_RE.test(value)) {
    throw new Error(`Not a valid PARCELGRID UUID: ${value}`);
  }
  return value as Uuid;
}

export function newUuid(): Uuid {
  return crypto.randomUUID() as Uuid;
}

/** The internal, universal key for a site. Never an APN or address. */
export type SiteId = Uuid;
export type ProjectId = Uuid;
export type ScenarioId = Uuid;

/**
 * A raw external identifier, kept as an attributed source record. Which
 * `system` issued it matters: an APN is only meaningful within its county.
 */
export interface ExternalIdentifier {
  /** Issuing system, e.g. "hennepin-county-assessor", "regrid", "attom". */
  readonly system: string;
  /** The identifier as the source expresses it, unmodified. */
  readonly value: string;
  /** Optional label of the identifier type, e.g. "APN", "PID", "FIPS". */
  readonly kind?: string;
}

/**
 * The set of source-record identifiers attached to a site. The internal
 * `siteId` is authoritative; everything else is provenance-bearing external
 * data that may change, conflict, or be absent.
 */
export interface ParcelIdentity {
  readonly siteId: SiteId;
  /** County assessor's parcel number(s). Plural: splits/merges happen. */
  readonly apns: readonly ExternalIdentifier[];
  /** Data-provider record ids (Regrid, ATTOM, ...). */
  readonly providerIds: readonly ExternalIdentifier[];
  /** Normalized address string (a locator, not a key). */
  readonly normalizedAddress?: string;
}

export function createParcelIdentity(
  init: Omit<ParcelIdentity, "siteId"> & { siteId?: SiteId },
): ParcelIdentity {
  return {
    siteId: init.siteId ?? newUuid(),
    apns: init.apns,
    providerIds: init.providerIds,
    ...(init.normalizedAddress !== undefined
      ? { normalizedAddress: init.normalizedAddress }
      : {}),
  };
}

export function findIdentifier(
  identity: ParcelIdentity,
  system: string,
): ExternalIdentifier | undefined {
  return (
    identity.apns.find((i) => i.system === system) ??
    identity.providerIds.find((i) => i.system === system)
  );
}
