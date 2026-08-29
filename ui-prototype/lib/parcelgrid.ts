/**
 * Server-side bridge from the PARCELGRID library (`src/lib`) to the UI.
 *
 * The prototype shipped with hand-written mock data (`mock-data.ts`,
 * `financials.ts`). This module replaces that with the real thing: it runs the
 * library's `intakeSite` pipeline (Census → Hennepin → FEMA → USGS → zoning),
 * builds the decision report and the by-right massing program, and returns a
 * plain, serializable `SiteAnalysis` the pages render. Every fact keeps its
 * provenance/verification, and unresolved values come back `null` rather than a
 * fabricated number — the same contract the library enforces.
 *
 * This runs ONLY on the server (the providers make outbound fetches). Import it
 * from server components / route handlers, never from a "use client" module.
 */

import { createMinneapolisProfile } from "../../src/lib/integrations/us-minneapolis/index.js";
import { intakeSite } from "../../src/lib/intake/index.js";
import { InMemorySiteRepository } from "../../src/lib/persistence/index.js";
import {
  buildDecisionReport,
  type DecisionReport,
} from "../../src/lib/report/index.js";
import {
  computeProForma,
  buildSiteMassingProgram,
  buildParcelTaxAssessment,
} from "../../src/lib/finance/index.js";
import { isEvidence, isUnresolved } from "../../src/lib/jurisdiction/index.js";
import type {
  EvidenceOrUnresolved,
  FinanceAssumptionProfile,
} from "../../src/lib/jurisdiction/index.js";
import { Area, Money } from "../../src/lib/units/index.js";

export interface ParcelSummary {
  readonly address: string;
  readonly apn: string | null;
  readonly owner: string | null;
  readonly lotAreaSf: number | null;
  readonly zoningDistrict: string | null;
  readonly zoningName: string | null;
  readonly maxHeightFt: number | null;
  readonly maxFar: number | null;
  readonly maxLotCoveragePct: number | null;
}

/** Hennepin assessor facts + the derived current effective tax rate. */
export interface AssessmentSummary {
  readonly yearBuilt: number | null;
  /** Formatted USD, e.g. "$3,658,000.00". */
  readonly assessedValue: string | null;
  readonly annualPropertyTax: string | null;
  /** Current effective rate as a percent, e.g. 1.89. Current assessment only. */
  readonly effectiveTaxRatePct: number | null;
  readonly lastSalePrice: string | null;
  readonly lastSaleDate: string | null;
  /** The assessor sale-code caveat (e.g. multi-parcel sale), when present. */
  readonly lastSaleCaveat: string | null;
}

/** Resolved Chapter 551 overlay districts. `resolved` is false only if the query failed. */
export interface OverlaysSummary {
  readonly names: readonly string[];
  readonly resolved: boolean;
}

/** Minimum off-street parking stalls (Ch. 541 citywide zero). */
export interface ParkingSummary {
  readonly minStalls: number;
  readonly source: string | null;
}

export interface EnvelopeSummary {
  readonly buildableGsf: number | null;
  readonly maxFootprintSf: number | null;
  readonly maxHeightFt: number | null;
  readonly indicativeUnits: number | null;
  readonly gsfPerUnit: number;
}

export interface ProFormaSeed {
  readonly buildableGsf: number | null;
  readonly units: number | null;
  readonly acquisitionPrice: number;
  readonly rentPerUnitMonth: number;
  readonly hardCostPerGsf: number;
  readonly exitCapRatePct: number;
}

export interface FloodSummary {
  readonly zone: string;
  readonly inSfha: boolean;
  readonly source: string | null;
}

export interface TerrainSummaryUi {
  readonly minFt: number;
  readonly maxFt: number;
  readonly slopePct: number;
  readonly source: string | null;
}

export interface SiteAnalysis {
  readonly resolved: boolean;
  readonly parcel: ParcelSummary;
  readonly report: DecisionReport;
  readonly envelope: EnvelopeSummary;
  readonly proFormaSeed: ProFormaSeed;
  readonly openItemCount: number;
  readonly flood: FloodSummary | null;
  readonly terrain: TerrainSummaryUi | null;
  readonly assessment: AssessmentSummary | null;
  readonly overlays: OverlaysSummary;
  readonly parking: ParkingSummary | null;
}

/** Assumptions the user drives; the library treats these as user-input evidence. */
export const DEFAULT_ASSUMPTIONS = {
  acquisitionPrice: 625000,
  rentPerUnitMonth: 2200,
  hardCostPerGsf: 300,
  softCostPct: 0.2,
  contingencyPct: 0.1,
  exitCapRatePct: 6.0,
  vacancyPct: 0.05,
  annualOpexPerUnit: 6500,
  avgUnitGsf: 1200,
} as const;

function num<T>(
  x: EvidenceOrUnresolved<T> | undefined,
  f: (v: T) => number,
): number | null {
  return x && isEvidence(x) ? f(x.value) : null;
}

/** A resolved user assumption as evidence (so the pro forma labels it honestly). */
function assume<T>(value: T): EvidenceOrUnresolved<T> {
  return {
    value,
    provenance: "user-input",
    confidence: "medium",
    verification: "unverified",
  };
}

function financeAssumptions(a: typeof DEFAULT_ASSUMPTIONS): FinanceAssumptionProfile {
  return {
    currency: "USD",
    hardCostPerGsf: assume(Money.usd(String(a.hardCostPerGsf))),
    softCostPct: assume(a.softCostPct),
    contingencyPct: assume(a.contingencyPct),
    constructionLoanRate: assume(0.08),
    permanentLoanRate: assume(0.06),
    exitCapRate: assume(a.exitCapRatePct / 100),
    vacancyPct: assume(a.vacancyPct),
  };
}

const DEFAULT_ADDRESS = "2320 Colfax Ave S, Minneapolis, MN 55405";

/**
 * Run the full pipeline for one address and shape it for the UI. `useClass`
 * drives the FAR tier (single/two/three-family). Falls back to the pilot
 * address when none is given.
 */
export async function getSiteAnalysis(
  address: string = DEFAULT_ADDRESS,
  opts: { useClass?: string } = {},
): Promise<SiteAnalysis> {
  const a = DEFAULT_ASSUMPTIONS;
  const profile = createMinneapolisProfile();
  const repository = new InMemorySiteRepository();
  const dd = await intakeSite(
    address,
    { profile, repository },
    { intent: { useClass: opts.useClass ?? "three-family" } },
  );

  const zoning = dd.zoning;
  const parcel =
    dd.parcel !== undefined && !isUnresolved(dd.parcel) ? dd.parcel : undefined;
  const parcelResolved = parcel !== undefined;
  const lotArea: EvidenceOrUnresolved<Area> | undefined = parcel?.lotArea;

  const proForma = zoning
    ? computeProForma({
        lotArea: lotArea ?? unresolvedArea(),
        maxFar: zoning.maxFar,
        maxLotCoverage: zoning.maxLotCoverage,
        finance: financeAssumptions(a),
        program: {
          avgUnitGsf: assume(Area.squareFeet(String(a.avgUnitGsf))),
          monthlyRentPerUnit: assume(Money.usd(String(a.rentPerUnitMonth))),
          annualOpexPerUnit: assume(Money.usd(String(a.annualOpexPerUnit))),
        },
      })
    : undefined;

  const massing =
    zoning && proForma
      ? buildSiteMassingProgram(lotArea ?? unresolvedArea(), zoning, proForma)
      : undefined;

  const report = buildDecisionReport(dd);

  const district = zoning && isEvidence(zoning.zoningDistrict)
    ? zoning.zoningDistrict
    : undefined;

  const parcelSummary: ParcelSummary = {
    address: isEvidence(dd.address) ? dd.address.value.normalized : address,
    apn: parcel ? (parcel.identity.apns[0]?.value ?? null) : null,
    owner:
      parcel && isEvidence(parcel.ownerName) ? parcel.ownerName.value : null,
    lotAreaSf: num(lotArea, (ar) => Math.round(ar.toSquareFeet())),
    zoningDistrict: district ? district.value : null,
    zoningName: district?.note ?? null,
    maxHeightFt: zoning ? num(zoning.maxHeight, (l) => Math.round(l.toFeet())) : null,
    maxFar: zoning ? num(zoning.maxFar, (n) => n) : null,
    maxLotCoveragePct: zoning ? num(zoning.maxLotCoverage, (n) => Math.round(n * 100)) : null,
  };

  const buildableGsf = massing
    ? num(massing.buildableGsf, (ar) => Math.round(ar.toSquareFeet()))
    : null;
  const units = massing ? num(massing.estimatedUnits, (n) => n) : null;

  const envelope: EnvelopeSummary = {
    buildableGsf,
    maxFootprintSf: massing
      ? num(massing.maxFootprint, (ar) => Math.round(ar.toSquareFeet()))
      : null,
    maxHeightFt: parcelSummary.maxHeightFt,
    indicativeUnits: units,
    gsfPerUnit: a.avgUnitGsf,
  };

  const flood: FloodSummary | null =
    dd.flood && isEvidence(dd.flood)
      ? {
          zone: dd.flood.value.femaZone,
          inSfha: dd.flood.value.inSfha,
          source: dd.flood.source?.label ?? null,
        }
      : null;

  const terrain: TerrainSummaryUi | null =
    dd.terrain && isEvidence(dd.terrain)
      ? {
          minFt: Math.round(dd.terrain.value.minElevation.toFeet()),
          maxFt: Math.round(dd.terrain.value.maxElevation.toFeet()),
          slopePct: Math.round(dd.terrain.value.meanSlopePct * 10) / 10,
          source: dd.terrain.source?.label ?? null,
        }
      : null;

  // Assessor facts + the derived current effective tax rate (finance/parcel-tax).
  let assessment: AssessmentSummary | null = null;
  if (parcel !== undefined) {
    const tax = buildParcelTaxAssessment(parcel);
    const sale =
      parcel.lastSale && isEvidence(parcel.lastSale)
        ? parcel.lastSale.value
        : undefined;
    assessment = {
      yearBuilt:
        parcel.yearBuilt && isEvidence(parcel.yearBuilt)
          ? parcel.yearBuilt.value
          : null,
      assessedValue: isEvidence(tax.assessedValue)
        ? tax.assessedValue.value.format()
        : null,
      annualPropertyTax: isEvidence(tax.annualPropertyTax)
        ? tax.annualPropertyTax.value.format()
        : null,
      effectiveTaxRatePct: isEvidence(tax.effectiveTaxRatePct)
        ? Math.round(tax.effectiveTaxRatePct.value * 10000) / 100
        : null,
      lastSalePrice: sale ? sale.price.format() : null,
      lastSaleDate: sale ? sale.date : null,
      lastSaleCaveat: sale?.saleCode ?? null,
    };
  }

  // Chapter 551 overlays: resolved facts (possibly empty = "none apply"); the
  // field is only "unresolved" if the overlay query itself failed.
  const overlayItems = zoning ? zoning.overlays : [];
  const overlays: OverlaysSummary = {
    names: overlayItems.filter(isEvidence).map((o) => o.value),
    resolved: overlayItems.every(isEvidence),
  };

  // Minimum off-street parking — Ch. 541 citywide zero.
  const parking: ParkingSummary | null =
    zoning && isEvidence(zoning.minParkingStalls)
      ? {
          minStalls: zoning.minParkingStalls.value,
          source: zoning.minParkingStalls.citation?.ordinanceSection ?? null,
        }
      : null;

  return {
    resolved: Boolean(parcelResolved),
    parcel: parcelSummary,
    report,
    envelope,
    flood,
    terrain,
    assessment,
    overlays,
    parking,
    proFormaSeed: {
      buildableGsf,
      units,
      acquisitionPrice: a.acquisitionPrice,
      rentPerUnitMonth: a.rentPerUnitMonth,
      hardCostPerGsf: a.hardCostPerGsf,
      exitCapRatePct: a.exitCapRatePct,
    },
    openItemCount: report.blockers.length,
  };
}

function unresolvedArea(): EvidenceOrUnresolved<Area> {
  return {
    kind: "unresolved",
    subject: "lot area",
    owner: "user",
    requiredAction: "resolve the parcel first",
    blocksApproval: true,
  };
}
