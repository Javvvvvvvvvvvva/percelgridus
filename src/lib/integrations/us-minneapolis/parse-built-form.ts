/**
 * Pure parser: Minneapolis built-form features -> the resolved built form
 * district name as official evidence, or Unresolved.
 *
 * Mirrors parseZoningDistrict: a clean single-district hit is an official fact
 * (the district NAME, e.g. "Interior 2", with the abbreviation as a note); no
 * coverage, a service error, or a split-zoned parcel is Unresolved. The
 * resolved name is the key into the Chapter 540 numeric standards.
 */

import type { IsoDate, SourceRef } from "../../jurisdiction/evidence.js";
import { officialFact, unresolved } from "../../jurisdiction/evidence.js";
import type { EvidenceOrUnresolved } from "../../jurisdiction/evidence.js";
import type { BuiltFormQueryResponse } from "./built-form-response.js";
import { ZONING_OWNER } from "./zoning-shared.js";

export interface ParseBuiltFormContext {
  readonly retrievalDate: IsoDate;
  readonly locator: string;
  readonly subject: string;
}

function name(f: { attributes?: { Built_Form?: string } }): string {
  return (f.attributes?.Built_Form ?? "").trim();
}

function source(ctx: ParseBuiltFormContext): SourceRef {
  return {
    label: "City of Minneapolis — Zoning Built Form",
    locator: ctx.locator,
    retrievalDate: ctx.retrievalDate,
  };
}

export function parseBuiltFormDistrict(
  response: BuiltFormQueryResponse,
  ctx: ParseBuiltFormContext,
): EvidenceOrUnresolved<string> {
  if (response.error !== undefined) {
    return unresolved(
      "built form district",
      ZONING_OWNER,
      `Minneapolis built-form query errored for ${ctx.subject}: ${
        response.error.message ?? "unknown error"
      }.`,
    );
  }

  const features = (response.features ?? []).filter((f) => name(f).length > 0);

  if (features.length === 0) {
    return unresolved(
      "built form district",
      ZONING_OWNER,
      `No Minneapolis built form district maps ${ctx.subject}; confirm the ` +
        `parcel is within the city and re-check the official zoning map.`,
    );
  }

  const distinct = [...new Set(features.map(name))];
  if (distinct.length > 1) {
    return unresolved(
      "built form district",
      ZONING_OWNER,
      `${ctx.subject} spans more than one built form district ` +
        `(${distinct.join(", ")}); a human must determine the governing ` +
        `district(s) and by-right envelope per Chapter 540.`,
    );
  }

  const districtName = distinct[0]!;
  const abbrv = (features[0]!.attributes?.Abbrv ?? "").trim();
  const fact = officialFact(districtName, source(ctx), {
    confidence: "high",
    verification: "machine-parsed",
  });
  return abbrv.length > 0 ? { ...fact, note: abbrv } : fact;
}
