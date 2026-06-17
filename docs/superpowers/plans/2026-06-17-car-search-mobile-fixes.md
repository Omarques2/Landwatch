# CAR Search Mobile Fixes — Correction Plan (2026-06-17)

Post-implementation manual testing (Codex + HAR) surfaced 3 real defects in the CAR-search mobile flow. All verified against code.

## Fix 1 — CAR tiles 403 (BLOCKER): `CarSelectMap` omits `X-Org-Id`

**Evidence:** `POST /v1/cars/map-searches` → 201 (Axios sends `X-Org-Id`). `GET /v1/cars/tiles/:id/*.mvt` → 38× 403 (no `X-Org-Id`). MapLibre loads tiles via `transformRequest`, not Axios, so the Axios org interceptor doesn't apply.

**Confirmed:** [CarSelectMap.vue:530](apps/web/src/components/maps/CarSelectMap.vue#L530) `buildAuthHeaders()` sends only `Authorization` + dev headers — no `X-Org-Id`. [AnalysisVectorMap.vue:262](apps/web/src/components/maps/AnalysisVectorMap.vue#L262) sends `X-Org-Id` via `normalizeOrgHeader(getActiveOrgId() || getDevBypassOrgId())`. Backend [cars.controller.ts:44](apps/api/src/cars/cars.controller.ts#L44) uses `orgMode: 'tenant'` → org required → 403 before serving MVT. Root cause = `CarSelectMap` diverged from the other maps.

**Fix (kill the divergence + make it testable; MapLibre `transformRequest` can't run in jsdom, so extract pure logic):**
1. New `apps/web/src/lib/org-header.ts` — exported `normalizeOrgHeader(orgId)` (UUID-validated; rejects `"null"`/`"undefined"`/non-UUID). Single source of truth.
2. New `apps/web/src/features/cars/tile-headers.ts` — exported `shouldAttachCarTileAuth(url)` + `buildCarTileHeaders({ accessToken, orgId, devBypass, devSub, devEmail })` (adds `Authorization`, `X-Org-Id` via `normalizeOrgHeader`, dev headers).
3. `CarSelectMap.vue` — import `getActiveOrgId`, `getDevBypassOrgId`, and the two helpers; replace local `shouldAttachAuthHeaders`/`buildAuthHeaders` to delegate, passing `getActiveOrgId() || getDevBypassOrgId()` as `orgId`.
4. `AnalysisVectorMap.vue` — replace its local `normalizeOrgHeader` with the shared `@/lib/org-header` import (behavior identical; removes the duplication that caused this bug).
5. Tests: `apps/web/src/lib/__tests__/org-header.spec.ts` (valid UUID passes; junk → null) + `apps/web/src/features/cars/__tests__/tile-headers.spec.ts` (`shouldAttachCarTileAuth` true for `/v1/cars/tiles/...mvt`, false otherwise; `buildCarTileHeaders` includes `X-Org-Id` when org valid, omits when null, includes `Authorization` with token, dev headers when bypass).

## Fix 2 — Mobile initial state: location-first, not empty map (also fixes a DEAD CTA)

**Confirmed bug, not just UX:** `CarSelectMap.initMap()` runs only when `hasRenderableSearch` ([CarSelectMap.vue:538](apps/web/src/components/maps/CarSelectMap.vue#L538), gated in `onMounted` + a watch). Before the first search `map === null` → `getMapCenter()` returns `null` → the sticky **"Buscar neste ponto"** CTA shows *"Mapa ainda não está pronto."* It cannot start a search. So map-first-from-empty is broken on first load.

**Fix — mobile `/analyses/search` opens in a `needsLocation` panel inside the map slot, swaps to the map after the first search:**
- Add `hasSearchResults` = `Boolean(activeSearch?.vectorSource) || fallbackCars.length > 0`.
- Add `showLocationEntry` = `isCoarsePointer && viewMode==='search' && !hasSearchResults`.
- Add `combinedCoord` ref + `onCombinedCoordInput(v)` → store raw + reuse existing `onSearchLatInput` (which already parses `"lat, lng"` via `parseCombinedCoordinates`).
- In the map slot: when `showLocationEntry`, render an entry panel — **"Usar minha localização"** (primary), a single **"Latitude, longitude"** field, **"Buscar CARs"** (calls existing `searchCars`); else render `CarSelectMap` (desktop always; mobile after results). `CarSelectMap` only mounts once there are results, so `initMap` runs and the crosshair + "Buscar neste ponto" work.
- Sticky CTA bar: gate with `v-if="hasSearchResults"` so "Buscar neste ponto" is never shown while the map is uninitialized.
- Post-search mobile header (Ajustar busca + coord summary) shows only when `hasSearchResults`. "Ajustar busca" sheet becomes fine-edit (lat/lng/radius/toggles) for after the first location.
- Hydrate `combinedCoord` from URL coords on mount and after GPS success.

## Fix 3 — GPS is primary, not buried in the sheet

GPS was only in the Ajustar-busca sheet ([NewAnalysisView.vue:325](apps/web/src/views/NewAnalysisView.vue#L325)). Folded into Fix 2: GPS is the primary button in the initial entry panel, plus an icon GPS button in the post-search header for re-locating.

## Out of scope (noted)
Tile requests are absolute (`localhost:3001`) + custom headers → CORS `OPTIONS` preflight noise. Not blocking; dev-only. Address later via same-origin tile proxy or relative URLs if perf matters.

## Gates
`npm run typecheck` · `npm test -- --run` · `npm run build` · `npm run lint` (expect only the 2 pre-existing unrelated errors). No commits (changes stay on `main`).
