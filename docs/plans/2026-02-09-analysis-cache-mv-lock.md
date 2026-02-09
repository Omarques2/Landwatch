# Analysis Cache + MV Lock Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analysis cache (TTL 2 months) and MV-lock detection with UI warnings/feature blocking.

**Architecture:** API exposes MV status and optional cached analysis payloads; web fetches MV status after login and disables affected UI. Cache is written at analysis generation time and used on detail load.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Vue 3, Vite, Leaflet.

---

### Task 1: Add DB schema for analysis cache

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_analysis_cache/`

**Step 1: Write the failing test**

```ts
// apps/api/test/analysis-cache.e2e-spec.ts
it('returns cached payload when available', async () => {
  // Arrange: insert Analysis + AnalysisCache
  // Act: GET /v1/analyses/:id
  // Assert: response uses cached payload
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- analysis-cache.e2e-spec.ts`
Expected: FAIL with 404 or missing cache.

**Step 3: Write minimal implementation**

```prisma
model AnalysisCache {
  analysisId String   @id @db.Uuid
  payload    Json
  cachedAt   DateTime @default(now())
  expiresAt  DateTime
  analysis   Analysis @relation(fields: [analysisId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
  @@map("analysis_cache")
  @@schema("app")
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- analysis-cache.e2e-spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api): add analysis cache table"
```

---

### Task 2: MV lock status endpoint

**Files:**
- Create: `apps/api/src/landwatch-status/landwatch-status.module.ts`
- Create: `apps/api/src/landwatch-status/landwatch-status.service.ts`
- Create: `apps/api/src/landwatch-status/landwatch-status.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/landwatch-status.e2e-spec.ts`

**Step 1: Write the failing test**

```ts
it('returns mv status list', async () => {
  const res = await request(app.getHttpServer()).get('/v1/landwatch/mv-status');
  expect(res.status).toBe(200);
  expect(res.body.data.views.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- landwatch-status.e2e-spec.ts`
Expected: FAIL 404.

**Step 3: Write minimal implementation**

```ts
// Query pg_locks/pg_stat_activity for matviews in schema landwatch
// Return { busy, views: [{name, locked, lockModes}] }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- landwatch-status.e2e-spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/landwatch-status apps/api/src/app.module.ts apps/api/test/landwatch-status.e2e-spec.ts
git commit -m "feat(api): expose landwatch MV status"
```

---

### Task 3: Cache read/write in analysis flow

**Files:**
- Modify: `apps/api/src/analyses/analysis-runner.service.ts`
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/analyses/analyses.controller.ts`
- Test: `apps/api/test/analysis-cache.e2e-spec.ts`

**Step 1: Write failing test**

```ts
it('uses cache when available and valid', async () => {
  // seed Analysis + AnalysisCache (expiresAt future)
  // GET /v1/analyses/:id returns cached payload
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- analysis-cache.e2e-spec.ts`
Expected: FAIL (response does not use cache).

**Step 3: Write minimal implementation**

```ts
// analyses.service.ts
// read cache by analysisId; if valid, return payload
// analysis-runner: on completion, write cache (expiresAt = now + 2 months)
```

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- analysis-cache.e2e-spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/analyses apps/api/test/analysis-cache.e2e-spec.ts
git commit -m "feat(api): cache analysis payloads"
```

---

### Task 4: UI MV warning + feature blocking

**Files:**
- Create: `apps/web/src/state/landwatch-status.ts`
- Modify: `apps/web/src/views/AppShellView.vue`
- Modify: `apps/web/src/components/topbar/Topbar.vue` (or equivalent)
- Modify: `apps/web/src/views/AnalysesSearchView.vue` (CAR lookup)
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Modify: `apps/web/src/views/FarmDetailView.vue`
- Test: `apps/web/src/__tests__/landwatch-status.spec.ts`

**Step 1: Write failing test**

```ts
it('shows warning when mv is busy', async () => {
  // mock api response busy=true
  // assert topbar warning visible
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- landwatch-status.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// state store (ref) with fetchStatus(); call after login
// show warning + disable buttons and show inline warning for affected features
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- landwatch-status.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/state apps/web/src/views apps/web/src/components apps/web/src/__tests__/landwatch-status.spec.ts
git commit -m "feat(web): warn on MV refresh and block affected actions"
```

---

### Task 5: Cleanup + documentation

**Files:**
- Modify: `planning.md`
- Modify: `docs/status-cards.md`
- Modify: `apps/Versionamento/USAGE.md` (if needed)

**Steps:**
1. Update planning/cards with completed items.
2. Add manual test steps to status-cards.
3. Run `npm run lint` and `npm run test:e2e` in `apps/api`.

**Commit:**
```bash
git add planning.md docs/status-cards.md
git commit -m "docs: update planning and MVP cards"
```
