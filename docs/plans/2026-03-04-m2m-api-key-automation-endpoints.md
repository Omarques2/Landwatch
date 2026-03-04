# M2M API Key Automation Endpoints Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a production-safe M2M API Key path for automation, keep JWT user auth for web endpoints, and separate user vs automation endpoints clearly.

**Architecture:** Keep existing user endpoints under `/v1/*` with JWT + ActiveUser checks unchanged. Add a dedicated automation namespace `/v1/automation/*` authenticated only by `x-api-key` + scope checks. Use explicit auth mode metadata in the global guard so automation routes cannot accidentally bypass auth and user routes cannot be accessed with API key only.

**Tech Stack:** NestJS guards/decorators/controllers, Prisma, Jest unit tests, Supertest e2e tests, existing `ApiKeyGuard` + scope metadata.

---

## Scope
- In scope:
  - Backend auth routing split (user vs automation).
  - Automation analyses endpoints with API key scopes.
  - Service-layer support for creating analyses via API key actor.
  - Test coverage for guard branching and route separation.
  - Docs update (auth matrix + M2M contract).
- Out of scope:
  - Frontend route changes (web keeps JWT flow as-is).
  - Notebook code changes in this backend-only task.
  - New OAuth refresh-token flow in backend.

## Route Contract (target)
- User endpoints (JWT): keep existing `/v1/analyses`, `/v1/farms`, `/v1/schedules`, `/v1/users/me`, etc.
- Automation endpoints (API Key):
  - `POST /v1/automation/analyses` (`analysis_write`)
  - `GET /v1/automation/analyses/:id` (`analysis_read`)
  - `GET /v1/automation/analyses/:id/map` (`analysis_read`)
- Optional validation endpoint (recommended):
  - `GET /v1/automation/auth/me` (`analysis_read`) returning `apiKeyId`, `clientId`, `orgId`, `scopes`.

---

### Task 1: Add explicit auth mode metadata and branch global auth

**Files:**
- Create: `apps/api/src/auth/auth-mode.decorator.ts`
- Modify: `apps/api/src/auth/global-auth.guard.ts`
- Test: `apps/api/src/auth/global-auth.guard.spec.ts`

**Step 1: Write the failing test**
- Add tests for `GlobalAuthGuard` behavior:
  - Public route -> skips all auth guards.
  - Default route -> runs `AuthGuard` then `ActiveUserGuard`.
  - Automation route metadata -> runs only `ApiKeyGuard`.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/global-auth.guard.spec.ts` (from `apps/api`)  
Expected: FAIL because metadata branch is not implemented.

**Step 3: Write minimal implementation**
- Add metadata key/decorator for auth mode (`user`, `automation`).
- Inject `Reflector` + `ApiKeyGuard` in `GlobalAuthGuard`.
- Branch logic:
  - `@Public()` -> `true`
  - `@AuthMode('automation')` -> `ApiKeyGuard.canActivate`
  - otherwise -> existing JWT + active-user chain.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/global-auth.guard.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/auth/auth-mode.decorator.ts src/auth/global-auth.guard.ts src/auth/global-auth.guard.spec.ts
git commit -m "feat(api): add auth mode metadata and global guard branching"
```

---

### Task 2: Add automation analyses controller namespace

**Files:**
- Create: `apps/api/src/analyses/automation-analyses.controller.ts`
- Modify: `apps/api/src/analyses/analyses.module.ts`
- Test: `apps/api/src/analyses/automation-analyses.controller.spec.ts`

**Step 1: Write the failing test**
- Test controller methods reject missing `req.apiKey`.
- Test controller methods call service methods with API key context when present.
- Test scope metadata exists on write/read methods.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/analyses/automation-analyses.controller.spec.ts`  
Expected: FAIL because controller does not exist.

**Step 3: Write minimal implementation**
- New controller path: `/v1/automation/analyses`.
- Decorate class with automation auth mode metadata.
- Add `@ApiKeyScopes`:
  - `analysis_write` for POST
  - `analysis_read` for GET detail/map
- Forward to service methods:
  - `createForApiKey(...)`
  - `getById(...)`
  - `getMapById(...)`

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/analyses/automation-analyses.controller.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/analyses/automation-analyses.controller.ts src/analyses/analyses.module.ts src/analyses/automation-analyses.controller.spec.ts
git commit -m "feat(api): add automation analyses routes with api key scopes"
```

---

### Task 3: Refactor analysis creation to support API key actor

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/auth/authed-request.type.ts`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`

**Step 1: Write the failing test**
- Add tests for `createForApiKey`:
  - creates analysis and enqueues runner.
  - resolves deterministic service user from API client context.
  - keeps existing `create(claims, dto)` behavior unchanged.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/analyses/analyses.service.spec.ts`  
Expected: FAIL because `createForApiKey` path does not exist.

**Step 3: Write minimal implementation**
- Add `createForApiKey(apiKeyContext, input)` in `AnalysesService`.
- Implement deterministic M2M actor resolution:
  - derive synthetic subject like `m2m:<clientId>`.
  - upsert/find `app_user` by `entraSub` to get `createdByUserId`.
- Reuse a shared internal create flow so user and automation stay consistent.
- Keep current user flow (`create(claims, ...)`) untouched in contract.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/analyses/analyses.service.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/analyses/analyses.service.ts src/auth/authed-request.type.ts src/analyses/analyses.service.spec.ts
git commit -m "feat(api): support m2m actor for analysis creation"
```

---

### Task 4: Add optional automation auth validation endpoint

**Files:**
- Create: `apps/api/src/auth/automation-auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/automation-auth.controller.spec.ts`

**Step 1: Write the failing test**
- `GET /v1/automation/auth/me` returns API key principal data when authenticated as automation.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/auth/automation-auth.controller.spec.ts`  
Expected: FAIL because endpoint does not exist.

**Step 3: Write minimal implementation**
- Add controller path `/v1/automation/auth`.
- Class uses automation auth mode metadata.
- `GET /me` returns request `apiKey` context.
- Require `analysis_read` scope.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/auth/automation-auth.controller.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/auth/automation-auth.controller.ts src/auth/auth.module.ts src/auth/automation-auth.controller.spec.ts
git commit -m "feat(api): add automation auth me endpoint"
```

---

### Task 5: Add route-separation regression e2e tests

**Files:**
- Create: `apps/api/test/automation-authz.e2e-spec.ts`
- Modify: `apps/api/test/run-e2e.js` (if needed to include file)

**Step 1: Write the failing test**
- Verify:
  - `/v1/automation/analyses/:id` is reachable with API-key auth path (no bearer JWT).
  - `/v1/analyses/:id` still requires bearer JWT and returns `401` without it.

**Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- automation-authz.e2e-spec.ts`  
Expected: FAIL before new routes/guard branch are fully wired.

**Step 3: Write minimal implementation for test setup**
- In e2e module, override `ApiKeyGuard` with test double that sets `req.apiKey`.
- Override `AnalysesService` with deterministic stubs.
- Keep `AuthGuard` behavior intact for user route assertion.

**Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- automation-authz.e2e-spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add test/automation-authz.e2e-spec.ts test/run-e2e.js
git commit -m "test(api): add e2e coverage for user vs automation route separation"
```

---

### Task 6: Update auth docs and endpoint contract docs

**Files:**
- Modify: `apps/api/docs/authz-matrix.md`
- Create: `apps/api/docs/automation-api-key-endpoints.md`
- Modify: `docs/project-overview.md`

**Step 1: Write doc checks**
- Ensure auth matrix explicitly distinguishes:
  - user routes -> JWT
  - automation routes -> API key + scopes.

**Step 2: Run checks**

Run: `npm run lint:check` (from `apps/api`)  
Expected: PASS (no formatting/lint errors from doc-linked code snippets).

**Step 3: Write minimal documentation**
- Add request examples (`x-api-key` header).
- Add migration guidance from old notebook JWT token path to new automation path.
- Add clear "web stays JWT" section.

**Step 4: Verify docs are consistent**
- Cross-check route list against actual controllers and tests.

**Step 5: Commit**

```bash
git add docs/authz-matrix.md docs/automation-api-key-endpoints.md ../../docs/project-overview.md
git commit -m "docs(api): document jwt user routes and api key automation routes"
```

---

### Task 7: Final verification and security review pass

**Files:**
- Verify only; no new files required unless fixes are needed.

**Step 1: Run targeted unit tests**

Run:
- `npm run test -- src/auth/global-auth.guard.spec.ts`
- `npm run test -- src/analyses/automation-analyses.controller.spec.ts`
- `npm run test -- src/analyses/analyses.service.spec.ts`
- `npm run test -- src/auth/automation-auth.controller.spec.ts`

Expected: PASS.

**Step 2: Run e2e regression**

Run: `npm run test:e2e -- automation-authz.e2e-spec.ts`  
Expected: PASS.

**Step 3: Security review checklist**
- Confirm no automation route is accidentally `@Public` without auth mode/API key guard.
- Confirm user routes cannot be accessed with only `x-api-key`.
- Confirm scope checks are enforced on automation routes.
- Confirm no raw API key is logged or persisted (hash only; existing behavior retained).

**Step 4: Smoke test route behavior manually**

Run examples:
- `curl -i -H "x-api-key: <valid>" http://localhost:3001/v1/automation/auth/me`
- `curl -i http://localhost:3001/v1/analyses`

Expected:
- first -> `200` (valid key) or `401/403` (invalid key).
- second -> `401` without bearer token.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(api): finalize m2m api key automation path with route separation"
```

---

## Rollout Strategy
1. Deploy backend with new automation routes while keeping existing JWT routes unchanged.
2. Generate dedicated API key for notebook automation (`analysis_write`, `analysis_read`).
3. Switch notebook/pipeline to automation endpoints + `x-api-key`.
4. Monitor `api_key.last_used_at`, error rate, and analysis creation success for 48h.
5. Deprecate legacy notebook JWT-based path only after stable run window.

## Rollback Strategy
1. Keep web using existing JWT endpoints (no rollback needed there).
2. If automation route fails, pipeline can temporarily return to old JWT token path.
3. Revert only automation controller/guard-branch commit if needed.

## Risks and Mitigations
- Risk: accidental public exposure of automation routes.
  - Mitigation: metadata-driven global guard + dedicated tests for auth branching.
- Risk: ambiguity on actor ownership (`createdByUserId`) for M2M.
  - Mitigation: deterministic synthetic M2M user resolution per API client.
- Risk: scope mismatch in issued keys.
  - Mitigation: strict `@ApiKeyScopes` and documented required scopes.
