/**
 * The nationwide fallback profile — Regrid parcels for any US address.
 *
 * This is the "break the wall" path: instead of one county GIS adapter per
 * jurisdiction (each often on an egress-blocked host), the Regrid API resolves
 * parcels across ~all US counties through one normalized schema. Composed with
 * the shared national providers (Census address, FEMA flood, USGS terrain) it
 * gives, for ANY US address: parcel geometry + assessor facts + flood + terrain.
 *
 * Zoning stays honest: it is jurisdiction-specific evidence, so this profile
 * carries the {@link UnsupportedZoningProvider} — every by-right field is
 * Unresolved with a "not yet covered" action until a local zoning adapter is
 * registered for that city. Finance and tax are the same all-Unresolved
 * placeholders every pending jurisdiction ships.
 *
 * Requires a Regrid API token (Regrid is a paid service). Without one this
 * profile cannot resolve parcels — callers should gate on the token and fall
 * back to an honest "parcel source not configured" state.
 */

import { createUsNationalProviders } from "./index.js";
import type { UsNationalConfig } from "./index.js";
import { UnsupportedZoningProvider } from "./unsupported-zoning.js";
import { RegridParcelProvider } from "../us-regrid/index.js";
import { unresolved } from "../../jurisdiction/index.js";
import type {
  FinanceAssumptionProfile,
  JurisdictionProfile,
  TaxEstimateProfile,
} from "../../jurisdiction/index.js";
import { US_UNIT_PROFILE } from "../../units/index.js";

export const US_REGRID_JURISDICTION_ID = "us-regrid-nationwide";

const FINANCE_ACTION =
  "Supply a dated, sourced market figure or record it as an explicit user " +
  "assumption; no nationwide default is inferred.";
const TAX_ACTION =
  "Confirm the local assessor rate and state statute, or record an explicit " +
  "user assumption.";

const PENDING_FINANCE: FinanceAssumptionProfile = {
  currency: "USD",
  hardCostPerGsf: unresolved("hard cost per GSF", "underwriter", FINANCE_ACTION),
  softCostPct: unresolved("soft cost %", "underwriter", FINANCE_ACTION),
  contingencyPct: unresolved("contingency %", "underwriter", FINANCE_ACTION),
  constructionLoanRate: unresolved("construction loan rate", "underwriter", FINANCE_ACTION),
  permanentLoanRate: unresolved("permanent loan rate", "underwriter", FINANCE_ACTION),
  exitCapRate: unresolved("exit cap rate", "underwriter", FINANCE_ACTION),
  vacancyPct: unresolved("vacancy %", "underwriter", FINANCE_ACTION),
};

const PENDING_TAX: TaxEstimateProfile = {
  propertyTaxRatePct: unresolved("property tax rate %", "tax advisor", TAX_ACTION),
  transferTaxRatePct: unresolved("transfer / deed tax rate %", "tax advisor", TAX_ACTION),
};

export interface UsRegridProfileConfig extends UsNationalConfig {
  /** Regrid API token (required for this profile to resolve parcels). */
  readonly regridToken: string;
}

/**
 * Build the nationwide Regrid fallback profile. Intended as an explicit
 * fallback when no city-specific profile serves an address — NOT registered for
 * address routing (it has no `placeNames`), because it is a catch-all, not a
 * jurisdiction match.
 */
export function createUsRegridProfile(
  config: UsRegridProfileConfig,
): JurisdictionProfile {
  const national = createUsNationalProviders(config);
  return {
    countryCode: "US",
    stateCode: "US",
    jurisdictionId: US_REGRID_JURISDICTION_ID,
    displayName: "United States — Regrid parcels (zoning not yet covered)",

    units: US_UNIT_PROFILE,
    addressProvider: national.addressProvider,
    parcelProvider: new RegridParcelProvider({ token: config.regridToken }),
    zoningProvider: new UnsupportedZoningProvider({
      jurisdictionId: US_REGRID_JURISDICTION_ID,
    }),
    hazardProviders: national.hazardProviders,
    financeProfile: PENDING_FINANCE,
    taxProfile: PENDING_TAX,
  };
}
