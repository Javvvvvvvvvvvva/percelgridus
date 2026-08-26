import { describe, it, expect } from "vitest";
import { Money, sumMoney } from "@/lib/units/money.js";

describe("Money (USD decimal)", () => {
  it("adds without binary float error (0.1 + 0.2)", () => {
    const total = Money.usd("0.1").plus("0.2");
    expect(total.toDecimalString()).toBe("0.3");
    expect(total.toNumber()).toBe(0.3);
  });

  it("round-trips through cents", () => {
    const m = Money.usd("1234.56");
    expect(m.toCents()).toBe(123456);
    expect(Money.fromCents(123456).equals(m)).toBe(true);
  });

  it("uses banker's rounding to cents", () => {
    expect(Money.usd("0.125").toCents()).toBe(12); // 12.5 -> 12 (to even)
    expect(Money.usd("0.135").toCents()).toBe(14); // 13.5 -> 14 (to even)
  });

  it("preserves precision across a long sum", () => {
    const amounts = Array.from({ length: 9 }, () => Money.usd("0.01"));
    expect(sumMoney(amounts).toDecimalString()).toBe("0.09");
  });

  it("formats as USD", () => {
    expect(Money.usd("1234.5").format()).toBe("$1,234.50");
  });

  it("refuses non-finite amounts", () => {
    expect(() => Money.usd(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => Money.usd(Number.NaN)).toThrow();
  });

  it("refuses division by zero", () => {
    expect(() => Money.usd("100").dividedBy(0)).toThrow();
  });

  it("compares amounts", () => {
    expect(Money.usd("100").compare("200")).toBe(-1);
    expect(Money.usd("200").compare("200")).toBe(0);
    expect(Money.usd("300").compare("200")).toBe(1);
  });
});
