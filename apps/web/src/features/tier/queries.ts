import { useQuery } from "@tanstack/vue-query";
import { toValue, type MaybeRefOrGetter } from "vue";
import * as api from "./api";

export const tierKeys = {
  all: ["tier"] as const,
  proprietarios: (params: Record<string, unknown> = {}) => ["tier", "proprietarios", params] as const,
  proprietario: (id: string) => ["tier", "proprietarios", id] as const,
  credito: () => ["tier", "credito"] as const,
  fazendas: (params: Record<string, unknown> = {}) => ["tier", "fazendas", params] as const,
  cars: (fazendaId: string) => ["tier", "cars", fazendaId] as const,
  frigorificos: (params: Record<string, unknown> = {}) => ["tier", "frigorificos", params] as const,
  grupos: (params: Record<string, unknown> = {}) => ["tier", "grupos", params] as const,
  tiers: (filters: Record<string, unknown> = {}) => ["tier", "tiers-list", filters] as const,
  tier: (id: string) => ["tier", "tiers", id] as const,
  lotes: (tierId: string) => ["tier", "lotes", tierId] as const,
  gtas: (search = "") => ["tier", "gtas", search] as const,
  abates: () => ["tier", "abates"] as const,
};

// ---- Query hooks ----
export function useProprietarios(params: MaybeRefOrGetter<{ search?: string }> = () => ({})) {
  return useQuery({
    queryKey: tierKeys.proprietarios(toValue(params)),
    queryFn: () => api.listProprietarios({ ...toValue(params), pageSize: 200 }),
  });
}

export function useFazendas(params: MaybeRefOrGetter<{ search?: string; proprietarioDonoId?: string }> = () => ({})) {
  return useQuery({
    queryKey: tierKeys.fazendas(toValue(params)),
    queryFn: () => api.listFazendas({ ...toValue(params), pageSize: 200 }),
  });
}

export function useCars(fazendaId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: tierKeys.cars(toValue(fazendaId)),
    queryFn: () => api.listCars({ fazendaId: toValue(fazendaId), pageSize: 200 }),
    enabled: () => !!toValue(fazendaId),
  });
}

export function useFrigorificos() {
  return useQuery({
    queryKey: tierKeys.frigorificos(),
    queryFn: () => api.listFrigorificos({ pageSize: 200 }),
  });
}

export function useGrupos() {
  return useQuery({
    queryKey: tierKeys.grupos(),
    queryFn: () => api.listGruposFrigorifico({ pageSize: 200 }),
  });
}

export function useTiers(
  filters: MaybeRefOrGetter<{
    proprietarioId?: string;
    fazendaId?: string;
    status?: string;
  }> = () => ({}),
) {
  return useQuery({
    queryKey: tierKeys.tiers(toValue(filters)),
    queryFn: () =>
      api.listTiers({
        ...toValue(filters),
        pageSize: 200,
      } as Parameters<typeof api.listTiers>[0]),
  });
}

export function useTier(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: tierKeys.tier(toValue(id)),
    queryFn: () => api.getTier(toValue(id)),
    enabled: () => !!toValue(id),
  });
}

export function useLotes(tierId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: tierKeys.lotes(toValue(tierId)),
    queryFn: async () => {
      const base = await api.listLotes(toValue(tierId));
      return Promise.all(base.map((l) => api.getLote(l.id)));
    },
    enabled: () => !!toValue(tierId),
  });
}

export function useGtas(search: MaybeRefOrGetter<string> = () => "") {
  return useQuery({
    queryKey: tierKeys.gtas(toValue(search)),
    queryFn: () => api.listGtas(toValue(search) || undefined),
  });
}

export function useAbates() {
  return useQuery({
    queryKey: tierKeys.abates(),
    queryFn: () => api.listAbates(),
  });
}

// Approved tiers with saldo>0, composed for the Abates picker.
export function useAvailableTiers() {
  return useQuery({
    queryKey: [...tierKeys.tiers({ status: "APROVADO" }), "available"],
    queryFn: async () => {
      const paged = await api.listTiers({ status: "APROVADO", pageSize: 200 });
      const detailed = await Promise.all(paged.rows.map((t) => api.getTier(t.id)));
      return detailed.filter((t) => t.saldo > 0);
    },
  });
}

export function useCredito(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: tierKeys.credito(),
    queryFn: () => api.getCredito(toValue(id)),
    enabled: () => !!toValue(id),
  });
}
