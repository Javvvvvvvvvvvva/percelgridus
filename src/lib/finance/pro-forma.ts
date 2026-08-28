/**
 * Development pro forma — a source-honest underwriting pass over one site.
 *
 * README-US (Phase US-3): "a pro forma can show whether a number is a dated
 * market source or an explicit user assumption." This engine never invents a
 * market number: every input is Evidence-or-Unresolved (an official value, a
 * dated market figure, or an explicit user assumption), every derived line is
 * an `algorithm` value, and a line whose inputs are not all resolved comes back
 * Unresolved naming the missing dependency — so an unfunded assumption blocks a
 * result rather than silently defaulting to zero.
 *
 * All money math runs on the decimal-exact {@link Money}; a raw `number` only
 * appears for ratios and counts, never as a dollar amount.
 */

import {
  algorithmValue,
  isUnresolved,
  unresolved,
} from "../jurisdiction/index.js";
import type {
  ByRightEnvelope,
  Evidence,
  EvidenceOrUnresolved,
  FinanceAssumptionProfile,
  Unresolved,
} from "../jurisdiction/index.js";
import { Area, Length, Money } from "../units/index.js";

const OWNER = "underwriter";

/** Propagate an unresolved dependency into the line that needed it. */
function dependsOn(subject: string, missing: Unresolved): Unresolved {
  return unresolved(
    subject,
    OWNER,
    `Depends on "${missing.subject}", which is unresolved: ${missing.requiredAction}`,
  );
}

/**
 * Compute a derived line from evidence inputs. If every input is resolved, the
 * result is an `algorithm` value; if any is Unresolved, the result is a gap
 * naming the first missing dependency. Keeps the provenance chain honest.
 */
function derive<T extends unknown[], R>(
  subject: string,
  inputs: { [K in keyof T]: EvidenceOrUnresolved<T[K]> },
  compute: (...vals: T) => R,
  opts: { note?: string } = {},
): EvidenceOrUnresolved<R> {
  for (const input of inputs) {
    if (isUnresolved(input)) return dependsOn(subject, input);
  }
  const vals = (inputs as EvidenceOrUnresolved<unknown>[]).map(
    (i) => (i as Evidence<unknown>).value,
  ) as T;
  return algorithmValue(compute(...vals), opts);
}

// ─────────────────────────── Inputs ───────────────────────────

/** User (or market) assumptions describing the intended building program. */
export interface DevelopmentProgramAssumptions {
  /** Average gross floor area per dwelling unit. */
  readonly avgUnitGsf: EvidenceOrUnresolved<Area>;
  readonly monthlyRentPerUnit: EvidenceOrUnresolved<Money>;
  readonly annualOpexPerUnit: EvidenceOrUnresolved<Money>;
}

export interface ProFormaInputs {
  readonly lotArea: EvidenceOrUnresolved<Area>;
  readonly maxFar: EvidenceOrUnresolved<number>;
  readonly maxLotCoverage: EvidenceOrUnresolved<number>;
  readonly finance: FinanceAssumptionProfile;
  readonly program: DevelopmentProgramAssumptions;
}

// ─────────────────────────── Outputs ───────────────────────────

export interface ProForma {
  // Buildable program (the massing envelope).
  readonly buildableGsf: EvidenceOrUnresolved<Area>;
  readonly footprintArea: EvidenceOrUnresolved<Area>;
  readonly estimatedUnits: EvidenceOrUnresolved<number>;
  // Development cost.
  readonly hardCost: EvidenceOrUnresolved<Money>;
  readonly softCost: EvidenceOrUnresolved<Money>;
  readonly contingency: EvidenceOrUnresolved<Money>;
  readonly totalDevelopmentCost: EvidenceOrUnresolved<Money>;
  // Stabilized revenue and returns.
  readonly grossAnnualRent: EvidenceOrUnresolved<Money>;
  readonly effectiveGrossIncome: EvidenceOrUnresolved<Money>;
  readonly annualOperatingExpense: EvidenceOrUnresolved<Money>;
  readonly netOperatingIncome: EvidenceOrUnresolved<Money>;
  readonly stabilizedValue: EvidenceOrUnresolved<Money>;
  /** Untrended yield on cost (NOI / total development cost), as a fraction. */
  readonly yieldOnCost: EvidenceOrUnresolved<number>;
  readonly developmentProfit: EvidenceOrUnresolved<Money>;
}

export function computeProForma(inputs: ProFormaInputs): ProForma {
  const { lotArea, maxFar, maxLotCoverage, finance, program } = inputs;

  const buildableGsf = derive(
    "buildable floor area",
    [lotArea, maxFar] as const,
    (lot, far) => lot.times(far),
    { note: "lot area × max floor area ratio" },
  );
  const footprintArea = derive(
    "building footprint",
    [lotArea, maxLotCoverage] as const,
    (lot, cov) => lot.times(cov),
  );
  const estimatedUnits = derive(
    "estimated units",
    [buildableGsf, program.avgUnitGsf] as const,
    (gsf, unit) => Math.floor(gsf.toSquareFeet() / unit.toSquareFeet()),
    { note: "floor(buildable GSF ÷ avg unit GSF)" },
  );

  const hardCost = derive(
    "hard cost",
    [buildableGsf, finance.hardCostPerGsf] as const,
    (gsf, rate) => rate.times(gsf.toSquareFeet()),
  );
  const softCost = derive(
    "soft cost",
    [hardCost, finance.softCostPct] as const,
    (hard, pct) => hard.times(pct),
  );
  const contingency = derive(
    "contingency",
    [hardCost, softCost, finance.contingencyPct] as const,
    (hard, soft, pct) => hard.plus(soft).times(pct),
  );
  const totalDevelopmentCost = derive(
    "total development cost",
    [hardCost, softCost, contingency] as const,
    (hard, soft, cont) => hard.plus(soft).plus(cont),
  );

  const grossAnnualRent = derive(
    "gross annual rent",
    [estimatedUnits, program.monthlyRentPerUnit] as const,
    (units, rent) => rent.times(units).times(12),
  );
  const effectiveGrossIncome = derive(
    "effective gross income",
    [grossAnnualRent, finance.vacancyPct] as const,
    (gross, vac) => gross.times(1 - vac),
  );
  const annualOperatingExpense = derive(
    "operating expense",
    [estimatedUnits, program.annualOpexPerUnit] as const,
    (units, opex) => opex.times(units),
  );
  const netOperatingIncome = derive(
    "net operating income",
    [effectiveGrossIncome, annualOperatingExpense] as const,
    (egi, opex) => egi.minus(opex),
  );
  const stabilizedValue = derive(
    "stabilized value",
    [netOperatingIncome, finance.exitCapRate] as const,
    (noi, cap) => noi.dividedBy(cap),
  );
  const yieldOnCost = derive(
    "yield on cost",
    [netOperatingIncome, totalDevelopmentCost] as const,
    (noi, cost) => Number(noi.toDecimalString()) / Number(cost.toDecimalString()),
  );
  const developmentProfit = derive(
    "development profit",
    [stabilizedValue, totalDevelopmentCost] as const,
    (value, cost) => value.minus(cost),
  );

  return {
    buildableGsf,
    footprintArea,
    estimatedUnits,
    hardCost,
    softCost,
    contingency,
    totalDevelopmentCost,
    grossAnnualRent,
    effectiveGrossIncome,
    annualOperatingExpense,
    netOperatingIncome,
    stabilizedValue,
    yieldOnCost,
    developmentProfit,
  };
}

// ─────────────────────────── Site massing program ───────────────────────────

/**
 * The by-right development envelope for a site — the massing inputs a site
 * plan / blueprint is built from. Every field carries its provenance; unknowns
 * stay Unresolved so a designer sees exactly which constraint is confirmed and
 * which is still a preliminary reference.
 */
export interface SiteMassingProgram {
  readonly zoningDistrict: EvidenceOrUnresolved<string>;
  readonly lotArea: EvidenceOrUnresolved<Area>;
  readonly maxFar: EvidenceOrUnresolved<number>;
  readonly buildableGsf: EvidenceOrUnresolved<Area>;
  readonly maxLotCoverage: EvidenceOrUnresolved<number>;
  readonly maxFootprint: EvidenceOrUnresolved<Area>;
  readonly maxHeight: EvidenceOrUnresolved<Length>;
  readonly minSetbacks: EvidenceOrUnresolved<{
    front: Length;
    side: Length;
    rear: Length;
  }>;
  readonly allowedUses: EvidenceOrUnresolved<readonly string[]>;
  readonly estimatedUnits: EvidenceOrUnresolved<number>;
}

/**
 * Assemble the massing program from a resolved lot area, the by-right zoning
 * envelope, and a computed pro forma. This is the hand-off to a site-plan
 * designer: the buildable envelope plus its provenance.
 */
export function buildSiteMassingProgram(
  lotArea: EvidenceOrUnresolved<Area>,
  zoning: ByRightEnvelope,
  proForma: ProForma,
): SiteMassingProgram {
  return {
    zoningDistrict: zoning.zoningDistrict,
    lotArea,
    maxFar: zoning.maxFar,
    buildableGsf: proForma.buildableGsf,
    maxLotCoverage: zoning.maxLotCoverage,
    maxFootprint: proForma.footprintArea,
    maxHeight: zoning.maxHeight,
    minSetbacks: zoning.minSetbacks,
    allowedUses: zoning.allowedUses,
    estimatedUnits: proForma.estimatedUnits,
  };
}
