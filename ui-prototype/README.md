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
  42 ft / FAR 0.7 / 60 % coverage, 6,177 buildable GSF, 8 approval blockers,
  with §540.x / §545.100 citations).
- `app/proforma/proforma-client.tsx` keeps the interactive sliders (user
  assumptions); the server wrapper seeds it with the real buildable envelope.
- `app/page.tsx` (landing) and `app/search/page.tsx` stay static; `lib/mock-data.ts`
  now only backs the search page's recent-lookups list.

Build/run uses webpack (`next … --webpack`) with `experimental.externalDir` +
`resolve.extensionAlias` so the Next bundler can import the library's ESM
`.js`-specified TypeScript sources from `../../src/lib`. See `next.config.ts`.

Still to do: bind the report's flood/topography fact cards from
`sa.report.facts` (they currently keep the design's static copy), and add an
address form on the landing/search page that passes `?address=` through.

`README-US.md` / `PROJECT_MEMORY.md` at the repo root are explicit that this
project implements contracts and providers before screens (see
"Implement domain adapters and unit/currency contracts before replacing
integrations or translating screens"). This folder is exactly the piece that
comes later — it's a self-contained Next.js app rendering the 5 static
artboards from `design-handoff/project/PARCELGRID US.dc.html` (landing,
search, current-condition report, build envelope, pro forma), with hardcoded
mock data and the pro forma math ported 1:1 from the design prototype.

It does **not** call into `src/lib` (units, jurisdiction, finance, evidence,
providers) at all. Before any of this becomes real product screens, it needs
to be rebuilt against those contracts — real `Money`/`Length`/`Area` value
objects, `Evidence`/`Unresolved` provenance from `src/lib/jurisdiction`, real
provider data instead of the mock parcel in `lib/mock-data.ts`, and the
finance ledger in `src/lib/finance` instead of the standalone
`lib/financials.ts` copy.

Treat this as a **visual reference and starting point**, not a UI to merge
as-is.

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
