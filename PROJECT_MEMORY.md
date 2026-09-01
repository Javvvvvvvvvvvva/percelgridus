# PARCELGRID US — current working baseline

Last updated: 2026-09-01

Short handoff doc kept against the actual code, so the next worker does not
mistake an old "next session" note for a current requirement. The product and
migration contract is [README-US.md](README-US.md).

## Where we are

Greenfield U.S. repository. First commit establishes the **adapter boundary
and unit/currency contracts only** — no integrations, database, or screens
yet. This order is mandated by README-US ("Implement domain adapters and
unit/currency contracts before replacing integrations or translating
screens").

The Korean prototype (`Javvvvvvvvvvvva/parcelgrid`) is the reusable regression
profile. It is cloned read-only for reference; nothing is copied verbatim.

## Product baseline

- Target flow (unchanged from KR): address → due diligence → test fit →
  underwriting → professional handoff → decision report.
- First pilot hypothesis: Minneapolis / Hennepin County, MN; low/mid-rise
  residential or mixed-use infill. Not final — see README-US "Founder
  decisions still required".
- Zoning is jurisdiction-specific evidence. A nationwide hard-coded zoning
  engine is prohibited. Say "by-right reference", never "legal maximum",
  until a local professional confirms the rule set.

## Current code paths

| Role | Implementation |
|---|---|
| USD money (decimal, currency-tagged) | `src/lib/units/money.ts` |
| Length (canonical meters) | `src/lib/units/length.ts` |
| Area (canonical m²) | `src/lib/units/area.ts` |
| Unit profile / cost bases | `src/lib/units/unit-profile.ts` |
| Evidence envelope | `src/lib/jurisdiction/evidence.ts` |
| Identifiers (UUID vs APN) | `src/lib/jurisdiction/identifiers.ts` |
| Provider seams | `src/lib/jurisdiction/providers.ts` |
| JurisdictionProfile + registry | `src/lib/jurisdiction/profile.ts` |
| AddressProvider — U.S. Census Geocoder | `src/lib/integrations/us-census/` |
| ParcelProvider — Hennepin County GIS | `src/lib/integrations/us-hennepin/` |
| ParcelProvider — Regrid (nationwide, token-gated) | `src/lib/integrations/us-regrid/` |
| HazardProvider (flood) — FEMA NFHL | `src/lib/integrations/us-fema/` |
| HazardProvider (terrain) — USGS 3DEP | `src/lib/integrations/us-usgs/` |
| Shared US national providers (address + flood + terrain) | `src/lib/integrations/us-national/` |
| Jurisdiction — Minneapolis (full zoning) | `src/lib/integrations/us-minneapolis/` |
| Jurisdiction — Saint Paul (district zoning, parcel pending) | `src/lib/integrations/us-stpaul/` |
| Parcel tax assessment (current effective rate) | `src/lib/finance/parcel-tax.ts` |
| Address → jurisdiction routing | `src/lib/jurisdiction/profile.ts` (`resolveByAddress`), `src/lib/intake/intake.ts` (`intakeSiteRouted`) |
| UI prototype wired to the library | `ui-prototype/` (`lib/parcelgrid.ts` bridge) |

## Contracts that must not regress

- Money stays decimal USD and currency-tagged. No `number` round-trips back
  into money math; no manwon/KRW path is ever added.
- The geometry kernel stays canonical metric (meters, m²). Conversions to
  U.S. customary happen only through the `Length`/`Area` accessors, and every
  conversion has a round-trip test.
- Facts and recommendations stay distinct provenance kinds. Official rules
  require a full `RuleCitation` (jurisdiction, ordinance section,
  effective/retrieval dates, parser version).
- `Unresolved` items with `blocksApproval` gate representative-scenario
  approval. Unverified official rules also block.
- The internal id is a PARCELGRID `Uuid`. APNs/provider ids/addresses are
  `ExternalIdentifier`/`ParcelIdentity` source records.

## Reuse / refactor / replace map (from KR prototype)

- **Reuse (country-neutral):** planning geometry & floor stack, spatial
  validation, Geometry Hash / scenario identity, Three.js massing, DAE/DXF
  packaging, financial ledger + reconciliation (`decimal.js`-based), evidence
  storage, review snapshots / handoff / report.
- **Refactor behind the jurisdiction interface:** zoning rules
  (`regulatory/constraints.ts`), frontage/setback/envelope
  (`geo/road-frontage.ts`, `geo/sun-setback.ts`), tax/finance
  (`finance/tax.ts`, `acquisition-price.ts`), identifiers.
- **Replace for the U.S. profile:** VWorld/MOLIT/Kakao integrations, KRW
  columns in the DB schema (`landPriceWon`, `acquiredPriceManwon`), pyeong /
  manwon / Korean address parsing, Seoul zoning + north-sunlight assumptions.

Note: in the KR schema, currency and unit are baked into DB columns, not
behind an adapter. Porting the schema to the U.S. profile is a migration, not
a translation.

## Next steps (README-US Phase US-1)

1. ~~Implement a concrete `AddressProvider` (U.S. Census Geocoder).~~ **Done and
   live-verified** — `src/lib/integrations/us-census/`. Pure parser fully
   fixture-tested; injectable fetch. Outbound HTTPS to
   `geocoding.geo.census.gov` is now reachable from an environment whose egress
   policy allowlists that host, and the provider was verified end-to-end there
   (default global fetch → HTTP 200 → parsed official evidence). The live
   check is captured as an opt-in smoke test
   (`src/tests/integrations/census-geocoder.live.test.ts`, gated on
   `CENSUS_LIVE=1`) so the default suite stays offline and hermetic.
2. ~~Implement a `ParcelProvider` for the pilot, returning `ParcelRecord`
   with evidence.~~ **Done and live-verified** — `src/lib/integrations/us-hennepin/`.
   Chose the **Hennepin County GIS** "County Parcels" layer (the assessor's
   system of record) over Regrid/ATTOM, which re-publish county data
   downstream: provenance-first means sourcing the original, and the county
   service is free, keyless, and reachable from the census-allowlisted egress
   environment. `byPoint` (intersects query) and `byIdentifier` (PID equality)
   both live-verified against a known Minneapolis parcel. Pure parser fixture-
   tested; live smoke gated on `HENNEPIN_LIVE=1`. Known gap surfaced as
   `Unresolved`, not zero: the county parcel layer carries no building
   footprint (source it from the municipal building layer / a survey later).
3. ~~Add FEMA flood + USGS terrain `HazardProvider`s.~~ **Done** —
   `src/lib/integrations/us-fema/` and `.../us-usgs/`.
   - **FEMA flood (live-verified):** NFHL "Flood Hazard Zones" layer 28.
     Queries the parcel polygon (intersects) and aggregates worst-case — any
     SFHA zone wins, `inSfha` set from `SFHA_TF`; no mapped zone is
     `Unresolved` (approval-blocking), never silently "not in a flood zone".
     Live-verified against `hazards.fema.gov` (Minneapolis parcel → Zone X).
     Gated live smoke: `FEMA_LIVE=1`.
   - **USGS terrain (live-verified):** EPQS point samples
     (parcel vertices + interior grid, point-in-polygon filtered) folded to a
     `TerrainSummary`. Min/max elevation are official 3DEP; `meanSlopePct` is a
     coarse extent-based estimate flagged in the evidence note.
     `epqs.nationalmap.gov` is now reachable from an environment whose egress
     policy allowlists that host, and the live smoke (`USGS_LIVE=1`) passes
     end-to-end there (default global fetch → HTTP 200 → parsed 3DEP
     elevations for a known Minneapolis parcel). Parser/sampling remain fully
     fixture-tested offline; the live check stays opt-in
     (`src/tests/integrations/usgs-terrain.live.test.ts`) so the default suite
     is hermetic.
4. ~~Stand up the first `JurisdictionProfile` (Minneapolis) and register it.~~
   **Done** — `src/lib/integrations/us-minneapolis/`. `createMinneapolisProfile`
   binds the four live providers (Census address, Hennepin parcel, FEMA flood,
   USGS terrain) to `us-mn-hennepin-minneapolis`; `registerMinneapolis` puts it
   in a `JurisdictionRegistry` (the MVP's single entry). Finance and tax have no
   sourced data yet, so they are **honest pending profiles** that surface every
   value as `Unresolved` (approval-blocking) rather than a fabricated default —
   README-US §2/§4. Each pending piece is swapped for its real source in place,
   with no downstream shape change. Per-provider network config threads through
   for tests/proxy fetch.
   - **Zoning (both districts live-verified; by-right numbers gated on egress):**
     `MinneapolisZoningProvider` (`us-minneapolis/zoning.ts`) queries TWO
     official City layers by polygon-intersects: "Planning Primary Zoning" →
     the primary/use district (e.g. `UN2`), and "Zoning Built Form" → the built
     form district (e.g. `Interior 2 / BFI2`). This encodes the real Minneapolis
     split: **use** comes from the primary district, **form** (height, FAR,
     setbacks, lot coverage) from the built form district (Chapter 540). The
     `ZoningEvidenceProvider` contract was extended so `envelopeFor(identity,
     geometry?)` receives the parcel geometry (as `HazardProvider` does). A
     split-zoned parcel (either layer) returns `Unresolved`, never a mis-picked
     district.
     - By-right **numeric standards** live in `built-form-rules.ts`, transcribed
       verbatim from the City's published Chapter 540 (fetched via `curl` after
       the ordinance host `minneapolis2040.com` was allowlisted). Each resolved
       value is an `official` rule at `verification: "unverified"`, which the
       approval gate treats as a blocker — a preliminary reference, never a
       legal max. Crucially, each standard is resolved from EXACTLY the inputs
       the ordinance conditions it on (`resolveNumericEnvelope`):
       - **HEIGHT** (§ 540.410, Table 540-6): built form district ALONE.
       - **LOT COVERAGE** (§ 540.910, Table 540-23): built form × primary
         district CATEGORY (`primaryCategoryFromDistrict`: UN/RM vs the CM/DT/PR/
         TR group), derived from the resolved primary district — no use needed.
       - **FAR** (§ 540.110, Table 540-2): built form × primary category ×
         building USE class. The `ZoningEvidenceProvider.envelopeFor(identity,
         geometry?, intent?)` contract gained a `DevelopmentIntent` param; the
         adapter narrows `intent.useClass` to `ZoningUseClass`
         (single/two/three-family, institutional-civic, other). Without a use
         class FAR is `Unresolved` (the gap message lists the tiers).
       - **SETBACKS/yards** (§ 540.8xx): contextual (front-yard averaging) — not
         automated; stays `Unresolved`. Parking (Ch. 541), overlays, and
         discretionary approvals also stay `Unresolved`.
       - **ALLOWED USES** (§ 545.100, Table 545-1): keyed by the primary (use)
         district (`use-rules.ts`, `resolveAllowedUses`). Scoped deliberately to
         the by-right **1–3 family residential dwelling** row — the one cleanly
         extractable row that matches the documented Minneapolis 2040 reform
         (single/two/three-family permitted by right in UN1/2/3, RM1/2, CM1/2).
         `allowedUses` carries those dwelling types with an explicit note that it
         covers residential dwellings ONLY; the full Table 545-1 (other use
         groups, 4+ unit and mixed-use dwellings, conditional uses) is not
         transcribed — that matrix is too large to verify in-session and a
         partial list would misread as exhaustive. Districts without new 1–3
         family by right return `Unresolved`.
       No value is ever collapsed across the inputs it truly depends on.
       Unseeded (stay Unresolved): "Transit 30A/30B" (GIS splits the ordinance's
       single "Transit 30" — needs reconciliation); "Core 50" has no height
       (Table 540-6 = "No limit") but does carry FAR (16.0) and coverage.
     - Pure parsers fixture-tested (both layers); `resolveNumericEnvelope` tested
       for height/coverage/FAR incl. the Interior 3 per-unit tiers and the
       category/use gating; provider tested with an injected fetch and a
       `DevelopmentIntent`. Live smoke (`MPLS_ZONING_LIVE=1`) verified green →
       UN2 + Interior 2, height 35 ft, coverage 45%, FAR 0.5 (single-family).
       `MinneapolisPendingZoningProvider` retained as the all-Unresolved offline
       placeholder.
     - **Egress note:** the ordinance hosts (`minneapolis2040.com`,
       `library.municode.com`) are reachable via `curl` but the WebFetch tool's
       egress path still blocks them, so the PDF is fetched with `curl` and read
       with `pymupdf`. To add standards, extend the tables from the ordinance
       text with exact sections; do not transcribe from memory.
5. ~~Bring in a persistence layer with USD/decimal columns and the UUID/APN
   split from `identifiers.ts`.~~ **Done** — `src/lib/persistence/`.
   - **UUID/APN split:** `SiteRepository` / `InMemorySiteRepository` key a site
     by its opaque `SiteId` UUID and index every external identifier (APN,
     provider id) separately. `findByExternalIdentifier(system, value)` is a
     source-record lookup, not a primary-key access; an APN can be reassigned to
     a new site (split/merge) and re-points the index, and the same value under
     a different `system` is a different identifier. Tested for all of these.
   - **USD/decimal columns:** `serialization.ts` crosses Money/Length/Area to
     columns as their exact canonical decimal STRINGS (`toDecimalString` /
     `toMetersString` / `toSquareMetersString`) with explicit currency/unit — a
     raw `number` never touches a stored value, so no float drift (tested incl.
     0.01 accumulation and sub-cent precision).
   - **Reference DDL:** `schema.sql` (Postgres) is the target a real store maps
     onto: `site` (uuid PK), `site_external_identifier` (many-per-site, never a
     key), and `site_financial_assumption` with `NUMERIC(19,4)` USD amounts +
     an explicit `currency` check — no float near a dollar value.
   - The in-memory impl is dependency-free (no DB in the library core); wiring a
     real Postgres is a straight map onto these tables.
6. **Intake pipeline (MVP spine)** — `src/lib/intake/`. `intakeSite(rawAddress,
   { profile, repository }, { intent? })` orchestrates the resolved providers
   into one due-diligence pass: normalize address → parcel by point → flood +
   terrain + zoning envelope on the parcel geometry → persist the site under its
   UUID → collect `approvalBlockers` over the whole result. It only orchestrates;
   every fact stays Evidence-or-Unresolved and it never invents a value or
   defaults a gap. Degrades honestly: an unresolved address stops before the
   parcel (nothing persisted); a geometry-less parcel makes hazards tracked gaps
   but still persists the identity. Unit-tested with stub providers (happy path,
   address/parcel gaps, geometry-less); live smoke gated on `INTAKE_LIVE=1`
   asserts the pipeline's internal consistency end-to-end against the real
   Minneapolis profile.
   - **Parcel by address (resolves the geocoder-offset problem):** the Census
     geocoder point is interpolated and often lands ~10–30 m off a small
     residential parcel (the parcel's OWN address can miss it), so `byPoint`
     alone returned Unresolved for most real addresses. Added
     `ParcelProvider.byAddress?` (optional on the contract) and implemented it
     on Hennepin: `parseUsAddress` splits the normalized address into
     house/street/municipality, and the layer is queried by its OWN address
     attributes (`HOUSE_NO`, `STREET_NM`, `MUNIC_NM`); `parseAddressMatch`
     enforces a single PID (distinct PIDs → Unresolved, never a guess).
     `intakeSite` now prefers `byAddress`, falling back to `byPoint`. Live E2E
     now completes: `3300 Aldrich Ave S` and `2320 Colfax Ave S` resolve to
     their parcels and persist with a full zoning envelope. Addresses whose
     county `STREET_NM` spelling differs from the Census normalization still
     miss (honest Unresolved), a future street-normalization refinement.

7. **Decision report** — `src/lib/report/`. `buildDecisionReport(dd)` turns a
   `SiteDueDiligence` into a data model that splits resolved FACTS (each with its
   provenance/confidence/verification and formatted source) from tracked GAPS
   (subject/owner/required action, blocks-approval flag), and computes
   `approvable` via `approvalBlockers` — false whenever any Unresolved or any
   unverified official rule remains, which is the honest normal case. Model is
   separate from rendering; `renderTextReport` is one renderer (an HTML/PDF one
   can reuse the model). Verified end-to-end from a real address: `3300 Aldrich
   Ave S` produces a report with 10 sourced facts (owner, 4,347 sq ft lot, FEMA
   Zone X, USGS 872–873 ft terrain, UN2, 1–3 family uses, 35 ft height, 0.50
   FAR, 45% coverage — each citing Census/Hennepin/FEMA/USGS/Chapter 540/545)
   and open items flagged BLOCKS APPROVAL, decision "NOT APPROVABLE — 8 blocking
   item(s)". This closes the README-US MVP loop: a real parcel from address to a
   source-linked, professional-review-gated decision report.

8. **Development pro forma** — `src/lib/finance/`. `computeProForma(inputs)`
   underwrites one site: buildable GSF (lot × FAR), footprint (lot × coverage),
   estimated units, the hard/soft/contingency/total cost stack, and stabilized
   revenue/returns (gross rent → EGI → NOI → cap-rate value, yield on cost,
   development profit). Every input is Evidence-or-Unresolved (official value,
   dated market figure, or explicit user assumption) and every derived line is
   an `algorithm` value; a line whose inputs are not all resolved comes back
   Unresolved naming the missing dependency (`derive` combinator), so an
   unfunded assumption blocks a result instead of defaulting to zero. All money
   math runs on decimal-exact `Money`. `buildSiteMassingProgram(lotArea, zoning,
   proForma)` packages the by-right envelope + buildable program (district, lot,
   FAR, buildable GSF, coverage, footprint, height, setbacks, uses, est. units)
   — the provenance-tagged hand-off to a site-plan / blueprint designer. Note:
   the profile's own `financeProfile` is still all-Unresolved (no sourced market
   data), so a real run supplies user assumptions; wiring dated market sources is
   the natural finance follow-up.

## Session 2026-08-30 — deepened Minneapolis, then went multi-jurisdiction

Everything below is merged to `main` and covered by `pnpm verify` (tsc + full
Vitest suite; live checks stay opt-in behind env flags). Corrects a few earlier
notes: Minneapolis parking and overlays are now RESOLVED (not Unresolved), and a
representative parcel now shows 7 blockers, not 8.

**Minneapolis, deepened (real data, no fabrication):**
- **Parking (Chapter 541):** `parking-rules.ts` — Minneapolis abolished off-street
  parking minimums citywide (2021), so `minParkingStalls` resolves to a sourced 0
  everywhere (no table/context needed). Official but `unverified`, so still gated.
- **Overlay districts (Chapter 551):** `overlays.ts` — resolved SPATIALLY from the
  City "Planning Zoning Overlay" layer (a POST intersects-count per sublayer). A
  clean set of misses resolves the field to an empty, non-blocking list ("no
  overlay applies"); any sublayer error degrades to one Unresolved gap.
  **Floodplain guard:** that sublayer embeds FIRM-panel Zone-X background polygons
  (null designation) that blanket the city, so the query filters
  `SYMBOL_NAM IS NOT NULL` — without it every inland parcel false-positived as
  floodplain. "Split Zoning" sublayer is excluded (already handled by the primary
  parser). Verified live: inland Colfax → none; a riverfront parcel → Shoreland.
- **Hennepin assessor facts** (`us-hennepin/parse-parcel.ts`): `BUILD_YR`,
  `TAXABLE_VAL_TOT`, `TAX_TOT`, `SALE_DATE/PRICE/CODE` → optional official facts on
  `ParcelRecord` (yearBuilt, assessedValue, annualPropertyTax, lastSale). Each
  emitted only when present; a blank/zero is omitted, never asserted as $0. The
  sale-code caveat (e.g. "SALE INCLUDES MORE THAN ONE PARCEL") rides on the value
  AND as the fact note, so a multi-parcel sale is never read as a clean price.
- **Current effective property-tax rate** (`finance/parcel-tax.ts`,
  `buildParcelTaxAssessment`): derived exactly from the parcel's own actual tax ÷
  assessor value — a current-condition `algorithm` fact, explicitly NOT a forward
  redevelopment rate (a rebuild is reassessed). The deed/transfer tax stays
  Unresolved (statute not verifiable from a reachable source — never guessed).
- **Setbacks / discretionary approvals** stay honestly Unresolved: yard rules are
  contextual and the ordinance-text hosts are egress-blocked here, so transcribing
  them would violate the no-fabrication contract.

**Robustness / correctness fixes (help every jurisdiction):**
- **FEMA + Minneapolis zoning now POST the geometry** (body, not URL). Detailed
  lakefront/riverfront parcels overflowed the GET URL limit → HTTP 414/431 →
  whole analysis 500'd. Point/attribute queries (Census/Hennepin/USGS) stay GET.
- **Intake is resilient** (`attemptOr` in `intake.ts`): a THROWN provider failure
  (timeout/5xx/DNS) degrades to an Unresolved source-failure gap instead of
  aborting the run. A report is always produced; the failed fact blocks approval
  and is marked "transient source failure, retry", distinct from "no data".

**Multi-jurisdiction architecture:**
- **`us-national`** — `createUsNationalProviders()` bundles the three FEDERAL
  providers (Census / FEMA / USGS) shared by every US jurisdiction. Verified live
  across DC / TX / CO. Minneapolis and Saint Paul both compose it.
- **Saint Paul (`us-stpaul`)** — the second jurisdiction. Live principal-zoning
  adapter (district resolved from the City ArcGIS Online layer; by-right rules
  Unresolved pending Saint Paul Legislative Code Title VIII/Ch. 66 — the same
  boundary Minneapolis started at). Parcel adapter is a documented PENDING
  placeholder: Ramsey/Met Council/MnGeo parcel hosts are egress-blocked here.
- **Regrid (`us-regrid`)** — a nationwide `ParcelProvider` (token-gated). One
  adapter, ~150M parcels, because Regrid normalizes every county's assessor record
  into one address/point API. Token is stripped from the recorded locator (never
  in a report/log). Wired into Saint Paul as a drop-in: `createStPaulProfile({
  regridToken })` swaps the pending placeholder for Regrid. No live call is made
  here (needs a token + `app.regrid.com` egress); the exact field/endpoint schema
  should be re-confirmed against live docs when a token is wired in.
- **Address → jurisdiction routing** — `JurisdictionProfile.placeNames` +
  `JurisdictionRegistry.resolveByAddress` (match state AND city; honest `undefined`
  when uncovered, so a same-named city in another state never mis-routes).
  `intakeSiteRouted` geocodes once, routes, then runs intake with the chosen
  profile (`IntakeOptions.preNormalized` avoids a second geocode).

**UI prototype** (`ui-prototype/`) is wired to the library via `lib/parcelgrid.ts`
(server bridge running the real pipeline). Runs on Next.js with `--webpack` +
`extensionAlias` to import the library's `.js`-specified TS. Not deployed
(deployment is gated on the founder finishing more states). Current screens:

- **Landing** (`app/page.tsx`) — one interactive US map (`components/us-map-interactive.tsx`);
  supported states are clickable, others show "not yet supported".
- **Search** (`app/search/page.tsx`) — address + acquisition + scenario toggle.
  "Try an example" lists plain example addresses only — no fabricated stats
  (`lib/examples.ts`; the old `mock-data.ts` with hand-written parcel numbers is gone).
- **Report** (`app/report/page.tsx`) — map-split: left = the REAL Hennepin parcel
  polygon (`components/parcel-map.tsx`) + subject identity (with a routed
  **jurisdiction** tag) + approval-blocking open items (each tagged with its owner);
  right = grounded-facts grid (data-driven badges/citations; permitted uses come
  from the library's Table 545-1, never hardcoded). When the parcel is Unresolved
  the facts grid is replaced by an honest panel that states the reason and offers
  **nearby real parcels** to pick (`ParcelProvider.nearby`, closest-first, never
  auto-snapped). A primary "view redevelopment envelope & pro forma" button always
  shows on a resolved report (any scenario).
- **Envelope** (`app/envelope/page.tsx`) — 3D isometric **massing model**
  (`components/massing-3d.tsx`): the real footprint extruded to the §540.410 height
  with floor plates, over the dashed lot outline. Pure SVG, server-rendered.
- **Pro forma** (`app/proforma/proforma-client.tsx`) — runs the REAL finance engine
  client-side (`lib/proforma-live.ts`); sliders drive only user assumptions.
  **Redevelopment options** compares the by-right dwelling types (1/2/3-family),
  each with its own ordinance FAR tier, live with the sliders. **Existing vs
  redevelopment** sets the assessor market value against the selected option's
  stabilized value (directional; different valuation bases, stated).

Multi-jurisdiction routing is wired into the bridge: it registers Minneapolis +
Saint Paul and routes via `intakeSiteRouted`. Saint Paul parcels resolve only
with `REGRID_TOKEN` set (else an honest pending placeholder); an out-of-coverage
address stops with "no covered jurisdiction".

## Session 2026-09-01 — UI depth: decisions, 3D, routing, integrity

Library additions this session:

- **`ParcelProvider.nearby(point, {radiusMeters, max})`** (optional seam;
  implemented for Hennepin) — returns `ParcelCandidate` suggestions (label +
  re-query address + PID + centroid distance), closest-first. NOT a resolution:
  used when a Google-sourced house number isn't itself a parcel (e.g. "1412 S 3rd
  St" → the real lot is 1414) so the app offers neighbours to pick instead of
  snapping. Buffered ArcGIS query (`distance` + `esriSRUnit_Meter`).
- **Existing-structure honesty**: the Hennepin `existingBuildingFootprint` gap now
  states a structure IS on record (with assessor year built) while keeping the
  footprint polygon Unresolved — "existing building" reads as a known structure,
  not an unknown absence.

UI work (all in `ui-prototype/`, see the UI section above): map-split report,
nearby-parcel disambiguation, honest Unresolved rendering (no fabricated 0s or
verified badges), data-driven permitted uses, the 3D massing model, the
by-right scenario comparison, existing-vs-redevelopment, address→jurisdiction
routing surfaced with a jurisdiction tag, an always-available forward button, and
removal of the fabricated "recent lookups".

Deliberately NOT done (honest, not skipped): interior side/rear **setback**
values stay Unresolved — the Minneapolis Urban Neighborhood yard standards could
not be verified against an authoritative source (all ordinance hosts are egress-
blocked here), and the front yard is genuinely contextual (established-average),
so no number is fabricated.

## How to add a new jurisdiction

The seam is proven: a new jurisdiction is **national bundle + parcel + zoning**.
The only genuinely new code is usually the ZONING adapter.

1. **Parcel source.** Either (a) a county GIS `ParcelProvider` (like Hennepin —
   provenance-first, free, but one adapter per county and often on an egress-
   blocked host), or (b) the `RegridParcelProvider` with a token — one adapter,
   all states. Prefer Regrid for breadth; a county adapter when the assessor's own
   layer is required and reachable.
2. **Zoning adapter.** Implement `ZoningEvidenceProvider` against the city's
   zoning GIS (see `us-stpaul/zoning.ts` for the minimal district-only shape, or
   `us-minneapolis/` for full by-right rules). POST the geometry. Resolve the
   district as an official spatial fact; leave by-right numeric rules Unresolved
   until the ordinance is transcribed with exact citations (never from memory).
   Split-zoned parcels → Unresolved, never a mis-pick.
3. **Profile.** `create<City>Profile()` = `createUsNationalProviders(config)` +
   your parcel + your zoning + pending finance/tax. Set `stateCode` and
   `placeNames` (lowercased city spellings) so routing works. Register it
   (`register<City>`).
4. **Tests.** Fixture-backed parse/provider tests + an opt-in live smoke test
   (gate on a `<CITY>_LIVE=1` flag). Add the profile to a two-jurisdiction
   registry test if routing coverage matters.

**The egress wall (this dev environment only):** most county/city GIS hosts are
blocked by the org egress policy; only `services*.arcgis.com` (ArcGIS Online),
`gis.hennepin.us`, and the federal hosts are allowlisted. This is a sandbox
limit, NOT a product limit — a deployed app has normal internet. To develop
against more hosts, widen the environment's network policy (see
code.claude.com/docs/en/claude-code-on-the-web); an org admin may be required.
For real all-states coverage, the scalable answer is the Regrid parcel adapter
(above) plus per-jurisdiction zoning.

### Runtime egress note

Node's global `fetch` (undici) does not honor `HTTPS_PROXY` automatically. In
a proxy-mediated environment, inject a proxy-aware fetch via
`CensusGeocoderConfig.fetchImpl` rather than relying on the default.

## Done condition

```bash
pnpm verify
```

`tsc --noEmit` and the full Vitest suite must pass before changes are merged.
Geometry/finance changes update their regression tests and the user-visible
provenance labels together.
