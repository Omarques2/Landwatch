# Tier Sub-project A — Cache + Optimistic UI Implementation Plan

> **For agentic workers (Codex):** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`. This is a CONTRACT — follow it in order, do NOT restructure the app or touch files outside each task's list. Spec: `docs/superpowers/specs/2026-07-06-tier-frontend-cache-optimistic-design.md`.

**Goal:** Introduce a `@tanstack/vue-query` caching layer for the Tier web module so navigation is instant when cached, data refreshes in the background, and mutations reflect immediately (hybrid optimistic) without manual reload.

**Architecture:** Add a `QueryClient` in `main.ts`. New `apps/web/src/features/tier/queries.ts` wraps the existing `api.ts` transport fns in `useQuery`/`useMutation` hooks (key factory + hybrid mutations). Migrate the 6 Tier views to consume hooks instead of `ref`+`onMounted`+`load`. `api.ts` unchanged.

**Tech Stack:** Vue 3.5, `@tanstack/vue-query` v5, axios (existing), vitest.

## Constraints
- No local DB / integration env. Gate is `npm run lint && npm run typecheck && npm run build` in `apps/web`, plus `npm run test` for the one unit test. Query/mutation hooks validated manually on staging.
- Do NOT change `api.ts`, `router/index.ts`, `AppShellView.vue`, or any non-Tier file except `main.ts` (one addition).
- One task = one commit (message given per task). No Claude co-author trailer.

## File structure
- Modify `apps/web/src/main.ts` — register `VueQueryPlugin` + `QueryClient`.
- Create `apps/web/src/features/tier/queries.ts` — key factory + query hooks + mutation hooks.
- Create `apps/web/src/features/tier/queries.spec.ts` — unit test for `tierKeys`.
- Modify the 6 views: `ProprietariosView.vue`, `FazendasView.vue`, `FrigorificosView.vue`, `TierListView.vue`, `TierDetailView.vue`, `AbatesView.vue`.

---

### Task 1: Add dependency + QueryClient setup

**Files:** Modify `apps/web/package.json`, `apps/web/src/main.ts`

- [ ] **Step 1: Install.** Run: `cd apps/web && npm install @tanstack/vue-query@^5`
  Expected: adds to `dependencies`, no peer errors (Vue 3.5 supported).

- [ ] **Step 2: Register the plugin** in `apps/web/src/main.ts`. Replace the file body with:

```ts
import { createApp } from "vue";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";

const app = createApp(App);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

app.use(router);
app.use(VueQueryPlugin, { queryClient });
app.mount("#app");
```

- [ ] **Step 3: Gate.** Run: `cd apps/web && npm run typecheck && npm run build`. Expected: PASS.
- [ ] **Step 4: Commit.**
```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/main.ts
git commit -m "feat(tier-web): add @tanstack/vue-query client"
```

---

### Task 2: Key factory + unit test

**Files:** Create `apps/web/src/features/tier/queries.ts` (initial), `apps/web/src/features/tier/queries.spec.ts`

- [ ] **Step 1: Write the failing test** `queries.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tierKeys } from "./queries";

describe("tierKeys", () => {
  it("builds hierarchical, stable keys", () => {
    expect(tierKeys.all).toEqual(["tier"]);
    expect(tierKeys.proprietarios({ search: "a" })).toEqual([
      "tier",
      "proprietarios",
      { search: "a" },
    ]);
    expect(tierKeys.tier("t1")).toEqual(["tier", "tiers", "t1"]);
    expect(tierKeys.lotes("t1")).toEqual(["tier", "lotes", "t1"]);
    expect(tierKeys.credito()).toEqual(["tier", "credito"]);
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `cd apps/web && npm run test -- queries` → FAIL (module missing).

- [ ] **Step 3: Create `queries.ts` with the key factory only:**

```ts
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
```

- [ ] **Step 4: Run, verify pass.** Run: `cd apps/web && npm run test -- queries` → PASS.
- [ ] **Step 5: Commit.**
```bash
git add apps/web/src/features/tier/queries.ts apps/web/src/features/tier/queries.spec.ts
git commit -m "feat(tier-web): query key factory"
```

---

### Task 3: Query hooks

**Files:** Modify `apps/web/src/features/tier/queries.ts`

- [ ] **Step 1: Append query hooks.** Each wraps the matching `api.ts` fn. Add imports from `@tanstack/vue-query` (`useQuery`) and `./api` + `vue` (`computed`, `unref`, `MaybeRefOrGetter`, `toValue`). Use `toValue` for reactive params so hooks react to changing refs.

```ts
import { useQuery, type QueryClient } from "@tanstack/vue-query";
import { toValue, type MaybeRefOrGetter } from "vue";
import * as api from "./api";

export function useProprietarios(
  params: MaybeRefOrGetter<{ search?: string }> = () => ({}),
) {
  return useQuery({
    queryKey: tierKeys.proprietarios(toValue(params)),
    queryFn: () => api.listProprietarios({ ...toValue(params), pageSize: 200 }),
  });
}

export function useFazendas(
  params: MaybeRefOrGetter<{ search?: string; proprietarioDonoId?: string }> = () => ({}),
) {
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
  filters: MaybeRefOrGetter<{ proprietarioId?: string; fazendaId?: string; status?: string }> = () => ({}),
) {
  return useQuery({
    queryKey: tierKeys.tiers(toValue(filters)),
    queryFn: () => api.listTiers({ ...(toValue(filters) as never), pageSize: 200 }),
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
  return useQuery({ queryKey: tierKeys.abates(), queryFn: () => api.listAbates() });
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
```

- [ ] **Step 2: Gate.** Run: `cd apps/web && npm run typecheck`. Expected: PASS.
  Note: if `MaybeRefOrGetter`/`toValue` are not exported by the installed Vue version, they are available in Vue 3.5 (`vue` package) — do not add another dependency.
- [ ] **Step 3: Commit.** `git add apps/web/src/features/tier/queries.ts && git commit -m "feat(tier-web): query hooks"`

---

### Task 4: Mutation hooks (hybrid)

**Files:** Modify `apps/web/src/features/tier/queries.ts`

- [ ] **Step 1: Append mutation hooks.** Add `useMutation`, `useQueryClient` to the tanstack import. Pattern:
  - **create*** → invalidate the list key on success (no optimistic).
  - **update/delete/status/contrato/link-unlink/upload/removeDoc** → optimistic: `onMutate` cancels + snapshots + patches; `onError` restores; `onSettled` invalidates.

Write these hooks (one `useMutation` each). For `create*` use this shape (example — replicate for each create):

```ts
import { useMutation, useQueryClient } from "@tanstack/vue-query";

export function useCreateProprietario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createProprietario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tier", "proprietarios"] }),
  });
}
```

For optimistic list-item edits/deletes use this shape (example for delete proprietario — replicate for the others against their list key):

```ts
export function useDeleteProprietario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProprietario,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["tier", "proprietarios"] });
      const prev = qc.getQueriesData({ queryKey: ["tier", "proprietarios"] });
      qc.setQueriesData({ queryKey: ["tier", "proprietarios"] }, (old: any) =>
        old?.rows ? { ...old, rows: old.rows.filter((r: any) => r.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      ctx?.prev?.forEach(([key, data]: [unknown, unknown]) => qc.setQueryData(key as never, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tier", "proprietarios"] }),
  });
}
```

**Full hook list to create** (name → api fn → strategy → invalidate/patch target key):

| Hook | api fn | Strategy | Key |
|------|--------|----------|-----|
| useCreateProprietario | createProprietario | invalidate | `["tier","proprietarios"]` |
| useUpdateProprietario | updateProprietario(id,body) | optimistic patch row | `["tier","proprietarios"]` |
| useDeleteProprietario | deleteProprietario | optimistic remove row | `["tier","proprietarios"]` |
| useCreateFazenda / useUpdateFazenda / useDeleteFazenda | *Fazenda | invalidate / optimistic / optimistic | `["tier","fazendas"]` |
| useCreateCar / useDeleteCar | *Car | invalidate / optimistic | `["tier","cars"]` (+ invalidate `["tier","fazendas"]` for count) |
| useCreateFrigorifico / useUpdateFrigorifico / useDeleteFrigorifico | *Frigorifico | invalidate / optimistic / optimistic | `["tier","frigorificos"]` |
| useCreateGrupo / useDeleteGrupo | *GrupoFrigorifico | invalidate / optimistic | `["tier","grupos"]` |
| useCreateTier | createTier | invalidate | `["tier","tiers-list"]` |
| useUpdateTier / useSetTierStatus / useSetTierContrato | updateTier/setTierStatus/setTierContrato | optimistic on `tier(id)` detail + invalidate list | `["tier","tiers"]` + `["tier","tiers-list"]` |
| useDeleteTier | deleteTier | optimistic remove from list | `["tier","tiers-list"]` |
| useCreateLote / useUpdateLote / useDeleteLote | *Lote | invalidate / optimistic / optimistic | `["tier","lotes"]` |
| useAddLoteOrigem / useRemoveLoteOrigem / useAddLoteGta / useRemoveLoteGta | *LoteOrigem/*LoteGta | optimistic + invalidate | `["tier","lotes"]` |
| useUploadDocumento / useDeleteDocumento | uploadDocumento/deleteDocumento | invalidate (upload) / optimistic (delete) | `["tier","lotes"]` |
| useCreateGta / useUpdateGta / useDeleteGta | *Gta | invalidate / optimistic / optimistic | `["tier","gtas"]` |
| useCreateAbate / useDeleteAbate | *Abate | invalidate | `["tier","abates"]` + `["tier","tiers"]` |

For link/unlink and lote-child mutations that take multiple args, wrap args in an object in `mutationFn` (e.g. `({loteId, gtaId}) => api.addLoteGta(loteId, gtaId)`).

- [ ] **Step 2: Gate.** `cd apps/web && npm run typecheck && npm run lint`. Expected: PASS. Run `npx prettier --write "src/features/tier/queries.ts"` first.
- [ ] **Step 3: Commit.** `git add apps/web/src/features/tier/queries.ts && git commit -m "feat(tier-web): mutation hooks (hybrid optimistic)"`

---

### Task 5: Migrate ProprietariosView (reference migration)

**Files:** Modify `apps/web/src/views/tier/ProprietariosView.vue`

- [ ] **Step 1: Replace the data layer** in `<script setup>`: remove the manual `rows`/`loading`/`load()`/`onMounted(load)` and the direct `api` imports for list/create/update/delete; use the hooks. Keep the form/modal state and `search` ref. Concretely:
  - Import: `import { useProprietarios, useCreateProprietario, useUpdateProprietario, useDeleteProprietario } from "@/features/tier/queries";`
  - Replace list state with:
    ```ts
    const search = ref("");
    const query = useProprietarios(() => ({ search: search.value || undefined }));
    const rows = computed(() => query.data.value?.rows ?? []);
    const loading = computed(() => query.isPending.value);
    const createMut = useCreateProprietario();
    const updateMut = useUpdateProprietario();
    const deleteMut = useDeleteProprietario();
    ```
  - In `save()`: call `await (editingId.value ? updateMut.mutateAsync({ id: editingId.value, body: payload() }) : createMut.mutateAsync(payload()))`. Adjust `useUpdateProprietario` `mutationFn` to accept `{id, body}`.
  - In `remove(row)`: `await deleteMut.mutateAsync(row.id)`.
  - Delete the old `load()` and `onMounted`. The `@click="load"`/reload button → `@click="query.refetch()"`.
  - Toasts stay (call on `.then/.catch` or via mutation `onSuccess`/`onError` options passed at call site).
- [ ] **Step 2: Gate.** `cd apps/web && npm run typecheck && npm run lint && npm run build`. Expected: PASS.
- [ ] **Step 3: Commit.** `git add apps/web/src/views/tier/ProprietariosView.vue && git commit -m "feat(tier-web): migrate proprietarios to query hooks"`

---

### Task 6: Migrate the remaining views

Apply the **same transformation as Task 5** to each view, using its hooks. One commit per view.

- [ ] **FazendasView.vue** — `useFazendas(() => ({ search }))`, `useProprietarios` (owner select), `useCars(editingId)` for the CAR sub-panel, `useCreateFazenda/useUpdateFazenda/useDeleteFazenda/useCreateCar/useDeleteCar`. Commit `feat(tier-web): migrate fazendas to query hooks`.
- [ ] **FrigorificosView.vue** — `useFrigorificos`, `useGrupos`, create/update/delete frig + create/delete grupo. Commit `feat(tier-web): migrate frigorificos to query hooks`.
- [ ] **TierListView.vue** — `useTiers(() => ({ status }))`, `useProprietarios/useFazendas/useFrigorificos` for the create modal, `useCreateTier`. Commit `feat(tier-web): migrate tier list to query hooks`.
- [ ] **TierDetailView.vue** — `useTier(id)`, `useLotes(id)`, `useGtas`, `useFazendas`; mutations for status/contrato/lote/doc/gta/origem. Commit `feat(tier-web): migrate tier detail to query hooks`.
- [ ] **AbatesView.vue** — `useAbates`, `useAvailableTiers`, `useFrigorificos`, `useCreateAbate`. Commit `feat(tier-web): migrate abates to query hooks`.

Each: gate `npm run typecheck && npm run lint && npm run build` before commit. Do NOT change unrelated markup/logic — only swap the data layer.

---

## Self-review
- **Spec coverage:** setup+policy (Task 1) ✓; queries.ts key factory (Task 2) + query hooks (Task 3) + hybrid mutations (Task 4) ✓; view migration all 6 (Tasks 5–6) ✓; testing (queries.spec + gates) ✓. `api.ts` untouched ✓.
- **Placeholder scan:** mutation list is a concrete table (name→fn→strategy→key), not a placeholder; each create/optimistic shape has full reference code to replicate. No TBDs.
- **Type consistency:** `tierKeys` names used identically in hooks and invalidation. Invalidation uses the key prefix arrays matching the factory output (`["tier","proprietarios"]` etc.).
- **Note:** cannot run vue-query hooks locally without a running API; only `tierKeys` is unit-tested. Everything else gated by typecheck/lint/build + manual staging check — stated in Constraints.
