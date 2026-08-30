/**
 * The Minneapolis JurisdictionProfile — the first (and, per README-US, only)
 * pilot adapter: one metro, one jurisdiction, wired end to end.
 *
 * This is the object that binds the four live providers built in Phases US-1
 * through US-3 to a single jurisdiction:
 *
 *   - address  → U.S. Census Geocoder      (us-census)
 *   - parcel   → Hennepin County GIS       (us-hennepin)
 *   - hazard   → FEMA NFHL flood + USGS 3DEP terrain
 *   - zoning   → City of Minneapolis primary-zoning layer (district only)
 *
 * The zoning adapter resolves the official zoning DISTRICT; its by-right
 * numeric rules, plus finance and tax, are not yet sourced and surface as
 * Unresolved (see parse-zoning and pending-finance-tax). The profile is
 * therefore contract-complete and type-safe today, and each pending piece is
 * swapped out in place without any downstream change (README-US §"Proposed
 * adapter boundary").
 *
 * The reusable core never names a country; it reaches all of this only through
 * {@link JurisdictionProfile}.
 */

import { createUsNationalProviders } from "../us-national/index.js";
import type { UsNationalConfig } from "../us-national/index.js";
import { HennepinParcelProvider } from "../us-hennepin/index.js";
import type { HennepinParcelConfig } from "../us-hennepin/index.js";

import type { JurisdictionProfile } from "../../jurisdiction/index.js";
import { JurisdictionRegistry } from "../../jurisdiction/index.js";
import { US_UNIT_PROFILE } from "../../units/index.js";

import {
  MINNEAPOLIS_PENDING_FINANCE,
  MINNEAPOLIS_PENDING_TAX,
} from "./pending-finance-tax.js";
import { MinneapolisZoningProvider } from "./zoning.js";
import type { MinneapolisZoningConfig } from "./zoning.js";

/** Stable internal id for the pilot jurisdiction. */
export const MINNEAPOLIS_JURISDICTION_ID = "us-mn-hennepin-minneapolis";

/**
 * Per-provider network config, injected so tests (and proxy-mediated
 * environments) can supply their own `fetchImpl`/`baseUrl` without touching
 * the wiring. Every field is optional; each provider defaults to its public
 * production endpoint.
 */
export interface MinneapolisProfileConfig extends UsNationalConfig {
  readonly hennepin?: HennepinParcelConfig;
  readonly zoning?: MinneapolisZoningConfig;
}

/**
 * Build the Minneapolis profile. Live providers are constructed with the
 * supplied (or default) config; zoning/finance/tax are the pending adapters.
 */
export function createMinneapolisProfile(
  config: MinneapolisProfileConfig = {},
): JurisdictionProfile {
  // Census address + FEMA flood + USGS terrain are the same for every US
  // jurisdiction; Minneapolis adds only its own parcel and zoning adapters.
  const national = createUsNationalProviders(config);
  return {
    countryCode: "US",
    stateCode: "MN",
    jurisdictionId: MINNEAPOLIS_JURISDICTION_ID,
    displayName: "Minneapolis, Hennepin County, MN",

    units: US_UNIT_PROFILE,
    addressProvider: national.addressProvider,
    parcelProvider: new HennepinParcelProvider(config.hennepin),
    zoningProvider: new MinneapolisZoningProvider(config.zoning),
    hazardProviders: national.hazardProviders,
    financeProfile: MINNEAPOLIS_PENDING_FINANCE,
    taxProfile: MINNEAPOLIS_PENDING_TAX,
  };
}

/**
 * Register the Minneapolis profile into a registry and return it. Defaults to
 * a fresh registry (the MVP ships exactly one entry); pass an existing one to
 * register into it. Throws via the registry if the id is already present.
 */
export function registerMinneapolis(
  registry: JurisdictionRegistry = new JurisdictionRegistry(),
  config: MinneapolisProfileConfig = {},
): JurisdictionRegistry {
  registry.register(createMinneapolisProfile(config));
  return registry;
}
