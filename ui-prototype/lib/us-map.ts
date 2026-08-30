import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json";
import type { FeatureCollection, Geometry } from "geojson";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 750;

/** One rendered state: its name and the SVG path for the Albers-USA projection. */
export type StateShape = { name: string; d: string };

/**
 * Project the 50 states + DC into SVG paths tagged with their name, so an
 * interactive map can identify which state is hovered or clicked. Runs on the
 * server (the topojson is heavy); only the light path strings + names are sent
 * to the client component.
 */
export function buildUsMapData(): { states: StateShape[] } {
  const topology = statesTopology as unknown as Topology<{
    states: GeometryCollection;
  }>;
  const collection = feature(
    topology,
    topology.objects.states,
  ) as unknown as FeatureCollection<Geometry>;

  const projection = geoAlbersUsa().fitSize(
    [VIEWBOX_WIDTH, VIEWBOX_HEIGHT],
    collection,
  );
  const path = geoPath(projection);

  const states: StateShape[] = [];
  for (const featureItem of collection.features) {
    const d = path(featureItem);
    if (!d) continue;
    const name = (featureItem.properties as { name?: string } | null)?.name ?? "";
    states.push({ name, d });
  }
  return { states };
}

export const MAP_VIEWBOX = `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`;
