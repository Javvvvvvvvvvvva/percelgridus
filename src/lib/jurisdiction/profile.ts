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

  readonly units: UnitProfile;
  readonly addressProvider: AddressProvider;
  readonly parcelProvider: ParcelProvider;
  readonly zoningProvider: ZoningEvidenceProvider;
  readonly hazardProviders: readonly HazardProvider[];
  readonly financeProfile: FinanceAssumptionProfile;
  readonly taxProfile: TaxEstimateProfile;
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
}
