import { describe, it, expect } from "vitest";
import {
  approvalBlockers,
  isEvidence,
  isUnresolved,
  isVerified,
  officialRule,
  unresolved,
  userAssumption,
  type RuleCitation,
} from "@/lib/jurisdiction/evidence.js";

const citation: RuleCitation = {
  label: "City of Minneapolis Zoning Code",
  locator: "https://library.municode.com/mn/minneapolis",
  jurisdictionId: "us-mn-hennepin-minneapolis",
  zoningDistrict: "R2B",
  ordinanceTitle: "Minneapolis Code of Ordinances Title 20",
  ordinanceSection: "§ 546.170",
  retrievalDate: "2026-08-26",
  effectiveDate: "2024-01-01",
  parserVersion: "mpls-zoning@2026.08",
};

describe("evidence provenance", () => {
  it("separates a user assumption from an official rule", () => {
    const assumption = userAssumption(1.2);
    const rule = officialRule(0.5, citation);
    expect(assumption.provenance).toBe("user-input");
    expect(rule.provenance).toBe("official");
    expect(rule.citation?.ordinanceSection).toBe("§ 546.170");
  });

  it("treats machine-parsed official rules as unverified", () => {
    expect(isVerified(officialRule(0.5, citation))).toBe(false);
    expect(
      isVerified(officialRule(0.5, citation, { verification: "verified" })),
    ).toBe(true);
  });

  it("narrows evidence vs. unresolved", () => {
    const gap = unresolved("rear setback", "planner", "confirm from survey");
    expect(isUnresolved(gap)).toBe(true);
    expect(isEvidence(userAssumption(1))).toBe(true);
  });
});

describe("approval blockers", () => {
  it("blocks on unresolved items and unverified official rules", () => {
    const blockers = approvalBlockers([
      userAssumption(1.2), // fine
      officialRule(0.5, citation), // unverified rule -> blocks
      unresolved("flood zone", "planner", "pull FEMA NFHL"), // blocks
      unresolved("nice-to-have", "analyst", "optional", {
        blocksApproval: false,
      }),
    ]);
    expect(blockers.map((b) => b.subject).sort()).toEqual(
      ["flood zone", "§ 546.170"].sort(),
    );
  });

  it("does not block once the official rule is verified", () => {
    const blockers = approvalBlockers([
      officialRule(0.5, citation, { verification: "verified" }),
    ]);
    expect(blockers).toHaveLength(0);
  });
});
