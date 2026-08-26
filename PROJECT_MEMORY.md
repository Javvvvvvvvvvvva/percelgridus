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
2. Implement a `ParcelProvider` for the pilot (Regrid or ATTOM) plus the
   pilot jurisdiction GIS, returning `ParcelRecord` with evidence.
3. Add FEMA flood + USGS terrain `HazardProvider`s.
4. Stand up the first `JurisdictionProfile` (Minneapolis) and register it.
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
