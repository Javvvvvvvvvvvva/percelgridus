import { describe, it, expect } from "vitest";
import {
  JurisdictionRegistry,
  parseStateCity,
} from "@/lib/jurisdiction/index.js";
import { registerMinneapolis, MINNEAPOLIS_JURISDICTION_ID } from "@/lib/integrations/us-minneapolis/index.js";
import { registerStPaul, SAINT_PAUL_JURISDICTION_ID } from "@/lib/integrations/us-stpaul/index.js";

describe("parseStateCity", () => {
  it("parses the Census 'STREET, CITY, ST, ZIP' form", () => {
    expect(parseStateCity("2320 COLFAX AVE S, MINNEAPOLIS, MN, 55405")).toEqual({
      stateCode: "MN",
      city: "minneapolis",
    });
  });

  it("parses a 'CITY, ST ZIP' form (state and zip in one part)", () => {
    expect(parseStateCity("375 Jackson St, Saint Paul, MN 55101")).toEqual({
      stateCode: "MN",
      city: "saint paul",
    });
  });

  it("returns empty parts when no state token is present", () => {
    expect(parseStateCity("just a street with no state")).toEqual({});
  });
});

describe("JurisdictionRegistry.resolveByAddress", () => {
  const registry = new JurisdictionRegistry();
  registerMinneapolis(registry);
  registerStPaul(registry);

  it("routes a Minneapolis address to the Minneapolis profile", () => {
    const p = registry.resolveByAddress("2320 COLFAX AVE S, MINNEAPOLIS, MN, 55405");
    expect(p?.jurisdictionId).toBe(MINNEAPOLIS_JURISDICTION_ID);
  });

  it("routes a Saint Paul address (and its spelling variants) to the Saint Paul profile", () => {
    for (const addr of [
      "375 Jackson St, Saint Paul, MN 55101",
      "375 Jackson St, ST PAUL, MN, 55101",
      "375 Jackson St, St. Paul, MN 55101",
    ]) {
      expect(registry.resolveByAddress(addr)?.jurisdictionId).toBe(SAINT_PAUL_JURISDICTION_ID);
    }
  });

  it("returns undefined for a covered state but an uncovered city", () => {
    expect(registry.resolveByAddress("1 Main St, Duluth, MN, 55802")).toBeUndefined();
  });

  it("returns undefined for a different state, even a same-named city", () => {
    // "Saint Paul" exists in other states; the state guard prevents mis-routing.
    expect(registry.resolveByAddress("1 Main St, Saint Paul, NE, 68873")).toBeUndefined();
  });

  it("returns undefined when the address has no parseable state/city", () => {
    expect(registry.resolveByAddress("nowhere in particular")).toBeUndefined();
  });
});
