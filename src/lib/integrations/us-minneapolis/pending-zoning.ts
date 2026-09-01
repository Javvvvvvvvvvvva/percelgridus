/**
 * MinneapolisPendingZoningProvider — an all-Unresolved placeholder that
 * satisfies the {@link ZoningEvidenceProvider} contract without a network
 * source.
 *
 * The live {@link MinneapolisZoningProvider} now resolves the zoning district
 * from the city's official layer; this placeholder is retained for offline
 * wiring and tests where no fetch is available. It fabricates nothing: every
 * envelope field, the district included, is an {@link Unresolved} that blocks
 * approval — a missing rule is visible product state, not a silent zero
 * (README-US §2, §4).
 */

import type { RuleCitation } from "../../jurisdiction/evidence.js";
import { unresolved } from "../../jurisdiction/evidence.js";
import type { ParcelIdentity } from "../../jurisdiction/identifiers.js";
import type {
  ByRightEnvelope,
  DevelopmentIntent,
  ParcelGeometryInput,
  ZoningEvidenceProvider,
} from "../../jurisdiction/providers.js";
import { buildEnvelope } from "./parse-zoning.js";
import {
  MINNEAPOLIS_JURISDICTION_ID,
  ZONING_OWNER,
  isoDate,
  minneapolisCitation,
} from "./zoning-shared.js";

export class MinneapolisPendingZoningProvider implements ZoningEvidenceProvider {
  readonly id = "us-minneapolis-zoning-pending";
  readonly jurisdictionId = MINNEAPOLIS_JURISDICTION_ID;
  /** `0.0.0-pending` marks that nothing — not even the district — is resolved. */
  readonly parserVersion = "0.0.0-pending";

  /**
   * Returns a fully-unresolved envelope regardless of geometry. Every
   * constraint is a tracked gap an owner must close, so no scenario built on it
   * can be represented as approvable.
   */
  async envelopeFor(
    _identity: ParcelIdentity,
    _geometry?: ParcelGeometryInput,
    _intent?: DevelopmentIntent,
  ): Promise<ByRightEnvelope> {
    return buildEnvelope(
      unresolved(
        "zoning district",
        ZONING_OWNER,
        "No zoning source is wired in this configuration; use the live " +
          "MinneapolisZoningProvider or confirm the district manually.",
      ),
    );
  }

  citationFor(section: string): RuleCitation {
    return minneapolisCitation(section, this.parserVersion, isoDate(new Date()));
  }
}
