export type LatLng = { lat: number; lng: number };
export type Bounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function isCenterOutsideBounds(center: LatLng, bounds?: Bounds | null): boolean {
  if (!bounds) return false;
  return (
    center.lat < bounds.minLat ||
    center.lat > bounds.maxLat ||
    center.lng < bounds.minLng ||
    center.lng > bounds.maxLng
  );
}
