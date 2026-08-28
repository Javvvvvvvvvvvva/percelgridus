export const subjectParcel = {
  address: "2320 Colfax Ave S, Minneapolis, MN 55405",
  apn: "3302924110099",
  ward: "Ward 10",
  lotAreaSf: 8825,
  zoningDistrict: "UN2",
  zoningName: "Urban Neighborhood 2",
  builtForm: "Interior 3",
  maxHeightFt: 42,
  maxFar: 0.7,
  maxLotCoveragePct: 60,
};

export const recentLookups = [
  { address: "2320 Colfax Ave S", district: "UN2", lotAreaSf: 8825, openItems: 8 },
  { address: "1416 W 28th St", district: "UN1", lotAreaSf: 5140, openItems: 6 },
  { address: "3100 Lyndale Ave S", district: "CM1", lotAreaSf: 12300, openItems: 9 },
];

// The design's banner counts 8 total blocking items: the 4 standalone rows
// below (setbacks, parking, overlays, discretionary approvals) plus the 4
// by-right rules bundled into the 5th row (height, FAR, lot coverage, uses).
export const TOTAL_OPEN_ITEMS = 8;

export const openItems = [
  {
    title: "Minimum setbacks unresolved",
    detail: "Owner: local zoning professional · contextual, not automatable",
  },
  {
    title: "Minimum parking not evaluated",
    detail: "Ch. 541 · transit-proximity exemptions unread",
  },
  {
    title: "Overlay districts unchecked",
    detail: "Ch. 535 · incl. historic and pedestrian overlays",
  },
  {
    title: "Discretionary approvals unknown",
    detail: "Site plan review / variance path not determined",
  },
  {
    title: "By-right rules await expert verification",
    detail: "Height · FAR · lot coverage · permitted uses (4 items)",
  },
];

export const envelope = {
  buildableGsf: 6177,
  maxFootprintSf: 5295,
  maxHeightFt: 42,
  indicativeUnits: 5,
  gsfPerUnit: 1200,
};
