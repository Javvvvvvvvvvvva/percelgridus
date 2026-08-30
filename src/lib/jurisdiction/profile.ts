/**
 * JurisdictionProfile — the single object that pins a project to a country,
 * a jurisdiction, and the providers that supply its evidence.
 *
 * Expanded from the README-US "Proposed adapter boundary" sketch. Everything
 * country-specific in the Korean prototype (identifiers, geocoding, units,
 * currency, zoning rules, hazards, finance/tax defaults) is reached only
 * through this profile, so the reusable core (geometry, ledger, exports,
 * handoff) never names a country.
 */

import type { UnitProfile } from "../units/index.js";
import type {
  AddressProvider,
  FinanceAssumptionProfile,
  HazardProvider,
  ParcelProvider,
  TaxEstimateProfile,
  ZoningEvidenceProvider,
} from "./providers.js";

export interface JurisdictionProfile {
  readonly countryCode: "US";
  /** USPS state code, e.g. "MN". */
  readonly stateCode: string;
  /** Stable internal id, e.g. "us-mn-hennepin-minneapolis". */
  readonly jurisdictionId: string;
  /** Human label, e.g. "Minneapolis, Hennepin County, MN". */
  readonly displayName: string;

  /**
   * Lowercased place (city) names this profile serves, used to route an address
   * to its jurisdiction. Several spellings of one city are allowed (e.g.
   * "saint paul", "st paul", "st. paul"). A profile with no place names is not
   * address-routable — it can still be fetched by id.
   */
  readonly placeNames?: readonly string[];

  readonly units: UnitProfile;
  readonly addressProvider: AddressProvider;
  readonly parcelProvider: ParcelProvider;
  readonly zoningProvider: ZoningEvidenceProvider;
  readonly hazardProviders: readonly HazardProvider[];
  readonly financeProfile: FinanceAssumptionProfile;
  readonly taxProfile: TaxEstimateProfile;
}

/**
 * Split a Census-normalized one-line address into its USPS state code and city.
 * The Census normalized form is "STREET, CITY, ST, ZIP" (the state part may be
 * "ST" or "ST 55415"); both are handled. Returns lowercased city and uppercased
 * state, or `undefined` parts when they cannot be found — never a guess.
 */
export function parseStateCity(normalizedAddress: string): {
  readonly stateCode?: string;
  readonly city?: string;
} {
  const parts = normalizedAddress.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  let stateIndex = -1;
  let stateCode: string | undefined;
  for (let i = 0; i < parts.length; i++) {
    const m = /^([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(parts[i]!);
    if (m) {
      stateIndex = i;
      stateCode = m[1]!.toUpperCase();
      break;
    }
  }
  const city =
    stateIndex > 0 ? parts[stateIndex - 1]!.toLowerCase() : undefined;
  return {
    ...(stateCode !== undefined ? { stateCode } : {}),
    ...(city !== undefined ? { city } : {}),
  };
}

/**
 * A registry of jurisdiction adapters. The MVP ships exactly one entry
 * (README-US: "one metro, one jurisdiction adapter, and one primary
 * building type"). Expansion is gated per README-US validation metrics.
 */
export class JurisdictionRegistry {
  private readonly byId = new Map<string, JurisdictionProfile>();

  register(profile: JurisdictionProfile): void {
    if (this.byId.has(profile.jurisdictionId)) {
      throw new Error(
        `Jurisdiction already registered: ${profile.jurisdictionId}`,
      );
    }
    this.byId.set(profile.jurisdictionId, profile);
  }

  get(jurisdictionId: string): JurisdictionProfile {
    const profile = this.byId.get(jurisdictionId);
    if (!profile) {
      throw new Error(`No jurisdiction adapter for: ${jurisdictionId}`);
    }
    return profile;
  }

  has(jurisdictionId: string): boolean {
    return this.byId.has(jurisdictionId);
  }

  list(): readonly JurisdictionProfile[] {
    return [...this.byId.values()];
  }

  /**
   * Route a normalized address to the jurisdiction that serves it, by matching
   * the address's state AND city against each profile's stateCode + placeNames.
   * Returns `undefined` when no registered jurisdiction covers the address —
   * an honest "no adapter here", never a wrong-jurisdiction guess (which would
   * attach the wrong zoning/parcel source).
   */
  resolveByAddress(normalizedAddress: string): JurisdictionProfile | undefined {
    const { stateCode, city } = parseStateCity(normalizedAddress);
    if (stateCode === undefined || city === undefined) return undefined;
    for (const profile of this.byId.values()) {
      if (profile.stateCode.toUpperCase() !== stateCode) continue;
      if (profile.placeNames?.some((name) => name === city)) return profile;
    }
    return undefined;
  }
}
