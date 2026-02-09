# EPIC-10 Cache + MV Lock Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analysis result caching (TTL 2 months) and MV refresh detection with UI warnings/feature blocking to keep the app responsive during refresh.

**Architecture:** Backend exposes `/v1/landwatch/mv-status` (already) and enforces MV refresh checks for current-date analyses; analysis runner writes cache entries after completion; frontend fetches MV status after login and disables dependent actions with warning UI.

**Tech Stack:** NestJS + Prisma (apps/api), Vue 3 + Vite + Vitest (apps/web).

---

### Task 1: Failing tests for API refactor (detail service + cache + MV checks)

**Files:**
- Test: `apps/api/src/analyses/analysis-detail.service.spec.ts`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`
- Test: `apps/api/src/analyses/analysis-runner.service.spec.ts`

**Step 1: Run failing unit tests (RED)**

Run: `npm test -- analysis-detail.service.spec.ts` (from `apps/api`)
Expected: FAIL (`Cannot find module './analysis-detail.service'`)

Run: `npm test -- analyses.service.spec.ts`
Expected: FAIL (missing deps/behaviors)

Run: `npm test -- analysis-runner.service.spec.ts`
Expected: FAIL (missing deps/behaviors)

**Step 2: Implement AnalysisDetailService (minimal to satisfy specs)**

Create: `apps/api/src/analyses/analysis-detail.service.ts`

```ts
@Injectable()
export class AnalysisDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docInfo: DocInfoService,
    @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
  ) { /* ... */ }

  async getById(id: string) { /* move logic from AnalysesService.getById */ }
  async getMapById(id: string, tolerance?: number) { /* move logic from AnalysesService.getMapById */ }
  async listIndigenaPhases(asOf?: string) { /* move logic */ }

  // helper methods copied from AnalysesService unchanged:
  // getSchema, normalizeDate, isCurrentAnalysisDate, normalizeFeatureId,
  // queryRawWithRetry, extractErrorCode, fetchSicarMeta, fetchSicarCoordinates,
  // fetchBiomas, fetchDatasets, fetchDocMatches, fetchIndigenaPhases,
  // fetchIndigenaPhaseHits, fetchUcsCategories, fetchUcsCategoryHits,
  // fetchDistinctAttrValues, fetchAttrValuesForFeatures, buildDatasetGroups,
  // buildIndigenaItems, buildUcsItems, inferProdesBiome, isIndigenaDataset,
  // isUcsDataset, normalizeAttrKey, getPackValue, extractAttrValue.
}
```

**Step 3: Run tests to verify GREEN**

Run: `npm test -- analysis-detail.service.spec.ts`
Expected: PASS

**Step 4: Refactor AnalysesService to delegate**

Modify: `apps/api/src/analyses/analyses.service.ts`

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly runner: AnalysisRunnerService,
  private readonly detail: AnalysisDetailService,
  private readonly cache: AnalysisCacheService,
  private readonly docInfo: DocInfoService,
  private readonly landwatchStatus: LandwatchStatusService,
  @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
) { /* ... */ }

async create(...) {
  const analysisDate = this.normalizeDate(...)
  if (this.isCurrentAnalysisDate(analysisDate)) {
    await this.landwatchStatus.assertNotRefreshing();
  }
  // rest unchanged
  if (cpfCnpj?.length === 14) await this.docInfo.updateCnpjInfoBestEffort(cpfCnpj);
}

async getById(id: string) {
  const cached = await this.cache.get<{ detail?: any }>(id);
  if (cached?.detail) return cached.detail;
  return this.detail.getById(id);
}

async getMapById(id: string, tolerance?: number) {
  const safeTol = isFinite(tolerance) ? Math.min(Math.max(tolerance ?? 0.0001, 0), 0.01) : 0.0001;
  const cached = await this.cache.get<{ map?: { tolerance: number; rows: any[] } }>(id);
  if (cached?.map && Math.abs(cached.map.tolerance - safeTol) < 1e-9) return cached.map.rows;
  return this.detail.getMapById(id, safeTol);
}

async listIndigenaPhases(asOf?: string) {
  return this.detail.listIndigenaPhases(asOf);
}
```

**Step 5: Run tests to verify GREEN**

Run: `npm test -- analyses.service.spec.ts`
Expected: PASS

### Task 2: Update AnalysisRunnerService to respect MV refresh + cache write

**Files:**
- Modify: `apps/api/src/analyses/analysis-runner.service.ts`
- Test: `apps/api/src/analyses/analysis-runner.service.spec.ts`

**Step 1: Run failing tests (RED)**

Run: `npm test -- analysis-runner.service.spec.ts`
Expected: FAIL

**Step 2: Implement minimal code to pass**

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly landwatchStatus: LandwatchStatusService,
  private readonly detail: AnalysisDetailService,
  private readonly cache: AnalysisCacheService,
  @Optional() @Inject(NOW_PROVIDER) nowProvider?: () => Date,
) { /* ... */ }

if (isCurrentAnalysisDate(analysisDate)) {
  try { await this.landwatchStatus.assertNotRefreshing(); }
  catch { await this.prisma.analysis.update({ data: { status: 'pending' }, where: { id } }); return; }
}

// after completion
const detail = await this.detail.getById(id);
const map = await this.detail.getMapById(id, 0.0001);
await this.cache.set(id, { detail, map: { tolerance: 0.0001, rows: map } });
```

**Step 3: Run tests to verify GREEN**

Run: `npm test -- analysis-runner.service.spec.ts`
Expected: PASS

### Task 3: Wire modules

**Files:**
- Modify: `apps/api/src/analyses/analyses.module.ts`

**Step 1: Add providers/imports**

```ts
imports: [LandwatchStatusModule],
providers: [AnalysesService, AnalysisRunnerService, AnalysisDetailService, AnalysisCacheService, DocInfoService],
exports: [AnalysesService],
```

**Step 2: Smoke test unit tests**

Run: `npm test -- analysis-detail.service.spec.ts`
Expected: PASS

### Task 4: Frontend MV status state + UI warnings

**Files:**
- Create: `apps/web/src/state/landwatch-status.ts`
- Modify: `apps/web/src/views/AppShellView.vue`
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Modify: `apps/web/src/views/FarmDetailView.vue`
- Modify: `apps/web/src/components/maps/CarSelectMap.vue`
- Test: `apps/web/src/state/__tests__/landwatch-status.spec.ts`
- Test: `apps/web/src/views/__tests__/AppShellView.test.ts`

**Step 1: Failing tests (RED)**

Run: `npm run test -- landwatch-status.spec.ts`
Expected: FAIL (module missing)

**Step 2: Implement state**

```ts
export const mvBusy = ref(false);
export const mvStatus = ref<{ busy: boolean; views: any[] } | null>(null);
export async function fetchLandwatchStatus() { /* call /v1/landwatch/mv-status */ }
```

**Step 3: AppShell warning banner**

Add a topbar warning when `mvBusy` is true.

**Step 4: NewAnalysisView + FarmDetailView disables actions when mvBusy**

- Disable submit/search buttons
- Show warning text
- Skip map fetch when mvBusy

**Step 5: CarSelectMap disabled overlay**

Add `disabled` prop to block right-click search when mvBusy.

**Step 6: Run tests**

Run: `npm run test -- AppShellView.test.ts`
Expected: PASS

### Task 5: Update planning and status cards

**Files:**
- Modify: `planning.md`
- Modify: `docs/status-cards.md`

**Step 1: Mark EPIC-10 items done**

### Task 6: Security review

- Check `.gitignore` for sensitive files
- Scan for hardcoded secrets with `rg -n "(AKIA|BEGIN RSA PRIVATE KEY|postgres://|password=)"`
- Report findings

---

**Note:** The required sub-skill `superpowers:executing-plans` is not available in this environment; implementation will proceed in this session.
