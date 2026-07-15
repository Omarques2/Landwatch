# Tier Frontend — Cache + Optimistic UI (Sub-project A) — Design

**Status:** approved (design), pending spec review
**Part of:** Tier module enhancements. Decomposed into A (this) → B (Documento/Lote UX) → C (Crédito tab) → D (Cobranças/Pagamentos). Each has its own spec + plan.

## Problem

The Tier web tabs use ad-hoc data loading (`ref` + `onMounted` + a manual `load()` per view, plain axios `http`). Symptoms:
- Annoying loading spinners on every navigation (no cache; each visit refetches from scratch).
- Newly created/edited records sometimes only appear after a manual page refresh (no cache invalidation after mutations).
- Every page movement hits the server (no reuse), more server dependency than necessary.

## Goal

Introduce a caching data layer for the Tier module so that: navigation between tabs is instant when data is cached, data refreshes in the background (stale-while-revalidate), and mutations reflect in the UI immediately (optimistic) or right after the round-trip (invalidate+refetch) — never requiring a manual reload.

## Approach

Adopt **`@tanstack/vue-query`** (TanStack Query for Vue), scoped to the Tier module. It provides keyed cache, background refetch, optimistic mutations with rollback, and query invalidation out of the box — a direct match for the goal. `api.ts` remains the transport layer; a new `queries.ts` wraps it in hooks. Rejected alternatives: hand-rolled composable cache (reimplements a query lib, error-prone invalidation) and Pinia store (more boilerplate, same result).

Mutation strategy is **hybrid**:
- `create*` → `onSuccess: invalidateQueries(listKey)` (no temporary-id reconciliation).
- `update* / setStatus / setContrato / delete* / link-unlink / upload / removeDoc` → **optimistic**: `onMutate` cancels in-flight queries, snapshots cache, patches it; `onError` rolls back; `onSettled` invalidates.

## Components

### 1. Query client setup
- Add dependency `@tanstack/vue-query` to `apps/web`.
- Register `VueQueryPlugin` in `apps/web/src/main.ts` with a `QueryClient` whose defaults are:
  - `staleTime: 30_000` (30s fresh before background refetch)
  - `gcTime: 300_000` (5min cache retention)
  - `refetchOnWindowFocus: true`
  - `retry: 1`

### 2. `apps/web/src/features/tier/queries.ts` (new)
- **Key factory** `tierKeys` — stable, hierarchical keys:
  - `tierKeys.proprietarios(params)`, `.proprietario(id)`, `.credito(id)`
  - `tierKeys.fazendas(params)`, `.cars(fazendaId)`
  - `tierKeys.frigorificos(params)`, `.grupos(params)`
  - `tierKeys.tiers(filters)`, `.tier(id)`
  - `tierKeys.lotes(tierId)`, `.gtas(search)`, `.abates()`
- **Query hooks** wrapping existing `api.ts` fns: `useProprietarios`, `useFazendas`, `useCars`, `useFrigorificos`, `useGrupos`, `useTiers`, `useTier`, `useLotes`, `useGtas`, `useAbates`, `useAvailableTiers` (approved + saldo>0, composed), `useCredito`.
- **Mutation hooks** following the hybrid strategy above, each invalidating the relevant list/detail keys on settle.

### 3. View migration
Migrate the existing Tier views to consume the hooks instead of manual `ref`/`onMounted`/`load`:
- `TierListView.vue`, `TierDetailView.vue`, `ProprietariosView.vue`, `FazendasView.vue`, `FrigorificosView.vue`, `AbatesView.vue`.
- Loading state comes from `isPending`/`isFetching`; spinners only show on cold load, not on cached revalidation.
- `api.ts` is unchanged (transport). `queries.ts` is the new layer on top.

## Data flow

View → query hook (reads cache, serves instantly if fresh; refetches in background if stale) → `api.ts` → `http` → API envelope → unwrap. Mutations: view → mutation hook (optimistic patch or invalidate) → `api.ts` → on settle, invalidate affected keys → dependent queries refetch in background.

## Error handling
- Optimistic mutations roll back the cache patch on error and surface a toast (existing `useToast`).
- Query errors surface via the hook's `isError`/`error`; views show the existing error toast/empty state.

## Testing
- Gate: `npm run lint && npm run typecheck && npm run build` in `apps/web`.
- Light unit test (vitest) on the `tierKeys` factory only (pure function). Query/mutation hooks require a QueryClient test harness and are validated manually on staging (no local DB / integration env).

## Out of scope (this sub-project)
- No backend changes.
- No new screens (Crédito = sub-project C; Cobranças = D).
- No document/GTA/origem UX changes (sub-project B).
- Cache is in-memory per session (not persisted to localStorage).
