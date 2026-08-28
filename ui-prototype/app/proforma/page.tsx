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
  return (
    <ProFormaClient parcel={sa.parcel} envelope={sa.envelope} seed={sa.proFormaSeed} />
  );
}
