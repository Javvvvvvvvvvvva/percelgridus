# PARCELGRID US — current working baseline

Last updated: 2026-08-26

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
| HazardProvider (flood) — FEMA NFHL | `src/lib/integrations/us-fema/` |
| HazardProvider (terrain) — USGS 3DEP | `src/lib/integrations/us-usgs/` |

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
   - **Zoning (district live-verified):** `MinneapolisZoningProvider`
     (`us-minneapolis/zoning.ts`) resolves the official zoning **district** from
     the City of Minneapolis "Planning Primary Zoning" ArcGIS layer via a
     polygon-intersects query — the `ZoningEvidenceProvider` contract was
     extended so `envelopeFor(identity, geometry?)` receives the parcel geometry
     (as `HazardProvider` does). A split-zoned parcel returns `Unresolved`, not a
     mis-picked district. By-right **numeric rules** (FAR/height/setbacks/
     coverage/parking), allowed uses, overlays, and discretionary approvals stay
     `Unresolved` (no ordinance rule text parsed yet), per §2 "no safe hard-coded
     zoning engine". Pure parser fixture-tested; live smoke gated on
     `MPLS_ZONING_LIVE=1` (verified green → UN2 for a known parcel).
     `MinneapolisPendingZoningProvider` is retained as the all-Unresolved
     offline placeholder.
5. Only then bring in a persistence layer with USD/decimal columns and the
   UUID/APN split from `identifiers.ts`.

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
