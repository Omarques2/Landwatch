# EPIC-09 + EPIC-10 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Dashboard + Farm Detail UI with skeleton loading, add basic rate limiting + structured job logs, and add minimal auth/farm/analysis tests.

**Architecture:** Add a small dashboard feature module in API for aggregated counts and recent analyses, extend analyses listing to accept farmId filter, and build UI views that consume these endpoints with explicit loading states. Use a shared skeleton component to prevent empty placeholders before API response.

**Tech Stack:** NestJS + Prisma, Vue 3 + Vite + Vitest, Tailwind.

---

### Task 1: Add Dashboard API (counts + recent analyses)

**Files:**
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`

**Step 1: Write the failing test**

```ts
// apps/api/src/dashboard/dashboard.service.spec.ts
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('returns counts and recent analyses', async () => {
    const prisma = {
      farm: { count: jest.fn().mockResolvedValue(2) },
      analysis: {
        count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', carKey: 'CAR-1', analysisDate: new Date('2026-02-08'), status: 'completed', farm: { name: 'Farm 1' } },
        ]),
      },
    } as any;

    const service = new DashboardService(prisma);
    const result = await service.getSummary();

    expect(result).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({ farms: 2, analyses: 5, pendingAnalyses: 2 }),
        recentAnalyses: expect.arrayContaining([
          expect.objectContaining({ id: 'a1', carKey: 'CAR-1' }),
        ]),
      }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/dashboard/dashboard.service.spec.ts`
Expected: FAIL (module not found / DashboardService missing)

**Step 3: Write minimal implementation**

```ts
// apps/api/src/dashboard/dashboard.service.ts
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [farms, analyses, pendingAnalyses, recentAnalyses] = await this.prisma.$transaction([
      this.prisma.farm.count(),
      this.prisma.analysis.count(),
      this.prisma.analysis.count({ where: { status: 'pending' } }),
      this.prisma.analysis.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { farm: { select: { name: true } } },
      }),
    ]);

    return {
      counts: { farms, analyses, pendingAnalyses },
      recentAnalyses: recentAnalyses.map((row) => ({
        ...row,
        farmName: row.farm?.name ?? null,
      })),
    };
  }
}
```

```ts
// apps/api/src/dashboard/dashboard.controller.ts
@Controller('v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  getSummary() {
    return this.dashboard.getSummary();
  }
}
```

```ts
// apps/api/src/dashboard/dashboard.module.ts
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

```ts
// apps/api/src/app.module.ts
imports: [DashboardModule, ...]
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/dashboard/dashboard.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/dashboard apps/api/src/app.module.ts

git commit -m "feat(api): add dashboard summary endpoint"
```

---

### Task 2: Add farmId filter to analyses list

**Files:**
- Modify: `apps/api/src/analyses/dto/list-analyses.query.ts`
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/analyses/analyses.controller.ts`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('filters analyses by farmId when provided', async () => {
  const prisma = makePrismaMock();
  prisma.analysis.count.mockResolvedValueOnce(1);
  prisma.analysis.findMany.mockResolvedValueOnce([]);
  const runner = { enqueue: jest.fn() };
  const service = new AnalysesService(prisma as any, runner as any, () => now);

  await service.list({ page: 1, pageSize: 10, farmId: 'farm-1' });

  expect(prisma.analysis.count).toHaveBeenCalledWith({ where: { farmId: 'farm-1' } });
  expect(prisma.analysis.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { farmId: 'farm-1' } }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/analyses/analyses.service.spec.ts`
Expected: FAIL (farmId unsupported)

**Step 3: Write minimal implementation**

```ts
// list-analyses.query.ts
@IsOptional()
@IsUUID()
farmId?: string;
```

```ts
// analyses.controller.ts
async list(@Query() query: ListAnalysesQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return this.analyses.list({ carKey: query.carKey, farmId: query.farmId, page, pageSize });
}
```

```ts
// analyses.service.ts
async list(params: { carKey?: string; farmId?: string; page: number; pageSize: number }) {
  const where = {
    ...(params.carKey ? { carKey: params.carKey } : {}),
    ...(params.farmId ? { farmId: params.farmId } : {}),
  };
  ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/analyses/analyses.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/analyses

git commit -m "feat(api): add farm filter to analyses list"
```

---

### Task 3: Basic rate limiting for /v1 (analyses/farms)

**Files:**
- Modify: `apps/api/src/config/config.schema.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/config/config.schema.spec.ts`

**Step 1: Write the failing test**

```ts
// config.schema.spec.ts
it('accepts rate limit API env defaults', () => {
  const parsed = validateEnv({
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',
    ENTRA_API_AUDIENCE: 'api://test',
    API_KEY_PEPPER: 'pepper',
  });
  expect(parsed.RATE_LIMIT_API_WINDOW_MS).toBeDefined();
  expect(parsed.RATE_LIMIT_API_MAX).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/config/config.schema.spec.ts`
Expected: FAIL (env keys missing)

**Step 3: Write minimal implementation**

```ts
// config.schema.ts
RATE_LIMIT_API_WINDOW_MS: numberSchema.default(60_000),
RATE_LIMIT_API_MAX: numberSchema.default(120),
```

```ts
// main.ts
const apiLimiter = rateLimit({
  windowMs: parseNumber(process.env.RATE_LIMIT_API_WINDOW_MS, 60_000),
  max: parseNumber(process.env.RATE_LIMIT_API_MAX, 120),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const correlationId = getCorrelationId(req);
    res.status(429).json({
      error: { code: 'RATE_LIMIT', message: 'Too many requests' },
      correlationId,
    });
  },
});
app.use('/v1/analyses', apiLimiter);
app.use('/v1/farms', apiLimiter);
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/config/config.schema.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/config/config.schema.ts apps/api/src/main.ts

git commit -m "feat(api): add basic rate limiting for v1"
```

---

### Task 4: Structured logs for analysis jobs

**Files:**
- Modify: `apps/api/src/analyses/analysis-runner.service.ts`
- Test: `apps/api/src/analyses/analysis-runner.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('logs structured payload on job failure', async () => {
  const prisma = { analysis: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(), findUnique: jest.fn() }, $queryRaw: jest.fn() } as any;
  const logger = { warn: jest.fn(), log: jest.fn() } as any;
  const service = new AnalysisRunnerService(prisma as any, () => new Date());
  (service as any).logger = logger;
  prisma.analysis.findUnique.mockResolvedValue({ id: 'a1', carKey: 'CAR', analysisDate: new Date() });
  prisma.$queryRaw.mockRejectedValue(new Error('boom'));

  await service.processAnalysis('a1');

  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"jobId":"a1"'));
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/analyses/analysis-runner.service.spec.ts`
Expected: FAIL (log not structured)

**Step 3: Write minimal implementation**

```ts
// analysis-runner.service.ts
private logJob(level: 'log' | 'warn', payload: Record<string, unknown>) {
  this.logger[level](JSON.stringify(payload));
}

// inside processAnalysis
this.logJob('log', { event: 'analysis.start', jobId: analysisId });
...
this.logJob('log', { event: 'analysis.completed', jobId: analysisId, intersectionCount });
...
catch (error) {
  this.logJob('warn', { event: 'analysis.failed', jobId: analysisId, message });
  ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/analyses/analysis-runner.service.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/analyses/analysis-runner.service.ts apps/api/src/analyses/analysis-runner.service.spec.ts

git commit -m "feat(api): log analysis jobs with structured payloads"
```

---

### Task 5: UI Dashboard view + skeletons

**Files:**
- Create: `apps/web/src/views/DashboardView.vue`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/views/AppShellView.vue`
- Modify: `apps/web/src/components/SidebarNav.vue`
- Test: `apps/web/src/views/__tests__/DashboardView.spec.ts`

**Step 1: Write the failing test**

```ts
import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import DashboardView from '../DashboardView.vue';

vi.mock('@/api/http', () => ({
  http: { get: vi.fn() },
}));

it('shows skeletons while loading', async () => {
  const wrapper = mount(DashboardView);
  expect(wrapper.find('[data-testid="dashboard-skeleton"]').exists()).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/web/src/views/__tests__/DashboardView.spec.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```vue
<!-- DashboardView.vue -->
<template>
  <div class="...">
    <div v-if="loading" data-testid="dashboard-skeleton">...</div>
    <div v-else>...</div>
  </div>
</template>
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/web/src/views/__tests__/DashboardView.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/views/DashboardView.vue apps/web/src/router/index.ts apps/web/src/views/AppShellView.vue apps/web/src/components/SidebarNav.vue apps/web/src/views/__tests__/DashboardView.spec.ts

git commit -m "feat(web): add dashboard with loading skeletons"
```

---

### Task 6: Farm Detail view + skeletons

**Files:**
- Create: `apps/web/src/views/FarmDetailView.vue`
- Modify: `apps/web/src/views/FarmsView.vue`
- Modify: `apps/web/src/router/index.ts`
- Test: `apps/web/src/views/__tests__/FarmDetailView.spec.ts`

**Step 1: Write the failing test**

```ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import FarmDetailView from '../FarmDetailView.vue';

it('shows skeleton while loading farm detail', () => {
  const wrapper = mount(FarmDetailView, { props: { id: 'farm-1' } });
  expect(wrapper.find('[data-testid="farm-detail-skeleton"]').exists()).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/web/src/views/__tests__/FarmDetailView.spec.ts`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```vue
<!-- FarmDetailView.vue -->
<template>
  <div v-if="loading" data-testid="farm-detail-skeleton">...</div>
  <div v-else>...</div>
</template>
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/web/src/views/__tests__/FarmDetailView.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/views/FarmDetailView.vue apps/web/src/views/FarmsView.vue apps/web/src/router/index.ts apps/web/src/views/__tests__/FarmDetailView.spec.ts

git commit -m "feat(web): add farm detail view with skeletons"
```

---

### Task 7: Add skeletons to dynamic lists (farms/analyses/new-analysis/me)

**Files:**
- Modify: `apps/web/src/views/FarmsView.vue`
- Modify: `apps/web/src/views/AnalysesView.vue`
- Modify: `apps/web/src/views/NewAnalysisView.vue`
- Modify: `apps/web/src/views/AppShellView.vue`
- Modify: `apps/web/src/components/SidebarNav.vue`
- Test: `apps/web/src/views/__tests__/FarmsView.spec.ts`
- Test: `apps/web/src/views/__tests__/AnalysesView.spec.ts`

**Step 1: Write the failing tests**

```ts
// FarmsView.spec.ts
it('does not show empty state while loading', () => {
  const wrapper = mount(FarmsView);
  expect(wrapper.find('[data-testid="farms-empty"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="farms-skeleton"]').exists()).toBe(true);
});
```

```ts
// AnalysesView.spec.ts
it('renders skeletons while analyses are loading', () => {
  const wrapper = mount(AnalysesView);
  expect(wrapper.find('[data-testid="analyses-skeleton"]').exists()).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- apps/web/src/views/__tests__/FarmsView.spec.ts apps/web/src/views/__tests__/AnalysesView.spec.ts`
Expected: FAIL (skeletons missing)

**Step 3: Write minimal implementation**

Add `loading` refs + `UiSkeleton` blocks with `data-testid` and only show empty state when `!loading`.

**Step 4: Run tests to verify they pass**

Run: `npm run test -- apps/web/src/views/__tests__/FarmsView.spec.ts apps/web/src/views/__tests__/AnalysesView.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/src/views/FarmsView.vue apps/web/src/views/AnalysesView.vue apps/web/src/views/NewAnalysisView.vue apps/web/src/views/AppShellView.vue apps/web/src/components/SidebarNav.vue apps/web/src/views/__tests__/FarmsView.spec.ts apps/web/src/views/__tests__/AnalysesView.spec.ts

git commit -m "feat(web): add loading skeletons for dynamic data"
```

---

### Task 8: Docs updates (EPIC-09/EPIC-10)

**Files:**
- Modify: `docs/status-cards.md`
- Modify: `planning.md`
- Create: `docs/deploy-checklist.md`

**Step 1: Update cards + planning**
- Add skeleton requirement to EPIC-09 card.
- Mark EPIC-09 + EPIC-10 items done.
- Add deploy checklist reference.

**Step 2: Add checklist**

```md
# Deploy Checklist (Staging -> Prod)
1. prisma migrate deploy
2. npm run test:e2e
3. npm run build (api/web)
4. smoke /health /ready
5. verify logs + rate limit
```

**Step 3: Commit**

```bash
git add docs/status-cards.md planning.md docs/deploy-checklist.md

git commit -m "docs: update MVP cards and deploy checklist"
```

---

### Task 9: Final verification

**Run:**
- `npm run test` (web)
- `npm run test:e2e` (api)
- `npm run build` (web)

Expected: all green.

---

Plan complete and saved to `docs/plans/2026-02-08-epic-09-10-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration

2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
