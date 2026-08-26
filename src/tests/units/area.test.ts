import { describe, it, expect } from "vitest";
import { Area } from "@/lib/units/area.js";

describe("Area (canonical square meters)", () => {
  it("keeps the kernel in square meters", () => {
    expect(Area.squareFeet(1000).unit).toBe("m2");
  });

  it("round-trips m² -> sq ft -> m² exactly", () => {
    const original = Area.squareMeters("500");
    const back = Area.squareFeet(original.toSquareFeet());
    expect(back.toSquareMeters()).toBeCloseTo(500, 8);
  });

  it("converts acres to square feet at the exact factor", () => {
    expect(Area.acres(1).toSquareFeet()).toBeCloseTo(43560, 6);
  });

  it("round-trips acres -> m² -> acres", () => {
    const original = Area.acres("0.25");
    const back = Area.squareMeters(original.toSquareMeters());
    expect(back.toAcres()).toBeCloseTo(0.25, 9);
  });

  it("sums floor areas for a GSF total", () => {
    const gsf = Area.squareFeet(1200)
      .plus(Area.squareFeet(1200))
      .plus(Area.squareFeet(900));
    expect(gsf.toSquareFeet()).toBeCloseTo(3300, 6);
  });

  it("formats as square feet", () => {
    expect(Area.squareFeet(12345).format()).toBe("12,345 sq ft");
  });
});
