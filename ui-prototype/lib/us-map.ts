import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json";
import type { FeatureCollection, Geometry } from "geojson";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 750;
const MN_ZOOM_SCALE = 1.7;

export type StatePath = { d: string; isFocus: boolean };

export type UsMapData = {
  /** All 50 states + DC, undifferentiated fill — for the plain map panel. */
  states: { d: string }[];
  /** Same geometry, with the focus state flagged for a highlight fill. */
  statesFocus: StatePath[];
  /** SVG transform centering + zooming on the focus state's centroid. */
  focusTransform: string;
};

export function buildUsMapData(focusStateName: string): UsMapData {
  const topology = statesTopology as unknown as Topology<{ states: GeometryCollection }>;
  const collection = feature(topology, topology.objects.states) as unknown as FeatureCollection<Geometry>;

  const projection = geoAlbersUsa().fitSize([VIEWBOX_WIDTH, VIEWBOX_HEIGHT], collection);
  const path = geoPath(projection);

  const states: { d: string }[] = [];
  const statesFocus: StatePath[] = [];
  let focusCentroid: [number, number] = [VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2];

  for (const featureItem of collection.features) {
    const d = path(featureItem);
    if (!d) continue;
    const isFocus = (featureItem.properties as { name?: string } | null)?.name === focusStateName;
    if (isFocus) {
      const centroid = path.centroid(featureItem);
      if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
        focusCentroid = centroid as [number, number];
      }
    }
    states.push({ d });
    statesFocus.push({ d, isFocus });
  }

  const tx = VIEWBOX_WIDTH / 2 - MN_ZOOM_SCALE * focusCentroid[0];
  const ty = VIEWBOX_HEIGHT / 2 - MN_ZOOM_SCALE * focusCentroid[1];

  return {
    states,
    statesFocus,
    focusTransform: `translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${MN_ZOOM_SCALE})`,
  };
}

export const MAP_VIEWBOX = `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`;
