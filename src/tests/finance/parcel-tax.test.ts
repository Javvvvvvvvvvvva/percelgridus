import { describe, it, expect } from "vitest";
import { buildParcelTaxAssessment } from "@/lib/finance/index.js";
import {
  officialFact,
  unresolved,
  isEvidence,
  isUnresolved,
  approvalBlockers,
  createParcelIdentity,
} from "@/lib/jurisdiction/index.js";
import type { ParcelRecord } from "@/lib/jurisdiction/index.js";
import { Area, Money } from "@/lib/units/index.js";

const SRC = {
  label: "Hennepin County GIS — County Parcels",
  locator: "x",
  retrievalDate: "2026-08-26",
};

function parcel(overrides: Partial<ParcelRecord> = {}): ParcelRecord {
  return {
    identity: createParcelIdentity({ apns: [], providerIds: [] }),
    geometry: officialFact([[[0, 0]]], SRC),
    lotArea: officialFact(Area.squareFeet("8825"), SRC),
    ownerName: officialFact("SLMC DEVELOPMENT LLC", SRC),
    ...overrides,
  };
}

describe("buildParcelTaxAssessment", () => {
  it("derives the current effective rate exactly from the official value and tax", () => {
    const t = buildParcelTaxAssessment(
      parcel({
        assessedValue: officialFact(Money.usd("3658000"), SRC),
        annualPropertyTax: officialFact(Money.usd("69198.46"), SRC),
      }),
    );
    expect(isEvidence(t.assessedValue)).toBe(true);
    expect(isEvidence(t.annualPropertyTax)).toBe(true);

    if (!isEvidence(t.effectiveTaxRatePct)) throw new Error("expected a rate");
    // 69198.46 / 3,658,000 = 0.018917… → 1.89%.
    expect(t.effectiveTaxRatePct.value).toBeCloseTo(0.018917, 5);
    expect(t.effectiveTaxRatePct.provenance).toBe("algorithm");
    // The note scopes it to the current assessment, never a forward rate.
    expect(t.effectiveTaxRatePct.note).toMatch(/current/i);
    expect(t.effectiveTaxRatePct.note).toMatch(/reassessed/i);
  });

  it("keeps the deed/transfer tax rate Unresolved — never asserted from memory", () => {
    const t = buildParcelTaxAssessment(
      parcel({
        assessedValue: officialFact(Money.usd("3658000"), SRC),
        annualPropertyTax: officialFact(Money.usd("69198.46"), SRC),
      }),
    );
    expect(isUnresolved(t.deedTransferTaxRatePct)).toBe(true);
    if (isUnresolved(t.deedTransferTaxRatePct)) {
      expect(t.deedTransferTaxRatePct.requiredAction).toMatch(/Minn\. Stat/);
      // It is a tracked note, not an approval blocker.
      expect(t.deedTransferTaxRatePct.blocksApproval).toBe(false);
    }
  });

  it("returns non-blocking gaps (no rate) when the parcel carries no tax data", () => {
    const t = buildParcelTaxAssessment(parcel());
    expect(isUnresolved(t.assessedValue)).toBe(true);
    expect(isUnresolved(t.annualPropertyTax)).toBe(true);
    expect(isUnresolved(t.effectiveTaxRatePct)).toBe(true);
    // None of the tax gaps block approval — they are current-condition context.
    expect(
      approvalBlockers([
        t.assessedValue,
        t.annualPropertyTax,
        t.effectiveTaxRatePct,
        t.deedTransferTaxRatePct,
      ]).length,
    ).toBe(0);
  });

  it("does not derive a rate when only one of value/tax is present", () => {
    const onlyValue = buildParcelTaxAssessment(
      parcel({ assessedValue: officialFact(Money.usd("500000"), SRC) }),
    );
    expect(isEvidence(onlyValue.assessedValue)).toBe(true);
    expect(isUnresolved(onlyValue.annualPropertyTax)).toBe(true);
    expect(isUnresolved(onlyValue.effectiveTaxRatePct)).toBe(true);
  });

  it("does not divide by a non-positive taxable value", () => {
    // Guard path: an assessed value of $0 must not yield a 0 or NaN rate.
    const t = buildParcelTaxAssessment(
      parcel({
        assessedValue: officialFact(Money.usd("0"), SRC),
        annualPropertyTax: officialFact(Money.usd("1234"), SRC),
      }),
    );
    expect(isUnresolved(t.effectiveTaxRatePct)).toBe(true);
  });
});
