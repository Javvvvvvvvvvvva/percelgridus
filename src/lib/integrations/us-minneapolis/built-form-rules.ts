/**
 * Minneapolis built-form by-right standards — the numeric envelope keyed by the
 * built form overlay district (Chapter 540), plus the pure mapping from a
 * resolved district to Evidence.
 *
 * Honesty boundary (README-US §2):
 *   - The by-right numeric standards (height, FAR, lot coverage, setbacks) are
 *     defined per built form district in Minneapolis Code Chapter 540.
 *   - The ordinance TEXT hosts (municode.com, minneapolis2040.com) are not
 *     reachable from this egress environment, so NO numeric value has been
 *     transcribed. A cited-but-unsourced number is exactly what the code warns
 *     against ("no safe nationwide hard-coded zoning engine"; state a
 *     "by-right reference", not a legal maximum).
 *   - The table below is therefore empty. When a district's row is added
 *     straight from the ordinance text — with its exact section, verbatim text,
 *     and effective date — every value flows through as an official rule at
 *     `unverified` status, which the approval gate already treats as a blocker:
 *     a preliminary reference a professional must confirm, never a legal max.
 *
 * A district with no row here yields Unresolved for every numeric field, so
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
 * Sourced standards keyed by built form district name (as the GIS layer spells
 * it, e.g. "Interior 2"). EMPTY by design — see the file header. Do not add a
 * row from memory; add it only from the ordinance text with a real section.
 */
export const MINNEAPOLIS_BUILT_FORM_STANDARDS: Readonly<
  Record<string, BuiltFormStandards>
> = {};

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
