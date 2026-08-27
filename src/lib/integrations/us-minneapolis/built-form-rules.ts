/**
 * Minneapolis built-form by-right standards — the numeric envelope keyed by the
 * built form overlay district (Chapter 540), plus the pure mapping from a
 * resolved district to Evidence.
 *
 * Honesty boundary (README-US §2):
 *   - The by-right numeric standards are defined per built form district in
 *     Minneapolis Code Chapter 540. Values here are transcribed from the City's
 *     published Chapter 540 text (fetched when the ordinance host is reachable);
 *     each is stamped with its exact section and verbatim text.
 *   - Every seeded value is a preliminary reference at `verification:
 *     "unverified"`, which the approval gate treats as a blocker — never a legal
 *     maximum until a professional confirms it ("no safe nationwide hard-coded
 *     zoning engine").
 *   - Only standards that the built form district determines ALONE are modeled
 *     as scalars here. Today that is maximum HEIGHT (Table 540-6). Maximum FAR
 *     (Table 540-2), lot coverage (Table 540-23), and yards/setbacks are
 *     conditional on the primary district category and/or the building use, so
 *     collapsing them to one number per built form district would misrepresent
 *     the ordinance; they stay Unresolved until the envelope is parameterized by
 *     primary district and use.
 *
 * A district with no sourced value for a field yields Unresolved for it, so
 * coverage only ever grows by adding sourced rows.
 */

import type { RuleCitation } from "../../jurisdiction/evidence.js";
import { officialRule, unresolved } from "../../jurisdiction/evidence.js";
import type {
  Evidence,
  EvidenceOrUnresolved,
  Unresolved,
} from "../../jurisdiction/evidence.js";
import { Length } from "../../units/index.js";
import { minneapolisCitation } from "./zoning-shared.js";

/** A value transcribed from a specific ordinance section. */
export interface SourcedValue<T> {
  readonly value: T;
  /** Exact ordinance section, e.g. "§ 540.410". */
  readonly section: string;
  /** Verbatim source text the value was read from. */
  readonly originalText?: string;
  /** When the section took effect. */
  readonly effectiveDate?: string;
}

/** The by-right numeric standards a built form district sets (Chapter 540). */
export interface BuiltFormStandards {
  /** Maximum principal-structure height. `feet` is authoritative for the
   * Length envelope; `stories` is carried for display. */
  readonly maxHeight?: SourcedValue<{ feet: number; stories?: number }>;
  /** Maximum floor area ratio. */
  readonly maxFar?: SourcedValue<number>;
  /** Maximum lot coverage as a fraction (0..1). */
  readonly maxLotCoverage?: SourcedValue<number>;
  /** Minimum setbacks in feet. */
  readonly minSetbacks?: SourcedValue<{
    frontFt: number;
    sideFt: number;
    rearFt: number;
  }>;
}

/**
 * Maximum height per built form district, verbatim from Minneapolis Code
 * § 540.410, Table 540-6 "Maximum Height by District" (fetched from the City's
 * published Chapter 540). Height is the one by-right standard keyed by the
 * built form district ALONE, so it maps cleanly here; the value is authoritative
 * as `feet` with `stories` carried for display.
 *
 * Only districts whose GIS name matches Table 540-6 exactly are seeded. Left
 * unseeded on purpose (each remains Unresolved):
 *   - "Core 50" — Table 540-6 states "No limit" (no numeric maximum);
 *   - "Transit 30A" / "Transit 30B" — the GIS layer splits these, but Table
 *     540-6 lists a single "Transit 30"; the A/B reconciliation must be
 *     confirmed against the ordinance before a value is asserted.
 *
 * Every seeded value is a preliminary reference at `verification: "unverified"`
 * (see `rule` below) — it blocks approval until a professional confirms it, and
 * is subject to the use-specific limits in Table 540-7 (§ 540.410(a)).
 */
const HEIGHT_SECTION = "§ 540.410 (Table 540-6)";
function height(
  feet: number,
  stories: number,
): SourcedValue<{ feet: number; stories?: number }> {
  return {
    value: { feet, stories },
    section: HEIGHT_SECTION,
    originalText: `${stories} stories, ${feet} feet`,
  };
}

/**
 * Sourced standards keyed by built form district name (as the GIS layer spells
 * it, e.g. "Interior 2"). Currently carries maximum height only; FAR, lot
 * coverage, and yards are conditional on the primary district and/or use (see
 * the header) and are not represented as built-form-only scalars, so they stay
 * Unresolved. Do not add a row from memory — only from the ordinance text with
 * its real section.
 */
export const MINNEAPOLIS_BUILT_FORM_STANDARDS: Readonly<
  Record<string, BuiltFormStandards>
> = {
  "Interior 1": { maxHeight: height(35, 2.5) },
  "Interior 2": { maxHeight: height(35, 2.5) },
  "Interior 3": { maxHeight: height(42, 3) },
  "Corridor 3": { maxHeight: height(42, 3) },
  "Corridor 4": { maxHeight: height(56, 4) },
  "Corridor 6": { maxHeight: height(84, 6) },
  "Transit 10": { maxHeight: height(140, 10) },
  "Transit 15": { maxHeight: height(210, 15) },
  "Transit 20": { maxHeight: height(280, 20) },
  Parks: { maxHeight: height(35, 2.5) },
  Production: { maxHeight: height(140, 10) },
};

export interface BuiltFormRuleContext {
  /** Resolved built form district name, e.g. "Interior 2". */
  readonly builtFormDistrict: string;
  readonly retrievalDate: string;
  readonly parserVersion: string;
  readonly owner: string;
}

/** The subset of a ByRightEnvelope that the built form district governs. */
export interface BuiltFormNumericEnvelope {
  readonly maxFar: EvidenceOrUnresolved<number>;
  readonly maxLotCoverage: EvidenceOrUnresolved<number>;
  readonly maxHeight: EvidenceOrUnresolved<Length>;
  readonly minSetbacks: EvidenceOrUnresolved<{
    front: Length;
    side: Length;
    rear: Length;
  }>;
}

function citation(
  sourced: SourcedValue<unknown>,
  ctx: BuiltFormRuleContext,
): RuleCitation {
  return minneapolisCitation(sourced.section, ctx.parserVersion, ctx.retrievalDate, {
    zoningDistrict: ctx.builtFormDistrict,
    ...(sourced.originalText !== undefined
      ? { originalText: sourced.originalText }
      : {}),
    ...(sourced.effectiveDate !== undefined
      ? { effectiveDate: sourced.effectiveDate }
      : {}),
  });
}

/** A parsed standard is a preliminary reference until a professional confirms. */
function rule<T>(value: T, sourced: SourcedValue<unknown>, ctx: BuiltFormRuleContext): Evidence<T> {
  return officialRule(value, citation(sourced, ctx), {
    confidence: "medium",
    verification: "unverified",
  });
}

function gap(subject: string, ctx: BuiltFormRuleContext): Unresolved {
  return unresolved(
    subject,
    ctx.owner,
    `No sourced Chapter 540 standard for the ${ctx.builtFormDistrict} built ` +
      `form district is available (the ordinance text is not reachable here); ` +
      `confirm ${subject} against Minneapolis Code Chapter 540.`,
  );
}

/**
 * Build the numeric by-right envelope for a resolved built form district. Each
 * field is an official (but unverified, approval-blocking) rule when the table
 * carries a sourced value, and Unresolved otherwise.
 */
export function builtFormNumericEnvelope(
  ctx: BuiltFormRuleContext,
  standards: BuiltFormStandards | undefined = MINNEAPOLIS_BUILT_FORM_STANDARDS[
    ctx.builtFormDistrict
  ],
): BuiltFormNumericEnvelope {
  const std = standards;

  const maxFar: EvidenceOrUnresolved<number> = std?.maxFar
    ? rule(std.maxFar.value, std.maxFar, ctx)
    : gap("maximum floor area ratio", ctx);

  const maxLotCoverage: EvidenceOrUnresolved<number> = std?.maxLotCoverage
    ? rule(std.maxLotCoverage.value, std.maxLotCoverage, ctx)
    : gap("maximum lot coverage", ctx);

  const maxHeight: EvidenceOrUnresolved<Length> = std?.maxHeight
    ? rule(Length.feet(std.maxHeight.value.feet), std.maxHeight, ctx)
    : gap("maximum height", ctx);

  const minSetbacks: BuiltFormNumericEnvelope["minSetbacks"] = std?.minSetbacks
    ? rule(
        {
          front: Length.feet(std.minSetbacks.value.frontFt),
          side: Length.feet(std.minSetbacks.value.sideFt),
          rear: Length.feet(std.minSetbacks.value.rearFt),
        },
        std.minSetbacks,
        ctx,
      )
    : gap("minimum setbacks (front/side/rear)", ctx);

  return { maxFar, maxLotCoverage, maxHeight, minSetbacks };
}
