/**
 * Parcel property-tax assessment — the CURRENT, certain tax reality of one
 * parcel, derived only from the county's own official record.
 *
 * The discipline here is deliberately narrow (README-US §1, §4): assert only
 * what is certain and sourced, never a plausible-looking rate.
 *
 *   - assessedValue / annualPropertyTax: the assessor's own figures for THIS
 *     parcel — official facts, carried straight through.
 *   - effectiveTaxRatePct: the exact ratio of the two (actual tax ÷ taxable
 *     value). It is a derived `algorithm` value describing the parcel's CURRENT
 *     bill on its CURRENT assessment — NOT a forward rate for a redevelopment
 *     (new construction is reassessed under Minnesota's class-rate system), and
 *     the note says exactly that.
 *   - deedTransferTaxRatePct: the Minnesota deed/transfer tax is statutory, but
 *     its rate is not verifiable from any source reachable in this environment.
 *     Asserting it from memory would be an unsourced number — precisely the
 *     failure the Evidence contract exists to prevent — so it stays Unresolved.
 *
 * A forward-looking property-tax rate for the redevelopment scenario is
 * intentionally NOT produced: it cannot be known with certainty here, and a
 * guess would be worse than an honest gap.
 */

import { algorithmValue, isEvidence, unresolved } from "../jurisdiction/index.js";
import type {
  Evidence,
  EvidenceOrUnresolved,
  ParcelRecord,
} from "../jurisdiction/index.js";
import type { Money } from "../units/index.js";

const TAX_OWNER = "tax advisor";

export interface ParcelTaxAssessment {
  /** Assessor total taxable market value (official), or a non-blocking gap. */
  readonly assessedValue: EvidenceOrUnresolved<Money>;
  /** Actual total annual property tax billed (official), or a non-blocking gap. */
  readonly annualPropertyTax: EvidenceOrUnresolved<Money>;
  /**
   * Current effective property-tax rate as a fraction (0..1): actual annual tax
   * ÷ assessor taxable value. Derived, exact, and scoped to the CURRENT
   * assessment — never a forward redevelopment rate.
   */
  readonly effectiveTaxRatePct: EvidenceOrUnresolved<number>;
  /** Minnesota deed/transfer tax rate — Unresolved (statute not reachable to verify). */
  readonly deedTransferTaxRatePct: EvidenceOrUnresolved<number>;
}

const CURRENT_RATE_NOTE =
  "Current effective rate = actual annual property tax ÷ assessor taxable " +
  "value for this parcel's CURRENT assessment. A redevelopment is reassessed " +
  "(Minnesota class-rate system), so this is a current-condition fact, not a " +
  "forward rate for the proposed project.";

/**
 * Build the tax assessment for a resolved parcel from its county record. Every
 * field is either an official/derived value backed by the parcel's own data or
 * an explicit non-blocking gap — nothing is defaulted.
 */
export function buildParcelTaxAssessment(
  parcel: ParcelRecord,
): ParcelTaxAssessment {
  const assessedValue =
    parcel.assessedValue ??
    unresolved(
      "assessor taxable value",
      TAX_OWNER,
      "No taxable value on the county record for this parcel; confirm with the Hennepin assessor.",
      { blocksApproval: false },
    );
  const annualPropertyTax =
    parcel.annualPropertyTax ??
    unresolved(
      "annual property tax",
      TAX_OWNER,
      "No annual property tax on the county record for this parcel; confirm with the Hennepin assessor.",
      { blocksApproval: false },
    );

  const effectiveTaxRatePct =
    isEvidence(assessedValue) && isEvidence(annualPropertyTax)
      ? effectiveRate(annualPropertyTax, assessedValue)
      : unresolved(
          "effective property tax rate",
          TAX_OWNER,
          "Needs both the assessor taxable value and the actual annual tax for this parcel.",
          { blocksApproval: false },
        );

  const deedTransferTaxRatePct = unresolved(
    "deed / transfer tax rate",
    TAX_OWNER,
    "Confirm the current Minnesota deed/transfer tax rate and any Hennepin " +
      "County additions (e.g. the Environmental Response Fund tax) against " +
      "Minn. Stat. ch. 287 / § 383B.80; not asserted from an unverified source.",
    { blocksApproval: false },
  );

  return {
    assessedValue,
    annualPropertyTax,
    effectiveTaxRatePct,
    deedTransferTaxRatePct,
  };
}

/**
 * Exact effective rate from two official Money figures. Returns a non-blocking
 * gap rather than a 0 or NaN if the taxable value is non-positive (which the
 * upstream parser already precludes, but a derived value must never divide by
 * zero silently).
 */
function effectiveRate(
  tax: Evidence<Money>,
  value: Evidence<Money>,
): EvidenceOrUnresolved<number> {
  const v = Number(value.value.toDecimalString());
  const t = Number(tax.value.toDecimalString());
  if (!(v > 0)) {
    return unresolved(
      "effective property tax rate",
      TAX_OWNER,
      "The assessor taxable value is non-positive, so an effective rate cannot be derived.",
      { blocksApproval: false },
    );
  }
  return algorithmValue(t / v, { confidence: "high", note: CURRENT_RATE_NOTE });
}
