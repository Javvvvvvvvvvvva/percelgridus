import { Badge } from "@/components/badge";

/**
 * Isometric massing model — extrudes the parcel's REAL footprint (the Hennepin
 * GIS lot polygon, inset to the by-right lot-coverage fraction) up to the
 * ordinance height, as an axonometric solid with per-storey floor plates. Like
 * ParcelMap it uses no basemap and invents no detail: the plan comes from the
 * real boundary, the height from the parsed §540.410 cap, and it says so. Pure
 * SVG, server-renderable, so it costs nothing at runtime.
 */
export function MassingModel3D({
  rings,
  coverageFraction,
  heightFt,
  stories,
  floodLabel,
  address,
  heightPx = 380,
}: {
  rings: number[][][] | null;
  coverageFraction: number | null;
  heightFt: number | null;
  stories: number | null;
  floodLabel: string | null;
  address: string;
  heightPx?: number;
}) {
  const W = 460;
  const H = heightPx;
  const model =
    rings && rings.length > 0 && heightFt && heightFt > 0
      ? buildModel(rings, coverageFraction ?? 1, heightFt, stories ?? 3, W, H)
      : null;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 12, left: 14, display: "flex", gap: 6, flexWrap: "wrap", zIndex: 2 }}>
        {floodLabel ? <Badge tone="blue">{floodLabel}</Badge> : null}
        <Badge tone="gray">SCHEMATIC MASSING</Badge>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`By-right massing model for ${address}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <pattern id="pg-grid3d" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#pg-grid3d)" />

        {model ? (
          <>
            {/* Lot ground outline (real parcel boundary), on the ground plane. */}
            <path d={model.lotPath} fill="var(--ink2)" fillOpacity={0.06} stroke="var(--ink2)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinejoin="round" />
            {/* Walls, painter-ordered back-to-front, two-tone by orientation. */}
            {model.walls.map((w, i) => (
              <path key={i} d={w.d} fill="var(--blue)" fillOpacity={w.lit ? 0.5 : 0.32} stroke="var(--blue)" strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
            ))}
            {/* Interior floor plates (front silhouette edges). */}
            {model.floorLines.map((d, i) => (
              <path key={`f${i}`} d={d} fill="none" stroke="var(--blue)" strokeOpacity={0.5} strokeWidth={1} />
            ))}
            {/* Roof plate. */}
            <path d={model.topPath} fill="var(--blue)" fillOpacity={0.82} stroke="var(--blue)" strokeWidth={1.5} strokeLinejoin="round" />
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="var(--ink3)" fontFamily="var(--font-mono), monospace">
            Massing unresolved
          </text>
        )}
      </svg>

      <div style={{ position: "absolute", bottom: 12, right: 14, fontFamily: "var(--font-mono), monospace", fontSize: 11, lineHeight: 1.3, color: "var(--ink3)", textAlign: "right" }}>
        {heightFt ? (
          <div style={{ color: "var(--ink)", fontWeight: 500 }}>
            {heightFt} ft · ≈ {stories ?? 3} stories
          </div>
        ) : null}
        <div>real footprint · §540.410 height</div>
      </div>
    </div>
  );
}

/** Build the axonometric geometry from the real rings + height. */
function buildModel(
  rings: number[][][],
  coverageFraction: number,
  heightFt: number,
  stories: number,
  W: number,
  H: number,
) {
  const lot = rings[0]!; // outer ring drives the plan
  // Local metric plan, centred on the footprint centroid.
  const pts = lot;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const midLat = (minLat + maxLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const M = 111_320;
  const cLng = (minLng + maxLng) / 2;
  const cLat = (minLat + maxLat) / 2;
  const toMeters = (p: number[]) => [(p[0]! - cLng) * k * M, (p[1]! - cLat) * M] as [number, number];

  const lotM = lot.map(toMeters);
  // Building footprint = lot scaled toward its centroid so the drawn area is the
  // coverage fraction (linear scale = sqrt(area fraction)).
  const f = Math.sqrt(Math.max(coverageFraction, 0.02));
  let bx = 0, by = 0;
  for (const [x, y] of lotM) { bx += x; by += y; }
  bx /= lotM.length; by /= lotM.length;
  const footM = lotM.map(([x, y]) => [bx + (x - bx) * f, by + (y - by) * f] as [number, number]);
  const heightM = heightFt * 0.3048;

  // Isometric (2:1) projection: ground (x,y) → diamond, z is up.
  const C = Math.cos(Math.PI / 6);
  const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C, (x + y) * 0.5 - z];

  // Collect every projected vertex to fit the frame.
  const all: [number, number][] = [];
  const lotBase = lotM.map(([x, y]) => iso(x, y, 0));
  const footBase = footM.map(([x, y]) => iso(x, y, 0));
  const footTop = footM.map(([x, y]) => iso(x, y, heightM));
  all.push(...lotBase, ...footBase, ...footTop);
  let miX = Infinity, maX = -Infinity, miY = Infinity, maY = -Infinity;
  for (const [x, y] of all) {
    if (x < miX) miX = x; if (x > maX) maX = x;
    if (y < miY) miY = y; if (y > maY) maY = y;
  }
  const pad = 34;
  const scale = Math.min((W - 2 * pad) / (maX - miX || 1), (H - 2 * pad) / (maY - miY || 1));
  const offX = (W - (maX - miX) * scale) / 2 - miX * scale;
  const offY = (H - (maY - miY) * scale) / 2 - miY * scale;
  const S = (p: [number, number]): [number, number] => [offX + p[0] * scale, offY + p[1] * scale];

  const toPath = (poly: [number, number][]) =>
    poly.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") + " Z";

  const lotPath = toPath(lotBase.map(S));
  const topPath = toPath(footTop.map(S));

  // Walls: one quad per footprint edge, ordered back-to-front (by ground depth
  // x+y ascending = farther first), two-tone by the edge normal vs a light dir.
  const n = footM.length;
  const edges: { d: string; lit: boolean; depth: number }[] = [];
  const lx = 0.9, ly = -0.4; // light from upper-right
  for (let i = 0; i < n - 1; i++) {
    const a = footM[i]!, b = footM[i + 1]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const nx = dy, ny = -dx; // outward-ish normal
    const lit = nx * lx + ny * ly > 0;
    const depth = (a[0] + a[1] + b[0] + b[1]) / 2;
    const quad: [number, number][] = [
      S(iso(a[0], a[1], 0)),
      S(iso(b[0], b[1], 0)),
      S(iso(b[0], b[1], heightM)),
      S(iso(a[0], a[1], heightM)),
    ];
    edges.push({ d: toPath(quad), lit, depth });
  }
  edges.sort((p, q) => p.depth - q.depth);

  // Floor plates: the footprint ring at each interior storey height.
  const floorLines: string[] = [];
  const nStories = Math.max(1, Math.min(stories, 8));
  for (let s = 1; s < nStories; s++) {
    const z = (heightM * s) / nStories;
    floorLines.push(toPath(footM.map(([x, y]) => S(iso(x, y, z)))));
  }

  return { lotPath, topPath, walls: edges, floorLines };
}
