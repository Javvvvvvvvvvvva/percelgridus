import { describe, it, expect } from "vitest";
import {
  serializeMoney,
  deserializeMoney,
  serializeLength,
  deserializeLength,
  serializeArea,
  deserializeArea,
} from "@/lib/persistence/index.js";
import { Area, Length, Money } from "@/lib/units/index.js";

describe("money serialization", () => {
  it("round-trips an exact decimal with no float drift", () => {
    // 0.1 + 0.2 famously != 0.3 in float; the decimal string must survive.
    const m = Money.usd("1234567.89").plus("0.01");
    const col = serializeMoney(m);
    // Exact decimal (trailing zero normalized away), not a float like 1234567.9000001.
    expect(col).toEqual({ amount: "1234567.9", currency: "USD" });
    expect(deserializeMoney(col).equals(m)).toBe(true);
    expect(deserializeMoney(col).equals(Money.usd("1234567.90"))).toBe(true);
  });

  it("carries currency explicitly and rejects a non-USD column", () => {
    expect(serializeMoney(Money.usd("5")).currency).toBe("USD");
    expect(() =>
      deserializeMoney({ amount: "5", currency: "EUR" as "USD" }),
    ).toThrow(/currency/i);
  });

  it("preserves high-precision fractional cents as a string", () => {
    const m = Money.usd("0.00005");
    expect(serializeMoney(m).amount).toBe("0.00005");
    expect(deserializeMoney(serializeMoney(m)).equals(m)).toBe(true);
  });
});

describe("length and area serialization", () => {
  it("round-trips a length as exact meters", () => {
    const len = Length.feet("35");
    const col = serializeLength(len);
    expect(col.meters).toBe("10.668"); // 35 * 0.3048, exact
    expect(deserializeLength(col).toMeters()).toBeCloseTo(len.toMeters());
  });

  it("round-trips an area as exact square meters", () => {
    const area = Area.squareMeters("836.127");
    expect(deserializeArea(serializeArea(area)).toSquareMeters()).toBeCloseTo(
      836.127,
    );
  });
});
