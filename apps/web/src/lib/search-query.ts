// apps/web/src/lib/search-query.ts
export type ParsedSearchQuery = {
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  carKey: string | null;
};

type RawQuery = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSearchQuery(query: RawQuery): ParsedSearchQuery {
  const lat = num(query.lat);
  const lng = num(query.lng);
  const radiusRaw = num(query.radius);
  const radiusKm = radiusRaw !== null && radiusRaw >= 1 && radiusRaw <= 50 ? radiusRaw : null;
  const carKeyRaw = typeof query.carKey === "string" ? query.carKey.trim() : "";
  return {
    lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
    radiusKm,
    carKey: carKeyRaw || null,
  };
}

export function serializeSearchQuery(input: {
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  carKey: string | null | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.lat !== null && input.lat !== undefined) out.lat = String(input.lat);
  if (input.lng !== null && input.lng !== undefined) out.lng = String(input.lng);
  if (input.radiusKm !== null && input.radiusKm !== undefined) out.radius = String(input.radiusKm);
  if (input.carKey) out.carKey = input.carKey;
  return out;
}
