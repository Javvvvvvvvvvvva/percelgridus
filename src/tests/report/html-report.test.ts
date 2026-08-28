import { describe, it, expect } from "vitest";
import { renderHtmlReport } from "@/lib/report/index.js";
import type { DecisionReport } from "@/lib/report/index.js";

function report(over: Partial<DecisionReport> = {}): DecisionReport {
  return {
    address: "3300 Aldrich Ave S, Minneapolis, MN",
    facts: [
      {
        label: "Zoning district",
        value: "UN2",
        provenance: "official",
        confidence: "high",
        verification: "machine-parsed",
        source: "City of Minneapolis — Planning Primary Zoning (retrieved 2026-08-26)",
      },
      {
        label: "Max height",
        value: "35 ft",
        provenance: "official",
        confidence: "medium",
        verification: "unverified",
        source: "Minneapolis Code Title 20 § 540.410 (retrieved 2026-08-26)",
      },
    ],
    gaps: [
      {
        label: "Max floor area ratio",
        subject: "FAR",
        owner: "planner",
        requiredAction: "supply the proposed use class",
        blocksApproval: true,
      },
    ],
    blockers: [{ subject: "FAR", reason: "supply the proposed use class" }],
    approvable: false,
    summary: "Preliminary reference only.",
    ...over,
  };
}

describe("renderHtmlReport", () => {
  it("emits a self-contained document with the decision and sections", () => {
    const html = renderHtmlReport(report());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Due Diligence — 3300 Aldrich Ave S");
    expect(html).toContain("Not approvable — 1 blocking item(s)");
    expect(html).toContain("Known facts (2)");
    expect(html).toContain("Open items (1)");
    expect(html).toContain("Blocks approval");
    // Self-contained: no external network references.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("flags an approvable report with the ok banner", () => {
    const html = renderHtmlReport(
      report({ approvable: true, gaps: [], blockers: [] }),
    );
    expect(html).toContain("No open blockers");
    expect(html).toContain('class="decision ok"');
  });

  it("HTML-escapes external values (no markup injection)", () => {
    const html = renderHtmlReport(
      report({
        facts: [
          {
            label: "Owner of record",
            value: "<script>alert(1)</script>",
            provenance: "official",
            confidence: "high",
            verification: "machine-parsed",
            note: 'evil " onload=x',
          },
        ],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("evil &quot; onload=x");
  });
});
