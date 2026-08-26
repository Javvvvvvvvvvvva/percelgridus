/**
 * Evidence — the provenance envelope every material fact carries.
 *
 * This is the load-bearing contract of PARCELGRID US. The Korean prototype
 * already separated official data, user input, algorithm output, and
 * references; this file makes that separation the *type* a value travels
 * in, so a fact and a recommendation cannot be confused at compile time.
 *
 * Backing README-US sections:
 *   §1 "Facts are not recommendations" — the ProvenanceKind union.
 *   §2 "Zoning is jurisdiction-specific evidence" — the citation fields
 *       (jurisdiction, ordinance section, effective/retrieval dates,
 *       parsed value + original text, confidence, parser version,
 *       verification status).
 *   §4 "Missing evidence is visible product state" — Unresolved.
 */

/** ISO-8601 date string, e.g. "2026-08-26". */
export type IsoDate = string;

/**
 * Where a value came from. Facts and recommendations are different kinds;
 * the engine never silently overwrites a user assumption (README-US §1).
 */
export type ProvenanceKind =
  | "official" // government or licensed provider data
  | "user-input" // user-entered fact or assumption
  | "algorithm" // algorithm-calculated value
  | "professional-confirmation" // confirmed by a licensed reviewer
  | "reference"; // preliminary reference / unresolved question

export type Confidence = "high" | "medium" | "low";

/** Where a value sits in the human-verification lifecycle. */
export type VerificationStatus =
  | "unverified"
  | "machine-parsed"
  | "under-review"
  | "verified"
  | "disputed";

/** A citation to a source document or dataset. */
export interface SourceRef {
  /** Human label, e.g. "City of Minneapolis Zoning Code". */
  readonly label: string;
  /** Stable locator (URL, dataset id, document id). */
  readonly locator: string;
  /** When the source's content took legal/nominal effect. */
  readonly effectiveDate?: IsoDate;
  /** When PARCELGRID retrieved this value from the source. */
  readonly retrievalDate: IsoDate;
}

/**
 * A citation for an automated regulatory rule (README-US §2). Extends the
 * generic source with jurisdiction and ordinance addressing plus the parser
 * lineage that produced the parsed value.
 */
export interface RuleCitation extends SourceRef {
  readonly jurisdictionId: string;
  readonly zoningDistrict?: string;
  /** Ordinance/code title, e.g. "Minneapolis Code of Ordinances Title 20". */
  readonly ordinanceTitle: string;
  /** Section within the ordinance, e.g. "§ 546.170". */
  readonly ordinanceSection: string;
  /** Overlay or special-district applicability, if any. */
  readonly overlays?: readonly string[];
  /** Verbatim source text the parsed value was derived from. */
  readonly originalText?: string;
  /** Version of the parser that produced the value, for reproducibility. */
  readonly parserVersion?: string;
}

/**
 * A value with its provenance. `T` is the parsed/typed value (a number, a
 * Money, a Length, a zoning code, ...). The metadata is never optional at
 * the type level for official data — a rule without a citation cannot be
 * constructed through {@link officialRule}.
 */
export interface Evidence<T> {
  readonly value: T;
  readonly provenance: ProvenanceKind;
  readonly confidence: Confidence;
  readonly verification: VerificationStatus;
  readonly source?: SourceRef;
  readonly citation?: RuleCitation;
  /** Reviewer who confirmed this, if provenance is professional/verified. */
  readonly reviewer?: string;
  /** Free-form note, e.g. why confidence is low. */
  readonly note?: string;
}

/**
 * Missing evidence is not zero — it is a tracked item with an owner and a
 * required action (README-US §4). An Unresolved blocks approval rather than
 * defaulting silently.
 */
export interface Unresolved {
  readonly kind: "unresolved";
  /** What is missing, e.g. "rear setback", "flood zone", "easements". */
  readonly subject: string;
  /** Who must resolve it (role or named person). */
  readonly owner: string;
  /** The concrete action needed to resolve it. */
  readonly requiredAction: string;
  /** Whether this blocks representative-scenario approval. Default true. */
  readonly blocksApproval: boolean;
}

/** Either a known value with provenance, or a tracked gap. */
export type EvidenceOrUnresolved<T> = Evidence<T> | Unresolved;

// ─────────────────────────── Constructors ───────────────────────────

export function userAssumption<T>(
  value: T,
  opts: { confidence?: Confidence; note?: string } = {},
): Evidence<T> {
  return {
    value,
    provenance: "user-input",
    confidence: opts.confidence ?? "medium",
    verification: "unverified",
    ...(opts.note !== undefined ? { note: opts.note } : {}),
  };
}

export function algorithmValue<T>(
  value: T,
  opts: { confidence?: Confidence; note?: string } = {},
): Evidence<T> {
  return {
    value,
    provenance: "algorithm",
    confidence: opts.confidence ?? "medium",
    verification: "machine-parsed",
    ...(opts.note !== undefined ? { note: opts.note } : {}),
  };
}

export function officialFact<T>(
  value: T,
  source: SourceRef,
  opts: { confidence?: Confidence; verification?: VerificationStatus } = {},
): Evidence<T> {
  return {
    value,
    provenance: "official",
    confidence: opts.confidence ?? "high",
    verification: opts.verification ?? "machine-parsed",
    source,
  };
}

/** An automated regulatory rule value. Requires a full RuleCitation (§2). */
export function officialRule<T>(
  value: T,
  citation: RuleCitation,
  opts: { confidence?: Confidence; verification?: VerificationStatus } = {},
): Evidence<T> {
  return {
    value,
    provenance: "official",
    confidence: opts.confidence ?? "medium",
    verification: opts.verification ?? "machine-parsed",
    source: citation,
    citation,
  };
}

export function unresolved(
  subject: string,
  owner: string,
  requiredAction: string,
  opts: { blocksApproval?: boolean } = {},
): Unresolved {
  return {
    kind: "unresolved",
    subject,
    owner,
    requiredAction,
    blocksApproval: opts.blocksApproval ?? true,
  };
}

// ─────────────────────────── Guards & helpers ───────────────────────────

export function isUnresolved<T>(
  e: EvidenceOrUnresolved<T>,
): e is Unresolved {
  return (e as Unresolved).kind === "unresolved";
}

export function isEvidence<T>(e: EvidenceOrUnresolved<T>): e is Evidence<T> {
  return !isUnresolved(e);
}

/** True if the value is confirmed enough to drive an approvable scenario. */
export function isVerified<T>(e: Evidence<T>): boolean {
  return (
    e.verification === "verified" ||
    e.provenance === "professional-confirmation"
  );
}

/**
 * Collect the items that block representative-scenario approval from a set
 * of evidence: every Unresolved with blocksApproval, and every official
 * rule still lacking human verification.
 */
export function approvalBlockers(
  items: readonly EvidenceOrUnresolved<unknown>[],
): { subject: string; reason: string }[] {
  const blockers: { subject: string; reason: string }[] = [];
  for (const item of items) {
    if (isUnresolved(item)) {
      if (item.blocksApproval) {
        blockers.push({ subject: item.subject, reason: item.requiredAction });
      }
      continue;
    }
    if (
      item.provenance === "official" &&
      item.citation !== undefined &&
      !isVerified(item)
    ) {
      blockers.push({
        subject: item.citation.ordinanceSection,
        reason: "rule not yet human-verified",
      });
    }
  }
  return blockers;
}
