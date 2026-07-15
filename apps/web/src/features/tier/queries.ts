export const tierKeys = {
  all: ["tier"] as const,
  proprietarios: (params: Record<string, unknown> = {}) =>
    ["tier", "proprietarios", params] as const,
  proprietario: (id: string) => ["tier", "proprietarios", id] as const,
  credito: () => ["tier", "credito"] as const,
  fazendas: (params: Record<string, unknown> = {}) =>
    ["tier", "fazendas", params] as const,
  cars: (fazendaId: string) => ["tier", "cars", fazendaId] as const,
  frigorificos: (params: Record<string, unknown> = {}) =>
    ["tier", "frigorificos", params] as const,
  grupos: (params: Record<string, unknown> = {}) =>
    ["tier", "grupos", params] as const,
  tiers: (filters: Record<string, unknown> = {}) =>
    ["tier", "tiers-list", filters] as const,
  tier: (id: string) => ["tier", "tiers", id] as const,
  lotes: (tierId: string) => ["tier", "lotes", tierId] as const,
  gtas: (search = "") => ["tier", "gtas", search] as const,
  abates: () => ["tier", "abates"] as const,
};
