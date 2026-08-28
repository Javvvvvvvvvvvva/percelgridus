/**
 * Site intake — the end-to-end due-diligence pipeline that ties the resolved
 * providers together for one parcel, from a raw address to a persisted,
 * decision-ready record.
 *
 * This is the MVP spine (README-US: "one pilot jurisdiction can process a real
 * parcel from address through a … decision report"). It orchestrates only; all
 * the facts come from the jurisdiction profile's providers, and every one
 * arrives wrapped in Evidence or surfaced as Unresolved — the pipeline never
 * invents a value or defaults a gap. The flow degrades honestly: if the address
 * can't be normalized, there is no point to look up a parcel for, and the result
 * says exactly that.
 *
 * Steps: normalize address → resolve parcel by point → (flood, terrain, zoning)
 * on the parcel geometry → persist the site under its UUID → collect the
 * approval blockers. Missing evidence at any step is a tracked gap, not a stop.
 *
 * Known limitation (parcel by point): the U.S. Census geocoder returns an
 * interpolated location that is often offset ~10–30 m from the lot and can land
 * just off a small residential parcel, so `byPoint` legitimately returns
 * Unresolved for many real addresses. The pipeline surfaces that honestly
 * (parcel Unresolved, nothing persisted) and never snaps to a neighboring lot —
 * a wrong parcel would attach the wrong owner/APN. The robust fix is a
 * parcel-by-address lookup against the county layer's own address attributes
 * (a future `ParcelProvider.byAddress`), not a geometric guess.
 */

import {
  approvalBlockers,
  isEvidence,
  isUnresolved,
  unresolved,
} from "../jurisdiction/index.js";
import type {
  ByRightEnvelope,
  DevelopmentIntent,
  Evidence,
  EvidenceOrUnresolved,
  FloodHazard,
  HazardProvider,
  JurisdictionProfile,
  NormalizedAddress,
  ParcelRecord,
  PolygonCoordinates,
  SiteId,
  TerrainSummary,
  Unresolved,
} from "../jurisdiction/index.js";
import type { SiteRepository } from "../persistence/index.js";

export interface IntakeDeps {
  readonly profile: JurisdictionProfile;
  readonly repository: SiteRepository;
}

export interface IntakeOptions {
  /** The proposed building, where a by-right standard depends on it (FAR). */
  readonly intent?: DevelopmentIntent;
}

/**
 * The assembled due-diligence for one intake attempt. Every fact field is
 * Evidence-or-Unresolved; `blockers` is the flattened list of everything that
 * blocks a representative-scenario approval.
 */
export interface SiteDueDiligence {
  readonly rawAddress: string;
  readonly address: Evidence<NormalizedAddress> | Unresolved;
  /** The parcel, once an address resolved to a point. */
  readonly parcel?: ParcelRecord | Unresolved;
  /** Persisted site UUID, once a parcel resolved. */
  readonly siteId?: SiteId;
  readonly flood?: Evidence<FloodHazard> | Unresolved;
  readonly terrain?: Evidence<TerrainSummary> | Unresolved;
  readonly zoning?: ByRightEnvelope;
  /** Whether the site was written to the repository. */
  readonly persisted: boolean;
  readonly blockers: readonly { subject: string; reason: string }[];
}

function hazardOf(
  profile: JurisdictionProfile,
  kind: "flood" | "terrain",
): HazardProvider | undefined {
  return profile.hazardProviders.find((h) => h.hazardKind === kind);
}

/**
 * Resolve the parcel, preferring the authoritative address match over the
 * interpolated geocoder point. Falls back to the point when the provider has no
 * `byAddress` or the address match doesn't resolve — never guesses a parcel.
 */
async function resolveParcel(
  profile: JurisdictionProfile,
  address: NormalizedAddress,
): Promise<ParcelRecord | Unresolved> {
  const provider = profile.parcelProvider;
  if (provider.byAddress) {
    const byAddr = await provider.byAddress(address.normalized);
    if (!isUnresolved(byAddr)) return byAddr;
  }
  return provider.byPoint(address.point);
}

/** Flatten a by-right envelope's evidence fields for the blocker sweep. */
function envelopeItems(
  env: ByRightEnvelope,
): readonly EvidenceOrUnresolved<unknown>[] {
  return [
    env.zoningDistrict,
    env.allowedUses,
    env.maxFar,
    env.maxLotCoverage,
    env.maxHeight,
    env.minSetbacks,
    env.minParkingStalls,
    ...env.overlays,
    ...env.discretionaryApprovals,
  ];
}

export async function intakeSite(
  rawAddress: string,
  deps: IntakeDeps,
  opts: IntakeOptions = {},
): Promise<SiteDueDiligence> {
  const { profile, repository } = deps;

  // 1. Normalize the address. Without it there is no point to proceed from.
  const address = await profile.addressProvider.normalize(rawAddress);
  if (isUnresolved(address)) {
    return {
      rawAddress,
      address,
      persisted: false,
      blockers: approvalBlockers([address]),
    };
  }

  // 2. Resolve the parcel. Prefer an authoritative address-attribute match
  //    (robust to the geocoder's point offset); fall back to the point only
  //    when the address match is unavailable or doesn't resolve.
  const parcel = await resolveParcel(profile, address.value);
  if (isUnresolved(parcel)) {
    return {
      rawAddress,
      address,
      parcel,
      persisted: false,
      blockers: approvalBlockers([address, parcel]),
    };
  }

  const geometry: PolygonCoordinates | undefined = isEvidence(parcel.geometry)
    ? parcel.geometry.value
    : undefined;

  // 3. Hazards + zoning on the parcel geometry. Without geometry, each is a
  //    tracked gap rather than a fabricated "no hazard" / guessed envelope.
  const noGeometry = (subject: string): Unresolved =>
    unresolved(
      subject,
      "surveyor",
      `The parcel geometry is unresolved, so ${subject} cannot be evaluated; ` +
        `resolve the parcel boundary first.`,
    );

  const floodProvider = hazardOf(profile, "flood");
  const flood: Evidence<FloodHazard> | Unresolved =
    geometry && floodProvider?.flood
      ? await floodProvider.flood(geometry)
      : noGeometry("flood hazard");

  const terrainProvider = hazardOf(profile, "terrain");
  const terrain: Evidence<TerrainSummary> | Unresolved =
    geometry && terrainProvider?.terrain
      ? await terrainProvider.terrain(geometry)
      : noGeometry("terrain");

  const zoning = await profile.zoningProvider.envelopeFor(
    parcel.identity,
    geometry,
    opts.intent,
  );

  // 4. Persist the site under its UUID (APN kept as a source record).
  repository.save({
    identity: parcel.identity,
    normalizedAddress: address.value.normalized,
  });

  // 5. Collect everything that blocks approval.
  const blockers = approvalBlockers([
    address,
    parcel.geometry,
    parcel.lotArea,
    parcel.ownerName,
    ...(parcel.existingBuildingFootprint !== undefined
      ? [parcel.existingBuildingFootprint]
      : []),
    flood,
    terrain,
    ...envelopeItems(zoning),
  ]);

  return {
    rawAddress,
    address,
    parcel,
    siteId: parcel.identity.siteId,
    flood,
    terrain,
    zoning,
    persisted: true,
    blockers,
  };
}
