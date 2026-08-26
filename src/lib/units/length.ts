/**
 * Length value object.
 *
 * Contract (README-US §"Units and currency are explicit"):
 *   - The geometry kernel stays in a canonical physical unit (meters) with
 *     explicit metadata.
 *   - U.S. display uses feet and inches.
 *   - There is no silent metric / U.S. customary conversion path: a raw
 *     `number` never crosses a unit boundary. Every length is a Length that
 *     knows it is meters internally and is converted only through an
 *     explicit accessor.
 *
 * Conversion factors are exact by definition:
 *   1 foot   = 0.3048 meters (international foot, exact)
 *   1 inch   = 0.0254 meters (exact)
 */

import Decimal from "decimal.js";

const METERS_PER_FOOT = new Decimal("0.3048");
const METERS_PER_INCH = new Decimal("0.0254");
const INCHES_PER_FOOT = 12;

export type LengthLike = Length | number | string | Decimal;

/** A length, stored canonically in meters. */
export class Length {
  /** Canonical kernel unit. */
  readonly unit = "m" as const;
  private readonly meters: Decimal;

  private constructor(meters: Decimal) {
    this.meters = meters;
  }

  static meters(value: number | string | Decimal): Length {
    return new Length(toDecimal(value));
  }

  static feet(value: number | string | Decimal): Length {
    return new Length(toDecimal(value).times(METERS_PER_FOOT));
  }

  static inches(value: number | string | Decimal): Length {
    return new Length(toDecimal(value).times(METERS_PER_INCH));
  }

  static zero(): Length {
    return new Length(new Decimal(0));
  }

  plus(other: LengthLike): Length {
    return new Length(this.meters.plus(Length.from(other).meters));
  }

  minus(other: LengthLike): Length {
    return new Length(this.meters.minus(Length.from(other).meters));
  }

  times(factor: number | string | Decimal): Length {
    return new Length(this.meters.times(toDecimal(factor)));
  }

  private static from(value: LengthLike): Length {
    return value instanceof Length ? value : Length.meters(value);
  }

  /** Canonical persisted form: exact meters as a decimal string. */
  toMeters(): number {
    return this.meters.toNumber();
  }

  toMetersString(): string {
    return this.meters.toFixed();
  }

  toFeet(): number {
    return this.meters.div(METERS_PER_FOOT).toNumber();
  }

  toInches(): number {
    return this.meters.div(METERS_PER_INCH).toNumber();
  }

  /**
   * Architectural feet-and-inches display, e.g. { feet: 8, inches: 3 }.
   * Inches are rounded to the nearest whole inch and carried into feet.
   */
  toFeetInches(): { feet: number; inches: number } {
    const totalInches = this.meters
      .div(METERS_PER_INCH)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    return {
      feet: Math.trunc(totalInches / INCHES_PER_FOOT),
      inches: totalInches % INCHES_PER_FOOT,
    };
  }

  format(): string {
    const { feet, inches } = this.toFeetInches();
    return `${feet}'-${inches}"`;
  }

  toString(): string {
    return `${this.toMetersString()} m`;
  }
}

function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite length: ${value}`);
    }
    return new Decimal(value);
  }
  return new Decimal(value);
}
