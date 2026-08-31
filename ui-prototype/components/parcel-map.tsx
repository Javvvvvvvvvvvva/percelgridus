import { Badge } from "@/components/badge";

/**
 * Site map — renders the parcel's REAL boundary polygon (Hennepin GIS geometry,
 * WGS84 rings) as a projected site plan. No basemap tiles (those need a tile
 * provider + key at deploy); this draws the actual lot shape, oriented north-up,
 * with a scale bar and the flood/overlay context as chips — honest and offline.
 */
export function ParcelMap({
  rings,
  lotAreaSf,
  floodLabel,
  overlayLabel,
  address,
}: {
  rings: number[][][] | null;
  lotAreaSf: number | null;
  floodLabel: string | null;
  overlayLabel: string | null;
  address: string;
}) {
  const W = 440;
  const H = 320;
  const PAD = 34;

  const projected = rings ? projectRings(rings, W, H, PAD) : null;

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
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          zIndex: 2,
        }}
      >
        {floodLabel ? <Badge tone="blue">{floodLabel}</Badge> : null}
        {overlayLabel ? <Badge tone="orange">{overlayLabel}</Badge> : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Parcel boundary for ${address}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <defs>
          <pattern id="pg-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.5" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#pg-grid)" />

        {projected ? (
          <>
            {projected.paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="var(--blue-bg)"
                stroke="var(--blue)"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ))}
            {/* North arrow */}
            <g transform={`translate(${W - 30}, 34)`}>
              <path d="M0 -14 L5 6 L0 1 L-5 6 Z" fill="var(--ink2)" />
              <text y={20} textAnchor="middle" fontSize={11} fill="var(--ink3)" fontFamily="var(--font-mono), monospace">N</text>
            </g>
            {/* Scale bar */}
            <g transform={`translate(${PAD}, ${H - 20})`}>
              <line x1={0} y1={0} x2={projected.scaleBarPx} y2={0} stroke="var(--ink2)" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="var(--ink2)" strokeWidth={2} />
              <line x1={projected.scaleBarPx} y1={-4} x2={projected.scaleBarPx} y2={4} stroke="var(--ink2)" strokeWidth={2} />
              <text x={projected.scaleBarPx / 2} y={-8} textAnchor="middle" fontSize={10} fill="var(--ink3)" fontFamily="var(--font-mono), monospace">
                {projected.scaleBarLabel}
              </text>
            </g>
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="var(--ink3)" fontFamily="var(--font-mono), monospace">
            Parcel boundary unresolved
          </text>
        )}
      </svg>

      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 14,
          fontFamily: "var(--font-mono), monospace",
          fontSize: 11,
          lineHeight: 1.3,
          color: "var(--ink3)",
          textAlign: "right",
        }}
      >
        {lotAreaSf !== null ? (
          <div style={{ color: "var(--ink)", fontWeight: 500 }}>
            {lotAreaSf.toLocaleString("en-US")} sq ft
          </div>
        ) : null}
        <div>Hennepin GIS boundary</div>
      </div>
    </div>
  );
}

/** Equirectangular projection (latitude-corrected) of the rings into the frame. */
function projectRings(rings: number[][][], W: number, H: number, pad: number) {
  const pts = rings.flat();
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const midLat = (minLat + maxLat) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  // World units (degrees), x scaled by cos(lat) so the aspect is right.
  const worldW = Math.max((maxLng - minLng) * k, 1e-9);
  const worldH = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((W - 2 * pad) / worldW, (H - 2 * pad) / worldH);
  const drawW = worldW * scale;
  const drawH = worldH * scale;
  const offX = (W - drawW) / 2;
  const offY = (H - drawH) / 2;
  const px = (lng: number) => offX + (lng - minLng) * k * scale;
  const py = (lat: number) => offY + (maxLat - lat) * scale; // flip Y

  const paths = rings.map((ring) => {
    const d = ring
      .map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]!).toFixed(1)},${py(p[1]!).toFixed(1)}`)
      .join(" ");
    return d + " Z";
  });

  // Scale bar: pick a "nice" round distance close to ~1/4 of the frame width.
  const metersPerDeg = 111_320;
  const worldWmeters = (maxLng - minLng) * k * metersPerDeg;
  const targetMeters = (worldWmeters * ((W - 2 * pad) * 0.25)) / drawW;
  const nice = niceRound(targetMeters);
  const scaleBarPx = (nice / worldWmeters) * drawW;
  const scaleBarLabel = nice >= 1 ? `${nice} m` : `${Math.round(nice * 100)} cm`;

  return { paths, scaleBarPx, scaleBarLabel };
}

/** Round to 1/2/5 × 10^n. */
function niceRound(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / pow;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * pow;
}
