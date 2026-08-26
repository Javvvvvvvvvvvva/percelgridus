/**
 * USD money value object.
 *
 * Contract (README-US §"Units and currency are explicit"):
 *   - Store money as decimal USD, never floating-point display values.
 *   - Currency is explicit and carried with every amount; there is no
 *     silent KRW/USD conversion path anywhere in the system.
 *
 * The Korean prototype stored money as integer 만원 (manwon) directly in
 * DB columns and rounded with `toManWon` at the boundary. That coupling is
 * exactly what this file replaces: money here is a currency-tagged decimal,
 * and 만원/원 do not exist in the U.S. profile.
 *
 * Internals use decimal.js (the same engine the reusable financial math
 * from the Korean prototype already runs on), so ledger math ported from
 * that engine keeps its precision guarantees.
 */

import Decimal from "decimal.js";

Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_EVEN, // banker's rounding
  toExpNeg: -9,
  toExpPos: 21,
});

/** The only currency the U.S. profile handles. */
export type CurrencyCode = "USD";

export type MoneyLike = Money | number | string | Decimal;

const CENTS_PER_DOLLAR = new Decimal(100);

/**
 * An amount of U.S. dollars, stored as an exact decimal.
 *
 * Never expose the raw Decimal for storage; use {@link toDecimalString}
 * (canonical persisted form) or {@link toCents} (integer, for systems that
 * require minor units). {@link toNumber} exists only for the display /
 * charting boundary and must not feed back into further money math.
 */
export class Money {
  readonly currency: CurrencyCode;
  private readonly amount: Decimal;

  private constructor(amount: Decimal, currency: CurrencyCode) {
    this.amount = amount;
    this.currency = currency;
  }

  /** Construct USD from a decimal-safe input (string preferred for literals). */
  static usd(value: MoneyLike): Money {
    if (value instanceof Money) {
      value.assertUsd();
      return value;
    }
    return new Money(toDecimal(value), "USD");
  }

  /** Construct USD from an integer number of cents. */
  static fromCents(cents: number | string | Decimal): Money {
    return new Money(toDecimal(cents).div(CENTS_PER_DOLLAR), "USD");
  }

  static zero(): Money {
    return new Money(new Decimal(0), "USD");
  }

  private assertUsd(): void {
    if (this.currency !== "USD") {
      throw new Error(`Unsupported currency: ${this.currency satisfies never}`);
    }
  }

  private sameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Refusing to mix currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  plus(other: MoneyLike): Money {
    const o = Money.usd(other);
    this.sameCurrency(o);
    return new Money(this.amount.plus(o.amount), this.currency);
  }

  minus(other: MoneyLike): Money {
    const o = Money.usd(other);
    this.sameCurrency(o);
    return new Money(this.amount.minus(o.amount), this.currency);
  }

  times(factor: number | string | Decimal): Money {
    return new Money(this.amount.times(toDecimal(factor)), this.currency);
  }

  dividedBy(divisor: number | string | Decimal): Money {
    const d = toDecimal(divisor);
    if (d.isZero()) throw new Error("Division of money by zero");
    return new Money(this.amount.div(d), this.currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  equals(other: MoneyLike): boolean {
    const o = Money.usd(other);
    return this.currency === o.currency && this.amount.equals(o.amount);
  }

  compare(other: MoneyLike): -1 | 0 | 1 {
    const o = Money.usd(other);
    this.sameCurrency(o);
    return this.amount.comparedTo(o.amount) as -1 | 0 | 1;
  }

  /** Canonical persisted form: an exact decimal string, e.g. "1234.56". */
  toDecimalString(): string {
    return this.amount.toFixed();
  }

  /** Integer minor units (cents), banker's-rounded. For minor-unit stores. */
  toCents(): number {
    return this.amount
      .times(CENTS_PER_DOLLAR)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
  }

  /** Display/charting boundary only — do not feed back into money math. */
  toNumber(): number {
    return this.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /** Localized display string, e.g. "$1,234.56". */
  format(): string {
    const rounded = this.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: this.currency,
    }).format(rounded.toNumber());
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }
}

function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite money amount: ${value}`);
    }
    return new Decimal(value);
  }
  return new Decimal(value);
}

export function sumMoney(amounts: readonly MoneyLike[]): Money {
  return amounts.reduce<Money>((acc, m) => acc.plus(m), Money.zero());
}
