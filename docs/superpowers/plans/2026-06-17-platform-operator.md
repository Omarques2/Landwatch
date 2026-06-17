# PLATFORM member = Global Operator — Implementation Plan (2026-06-17)

Codex reviewed + validated against code. `isPlatformUser` already gates routes/features/tools, but **data-scoping still keys off `isPlatformAdmin`**, so a PLATFORM member is filtered to the active org instead of seeing global data. This plan makes a PLATFORM member a **global operator**: global READS, org-scoped WRITES, no `/admin`/structural management.

## Decisions (confirmed)
- PLATFORM member READS operational data of **all orgs** (intentional; Sigfarm staff = global operator).
- WRITES always go to the **active org**, which is **always set** and **limited to the user's memberships** (a member is not an admin → cannot activate a non-member org). In practice a pure operator writes to the PLATFORM org.
- **Schedules** are included in global read.
- `/admin` + org/user/feature management + structural attachments (categories/reviewers) stay **admin-only**.

## Core rule (the one Codex insists on)
Never treat `isPlatformUser` as `isPlatformAdmin` everywhere. Split intent:
```ts
// AccessService
canReadAllOperationalData(actor) = actor.isPlatformAdmin || actor.isPlatformUser  // global READ
requirePlatformUser(actor)       // operational tool/route access (exists)
requirePlatformAdmin(actor)      // structural admin: /admin, orgs, users, features, categories, reviewers
// WRITES stay org-scoped: created/edited resources use the active org; no broadening for isPlatformUser.
```

## Verified gaps (where to change)
- [analyses.service.ts:511](apps/api/src/analyses/analyses.service.ts#L511) — `where = isPlatformAdmin ? {} : { orgId }`
- [farms.service.ts:180,259,304,323](apps/api/src/farms/farms.service.ts#L180) — list/getById/byCar scoping
- [schedules.service.ts:112](apps/api/src/schedules/schedules.service.ts#L112) — list scoping
- [access.service.ts:66](apps/api/src/auth/access.service.ts#L66) — `requireSameOrgOrPlatform` used by BOTH read (`assertCanReadAnalysis/Farm`) and edit (`assertCanEditFarm`)

---

## Phase 1 — AccessService: read/write split

**File:** `apps/api/src/auth/access.service.ts`

- [ ] Add the helper:
```ts
// Global operational READ access (all orgs). NOT a write/admin grant.
canReadAllOperationalData(
  actor: Pick<ActorContext, 'isPlatformAdmin' | 'isPlatformUser'>,
): boolean {
  return actor.isPlatformAdmin || actor.isPlatformUser;
}
```
- [ ] `assertCanReadAnalysis`: allow global read for operators BEFORE the org check:
```ts
async assertCanReadAnalysis(actor, analysisId) {
  const analysis = await this.prisma.analysis.findUnique({ where: { id: analysisId }, select: { id: true, orgId: true } });
  if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analysis not found' });
  if (this.canReadAllOperationalData(actor)) return analysis; // operator/admin: global read
  this.requireSameOrgOrPlatform(actor, analysis.orgId);        // tenant: same-org only
  return analysis;
}
```
(The `actor` Pick type for `assertCanReadAnalysis` must include `isPlatformUser`.)
- [ ] `assertCanReadFarm`: after the `farm.orgId === null` early return, add `if (this.canReadAllOperationalData(actor)) return farm;` then keep `requireSameOrgOrPlatform`.
- [ ] `assertCanEditFarm`: **unchanged** (read via `assertCanReadFarm` is now global, but the edit check stays `isPlatformAdmin || farm.orgId === actor.orgId`). Result: operator can READ any farm, EDIT only active-org farms.
- [ ] `requireSameOrgOrPlatform`: **unchanged** (admin or same-org) — it remains the write/edit gate; do NOT add `isPlatformUser`.
- [ ] `farmScopedLookup`: for `canReadAllOperationalData(actor)`, search across all orgs (drop the org filter), else current org→public behavior.
- [ ] Tests (`access.service.spec.ts`): operator reads cross-org analysis/farm (allowed); operator edits cross-org farm (FARM_EDIT_FORBIDDEN); tenant reads other-org analysis (denied).

## Phase 2 — Global read in list services

- [ ] **Analyses** [analyses.service.ts:511]: the local actor input type (line ~49) add `isPlatformUser?: boolean`; change scope to:
```ts
const where: Prisma.AnalysisWhereInput =
  actor.isPlatformAdmin || actor.isPlatformUser ? {} : { orgId: actor.orgId };
```
- [ ] **Farms** [farms.service.ts:180,259]: replace `actor.isPlatformAdmin ?` with `(actor.isPlatformAdmin || actor.isPlatformUser) ?` for list + getById scope. byCar [304,323]: operator resolves across all orgs (global), not just active+public.
- [ ] **Schedules** [schedules.service.ts:112]: `...(actor && !(actor.isPlatformAdmin || actor.isPlatformUser) ? { orgId: actor.orgId } : {})`.
- [ ] Tests: operator list → no org filter (sees A1/B1/P1); tenant list → scoped to its org.

## Phase 3 — Writes stay org-scoped (verify, mostly no change)

- [ ] `FarmsService.createForActor` already requires `actor.orgId` (org-scoped) — operator's active org = PLATFORM → farm created there. No change.
- [ ] `AnalysesService.createScheduled` / on-demand create require org — unchanged.
- [ ] `SchedulesService.ensureFarmForActor` keeps `isPlatformAdmin`-only cross-org allowance → operator schedules only active-org farms. No change.
- [ ] Edit farm: `assertCanEditFarm` unchanged (Phase 1). 
- [ ] Tests: operator creating a farm/analysis → resource.orgId === active org (PLATFORM); operator cannot edit a tenant-org farm.

## Phase 4 — Structural admin stays admin-only (verify)

- [ ] Confirm `/admin`, users, orgs, features, attachment categories/reviewers all use `requirePlatformAdmin` (or `ensurePlatformAdminForAttachmentAdmin`). No change expected; add a test asserting an operator (isPlatformUser, !isPlatformAdmin) is rejected from: a user-management endpoint, an org-management endpoint, attachment category create, reviewer management.

## Phase 5 — Topbar org selector (frontend)

**File:** `apps/web/src/views/AppShellView.vue` (+ `org-context`, `me.ts`)

- [ ] If the user has **1 membership** → show the active org name as a label. If **2+** → a dropdown listing memberships; selecting calls `setActiveOrgId(id)`, clears the access cache (it's keyed by org), and refetches `/access/me` + current view data.
- [ ] No "Visão global"/null-org option (writes always need an org; reads are already global server-side for operators).
- [ ] `me.ts`: ensure the access cache key is the active org (`accessOrgKey()` already is) so switching orgs swaps features cleanly.
- [ ] Memberships need org names for the dropdown — confirm `/users/me` memberships include `org.name`/`slug`; if not, add to the backend `me` payload.
- [ ] Tests: switching org updates `X-Org-Id` on subsequent requests + the access cache resolves the new org; 1-membership users see a label (no dropdown).

## Phase 6 — Verification
- API: `npm run build` · `npm test -- --runInBand`. Web: `npm run typecheck` · `npm test -- --run` · `npm run build`.
- Manual: operator sees `/analyses` and `/farms` with multiple orgs' data; opens a tenant analysis detail (map/PDF/GeoJSON/anexos); cannot reach `/admin`; cannot manage users/orgs/features/categories/reviewers; a tenant user still sees only its org.

## Codex review — verdict
- **Correct + necessary**: the read/write split (global read via `canReadAllOperationalData`, writes scoped) and the explicit "don't equate isPlatformUser with isPlatformAdmin" rule. Implement.
- **Adjusted per product decision**: dropped Codex's "Visão global / null-org globalMode" — you ruled writes always use the active org and there's always an active org. So the operator's global read is unconditional (server-side), and the topbar selector only switches among memberships (no null mode). Simpler + avoids a null-org write path.
- **Active-org scope**: limited to memberships (operator is not admin → cannot activate a non-member org). Operator writes land in the PLATFORM org.

## Gates / no commit
No commits unless requested.
