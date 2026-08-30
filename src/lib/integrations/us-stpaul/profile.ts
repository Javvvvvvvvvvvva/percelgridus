/**
 * The Saint Paul JurisdictionProfile — the second jurisdiction adapter, and the
 * first to exercise the multi-jurisdiction seam.
 *
 * It composes exactly what the seam predicts:
 *   - the shared US NATIONAL providers (Census address, FEMA flood, USGS
 *     terrain) — reused unchanged from the Minneapolis pilot;
 *   - a Saint Paul-specific ZONING adapter (principal district, live from the
 *     City's ArcGIS Online layer);
 *   - a Ramsey County PARCEL adapter that is a documented pending placeholder,
 *     because the county parcel host is not reachable from this environment.
 *
 * So a new jurisdiction really is "national bundle + parcel + zoning": the only
 * new code Saint Paul needs is its zoning adapter (the parcel adapter is pending
 * on egress, not on engineering). Finance and tax are the same all-Unresolved
 * placeholders the pilot ships, until sourced rates are wired in.
 */

import { createUsNationalProviders } from "../us-national/index.js";
import type { UsNationalConfig } from "../us-national/index.js";
import { unresolved } from "../../jurisdiction/index.js";
import { JurisdictionRegistry } from "../../jurisdiction/index.js";
import type {
  FinanceAssumptionProfile,
  JurisdictionProfile,
  TaxEstimateProfile,
} from "../../jurisdiction/index.js";
import { US_UNIT_PROFILE } from "../../units/index.js";

import { RamseyPendingParcelProvider } from "./pending-parcel.js";
import { StPaulZoningProvider } from "./zoning.js";
import type { StPaulZoningConfig } from "./zoning.js";
import { SAINT_PAUL_JURISDICTION_ID } from "./parse-zoning.js";

export { SAINT_PAUL_JURISDICTION_ID };

const FINANCE_ACTION =
  "Supply a dated, sourced market figure or record it as an explicit user " +
  "assumption; no default is inferred for Saint Paul yet.";
const TAX_ACTION =
  "Confirm the Ramsey County / City of Saint Paul rate against the current " +
  "assessor and Minnesota statute, or record an explicit user assumption.";

/** All-unresolved finance assumptions — no market number is fabricated. */
const SAINT_PAUL_PENDING_FINANCE: FinanceAssumptionProfile = {
  currency: "USD",
  hardCostPerGsf: unresolved("hard cost per GSF", "underwriter", FINANCE_ACTION),
  softCostPct: unresolved("soft cost %", "underwriter", FINANCE_ACTION),
  contingencyPct: unresolved("contingency %", "underwriter", FINANCE_ACTION),
  constructionLoanRate: unresolved("construction loan rate", "underwriter", FINANCE_ACTION),
  permanentLoanRate: unresolved("permanent loan rate", "underwriter", FINANCE_ACTION),
  exitCapRate: unresolved("exit cap rate", "underwriter", FINANCE_ACTION),
  vacancyPct: unresolved("vacancy %", "underwriter", FINANCE_ACTION),
};

const SAINT_PAUL_PENDING_TAX: TaxEstimateProfile = {
  propertyTaxRatePct: unresolved("property tax rate %", "tax advisor", TAX_ACTION),
  transferTaxRatePct: unresolved("transfer / deed tax rate %", "tax advisor", TAX_ACTION),
};

export interface StPaulProfileConfig extends UsNationalConfig {
  readonly zoning?: StPaulZoningConfig;
}

/**
 * Build the Saint Paul profile. The national providers and the live zoning
 * adapter are constructed with the supplied (or default) config; the parcel
 * adapter is the pending Ramsey placeholder.
 */
export function createStPaulProfile(
  config: StPaulProfileConfig = {},
): JurisdictionProfile {
  const national = createUsNationalProviders(config);
  return {
    countryCode: "US",
    stateCode: "MN",
    jurisdictionId: SAINT_PAUL_JURISDICTION_ID,
    displayName: "Saint Paul, Ramsey County, MN",

    units: US_UNIT_PROFILE,
    addressProvider: national.addressProvider,
    parcelProvider: new RamseyPendingParcelProvider(),
    zoningProvider: new StPaulZoningProvider(config.zoning),
    hazardProviders: national.hazardProviders,
    financeProfile: SAINT_PAUL_PENDING_FINANCE,
    taxProfile: SAINT_PAUL_PENDING_TAX,
  };
}

/** Register the Saint Paul profile into a registry and return it. */
export function registerStPaul(
  registry: JurisdictionRegistry = new JurisdictionRegistry(),
  config: StPaulProfileConfig = {},
): JurisdictionRegistry {
  registry.register(createStPaulProfile(config));
  return registry;
}
