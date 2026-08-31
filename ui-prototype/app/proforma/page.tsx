import { getSiteAnalysis } from "@/lib/parcelgrid";
import ProFormaClient from "./proforma-client";

// Server wrapper: run the real analysis, hand the resolved envelope + pro forma
// seed to the interactive client component (sliders drive user assumptions only).
export default async function ProFormaPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  const sa = await getSiteAnalysis(address);
  const floodLabel = sa.flood
    ? sa.flood.inSfha
      ? `SFHA · Zone ${sa.flood.zone}`
      : `Flood Zone ${sa.flood.zone}`
    : null;
  const overlayLabel =
    sa.overlays.resolved && sa.overlays.names.length ? sa.overlays.names.join(" · ") : null;
  return (
    <ProFormaClient
      parcel={sa.parcel}
      envelope={sa.envelope}
      seed={sa.proFormaSeed}
      assessment={sa.assessment}
      openItemCount={sa.openItemCount}
      parcelGeometry={sa.parcelGeometry}
      floodLabel={floodLabel}
      overlayLabel={overlayLabel}
    />
  );
}
