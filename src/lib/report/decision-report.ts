/**
 * Decision report — turn a {@link SiteDueDiligence} into a decision-ready,
 * human-readable account of what is known, where each fact came from, and what
 * still blocks an approvable scenario.
 *
 * README-US: "every parcel fact, zoning rule, market value, and financial
 * assumption shows its source, effective date, retrieval date, confidence, and
 * reviewer", and "missing evidence is visible product state". This module makes
 * both literal: every resolved fact becomes a line carrying its provenance and
 * source, every gap becomes a tracked item with an owner and required action,
 * and the report is never "approved" while anything still blocks — including
 * official rules that a professional has not yet verified.
 *
 * The report is a data model first (`DecisionReport`); `renderTextReport` is one
 * renderer over it, so an HTML or PDF renderer can reuse the same model.
 */

import { isEvidence, isUnresolved } from "../jurisdiction/index.js";
import type {
  ByRightEnvelope,
  Confidence,
  Evidence,
  EvidenceOrUnresolved,
  FloodHazard,
  ProvenanceKind,
  RuleCitation,
  SiteId,
  SourceRef,
  TerrainSummary,
  Unresolved,
  VerificationStatus,
} from "../jurisdiction/index.js";
import { approvalBlockers } from "../jurisdiction/index.js";
import { Area, Length } from "../units/index.js";
import { buildParcelTaxAssessment } from "../finance/index.js";
import type { SiteDueDiligence } from "../intake/index.js";

/** One resolved fact, with the provenance the reader needs to trust it. */
export interface FactLine {
  readonly label: string;
  readonly value: string;
  readonly provenance: ProvenanceKind;
  readonly confidence: Confidence;
  readonly verification: VerificationStatus;
  readonly source?: string;
  readonly note?: string;
}

/** One tracked gap — missing evidence as visible product state. */
export interface GapLine {
  readonly label: string;
  readonly subject: string;
  readonly owner: string;
  readonly requiredAction: string;
  readonly blocksApproval: boolean;
}

export interface DecisionReport {
  readonly address: string;
  readonly siteId?: SiteId;
  readonly facts: readonly FactLine[];
  readonly gaps: readonly GapLine[];
  /** Everything that blocks a representative-scenario approval. */
  readonly blockers: readonly { subject: string; reason: string }[];
  /** False whenever anything still blocks approval (the usual case). */
  readonly approvable: boolean;
  readonly summary: string;
}

// ─────────────────────────── Source formatting ───────────────────────────

function formatSource(source?: SourceRef, citation?: RuleCitation): string | undefined {
  if (citation !== undefined) {
    const parts = [citation.ordinanceTitle, citation.ordinanceSection].filter(
      (s) => s && s.length > 0,
    );
    const base = parts.join(" ");
    return `${base} (retrieved ${citation.retrievalDate})`;
  }
  if (source !== undefined) {
    const eff =
      source.effectiveDate !== undefined ? `, effective ${source.effectiveDate}` : "";
    return `${source.label} (retrieved ${source.retrievalDate}${eff})`;
  }
  return undefined;
}

function factFrom<T>(
  label: string,
  ev: Evidence<T>,
  value: string,
): FactLine {
  const src = formatSource(ev.source, ev.citation);
  return {
    label,
    value,
    provenance: ev.provenance,
    confidence: ev.confidence,
    verification: ev.verification,
    ...(src !== undefined ? { source: src } : {}),
    ...(ev.note !== undefined ? { note: ev.note } : {}),
  };
}

function gapFrom(label: string, u: Unresolved): GapLine {
  return {
    label,
    subject: u.subject,
    owner: u.owner,
    requiredAction: u.requiredAction,
    blocksApproval: u.blocksApproval,
  };
}

// ─────────────────────────── Value formatters ───────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
const areaSf = (a: Area): string => `${Math.round(a.toSquareFeet()).toLocaleString()} sq ft`;
const heightFt = (l: Length): string => `${l.toFeet().toFixed(0)} ft`;
const flood = (f: FloodHazard): string =>
  `Zone ${f.femaZone}${f.inSfha ? " (Special Flood Hazard Area)" : ""}`;
const terrain = (t: TerrainSummary): string =>
  `${t.minElevation.toFeet().toFixed(0)}–${t.maxElevation.toFeet().toFixed(0)} ft elevation, ~${t.meanSlopePct.toFixed(1)}% mean slope`;

/**
 * Build the report model from a due-diligence result. `opts.intentDescribed`
 * lets a caller note what proposed use the FAR was resolved for.
 */
export function buildDecisionReport(dd: SiteDueDiligence): DecisionReport {
  const facts: FactLine[] = [];
  const gaps: GapLine[] = [];
  const blockerItems: EvidenceOrUnresolved<unknown>[] = [];

  const add = <T>(
    label: string,
    item: EvidenceOrUnresolved<T> | undefined,
    fmt: (v: T) => string,
  ): void => {
    if (item === undefined) return;
    blockerItems.push(item);
    if (isUnresolved(item)) gaps.push(gapFrom(label, item));
    else facts.push(factFrom(label, item, fmt(item.value)));
  };

  // Address (always present as Evidence or Unresolved).
  add("Address", dd.address, (a) => a.normalized);

  if (dd.parcel !== undefined && !isUnresolved(dd.parcel)) {
    const p = dd.parcel;
    add("Owner of record", p.ownerName, (s) => s);
    add("Lot area", p.lotArea, areaSf);
    add("Year built", p.yearBuilt, (y) => String(y));
    add("Existing building footprint", p.existingBuildingFootprint, () => "on record");
    add("Assessor taxable value", p.assessedValue, (m) => m.format());
    add("Annual property tax", p.annualPropertyTax, (m) => m.format());
    add("Last recorded sale", p.lastSale, (s) => `${s.price.format()} (${s.date})`);
    // Current effective property-tax rate, derived exactly from the two official
    // figures above. Scoped to the current assessment (a redevelopment is
    // reassessed), so it is a fact about current condition, not a forward rate.
    const tax = buildParcelTaxAssessment(p);
    add("Effective property tax rate", tax.effectiveTaxRatePct, (r) =>
      `${(r * 100).toFixed(2)}% (current assessment)`,
    );
  } else if (dd.parcel !== undefined) {
    add("Parcel", dd.parcel, () => "");
  }

  add("Flood hazard", dd.flood, flood);
  add("Terrain", dd.terrain, terrain);

  if (dd.zoning !== undefined) {
    const z: ByRightEnvelope = dd.zoning;
    add("Zoning district", z.zoningDistrict, (s) => s);
    add("Allowed uses (by-right)", z.allowedUses, (u) => u.join(", "));
    add("Max height", z.maxHeight, heightFt);
    add("Max floor area ratio", z.maxFar, (n) => n.toFixed(2));
    add("Max lot coverage", z.maxLotCoverage, pct);
    add("Min setbacks", z.minSetbacks, (s) =>
      `front ${heightFt(s.front)}, side ${heightFt(s.side)}, rear ${heightFt(s.rear)}`,
    );
    add("Min parking stalls", z.minParkingStalls, (n) => String(n));
    z.overlays.forEach((o, i) => add(`Overlay ${i + 1}`, o, (s) => s));
    z.discretionaryApprovals.forEach((d, i) =>
      add(`Discretionary approval ${i + 1}`, d, () => ""),
    );
  }

  const blockers = approvalBlockers(blockerItems);
  const approvable = blockers.length === 0;
  const summary = approvable
    ? `Preliminary due diligence complete for ${dd.rawAddress} with no open blockers; a qualified professional must still confirm the by-right rules before this is relied on.`
    : `Preliminary reference only for ${dd.rawAddress}: ${blockers.length} item(s) block an approvable scenario and require resolution or professional verification.`;

  return {
    address: dd.rawAddress,
    ...(dd.siteId !== undefined ? { siteId: dd.siteId } : {}),
    facts,
    gaps,
    blockers,
    approvable,
    summary,
  };
}

// ─────────────────────────── Text renderer ───────────────────────────

function factLineText(f: FactLine): string {
  const flags = `${f.provenance}/${f.confidence}/${f.verification}`;
  const src = f.source !== undefined ? `\n      source: ${f.source}` : "";
  const note = f.note !== undefined ? `\n      note: ${f.note}` : "";
  return `  • ${f.label}: ${f.value}  [${flags}]${src}${note}`;
}

function gapLineText(g: GapLine): string {
  const block = g.blocksApproval ? "BLOCKS APPROVAL" : "tracked";
  return `  ✗ ${g.label} — ${g.subject} [${block}]\n      owner: ${g.owner}\n      action: ${g.requiredAction}`;
}

/** Render a plain-text decision report over the model. */
export function renderTextReport(report: DecisionReport): string {
  const lines: string[] = [];
  lines.push("PARCELGRID — PRELIMINARY DUE DILIGENCE");
  lines.push(`Address: ${report.address}`);
  if (report.siteId !== undefined) lines.push(`Site ID: ${report.siteId}`);
  lines.push(
    `Decision: ${report.approvable ? "NO OPEN BLOCKERS (professional confirmation still required)" : "NOT APPROVABLE — " + report.blockers.length + " blocking item(s)"}`,
  );
  lines.push("");
  lines.push(`KNOWN FACTS (${report.facts.length})`);
  lines.push(report.facts.length ? report.facts.map(factLineText).join("\n") : "  (none resolved)");
  lines.push("");
  lines.push(`OPEN ITEMS (${report.gaps.length})`);
  lines.push(report.gaps.length ? report.gaps.map(gapLineText).join("\n") : "  (none)");
  lines.push("");
  lines.push(report.summary);
  return lines.join("\n");
}
