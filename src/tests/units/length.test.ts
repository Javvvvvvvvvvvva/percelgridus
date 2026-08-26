import { describe, it, expect } from "vitest";
import { Length } from "@/lib/units/length.js";

describe("Length (canonical meters)", () => {
  it("keeps the kernel in meters", () => {
    expect(Length.feet(1).unit).toBe("m");
    expect(Length.feet(1).toMeters()).toBeCloseTo(0.3048, 10);
  });

  it("round-trips meters -> feet -> meters exactly", () => {
    const original = Length.meters("10");
    const back = Length.feet(original.toFeet());
    expect(back.toMeters()).toBeCloseTo(10, 9);
  });

  it("round-trips feet -> meters -> feet exactly", () => {
    const original = Length.feet("35");
    const back = Length.meters(original.toMeters());
    expect(back.toFeet()).toBeCloseTo(35, 9);
  });

  it("converts to architectural feet-and-inches", () => {
    expect(Length.feet(8).plus(Length.inches(3)).toFeetInches()).toEqual({
      feet: 8,
      inches: 3,
    });
    expect(Length.meters("2.5").format()).toBe(`8'-2"`); // 2.5 m ≈ 8'2"
  });

  it("adds and subtracts across construction units", () => {
    const wall = Length.feet(10).plus(Length.inches(6));
    expect(wall.toFeet()).toBeCloseTo(10.5, 9);
  });

  it("refuses non-finite lengths", () => {
    expect(() => Length.meters(Number.NaN)).toThrow();
  });
});
