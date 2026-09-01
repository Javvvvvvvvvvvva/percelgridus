# UI prototype (wired to `src/lib`)

This folder is a **Claude Design handoff implementation**, now connected to the
PARCELGRID library.

## Wired to the real library

`lib/parcelgrid.ts` is a **server-side bridge**: it runs the library's
`intakeSite` pipeline (Census → Hennepin → FEMA → USGS → zoning), builds the
decision report + by-right massing program + pro forma, and returns a plain
`SiteAnalysis` the pages render. Every fact keeps its provenance/verification;
unresolved values come back `null`, never a fabricated number.

- `app/report/page.tsx`, `app/envelope/page.tsx`, `app/proforma/page.tsx` are
  **server-rendered on demand** — they call `getSiteAnalysis(address)` and show
  live data (verified end-to-end: `2320 Colfax Ave S` → APN 3302924110099, UN2,
  42 ft / FAR 0.7 / 60 % coverage, 6,177 buildable GSF, parking min 0 (Ch. 541),
  no overlay, built 2015, effective tax 1.89 %, 7 approval blockers, with
  §540.x / §545.100 citations).
- `app/proforma/proforma-client.tsx` keeps the interactive sliders (user
  assumptions); the server wrapper seeds it with the real buildable envelope and
  a "market reference (not inputs)" panel from the assessor facts.
- `app/page.tsx` (landing) stays static; `app/search/page.tsx` has a live address
  form that passes `?address=` through; `lib/mock-data.ts` now only backs the
  search page's recent-lookups list.

Build/run uses webpack (`next … --webpack`) with `experimental.externalDir` +
`resolve.extensionAlias` so the Next bundler can import the library's ESM
`.js`-specified TypeScript sources from `../../src/lib`. See `next.config.ts`.

The report/envelope/pro-forma pages now render REAL data end-to-end: the flood,
topography, zoning, assessor (year built / assessor value / actual tax / last
sale with its sale-code caveat), effective tax rate, overlay, and parking cards
all come from the library through `getSiteAnalysis`; the search page's address
form passes `?address=` through to a live analysis. `lib/mock-data.ts` now only
backs the search page's recent-lookups list, and the pro-forma sliders are the
one place `lib/financials.ts` still drives the math (user assumptions only).

Origin: this folder started as a self-contained Claude Design handoff — the 5
static artboards from `design-handoff/project/PARCELGRID US.dc.html` (landing,
search, current-condition report, build envelope, pro forma) with hardcoded mock
data. It has since been wired to `src/lib` per `README-US.md` / `PROJECT_MEMORY.md`
("implement domain adapters and unit/currency contracts before … translating
screens"): the pages carry real `Money`/`Length`/`Area` values and
`Evidence`/`Unresolved` provenance, with unresolved facts shown as `—` or open
items, never a fabricated number.

Still a prototype, not the production UI: the landing map is static (no
state-click interaction yet), and only Minneapolis renders full by-right rules
(other jurisdictions surface the district with rules pending — see
`PROJECT_MEMORY.md`). It is not deployed.

## What's here

- `app/`, `components/`, `lib/` — the Next.js (App Router, TypeScript) app.
  See top-level `README.md` in this folder's parent for run instructions
  (`npm install && npm run dev`).
- `design-handoff/` — the original Claude Design export this was built from
  (`README.md` explains the bundle, `chats/chat1.md` is the design
  back-and-forth, `project/PARCELGRID US.dc.html` + `support.js` are the
  design source).

## Run it

```bash
cd ui-prototype
npm install
npm run dev
```

## Multi-jurisdiction & turning on Regrid (nationwide parcels)

`lib/parcelgrid.ts` routes each address to the jurisdiction that serves it:

- **Minneapolis** — resolves fully (Hennepin County GIS, free).
- **Saint Paul** — routes to its live zoning; parcels need a Regrid token (or a
  Ramsey/Met Council adapter) — until then the report shows an honest pending
  state, never fabricated data.
- **Anywhere else in the US** — resolves parcels + flood + terrain via Regrid
  when a token is set; zoning shows "not yet covered" until a local adapter
  exists. Without a token, an out-of-pilot address stops with "no covered
  jurisdiction".

To turn on Regrid (paid; 30-day free trial at regrid.com), set the token when
running:

```bash
REGRID_TOKEN=<your-regrid-token> npm run dev
```

That single env var makes Saint Paul and any US address resolve parcels. No code
change is needed — the `RegridParcelProvider` is verified against Regrid's live
v2 API (endpoints, `token`/`lat`/`lon`/`query` params, GeoJSON standard schema).
