import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/vue-query";
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

// ---- Mutation hooks (hybrid: optimistic for flat-list edit/delete, invalidate for nested/detail) ----

type Row = { id: string } & Record<string, unknown>;
type ListShape = Row[] | { rows: Row[] } | undefined;

function patchLists(qc: ReturnType<typeof useQueryClient>, prefix: QueryKey, fn: (rows: Row[]) => Row[]) {
  qc.setQueriesData<ListShape>({ queryKey: prefix }, (old) => {
    if (!old) return old;
    if (Array.isArray(old)) return fn(old);
    if (old.rows) return { ...old, rows: fn(old.rows) };
    return old;
  });
}

function useInvalidate<TVars>(mutationFn: (vars: TVars) => Promise<unknown>, keys: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}

function useListDelete(prefix: QueryKey, mutationFn: (id: string) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: prefix });
      const prev = qc.getQueriesData<ListShape>({ queryKey: prefix });
      patchLists(qc, prefix, (rows) => rows.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev?.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: prefix }),
  });
}

function useListUpdate<B extends Record<string, unknown>>(
  prefix: QueryKey,
  mutationFn: (vars: { id: string; body: B }) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: prefix });
      const prev = qc.getQueriesData<ListShape>({ queryKey: prefix });
      patchLists(qc, prefix, (rows) => rows.map((r) => (r.id === id ? { ...r, ...body } : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev?.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: prefix }),
  });
}

const K = {
  prop: ["tier", "proprietarios"] as QueryKey,
  faz: ["tier", "fazendas"] as QueryKey,
  cars: ["tier", "cars"] as QueryKey,
  frig: ["tier", "frigorificos"] as QueryKey,
  grupos: ["tier", "grupos"] as QueryKey,
  tiersList: ["tier", "tiers-list"] as QueryKey,
  tiers: ["tier", "tiers"] as QueryKey,
  lotes: ["tier", "lotes"] as QueryKey,
  gtas: ["tier", "gtas"] as QueryKey,
  abates: ["tier", "abates"] as QueryKey,
  credito: ["tier", "credito"] as QueryKey,
};

// Proprietarios
export const useCreateProprietario = () => useInvalidate(api.createProprietario, [K.prop]);
export const useUpdateProprietario = () => useListUpdate(K.prop, ({ id, body }) => api.updateProprietario(id, body));
export const useDeleteProprietario = () => useListDelete(K.prop, api.deleteProprietario);

// Fazendas
export const useCreateFazenda = () => useInvalidate(api.createFazenda, [K.faz]);
export const useUpdateFazenda = () => useListUpdate(K.faz, ({ id, body }) => api.updateFazenda(id, body));
export const useDeleteFazenda = () => useListDelete(K.faz, api.deleteFazenda);

// Cars
export const useCreateCar = () => useInvalidate(api.createCar, [K.cars, K.faz]);
export const useDeleteCar = () => useListDelete(K.cars, api.deleteCar);

// Frigorificos + grupos
export const useCreateFrigorifico = () => useInvalidate(api.createFrigorifico, [K.frig]);
export const useUpdateFrigorifico = () => useListUpdate(K.frig, ({ id, body }) => api.updateFrigorifico(id, body));
export const useDeleteFrigorifico = () => useListDelete(K.frig, api.deleteFrigorifico);
export const useCreateGrupo = () => useInvalidate(api.createGrupoFrigorifico, [K.grupos]);
export const useDeleteGrupo = () => useListDelete(K.grupos, api.deleteGrupoFrigorifico);

// Tiers
export const useCreateTier = () => useInvalidate(api.createTier, [K.tiersList]);
export const useUpdateTier = () =>
  useInvalidate(
    ({ id, body }: { id: string; body: Parameters<typeof api.updateTier>[1] }) => api.updateTier(id, body),
    [K.tiers, K.tiersList],
  );
export const useSetTierStatus = () =>
  useInvalidate(
    ({ id, body }: { id: string; body: Parameters<typeof api.setTierStatus>[1] }) => api.setTierStatus(id, body),
    [K.tiers, K.tiersList, K.credito],
  );
export const useSetTierContrato = () =>
  useInvalidate(
    ({ id, body }: { id: string; body: Parameters<typeof api.setTierContrato>[1] }) => api.setTierContrato(id, body),
    [K.tiers],
  );
export const useDeleteTier = () => useListDelete(K.tiersList, api.deleteTier);

// Lotes + children (nested cache → invalidate)
export const useCreateLote = () => useInvalidate(api.createLote, [K.lotes]);
export const useUpdateLote = () =>
  useInvalidate(({ id, body }: { id: string; body: { nome?: string } }) => api.updateLote(id, body), [K.lotes]);
export const useDeleteLote = () => useInvalidate(api.deleteLote, [K.lotes]);
export const useAddLoteOrigem = () =>
  useInvalidate(
    ({ loteId, fazendaId }: { loteId: string; fazendaId: string }) => api.addLoteOrigem(loteId, fazendaId),
    [K.lotes],
  );
export const useRemoveLoteOrigem = () =>
  useInvalidate(
    ({ loteId, fazendaId }: { loteId: string; fazendaId: string }) => api.removeLoteOrigem(loteId, fazendaId),
    [K.lotes],
  );
export const useAddLoteGta = () =>
  useInvalidate(({ loteId, gtaId }: { loteId: string; gtaId: string }) => api.addLoteGta(loteId, gtaId), [K.lotes]);
export const useRemoveLoteGta = () =>
  useInvalidate(({ loteId, gtaId }: { loteId: string; gtaId: string }) => api.removeLoteGta(loteId, gtaId), [K.lotes]);

// Documentos (nested under lotes)
export const useUploadDocumento = () => useInvalidate(api.uploadDocumento, [K.lotes]);
export const useDeleteDocumento = () => useInvalidate(api.deleteDocumento, [K.lotes]);

// Gtas
export const useExtractGta = () => useMutation({ mutationFn: api.extractGta });
export const useCreateGta = () => useInvalidate(api.createGta, [K.gtas]);
export const useUpdateGta = () => useListUpdate(K.gtas, ({ id, body }) => api.updateGta(id, body));
export const useDeleteGta = () => useListDelete(K.gtas, api.deleteGta);

// Abates
export const useCreateAbate = () => useInvalidate(api.createAbate, [K.abates, K.tiers, K.credito]);
export const useDeleteAbate = () => useInvalidate(api.deleteAbate, [K.abates, K.tiers, K.credito]);
