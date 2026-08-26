/**
 * MinneapolisPendingZoningProvider — an honest, evidence-first placeholder for
 * the Minneapolis by-right zoning adapter.
 *
 * README-US is explicit that there is "no safe nationwide hard-coded zoning
 * engine" and that the product must say "by-right reference" — never "legal
 * maximum" — until a qualified local professional confirms the rule set
 * (README-US §2). Until the real Minneapolis ordinance parser exists, this
 * adapter satisfies the {@link ZoningEvidenceProvider} contract WITHOUT
 * fabricating a single rule: every field of the envelope is returned as an
 * {@link Unresolved} that blocks approval. A missing rule is visible product
 * state, not a silent zero (README-US §4).
 *
 * The `citationFor` template still points at the real ordinance so that when
 * the parser lands, each parsed value is stamped with a well-formed
 * {@link RuleCitation}. Swapping this class for the parsing implementation is
 * the entirety of Phase US-2's zoning work; nothing downstream changes shape.
 */

import type { RuleCitation, Unresolved } from "../../jurisdiction/evidence.js";
import { unresolved } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";

const JURISDICTION_ID = "us-mn-hennepin-minneapolis";

/** Who owns resolving a zoning gap and how, echoed into every Unresolved. */
const ZONING_OWNER = "local zoning professional";
const ZONING_ACTION =
  "Confirm the parcel's zoning district and by-right envelope against the " +
  "City of Minneapolis Unified Development Ordinance (Title 20); the automated " +
  "adapter does not yet parse Minneapolis rules.";

export class MinneapolisPendingZoningProvider implements ZoningEvidenceProvider {
  readonly id = "us-minneapolis-zoning-pending";
  readonly jurisdictionId = JURISDICTION_ID;
  /**
   * `0.0.0-pending` marks that no rule text has been parsed yet. The real
   * adapter bumps this to a dated version (e.g. "2026.08") once it parses the
   * ordinance, and stamps it onto each RuleCitation for reproducibility.
   */
  readonly parserVersion = "0.0.0-pending";

  /**
   * Returns a fully-unresolved envelope. Every constraint is a tracked gap an
   * owner must close, so no scenario built on it can be represented as
   * approvable while the real parser is absent.
   */
  async envelopeFor(_identity: ParcelIdentity): Promise<ByRightEnvelope> {
    const gap = (subject: string): Unresolved =>
      unresolved(subject, ZONING_OWNER, ZONING_ACTION);

    return {
      jurisdictionId: this.jurisdictionId,
      zoningDistrict: gap("zoning district"),
      allowedUses: gap("allowed uses"),
      maxFar: gap("maximum floor area ratio"),
      maxLotCoverage: gap("maximum lot coverage"),
      maxHeight: gap("maximum height"),
      minSetbacks: gap("minimum setbacks (front/side/rear)"),
      minParkingStalls: gap("minimum parking stalls"),
      overlays: [gap("overlay districts")],
      discretionaryApprovals: [
        gap("discretionary approvals / special reviews"),
      ],
    };
  }

  /**
   * A citation template for a section of the Minneapolis ordinance. The
   * parsed value is filled in by the real adapter; here it documents the
   * source addressing that every parsed rule will carry.
   */
  citationFor(section: string): RuleCitation {
    return {
      jurisdictionId: this.jurisdictionId,
      label: "City of Minneapolis Unified Development Ordinance",
      locator:
        "https://library.municode.com/mn/minneapolis/codes/code_of_ordinances",
      ordinanceTitle: "Minneapolis Code of Ordinances Title 20 (Zoning Code)",
      ordinanceSection: section,
      retrievalDate: new Date().toISOString().slice(0, 10),
      parserVersion: this.parserVersion,
    };
  }
}
