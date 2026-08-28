import { describe, it, expect } from "vitest";
import {
  computeProForma,
  buildSiteMassingProgram,
  type ProFormaInputs,
} from "@/lib/finance/index.js";
import {
  userAssumption,
  unresolved,
  isEvidence,
  isUnresolved,
} from "@/lib/jurisdiction/index.js";
import type { FinanceAssumptionProfile } from "@/lib/jurisdiction/index.js";
import { Area, Money } from "@/lib/units/index.js";

function finance(over: Partial<FinanceAssumptionProfile> = {}): FinanceAssumptionProfile {
  return {
    currency: "USD",
    hardCostPerGsf: userAssumption(Money.usd("300")),
    softCostPct: userAssumption(0.2),
    contingencyPct: userAssumption(0.1),
    constructionLoanRate: userAssumption(0.08),
    permanentLoanRate: userAssumption(0.06),
    exitCapRate: userAssumption(0.06),
    vacancyPct: userAssumption(0.05),
    ...over,
  };
}

function inputs(over: Partial<ProFormaInputs> = {}): ProFormaInputs {
  return {
    lotArea: userAssumption(Area.squareFeet("5000")),
    maxFar: userAssumption(0.5),
    maxLotCoverage: userAssumption(0.45),
    finance: finance(),
    program: {
      avgUnitGsf: userAssumption(Area.squareFeet("1000")),
      monthlyRentPerUnit: userAssumption(Money.usd("2000")),
      annualOpexPerUnit: userAssumption(Money.usd("6000")),
    },
    ...over,
  };
}

describe("computeProForma", () => {
  it("computes the full stack from resolved assumptions", () => {
    const pf = computeProForma(inputs());

    const num = <T>(x: unknown, f: (v: T) => number): number => {
      if (isUnresolved(x)) throw new Error("expected evidence");
      return f((x as { value: T }).value);
    };

    expect(num<Area>(pf.buildableGsf, (a) => a.toSquareFeet())).toBeCloseTo(2500, 3);
    expect(num<Area>(pf.footprintArea, (a) => a.toSquareFeet())).toBeCloseTo(2250, 3);
    expect(num<number>(pf.estimatedUnits, (n) => n)).toBe(2);
    expect(num<Money>(pf.hardCost, (m) => m.toNumber())).toBeCloseTo(750_000, 0);
    expect(num<Money>(pf.softCost, (m) => m.toNumber())).toBeCloseTo(150_000, 0);
    expect(num<Money>(pf.contingency, (m) => m.toNumber())).toBeCloseTo(90_000, 0);
    expect(num<Money>(pf.totalDevelopmentCost, (m) => m.toNumber())).toBeCloseTo(990_000, 0);
    expect(num<Money>(pf.grossAnnualRent, (m) => m.toNumber())).toBeCloseTo(48_000, 0);
    expect(num<Money>(pf.effectiveGrossIncome, (m) => m.toNumber())).toBeCloseTo(45_600, 0);
    expect(num<Money>(pf.netOperatingIncome, (m) => m.toNumber())).toBeCloseTo(33_600, 0);
    expect(num<Money>(pf.stabilizedValue, (m) => m.toNumber())).toBeCloseTo(560_000, 0);
    expect(num<number>(pf.yieldOnCost, (n) => n)).toBeCloseTo(0.03394, 4);
    expect(num<Money>(pf.developmentProfit, (m) => m.toNumber())).toBeCloseTo(-430_000, 0);

    // Derived lines are algorithm provenance, not passed off as official.
    if (isEvidence(pf.totalDevelopmentCost)) {
      expect(pf.totalDevelopmentCost.provenance).toBe("algorithm");
    }
  });

  it("propagates a missing assumption as Unresolved naming the dependency", () => {
    const pf = computeProForma(
      inputs({ finance: finance({ hardCostPerGsf: unresolved("hard cost per GSF", "underwriter", "supply a sourced figure") }) }),
    );
    // Buildable program does not depend on cost — still resolves.
    expect(isEvidence(pf.buildableGsf)).toBe(true);
    expect(isEvidence(pf.estimatedUnits)).toBe(true);
    // Cost stack is Unresolved, and the message names the missing input.
    expect(isUnresolved(pf.hardCost)).toBe(true);
    if (isUnresolved(pf.hardCost)) {
      expect(pf.hardCost.requiredAction).toContain("hard cost per GSF");
    }
    expect(isUnresolved(pf.totalDevelopmentCost)).toBe(true);
    expect(isUnresolved(pf.developmentProfit)).toBe(true);
  });

  it("leaves the whole stack Unresolved when zoning FAR is unknown", () => {
    const pf = computeProForma(
      inputs({ maxFar: unresolved("FAR", "planner", "supply the use class") }),
    );
    expect(isUnresolved(pf.buildableGsf)).toBe(true);
    expect(isUnresolved(pf.estimatedUnits)).toBe(true);
    expect(isUnresolved(pf.hardCost)).toBe(true);
  });
});

describe("buildSiteMassingProgram", () => {
  it("assembles the by-right envelope + buildable program for a designer", () => {
    const pf = computeProForma(inputs());
    const envelope = {
      jurisdictionId: "us-mn-hennepin-minneapolis",
      zoningDistrict: userAssumption("UN2"),
      allowedUses: userAssumption(["single-family dwelling"] as readonly string[]),
      maxFar: userAssumption(0.5),
      maxLotCoverage: userAssumption(0.45),
      maxHeight: unresolved("height", "planner", "x"),
      minSetbacks: unresolved("setbacks", "planner", "x"),
      minParkingStalls: unresolved("parking", "planner", "x"),
      overlays: [],
      discretionaryApprovals: [],
    };
    const program = buildSiteMassingProgram(
      userAssumption(Area.squareFeet("5000")),
      envelope,
      pf,
    );
    expect(isEvidence(program.buildableGsf)).toBe(true);
    expect(isEvidence(program.maxFootprint)).toBe(true);
    expect(isEvidence(program.estimatedUnits)).toBe(true);
    // Unknown envelope pieces pass through as Unresolved for the designer.
    expect(isUnresolved(program.maxHeight)).toBe(true);
    expect(isUnresolved(program.minSetbacks)).toBe(true);
  });
});
