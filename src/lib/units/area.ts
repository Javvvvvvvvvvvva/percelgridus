/**
 * Area value object.
 *
 * Contract (README-US §"Units and currency are explicit"):
 *   - The geometry kernel stays in a canonical physical unit (square
 *     meters) with explicit metadata.
 *   - U.S. display uses square feet and acres.
 *   - No silent metric / U.S. customary conversion path.
 *
 * Cost bases such as USD/GSF and USD/NSF are computed against square feet,
 * so a scenario's area schedule must be able to produce GSF/NSF explicitly
 * rather than leaking a raw number that a caller guesses the unit of.
 *
 * Conversion factors (derived from the exact international foot):
 *   1 square foot = 0.3048^2       = 0.09290304 square meters (exact)
 *   1 acre        = 43,560 sq ft   = 4046.8564224 square meters (exact)
 */

import Decimal from "decimal.js";

const SQM_PER_SQFT = new Decimal("0.09290304");
const SQFT_PER_ACRE = new Decimal(43560);
const SQM_PER_ACRE = SQM_PER_SQFT.times(SQFT_PER_ACRE);

export type AreaLike = Area | number | string | Decimal;

/** An area, stored canonically in square meters. */
export class Area {
  /** Canonical kernel unit. */
  readonly unit = "m2" as const;
  private readonly sqm: Decimal;

  private constructor(sqm: Decimal) {
    this.sqm = sqm;
  }

  static squareMeters(value: number | string | Decimal): Area {
    return new Area(toDecimal(value));
  }

  static squareFeet(value: number | string | Decimal): Area {
    return new Area(toDecimal(value).times(SQM_PER_SQFT));
  }

  static acres(value: number | string | Decimal): Area {
    return new Area(toDecimal(value).times(SQM_PER_ACRE));
  }

  static zero(): Area {
    return new Area(new Decimal(0));
  }

  plus(other: AreaLike): Area {
    return new Area(this.sqm.plus(Area.from(other).sqm));
  }

  minus(other: AreaLike): Area {
    return new Area(this.sqm.minus(Area.from(other).sqm));
  }

  times(factor: number | string | Decimal): Area {
    return new Area(this.sqm.times(toDecimal(factor)));
  }

  private static from(value: AreaLike): Area {
    return value instanceof Area ? value : Area.squareMeters(value);
  }

  /** Canonical persisted form: exact square meters. */
  toSquareMeters(): number {
    return this.sqm.toNumber();
  }

  toSquareMetersString(): string {
    return this.sqm.toFixed();
  }

  /** Gross/net square feet — the basis for USD/GSF and USD/NSF. */
  toSquareFeet(): number {
    return this.sqm.div(SQM_PER_SQFT).toNumber();
  }

  toAcres(): number {
    return this.sqm.div(SQM_PER_ACRE).toNumber();
  }

  format(): string {
    const sqft = this.sqm
      .div(SQM_PER_SQFT)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    return `${new Intl.NumberFormat("en-US").format(sqft)} sq ft`;
  }

  toString(): string {
    return `${this.toSquareMetersString()} m2`;
  }
}

function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite area: ${value}`);
    }
    return new Decimal(value);
  }
  return new Decimal(value);
}
