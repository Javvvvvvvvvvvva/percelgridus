/**
 * Column serialization for the value objects — the "money is decimal, never
 * float" boundary made explicit.
 *
 * README-US: "Store money as decimal USD, never floating-point display values."
 * Every value object already has an exact canonical string form (Money
 * `toDecimalString`, Length `toMetersString`, Area `toSquareMetersString`); a
 * persisted column carries that string plus its explicit unit/currency tag, and
 * these functions are the only sanctioned crossing. A raw JS `number` never
 * touches a stored money/length/area value, so no float rounding enters the
 * store.
 */

import { Area, Length, Money } from "../units/index.js";
import type { CurrencyCode } from "../units/index.js";

/** A persisted USD amount: an exact decimal string with an explicit currency. */
export interface MoneyColumn {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

/** A persisted length: exact meters (the canonical kernel unit) as a string. */
export interface LengthColumn {
  readonly meters: string;
}

/** A persisted area: exact square meters as a string. */
export interface AreaColumn {
  readonly squareMeters: string;
}

export function serializeMoney(money: Money): MoneyColumn {
  return { amount: money.toDecimalString(), currency: money.currency };
}

export function deserializeMoney(col: MoneyColumn): Money {
  if (col.currency !== "USD") {
    throw new Error(`Unsupported persisted currency: ${col.currency}`);
  }
  return Money.usd(col.amount);
}

export function serializeLength(length: Length): LengthColumn {
  return { meters: length.toMetersString() };
}

export function deserializeLength(col: LengthColumn): Length {
  return Length.meters(col.meters);
}

export function serializeArea(area: Area): AreaColumn {
  return { squareMeters: area.toSquareMetersString() };
}

export function deserializeArea(col: AreaColumn): Area {
  return Area.squareMeters(col.squareMeters);
}
