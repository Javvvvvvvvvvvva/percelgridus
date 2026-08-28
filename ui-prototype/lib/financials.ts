// Ported 1:1 from the Claude Design prototype's `renderVals()` pro forma
// logic (PARCELGRID US.dc.html) so the base case reproduces the figures
// the user confirmed: $2,446,179 dev cost / $3,071,179 total / -$1,522,846.
const DEFAULT_BUILDABLE_GSF = 6177;
const DEFAULT_UNITS = 5;
const SOFT_COST_FACTOR = 0.3200469;
const ANNUAL_OPEX = 32500;
const VACANCY = 0.05;

export type ProFormaInputs = {
  acquisitionPrice: number;
  rentPerUnitMonth: number;
  hardCostPerGsf: number;
  exitCapRatePct: number;
  /** Buildable area and unit count, from the real by-right envelope. */
  buildableGsf?: number;
  units?: number;
};

export function money(n: number, decimals = 0): string {
  return (
    "$" +
    Math.abs(Math.round(n)).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function computeProForma(inputs: ProFormaInputs) {
  const { acquisitionPrice, rentPerUnitMonth, hardCostPerGsf, exitCapRatePct } = inputs;
  const buildableGsf = inputs.buildableGsf ?? DEFAULT_BUILDABLE_GSF;
  const units = inputs.units ?? DEFAULT_UNITS;

  const hardCost = buildableGsf * hardCostPerGsf;
  const developmentCost = hardCost + hardCost * SOFT_COST_FACTOR;
  const totalCapitalIn = acquisitionPrice + developmentCost;

  const noi = units * rentPerUnitMonth * 12 * (1 - VACANCY) - ANNUAL_OPEX;
  const stabilizedValue = noi / (exitCapRatePct / 100);
  const profit = stabilizedValue - totalCapitalIn;
  const feasible = profit >= 0;

  const yieldOnCostPct = (noi / developmentCost) * 100;

  const breakevenAchievable = stabilizedValue - developmentCost >= 0;
  const breakevenAcquisitionPrice = breakevenAchievable ? stabilizedValue - developmentCost : null;

  return {
    developmentCost,
    totalCapitalIn,
    noi,
    stabilizedValue,
    profit,
    feasible,
    yieldOnCostPct,
    breakevenAchievable,
    breakevenAcquisitionPrice,
    verdictKicker: feasible ? "Preliminary — feasible at this price" : "Preliminary — not feasible at this price",
    verdictHeadline: (feasible ? "Development profit +" : "Development loss −") + money(profit),
    verdictSub:
      "Stabilized value " +
      money(stabilizedValue) +
      (feasible ? " exceeds " : " is below ") +
      "total capital in " +
      money(totalCapitalIn) +
      ". At " +
      money(acquisitionPrice) +
      " acquisition you would " +
      (feasible ? "clear the cost basis" : "overpay") +
      ".",
    breakevenNote: breakevenAchievable
      ? "Value minus development cost, at zero profit."
      : "Development cost alone exceeds stabilized value by " +
        money(developmentCost - stabilizedValue) +
        ". No acquisition price — including $0 — makes this feasible at these assumptions.",
  };
}

export const PRO_FORMA_DEFAULTS: ProFormaInputs = {
  acquisitionPrice: 625000,
  rentPerUnitMonth: 2200,
  hardCostPerGsf: 300,
  exitCapRatePct: 6.0,
};
