/**
 * Pending finance and tax profiles for Minneapolis.
 *
 * A pro forma must show whether every number is a dated market source or an
 * explicit user assumption (README-US §1, Phase US-3). Until sourced market
 * and statutory rates are wired in, these profiles carry each assumption as an
 * {@link Unresolved} rather than a plausible-looking default: an unsourced cap
 * rate or tax rate that silently drives underwriting is exactly the failure the
 * Evidence contract exists to prevent. The `currency` is the one fact that is
 * definitionally known for a U.S. jurisdiction.
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import type {
  FinanceAssumptionProfile,
  TaxEstimateProfile,
} from "../../jurisdiction/providers.js";

const FINANCE_OWNER = "underwriter";
const FINANCE_ACTION =
  "Supply a dated, sourced market figure or record it as an explicit user " +
  "assumption; no default is inferred for Minneapolis yet.";

const TAX_OWNER = "tax advisor";
const TAX_ACTION =
  "Confirm the Hennepin County / City of Minneapolis rate against the current " +
  "assessor and Minnesota statute, or record an explicit user assumption.";

/**
 * All-unresolved finance assumptions. Every rate blocks approval until a
 * source or user assumption replaces it, so a pro forma cannot silently run on
 * fabricated market numbers.
 */
export const MINNEAPOLIS_PENDING_FINANCE: FinanceAssumptionProfile = {
  currency: "USD",
  hardCostPerGsf: unresolved("hard cost per GSF", FINANCE_OWNER, FINANCE_ACTION),
  softCostPct: unresolved("soft cost %", FINANCE_OWNER, FINANCE_ACTION),
  contingencyPct: unresolved("contingency %", FINANCE_OWNER, FINANCE_ACTION),
  constructionLoanRate: unresolved(
    "construction loan rate",
    FINANCE_OWNER,
    FINANCE_ACTION,
  ),
  permanentLoanRate: unresolved(
    "permanent loan rate",
    FINANCE_OWNER,
    FINANCE_ACTION,
  ),
  exitCapRate: unresolved("exit cap rate", FINANCE_OWNER, FINANCE_ACTION),
  vacancyPct: unresolved("vacancy %", FINANCE_OWNER, FINANCE_ACTION),
};

/** All-unresolved tax inputs, pending sourced statutory rates. */
export const MINNEAPOLIS_PENDING_TAX: TaxEstimateProfile = {
  propertyTaxRatePct: unresolved("property tax rate %", TAX_OWNER, TAX_ACTION),
  transferTaxRatePct: unresolved(
    "transfer / deed tax rate %",
    TAX_OWNER,
    TAX_ACTION,
  ),
};
