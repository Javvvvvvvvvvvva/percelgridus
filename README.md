# PARCELGRID US

Provenance-first predevelopment decision platform for U.S. small and midsize
real estate developers — the U.S. profile of PARCELGRID.

> **Status:** early foundation. This repository currently contains the
> country/jurisdiction **adapter boundary** and the **unit/currency
> contracts** only. Integrations, database, and screens come after the
> contracts, per the migration plan.

The product blueprint and migration contract is **[README-US.md](README-US.md)**.
The reusable engineering comes from the validated Korean prototype
([Javvvvvvvvvvvva/parcelgrid](https://github.com/Javvvvvvvvvvvva/parcelgrid));
that code is a **read-only regression profile** and is never translated and
shipped as U.S.-ready.

## Why contracts first

README-US is explicit about order:

> Implement domain adapters and unit/currency contracts **before** replacing
> integrations or translating screens.

Everything country-specific in the Korean prototype (identifiers, geocoding,
zoning rules, units, currency, hazards, finance/tax defaults) is reached only
through a `JurisdictionProfile`, so the reusable core (geometry, ledger,
exports, handoff, report) never names a country.

## What is implemented

| Contract | Location | Backs README-US section |
|---|---|---|
| USD money (decimal, currency-tagged) | `src/lib/units/money.ts` | Units and currency are explicit |
| Length (canonical meters ↔ ft/in) | `src/lib/units/length.ts` | Units and currency are explicit |
| Area (canonical m² ↔ sq ft/acre) | `src/lib/units/area.ts` | Units and currency are explicit |
| Unit profile & labeled cost bases | `src/lib/units/unit-profile.ts` | USD/GSF, USD/NSF, USD/unit, USD/stall |
| Evidence envelope (facts ≠ recommendations) | `src/lib/jurisdiction/evidence.ts` | §1, §2, §4 |
| Internal UUID vs. raw APN/provider ids | `src/lib/jurisdiction/identifiers.ts` | Internal id is a PARCELGRID UUID |
| Provider seams (address/parcel/zoning/hazard/finance/tax) | `src/lib/jurisdiction/providers.ts` | U.S. data strategy |
| `JurisdictionProfile` + registry | `src/lib/jurisdiction/profile.ts` | Proposed adapter boundary |

Design decisions and what comes next live in
[PROJECT_MEMORY.md](PROJECT_MEMORY.md).

## Core invariants

- **Money is decimal USD, currency-tagged.** No floating-point display value
  feeds back into money math; there is no manwon/KRW path.
- **Geometry kernel is canonical metric.** A raw `number` never crosses a
  unit boundary — every length/area is a value object that knows its unit.
- **Every material fact carries provenance.** Official / user-input /
  algorithm / professional-confirmation / reference are distinct at the type
  level; the engine never silently overwrites a user assumption.
- **Missing evidence is state, not zero.** An `Unresolved` has an owner and a
  required action and blocks representative-scenario approval.
- **The internal key is a UUID.** APNs, provider ids, and addresses are
  attributed source records, never primary keys.

## Develop

```bash
pnpm install
pnpm verify   # tsc --noEmit && vitest run
```

## Disclaimer

PARCELGRID US provides preliminary, source-linked development feasibility
support. It does not replace surveys, title work, zoning verification, legal
opinions, environmental assessments, architectural/engineering services,
appraisals, tax advice, contractor estimates, lender underwriting, or permit
review. Qualified local professionals must verify material decisions.
