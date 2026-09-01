/**
 * A ZoningEvidenceProvider for jurisdictions that have no zoning adapter yet.
 *
 * The nationwide Regrid path (see `createUsRegridProfile`) resolves PARCELS in
 * any US county, but zoning is jurisdiction-specific evidence — a nationwide
 * hard-coded zoning engine is prohibited (README-US). So for an address whose
 * city has no registered zoning adapter, this provider returns every by-right
 * field as `Unresolved` with a clear "not yet covered" action, rather than
 * inventing a district or a rule. It never produces a rule, so `citationFor` is
 * a minimal, honest template that is only ever attached to nothing.
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import type { RuleCitation } from "../../jurisdiction/evidence.js";
import type {
  ByRightEnvelope,
  ParcelIdentity,
  ZoningEvidenceProvider,
} from "../../jurisdiction/index.js";

const OWNER = "local zoning professional";

function action(subject: string): string {
  return (
    `Zoning is jurisdiction-specific and not yet covered for this address; ` +
    `register a local zoning adapter (or confirm ${subject} with the city) ` +
    `before relying on any by-right figure.`
  );
}

export interface UnsupportedZoningConfig {
  readonly jurisdictionId?: string;
  readonly retrievalDate?: string;
}

export class UnsupportedZoningProvider implements ZoningEvidenceProvider {
  readonly id = "us-unsupported-zoning";
  readonly jurisdictionId: string;
  readonly parserVersion = "unsupported@2026.09";
  private readonly retrievalDate: string;

  constructor(config: UnsupportedZoningConfig = {}) {
    this.jurisdictionId = config.jurisdictionId ?? "us-zoning-uncovered";
    this.retrievalDate = config.retrievalDate ?? new Date().toISOString().slice(0, 10);
  }

  async envelopeFor(_identity: ParcelIdentity): Promise<ByRightEnvelope> {
    return {
      jurisdictionId: this.jurisdictionId,
      zoningDistrict: unresolved("zoning district", OWNER, action("the district")),
      allowedUses: unresolved("allowed uses", OWNER, action("permitted uses")),
      maxFar: unresolved("maximum FAR", OWNER, action("the FAR")),
      maxLotCoverage: unresolved("maximum lot coverage", OWNER, action("lot coverage")),
      maxHeight: unresolved("maximum height", OWNER, action("the height limit")),
      minSetbacks: unresolved("minimum setbacks", OWNER, action("the yard requirements")),
      minParkingStalls: unresolved("minimum parking stalls", OWNER, action("the parking rule")),
      overlays: [unresolved("overlay districts", OWNER, action("overlays"))],
      discretionaryApprovals: [
        unresolved("discretionary approvals", OWNER, action("discretionary reviews")),
      ],
    };
  }

  citationFor(section: string): RuleCitation {
    return {
      label: "Local zoning code (adapter not yet implemented)",
      locator: `unsupported-zoning:${this.jurisdictionId}`,
      retrievalDate: this.retrievalDate,
      jurisdictionId: this.jurisdictionId,
      ordinanceTitle: "Local zoning code",
      ordinanceSection: section,
      parserVersion: this.parserVersion,
    };
  }
}
