/**
 * Live pro forma — runs the REAL library engine (`src/lib/finance`) in the
 * browser so the interactive sliders compute with the exact same
 * decimal-precise math as the server-side report, not a separate copy.
 *
 * `computeProForma` depends only on the units + jurisdiction contracts (no
 * network), so it is safe to bundle into the client. This module wraps slider
 * numbers as user-assumption Evidence, calls the real engine, and returns plain
 * numbers for rendering. Acquisition-inclusive verdict / break-even are UI
 * presentation derived from the engine's numbers — the MATH stays in the engine.
 */

import { computeProForma } from "../../src/lib/finance/index.js";
import { Area, Money } from "../../src/lib/units/index.js";
import { isEvidence } from "../../src/lib/jurisdiction/index.js";
import type { EvidenceOrUnresolved } from "../../src/lib/jurisdiction/index.js";

/** A resolved user assumption as Evidence (so the engine labels it honestly). */
function assume<T>(value: T): EvidenceOrUnresolved<T> {
  return { value, provenance: "user-input", confidence: "medium", verification: "unverified" };
}

/** Everything the engine needs, split into resolved site facts + slider inputs. */
export interface LiveProFormaInputs {
  // Resolved from the by-right envelope (real facts).
  readonly lotAreaSf: number;
  readonly maxFar: number;
  readonly maxLotCoverage: number; // fraction 0..1
  readonly avgUnitGsf: number;
  readonly softCostPct: number;
  readonly contingencyPct: number;
  readonly vacancyPct: number;
  readonly annualOpexPerUnit: number;
  // User assumptions (sliders + acquisition).
  readonly acquisitionPrice: number;
  readonly rentPerUnitMonth: number;
  readonly hardCostPerGsf: number;
  readonly exitCapRatePct: number;
}

export interface LiveProFormaResult {
  readonly buildableGsf: number | null;
  readonly units: number | null;
  readonly developmentCost: number | null;
  readonly totalCapitalIn: number | null;
  readonly noi: number | null;
  readonly stabilizedValue: number | null;
  readonly yieldOnCostPct: number | null;
  readonly profit: number | null; // vs total capital in (acquisition-inclusive)
  readonly feasible: boolean;
  readonly breakevenAchievable: boolean;
  readonly breakevenAcquisitionPrice: number | null;
}

const moneyNum = (x: EvidenceOrUnresolved<Money> | undefined): number | null =>
  x && isEvidence(x) ? x.value.toNumber() : null;
const plainNum = (x: EvidenceOrUnresolved<number> | undefined): number | null =>
  x && isEvidence(x) ? x.value : null;
const areaNum = (x: EvidenceOrUnresolved<Area> | undefined): number | null =>
  x && isEvidence(x) ? Math.round(x.value.toSquareFeet()) : null;

export function runLiveProForma(i: LiveProFormaInputs): LiveProFormaResult {
  const pf = computeProForma({
    lotArea: assume(Area.squareFeet(String(Math.round(i.lotAreaSf)))),
    maxFar: assume(i.maxFar),
    maxLotCoverage: assume(i.maxLotCoverage),
    finance: {
      currency: "USD",
      hardCostPerGsf: assume(Money.usd(String(i.hardCostPerGsf))),
      softCostPct: assume(i.softCostPct),
      contingencyPct: assume(i.contingencyPct),
      constructionLoanRate: assume(0.08),
      permanentLoanRate: assume(0.06),
      exitCapRate: assume(i.exitCapRatePct / 100),
      vacancyPct: assume(i.vacancyPct),
    },
    program: {
      avgUnitGsf: assume(Area.squareFeet(String(Math.round(i.avgUnitGsf)))),
      monthlyRentPerUnit: assume(Money.usd(String(i.rentPerUnitMonth))),
      annualOpexPerUnit: assume(Money.usd(String(i.annualOpexPerUnit))),
    },
  });

  const developmentCost = moneyNum(pf.totalDevelopmentCost);
  const stabilizedValue = moneyNum(pf.stabilizedValue);
  const noi = moneyNum(pf.netOperatingIncome);
  const yieldOnCostPct = plainNum(pf.yieldOnCost) !== null ? plainNum(pf.yieldOnCost)! * 100 : null;

  const totalCapitalIn = developmentCost !== null ? i.acquisitionPrice + developmentCost : null;
  const profit =
    stabilizedValue !== null && totalCapitalIn !== null ? stabilizedValue - totalCapitalIn : null;
  const feasible = profit !== null && profit >= 0;

  const breakevenAchievable =
    stabilizedValue !== null && developmentCost !== null && stabilizedValue - developmentCost >= 0;
  const breakevenAcquisitionPrice =
    breakevenAchievable && stabilizedValue !== null && developmentCost !== null
      ? stabilizedValue - developmentCost
      : null;

  return {
    buildableGsf: areaNum(pf.buildableGsf),
    units: plainNum(pf.estimatedUnits),
    developmentCost,
    totalCapitalIn,
    noi,
    stabilizedValue,
    yieldOnCostPct,
    profit,
    feasible,
    breakevenAchievable,
    breakevenAcquisitionPrice,
  };
}

/** Whole-dollar USD for display (the report's Money.format keeps cents). */
export function money(n: number | null): string {
  if (n === null) return "—";
  return "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

/** Default user assumptions, mirrored from the server bridge. */
export const PRO_FORMA_DEFAULTS = {
  acquisitionPrice: 625000,
  rentPerUnitMonth: 2200,
  hardCostPerGsf: 300,
  exitCapRatePct: 6.0,
};
