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
  JurisdictionRegistry,
} from "../jurisdiction/index.js";
import type {
  AddressProvider,
  ByRightEnvelope,
  DevelopmentIntent,
  Evidence,
  EvidenceOrUnresolved,
  FloodHazard,
  HazardProvider,
  JurisdictionProfile,
  NormalizedAddress,
  ParcelRecord,
  ParcelGeometry,
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
  /**
   * An already-normalized address, to skip re-geocoding. Set by the routed
   * entry point, which geocodes once to pick the jurisdiction and hands the
   * result straight through.
   */
  readonly preNormalized?: Evidence<NormalizedAddress>;
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
 * Run a provider call, degrading a THROWN transport/source failure to an
 * `Unresolved` rather than letting it abort the whole intake. A data source
 * that cannot be reached (timeout, 5xx, DNS) is a transient gap — approval-
 * blocking like any unresolved value, but explicitly a source failure to retry,
 * never a fabricated result and never a 500 that loses every other fact. The
 * pipeline's promise (README-US: missing evidence is visible product state) has
 * to hold for an unreachable source, not just a source that returns "no data".
 */
async function attemptOr<R>(
  run: () => Promise<R>,
  onError: (message: string) => R,
): Promise<R> {
  try {
    return await run();
  } catch (cause) {
    return onError(cause instanceof Error ? cause.message : String(cause));
  }
}

/** An Unresolved marking a data source that could not be reached this run. */
function sourceUnreachable(
  subject: string,
  owner: string,
  message: string,
): Unresolved {
  return unresolved(
    subject,
    owner,
    `The ${subject} data source could not be reached (${message}); this is a ` +
      `transient source failure, not a resolved value — retry, or resolve it ` +
      `manually before relying on this parcel.`,
  );
}

/**
 * A fully-unresolved by-right envelope, used when the zoning source itself
 * throws. Keeps the report shape intact (every field an honest gap) instead of
 * losing the whole analysis to one unreachable layer.
 */
function unreachableEnvelope(
  jurisdictionId: string,
  message: string,
): ByRightEnvelope {
  const gap = (subject: string): Unresolved =>
    sourceUnreachable(subject, "local zoning professional", message);
  return {
    jurisdictionId,
    zoningDistrict: gap("zoning district"),
    allowedUses: gap("allowed uses"),
    maxFar: gap("maximum floor area ratio"),
    maxLotCoverage: gap("maximum lot coverage"),
    maxHeight: gap("maximum height"),
    minSetbacks: gap("minimum setbacks (front/side/rear)"),
    minParkingStalls: gap("minimum parking stalls"),
    overlays: [gap("overlay districts")],
    discretionaryApprovals: [gap("discretionary approvals / special reviews")],
  };
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

  // 1. Normalize the address (unless the routed entry point already did).
  //    A thrown source failure degrades to Unresolved, not a crash.
  const address =
    opts.preNormalized ??
    (await attemptOr(
      () => profile.addressProvider.normalize(rawAddress),
      (m) => sourceUnreachable("address", "user", m),
    ));
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
  const parcel = await attemptOr(
    () => resolveParcel(profile, address.value),
    (m) => sourceUnreachable("parcel", "user", m),
  );
  if (isUnresolved(parcel)) {
    return {
      rawAddress,
      address,
      parcel,
      persisted: false,
      blockers: approvalBlockers([address, parcel]),
    };
  }

  const geometry: ParcelGeometry | undefined = isEvidence(parcel.geometry)
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
      ? await attemptOr(
          () => floodProvider.flood!(geometry),
          (m) => sourceUnreachable("flood hazard", "surveyor", m),
        )
      : noGeometry("flood hazard");

  const terrainProvider = hazardOf(profile, "terrain");
  const terrain: Evidence<TerrainSummary> | Unresolved =
    geometry && terrainProvider?.terrain
      ? await attemptOr(
          () => terrainProvider.terrain!(geometry),
          (m) => sourceUnreachable("terrain", "surveyor", m),
        )
      : noGeometry("terrain");

  const zoning = await attemptOr(
    () => profile.zoningProvider.envelopeFor(parcel.identity, geometry, opts.intent),
    (m) => unreachableEnvelope(profile.jurisdictionId, m),
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

// ─────────────────────── Multi-jurisdiction entry point ───────────────────────

export interface RoutedIntakeDeps {
  readonly registry: JurisdictionRegistry;
  readonly repository: SiteRepository;
  /** Shared geocoder used to pick the jurisdiction (Census works nationwide). */
  readonly addressProvider: AddressProvider;
}

export interface RoutedSiteDueDiligence extends SiteDueDiligence {
  /** The jurisdiction the address routed to, when one was found. */
  readonly jurisdictionId?: string;
  readonly jurisdictionName?: string;
}

/**
 * Multi-jurisdiction entry point: geocode the address once, route it to the
 * jurisdiction that serves it, then run intake with that profile (handing the
 * already-normalized address through so it is not geocoded twice). When no
 * registered jurisdiction covers the address, stop with an honest gap rather
 * than analyzing it under the wrong adapter — a wrong jurisdiction would attach
 * the wrong zoning and parcel sources.
 */
export async function intakeSiteRouted(
  rawAddress: string,
  deps: RoutedIntakeDeps,
  opts: IntakeOptions = {},
): Promise<RoutedSiteDueDiligence> {
  const address = await attemptOr(
    () => deps.addressProvider.normalize(rawAddress),
    (m) => sourceUnreachable("address", "user", m),
  );
  if (isUnresolved(address)) {
    return {
      rawAddress,
      address,
      persisted: false,
      blockers: approvalBlockers([address]),
    };
  }

  const profile = deps.registry.resolveByAddress(address.value.normalized);
  if (profile === undefined) {
    const gap = unresolved(
      "jurisdiction",
      "user",
      `No registered jurisdiction adapter serves "${address.value.normalized}". ` +
        `Register a profile for its state and city to analyze this address.`,
    );
    return {
      rawAddress,
      address,
      persisted: false,
      blockers: approvalBlockers([gap]),
    };
  }

  const dd = await intakeSite(
    rawAddress,
    { profile, repository: deps.repository },
    { ...opts, preNormalized: address },
  );
  return {
    ...dd,
    jurisdictionId: profile.jurisdictionId,
    jurisdictionName: profile.displayName,
  };
}
