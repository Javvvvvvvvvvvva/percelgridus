/**
 * RamseyPendingParcelProvider — an honest placeholder for the Ramsey County
 * parcel layer.
 *
 * Saint Paul is in Ramsey County, whose authoritative parcel data lives on the
 * county / Met Council / MnGeo servers. Those hosts are not reachable from this
 * environment's egress policy (unlike Hennepin's gis.hennepin.us, which is
 * allowlisted), so this provider resolves every lookup to an explicit
 * `Unresolved` rather than a fabricated parcel. It keeps the Saint Paul profile
 * contract-complete and type-safe today; swapping in a real Ramsey adapter (once
 * that host is allowlisted, or via a commercial parcel API) is a drop-in change
 * with no downstream edits — the same pattern the Minneapolis zoning adapter
 * followed before it was wired.
 */

import { unresolved } from "../../jurisdiction/evidence.js";
import type { Unresolved } from "../../jurisdiction/evidence.js";
import type { ExternalIdentifier } from "../../jurisdiction/identifiers.js";
import type {
  GeoPoint,
  ParcelProvider,
  ParcelRecord,
} from "../../jurisdiction/providers.js";

const ACTION =
  "The Ramsey County parcel source is not reachable from this environment; " +
  "allowlist the county/Met Council/MnGeo GIS host (or wire a commercial parcel " +
  "API) to resolve Saint Paul parcels. No parcel is guessed in the meantime.";

export class RamseyPendingParcelProvider implements ParcelProvider {
  readonly id = "us-ramsey-parcels-pending";

  private gap(): Unresolved {
    return unresolved("parcel", "user", ACTION);
  }

  async byPoint(_point: GeoPoint): Promise<ParcelRecord | Unresolved> {
    return this.gap();
  }

  async byIdentifier(
    _id: ExternalIdentifier,
  ): Promise<ParcelRecord | Unresolved> {
    return this.gap();
  }

  async byAddress(
    _normalizedAddress: string,
  ): Promise<ParcelRecord | Unresolved> {
    return this.gap();
  }
}
