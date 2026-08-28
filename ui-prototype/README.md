# UI prototype (not wired to `src/lib`)

This folder is a **Claude Design handoff implementation**, pushed on a dedicated
branch and kept out of `main` on purpose.

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
