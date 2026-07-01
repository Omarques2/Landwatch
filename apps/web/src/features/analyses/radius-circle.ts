import type { FeatureCollection, Position } from "geojson";

// Approximate a geodesic circle as a 64-vertex polygon around center.
export function buildRadiusCircleGeoJson(
  center: { lat: number; lng: number },
  radiusMeters: number,
): FeatureCollection {
  const points = 64;
  const earthRadius = 6_378_137;
  const latRad = (center.lat * Math.PI) / 180;
  const coords: Position[] = [];
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusMeters * Math.cos(angle)) / (earthRadius * Math.cos(latRad));
    const dy = (radiusMeters * Math.sin(angle)) / earthRadius;
    const lng = center.lng + (dx * 180) / Math.PI;
    const lat = center.lat + (dy * 180) / Math.PI;
    coords.push([lng, lat]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      },
    ],
  };
}
