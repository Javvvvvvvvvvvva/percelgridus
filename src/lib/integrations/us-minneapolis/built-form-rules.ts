/**
 * Minneapolis built-form by-right standards — the numeric envelope and the pure
 * mapping from a resolved parcel context to Evidence, transcribed verbatim from
 * the City's published Chapter 540.
 *
 * The envelope depends on more than the built form district, and this module
 * models exactly which inputs each standard needs — never collapsing a
 * conditional rule to a single number:
 *
 *   - HEIGHT (§ 540.410, Table 540-6): built form district ALONE.
 *   - LOT COVERAGE (§ 540.910, Table 540-23): built form district × primary
 *     district CATEGORY (Urban Neighborhood / Residential Mixed-Use vs. the
 *     Commercial/Downtown/Production/Transportation group).
 *   - FLOOR AREA RATIO (§ 540.110, Table 540-2): built form district × primary
 *     category × the building's USE class.
 *   - SETBACKS / yards (§ 540.8xx): contextual (established front-yard averaging,
 *     etc.) — not modeled; stays Unresolved.
 *
 * Honesty boundary (README-US §2): every sourced value is an `official` rule at
 * `verification: "unverified"`, which the approval gate treats as a blocker — a
 * preliminary reference a professional must confirm, never a legal maximum, and
 * subject to use-specific limits (e.g. Table 540-7 for height). A field whose
 * required inputs are unresolved (primary district not determined, use class not
 * supplied) yields Unresolved, so a number is asserted only when the ordinance
 * actually determines one.
 *
 * Only districts whose GIS name matches the ordinance tables exactly are seeded.
 * "Transit 30A"/"Transit 30B" (the GIS layer splits the ordinance's single
 * "Transit 30") are left unseeded pending reconciliation; height additionally
 * omits "Core 50" (Table 540-6 = "No limit").
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

// ───────────────────────────── Inputs ─────────────────────────────

/**
 * Primary district category as Table 540-2 / 540-23 partition it: UN/RM vs. the
 * commercial-mixed-use / downtown / production / transportation group.
 */
export type PrimaryCategory = "un-rm" | "other";

/**
 * Building use class, at the granularity the FAR table distinguishes.
 * "single-family" also covers state-credentialed care facilities serving six or
 * fewer persons, which Table 540-2 groups with single-family dwellings.
 */
export type ZoningUseClass =
  | "single-family"
  | "two-family"
  | "three-family"
  | "institutional-civic"
  | "other";

/** Map a primary zoning district code (e.g. "UN2", "CM3") to its category. */
export function primaryCategoryFromDistrict(
  code: string,
): PrimaryCategory | undefined {
  const c = code.trim().toUpperCase();
  if (c.startsWith("UN") || c.startsWith("RM")) return "un-rm";
  if (
    c.startsWith("CM") ||
    c.startsWith("DT") ||
    c.startsWith("PR") ||
    c.startsWith("TR")
  ) {
    return "other";
  }
  return undefined;
}

// ─────────────────────────── Sourced tables ───────────────────────────

/** A value transcribed from a specific ordinance section. */
export interface SourcedValue<T> {
  readonly value: T;
  readonly section: string;
  readonly originalText?: string;
  readonly effectiveDate?: string;
}

/** Standards a built form district sets on its own (height today). */
export interface BuiltFormStandards {
  readonly maxHeight?: SourcedValue<{ feet: number; stories?: number }>;
}

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
 * Maximum height per built form district, verbatim from Table 540-6. Height is
 * the one standard the built form district determines alone. See the header for
 * the districts deliberately omitted.
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

/** One primary-category column of the FAR table for a built form district. */
interface FarCell {
  /** Use-specific FAR tiers, tried in order; first match wins. */
  readonly tiers: readonly { useClasses: readonly ZoningUseClass[]; far: number }[];
  /** FAR for any use not matched by a tier ("all other buildings/uses"). */
  readonly fallback: number;
  readonly section: string;
  readonly originalText: string;
}

const FAR_SECTION = "§ 540.110 (Table 540-2)";
const RES_1_3: readonly ZoningUseClass[] = [
  "single-family",
  "two-family",
  "three-family",
];

function farCell(
  tiers: FarCell["tiers"],
  fallback: number,
  originalText: string,
): FarCell {
  return { tiers, fallback, section: FAR_SECTION, originalText };
}
/** A flat FAR (no use distinction) — the value is the fallback with no tiers. */
function flatFar(value: number): FarCell {
  return farCell([], value, `${value}`);
}

/** Maximum floor area ratio, verbatim from Table 540-2. */
const FAR_TABLE: Readonly<
  Record<string, { "un-rm"?: FarCell; other?: FarCell }>
> = {
  "Interior 1": {
    "un-rm": farCell(
      [{ useClasses: ["institutional-civic"], far: 0.8 }],
      0.5,
      "All uses except Institutional and Civic Uses: 0.5; Institutional and Civic Uses: 0.8",
    ),
    other: farCell(
      [{ useClasses: RES_1_3, far: 0.5 }],
      1.4,
      "Residential buildings with 1-3 units: 0.5; All other buildings: 1.4",
    ),
  },
  "Interior 2": {
    "un-rm": farCell(
      [{ useClasses: RES_1_3, far: 0.5 }],
      0.8,
      "Residential buildings with 1-3 units: 0.5; All other buildings: 0.8",
    ),
    other: farCell(
      [{ useClasses: RES_1_3, far: 0.5 }],
      1.4,
      "Residential buildings with 1-3 units: 0.5; All other buildings: 1.4",
    ),
  },
  "Interior 3": {
    "un-rm": farCell(
      [
        { useClasses: ["single-family"], far: 0.5 },
        { useClasses: ["two-family"], far: 0.6 },
        { useClasses: ["three-family"], far: 0.7 },
      ],
      1.4,
      "Single-family and care facilities serving 6 or fewer: 0.5; Two-family: 0.6; Three-family: 0.7; All other uses: 1.4",
    ),
    other: farCell(
      [
        { useClasses: ["single-family"], far: 0.5 },
        { useClasses: ["two-family"], far: 0.6 },
        { useClasses: ["three-family"], far: 0.7 },
      ],
      1.6,
      "Single-family and care facilities serving 6 or fewer: 0.5; Two-family: 0.6; Three-family: 0.7; Other uses: 1.6",
    ),
  },
  "Corridor 3": { "un-rm": flatFar(1.5), other: flatFar(1.9) },
  "Corridor 4": { "un-rm": flatFar(2.0), other: flatFar(2.4) },
  "Corridor 6": { "un-rm": flatFar(3.0), other: flatFar(3.4) },
  "Transit 10": { "un-rm": flatFar(5.0), other: flatFar(5.4) },
  "Transit 15": { "un-rm": flatFar(6.0), other: flatFar(6.4) },
  "Transit 20": { "un-rm": flatFar(7.0), other: flatFar(7.4) },
  "Core 50": { "un-rm": flatFar(16.0), other: flatFar(16.0) },
  Production: { "un-rm": flatFar(3.0), other: flatFar(3.0) },
  Parks: {
    "un-rm": farCell(
      [{ useClasses: RES_1_3, far: 0.5 }],
      0.8,
      "Residential buildings with 1-3 units: 0.5; All other uses: 0.8",
    ),
    other: flatFar(2.0),
  },
};

/** Maximum lot coverage (percent) by built form district × primary category. */
const COVERAGE_SECTION = "§ 540.910 (Table 540-23)";
const COVERAGE_TABLE: Readonly<
  Record<string, { "un-rm": number; other: number }>
> = {
  "Interior 1": { "un-rm": 45, other: 100 },
  "Interior 2": { "un-rm": 45, other: 100 },
  "Interior 3": { "un-rm": 60, other: 100 },
  "Corridor 3": { "un-rm": 60, other: 100 },
  "Corridor 4": { "un-rm": 70, other: 100 },
  "Corridor 6": { "un-rm": 70, other: 100 },
  "Transit 10": { "un-rm": 80, other: 100 },
  "Transit 15": { "un-rm": 80, other: 100 },
  "Transit 20": { "un-rm": 80, other: 100 },
  "Core 50": { "un-rm": 100, other: 100 },
  Production: { "un-rm": 100, other: 100 },
  Parks: { "un-rm": 45, other: 45 },
};

// ─────────────────────────── Resolution ───────────────────────────

export interface NumericEnvelopeContext {
  /** Resolved built form district name, e.g. "Interior 2". */
  readonly builtFormDistrict: string;
  /** Resolved primary district category; absent if the district is unresolved. */
  readonly primaryCategory?: PrimaryCategory;
  /** The proposed building's use class; absent if the caller supplied none. */
  readonly useClass?: ZoningUseClass;
  readonly retrievalDate: string;
  readonly parserVersion: string;
  readonly owner: string;
}

/** The subset of a ByRightEnvelope the built form standards govern. */
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
  parts: { section: string; originalText?: string; effectiveDate?: string },
  ctx: NumericEnvelopeContext,
): RuleCitation {
  return minneapolisCitation(parts.section, ctx.parserVersion, ctx.retrievalDate, {
    zoningDistrict: ctx.builtFormDistrict,
    ...(parts.originalText !== undefined
      ? { originalText: parts.originalText }
      : {}),
    ...(parts.effectiveDate !== undefined
      ? { effectiveDate: parts.effectiveDate }
      : {}),
  });
}

/** A parsed standard is a preliminary reference until a professional confirms. */
function rule<T>(
  value: T,
  parts: { section: string; originalText?: string; effectiveDate?: string },
  ctx: NumericEnvelopeContext,
): Evidence<T> {
  return officialRule(value, citation(parts, ctx), {
    confidence: "medium",
    verification: "unverified",
  });
}

function gap(subject: string, action: string, ctx: NumericEnvelopeContext): Unresolved {
  return unresolved(subject, ctx.owner, action);
}

function resolveHeight(
  ctx: NumericEnvelopeContext,
): EvidenceOrUnresolved<Length> {
  const h = MINNEAPOLIS_BUILT_FORM_STANDARDS[ctx.builtFormDistrict]?.maxHeight;
  if (!h) {
    return gap(
      "maximum height",
      `No sourced Table 540-6 height for the ${ctx.builtFormDistrict} built ` +
        `form district; confirm against Minneapolis Code § 540.410.`,
      ctx,
    );
  }
  return rule(Length.feet(h.value.feet), h, ctx);
}

function resolveCoverage(
  ctx: NumericEnvelopeContext,
): EvidenceOrUnresolved<number> {
  if (ctx.primaryCategory === undefined) {
    return gap(
      "maximum lot coverage",
      `Lot coverage depends on the primary district category, which is not ` +
        `resolved for the ${ctx.builtFormDistrict} parcel; resolve the primary ` +
        `zoning district, then re-check § 540.910 (Table 540-23).`,
      ctx,
    );
  }
  const cell = COVERAGE_TABLE[ctx.builtFormDistrict];
  if (!cell) {
    return gap(
      "maximum lot coverage",
      `No sourced Table 540-23 coverage for the ${ctx.builtFormDistrict} ` +
        `built form district; confirm against Minneapolis Code § 540.910.`,
      ctx,
    );
  }
  const pct = cell[ctx.primaryCategory];
  const label =
    ctx.primaryCategory === "un-rm"
      ? "Urban Neighborhood and Residential Mixed-Use Districts"
      : "Commercial Mixed-Use, Downtown, Production, and Transportation Districts";
  return rule(pct / 100, {
    section: COVERAGE_SECTION,
    originalText: `${ctx.builtFormDistrict} — ${label}: ${pct} percent`,
  }, ctx);
}

function resolveFar(ctx: NumericEnvelopeContext): EvidenceOrUnresolved<number> {
  const byCat = FAR_TABLE[ctx.builtFormDistrict];
  if (ctx.primaryCategory === undefined || !byCat) {
    return gap(
      "maximum floor area ratio",
      `FAR depends on the primary district category; resolve the primary ` +
        `zoning district for the ${ctx.builtFormDistrict} parcel, then re-check ` +
        `§ 540.110 (Table 540-2).`,
      ctx,
    );
  }
  const cell = byCat[ctx.primaryCategory];
  if (!cell) {
    return gap(
      "maximum floor area ratio",
      `No sourced Table 540-2 FAR for ${ctx.builtFormDistrict} / ` +
        `${ctx.primaryCategory}; confirm against Minneapolis Code § 540.110.`,
      ctx,
    );
  }
  if (ctx.useClass === undefined) {
    return gap(
      "maximum floor area ratio",
      `FAR for ${ctx.builtFormDistrict} (${ctx.primaryCategory}) depends on the ` +
        `building use — supply the proposed use class. Table 540-2 tiers: ` +
        `${cell.originalText}.`,
      ctx,
    );
  }
  const tier = cell.tiers.find((t) => t.useClasses.includes(ctx.useClass!));
  const far = tier ? tier.far : cell.fallback;
  return rule(far, { section: cell.section, originalText: cell.originalText }, ctx);
}

/**
 * Build the numeric by-right envelope for a resolved parcel context. Each field
 * is an official (but unverified, approval-blocking) rule when its required
 * inputs are present and the ordinance determines a value, and Unresolved
 * otherwise.
 */
export function resolveNumericEnvelope(
  ctx: NumericEnvelopeContext,
): BuiltFormNumericEnvelope {
  return {
    maxHeight: resolveHeight(ctx),
    maxLotCoverage: resolveCoverage(ctx),
    maxFar: resolveFar(ctx),
    minSetbacks: gap(
      "minimum setbacks (front/side/rear)",
      `Yard requirements (§ 540.8xx) are contextual (e.g. established front-yard ` +
        `averaging) and are not automated; confirm against Minneapolis Code ` +
        `Chapter 540, Article IX.`,
      ctx,
    ),
  };
}
