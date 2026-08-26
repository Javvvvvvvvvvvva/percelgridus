/**
 * UnitProfile — the display and cost-basis conventions a jurisdiction uses.
 *
 * The geometry kernel is always canonical (meters, square meters). A
 * UnitProfile does NOT change the kernel; it declares how canonical
 * quantities are shown and which cost bases are labeled, so that a
 * conversion is always an explicit, declared act (README-US §"Units and
 * currency are explicit").
 */

import type { CurrencyCode } from "./money.js";

export type LengthDisplayUnit = "feet-inches" | "feet" | "meters";
export type AreaDisplayUnit = "square-feet" | "acres" | "square-meters";

/**
 * Labeled cost bases (README-US: "Label cost bases such as USD/GSF,
 * USD/NSF, USD/unit, and USD/parking stall."). A cost basis pairs a money
 * currency with the physical/counting quantity it is charged against.
 */
export type CostBasis =
  | "USD/GSF" // per gross square foot
  | "USD/NSF" // per net square foot
  | "USD/unit" // per dwelling unit
  | "USD/parking-stall"; // per structured/surface stall

export interface UnitProfile {
  /** Human-facing measurement system. The kernel stays metric regardless. */
  readonly system: "us-customary";
  readonly currency: CurrencyCode;
  readonly lengthDisplay: LengthDisplayUnit;
  readonly areaDisplay: AreaDisplayUnit;
  /** Cost bases this profile is allowed to express, for validation. */
  readonly costBases: readonly CostBasis[];
}

/** The default U.S. display profile. */
export const US_UNIT_PROFILE: UnitProfile = {
  system: "us-customary",
  currency: "USD",
  lengthDisplay: "feet-inches",
  areaDisplay: "square-feet",
  costBases: ["USD/GSF", "USD/NSF", "USD/unit", "USD/parking-stall"],
};
