/**
 * US national providers — the federal data sources every US jurisdiction shares.
 *
 * Three of the five providers in a {@link JurisdictionProfile} are not
 * jurisdiction-specific at all: address geocoding (U.S. Census), flood hazard
 * (FEMA National Flood Hazard Layer), and terrain (USGS 3DEP) resolve for any
 * address in the country. Verified live across three states — Washington DC,
 * Austin TX, and Denver CO all geocode and return real flood zone + elevation —
 * not just the Minneapolis pilot.
 *
 * Extracting them here makes the national/jurisdiction boundary explicit: a new
 * jurisdiction reuses this bundle unchanged and only has to add its own PARCEL
 * and ZONING adapters (the two layers that genuinely differ by county/city).
 * That is the seam the multi-jurisdiction rollout builds on.
 */

import { CensusAddressProvider } from "../us-census/index.js";
import type { CensusGeocoderConfig } from "../us-census/index.js";
import { FemaFloodProvider } from "../us-fema/index.js";
import type { FemaFloodConfig } from "../us-fema/index.js";
import { UsgsTerrainProvider } from "../us-usgs/index.js";
import type { UsgsTerrainConfig } from "../us-usgs/index.js";
import type {
  AddressProvider,
  HazardProvider,
} from "../../jurisdiction/index.js";

/** Per-provider network config, injected so tests / proxied environments can
 *  supply their own `fetchImpl`/`baseUrl`. Every field is optional. */
export interface UsNationalConfig {
  readonly census?: CensusGeocoderConfig;
  readonly fema?: FemaFloodConfig;
  readonly usgs?: UsgsTerrainConfig;
}

/** The address + hazard providers shared by every US jurisdiction profile. */
export interface UsNationalProviders {
  readonly addressProvider: AddressProvider;
  readonly hazardProviders: readonly HazardProvider[];
}

/**
 * Build the federal providers every US jurisdiction shares. A jurisdiction
 * profile spreads these in and adds only its parcel and zoning adapters.
 */
export function createUsNationalProviders(
  config: UsNationalConfig = {},
): UsNationalProviders {
  return {
    addressProvider: new CensusAddressProvider(config.census),
    hazardProviders: [
      new FemaFloodProvider(config.fema),
      new UsgsTerrainProvider(config.usgs),
    ],
  };
}
