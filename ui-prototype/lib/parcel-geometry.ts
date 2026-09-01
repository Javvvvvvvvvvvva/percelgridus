export type PolygonCoordinatesUi = number[][][];

/** Serializable mirror of the core ParcelGeometry contract. */
export type ParcelGeometryUi =
  | { readonly type: "Polygon"; readonly coordinates: PolygonCoordinatesUi }
  | {
      readonly type: "MultiPolygon";
      readonly coordinates: number[][][][];
    };

export function geometryParts(
  geometry: ParcelGeometryUi,
): readonly PolygonCoordinatesUi[] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}
