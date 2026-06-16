# Org Access Security Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir riscos reais do RBAC multi-tenant, mantendo as decisoes de produto: anexos somente para PLATFORM admin e schedules somente para farms com org.

**Architecture:** Centralizar a definicao de platform admin no `ActorContextService`, fazer migrations falharem de forma segura quando dados legados nao puderem ser classificados, e fechar APIs internas que hoje permitem chamadas sem escopo de org. Admin features ficam opt-in no banco e validadas por DTO real.

**Tech Stack:** NestJS, Prisma, PostgreSQL migrations, Jest, TypeScript, class-validator.

---

## File Structure

- Modify: `apps/api/prisma/migrations/20260611130000_org_safe_access/migration.sql` - cria org PLATFORM idempotente, corrige default de feature access, desabilita API clients legados sem org em vez de ativar PLATFORM silenciosamente.
- Modify: `apps/api/prisma/migrations/20260611160000_legacy_farms_to_platform_org/migration.sql` - troca `NOTICE/RETURN` por `RAISE EXCEPTION`.
- Modify: `apps/api/prisma/schema.prisma` - `OrgFeatureAccess.enabled` default false.
- Create: `apps/api/src/admin/dto/update-org-features.dto.ts` - DTO validado para patch de features.
- Modify: `apps/api/src/admin/admin.controller.ts` - usa DTO.
- Modify: `apps/api/src/admin/admin.service.ts` - valida org antes do upsert, remove `@Optional()` em dependencias de auth, mantem `createOrg` SEM seed de features (org nova nasce vazia, opt-in puro — ver Task 6).
- Modify: `apps/api/src/admin/admin.service.spec.ts` - cobre DTO/service org not found/features.
- Modify: `apps/api/src/auth/actor-context.service.ts` - expor regra unica de platform admin para reuso.
- Modify: `apps/api/src/auth/actor-context.service.spec.ts` - cobre env allowlist e membership PLATFORM.
- Modify: `apps/api/src/attachments/attachments.service.ts` - remover regra env-only propria.
- Modify: `apps/api/src/attachments/attachments.controller.ts` - remover `as any`; usar ator oficial ou tipo compativel.
- Modify: `apps/api/src/attachments/attachments.service.spec.ts` and `apps/api/src/attachments/attachments.controller.spec.ts` - cobre PLATFORM membership em anexos e tenant negado.
- Modify: `apps/api/src/analyses/analyses.service.ts` - remover overload sem actor e decidir criacao platform sem org.
- Modify: `apps/api/src/analyses/analyses.service.spec.ts` - atualizar chamadas de list e criacao platform.
- Modify: `apps/api/src/farms/farms.service.ts` - remover overload sem actor e sentinel `__none__`.
- Modify: `apps/api/src/farms/farms.service.spec.ts` / `apps/api/src/farms/farms.controller.spec.ts` - atualizar scoping.
- Modify: `apps/api/docs/authz-matrix.md` - documentar decisoes finais.

## Policy Decisions Locked

- Anexos: somente `isPlatformAdmin === true`; tenants nao acessam `/v1/attachments/*`.
- Schedules: criar/usar schedule apenas quando `farm.orgId` existe; farms publicas/null nao podem ter schedule.
- Platform admin oficial: `PLATFORM_ADMIN_SUBS` ou usuario ativo owner/admin de org ativa `kind=PLATFORM`.
- API clients legados sem org: nao ativar como PLATFORM automaticamente. Devem ficar desabilitados ate classificacao manual.

---

## Plan Review Corrections — 2026-06-16 (revisao Claude)

> Estas correcoes resolvem os bloqueadores encontrados na revisao do plano. Leia antes de executar qualquer task. As tasks afetadas tambem trazem um bloco `> CORRECTION` inline.

**Bloqueadores (devem ser resolvidos antes de iniciar a execucao):**

1. **Lockout de platform admin de env/dev-bypass (NOVA Task 0).** `ActorContextService.fromSubject` chama `resolveUser` *antes* de avaliar `PLATFORM_ADMIN_SUBS`/dev-bypass (verificado em `actor-context.service.ts:122`). Como as Tasks 3 e 10 passam a delegar a deteccao de admin para `fromSubject`, qualquer admin de env (ou o dev-bypass `00000000-0000-4000-8000-000000000001`, que **nao tem seed** em nenhuma migration) sem row `user` ativa passa a tomar 403. Precisa ser corrigido primeiro (Task 0), senao a unificacao do platform admin troca uma inconsistencia por um lockout.
2. **`requirePlatformAdmin` nao compila com o ator de attachments (Task 3).** O `ActorContext` local de attachments tem 4 campos (`{ userId, orgId, isPlatformAdmin, subject }`, `attachments.service.ts:55`); o do auth tem 9. Passar o de 4 onde se espera o de 9 nao tipa — e exatamente por isso existe o `as any`. A correcao minima e estreitar o parametro de `requirePlatformAdmin`, nao unificar os tipos (Task 3 corrigida).
3. **Inconsistencia interna de aridade do construtor de `AdminService` (Tasks 6 e 10).** Task 6 Step 3 instancia `new AdminService(prisma as any)` (1 arg) enquanto Task 10 torna os 3 parametros obrigatorios → o teste da Task 6 nao compila. Alem disso o spec atual tem ~10 instanciacoes de 1 arg (linhas 42, 51, 63, 79, 95, …) que dependem do fast-path do env allowlist e quebram com a Task 10.
4. **PLATFORM org nao pode receber tenant features.** A Task 2 insere a org PLATFORM antes do seed de `org_feature_access` em `20260611130000`. Se o seed continuar `FROM app.org o` sem filtro, a org PLATFORM recebe `FARMS/ANALYSES/ANALYSIS_CREATE/CAR_SEARCH/SCHEDULES`. Como `ActorContextService.fromSubject` hoje permite qualquer membership na org solicitada (role `member` inclusive), um membro nao-admin da org PLATFORM poderia acessar dados legados backfillados para a org PLATFORM via rotas tenant. Corrigir em duas camadas: seed apenas `o.kind = 'TENANT'` e negar `org.kind = 'PLATFORM'` para quem nao e platform admin.
5. **Attachments ainda faz lookup de user antes da regra central.** Mesmo com a Task 0, `AttachmentsService.resolveActor` hoje faz `prisma.user.findFirst` antes de calcular `isPlatformAdmin`. Se admin de env nao tiver row `user`, continua 403 antes de chamar `ActorContextService`. Task 3 deve delegar a resolucao inicial para `ActorContextService.fromSubject` antes de qualquer lookup local, ou remover o lookup local.
6. **Task 8 exige org para API key PLATFORM, mas nao define como resolver org alvo.** `ApiKeyGuard` exige `kind=PLATFORM` com `orgId=null`, e `AutomationAnalysesController.actor()` chama `fromApiKey(req.apiKey)` sem header de org. Sem uma mudanca explicita, toda key PLATFORM com `analysis_write` passa a falhar sempre. Implementar `X-Org-Id` como org alvo obrigatoria para create com key PLATFORM, validada por `ActorContextService.fromApiKey(apiKey, { orgId })`.
7. **Criacao de analise por platform admin precisa respeitar a org alvo.** Hoje `AnalysesService.createWithActor` pula a checagem de org da farm quando `actor.isPlatformAdmin === true`. Depois da Task 8, isso permitiria `X-Org-Id=org-A` criar uma analise ligada a `farmId` de `org-B`, gravando `analysis.orgId=org-A` com `farmId` cruzado. Task 8 deve adicionar checagem de consistencia `farm.orgId === actor.orgId` tambem para platform admin quando a operacao for create org-scoped.
8. **Construtor de `AttachmentsService` quebra specs em massa.** A Task 3 injeta `ActorContextService`, mas o spec atual instancia `new AttachmentsService(prisma as any)` dezenas de vezes. Sem helper central, a correcao vira erro de compilacao amplo. Task 3 deve atualizar todas as ocorrencias com mock padrao de `actorContext`.

**Regra unica de migrations (cross-cutting):** as migrations `20260611130000`, `20260611150000` e `20260611160000` estao **untracked / nunca lancadas** (verificado via `git status`). Portanto **edite-as in-place** em todas as tasks e rode `prisma migrate reset` no DB de dev local apos editar. Ignore a alternativa "forward migration" da Task 4 Step 3 (ver correcao na Task 4).

### Task 0: Corrigir ordem env/dev-bypass em `fromSubject` (PRE-REQUISITO de Tasks 3 e 10)

**Files:**
- Modify: `apps/api/src/auth/actor-context.service.ts`
- Test: `apps/api/src/auth/actor-context.service.spec.ts`

- [ ] **Step 1: Confirmar a ordem atual**

```bash
rg -n "resolveUser\(subject\)|platformAdminSubjects\(\)\.has|isDevBypassAdmin" apps/api/src/auth/actor-context.service.ts
```

Esperado: `const user = await this.resolveUser(subject);` aparece ANTES do calculo de `platformByEnv`.

- [ ] **Step 2: Avaliar env/dev-bypass antes de exigir row de user, e auto-provisionar admin de env**

Em `fromSubject`, calcule `platformByEnv` primeiro e, quando o subject for admin de env/dev-bypass mas nao tiver row `user`, faca upsert de um user ativo (mesmo padrao ja usado por `fromApiKey` para usuarios M2M). Isso mantem o invariante `ActorContext.userId` sempre preenchido sem trancar admins de env. **Nao grave `identityUserId` com string nao-UUID**: `User.identityUserId` e `@db.Uuid`. Use `identityUserId` apenas quando `UUID_REGEX.test(subject)`; caso contrario use somente `entraSub`.

Forma esperada:

```ts
const platformByEnv =
  this.platformAdminSubjects().has(subject) || this.isDevBypassAdmin(subject);

const user = platformByEnv
  ? await this.resolveOrProvisionPlatformUser(subject)
  : await this.resolveUser(subject);
```

Onde `resolveOrProvisionPlatformUser` tenta `resolveUser` e, se nao encontrar, faz:

```ts
const isUuidSubject = UUID_REGEX.test(subject);
return this.prisma.user.upsert({
  where: { entraSub: subject },
  create: {
    entraSub: subject,
    identityUserId: isUuidSubject ? subject : undefined,
    displayName: `Platform admin ${subject}`,
    status: UserStatus.active,
  },
  update: { status: UserStatus.active },
  select: { id: true, status: true },
});
```

Tambem atualize `resolveUser` para nao consultar `identityUserId` quando `subject` nao for UUID:

```ts
where: UUID_REGEX.test(subject)
  ? { OR: [{ identityUserId: subject }, { entraSub: subject }] }
  : { entraSub: subject },
```

Para subjects nao-admin, o comportamento permanece identico (lanca `USER_NOT_FOUND`/`USER_NOT_ACTIVE`).

Reason: admins configurados por env/dev-bypass sao confiados pela configuracao do ambiente; exigir provisionamento manual da row `user` antes de qualquer acesso e o lockout descrito no Bloqueador 1.

- [ ] **Step 3: Testes**

Adicionar em `actor-context.service.spec.ts`:

```ts
it('treats env allowlist subject as platform admin even without pre-existing user row', async () => {
  process.env.PLATFORM_ADMIN_SUBS = 'env-admin-sub';
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.upsert.mockResolvedValue({ id: 'prov-1', status: 'active' });
  const actor = await service.fromSubject('env-admin-sub', { orgMode: 'platform' });
  expect(actor.isPlatformAdmin).toBe(true);
});

it('still rejects non-admin subject without user row', async () => {
  delete process.env.PLATFORM_ADMIN_SUBS;
  prisma.user.findFirst.mockResolvedValue(null);
  await expect(service.fromSubject('ghost-sub', { orgMode: 'platform' }))
    .rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
});

it('provisions non-uuid env allowlist subject using entraSub only', async () => {
  process.env.PLATFORM_ADMIN_SUBS = 'ops-admin';
  prisma.user.findFirst.mockResolvedValue(null);
  prisma.user.upsert.mockResolvedValue({ id: 'prov-2', status: 'active' });
  await service.fromSubject('ops-admin', { orgMode: 'platform' });
  expect(prisma.user.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { entraSub: 'ops-admin' },
      create: expect.objectContaining({
        entraSub: 'ops-admin',
        identityUserId: undefined,
      }),
    }),
  );
});
```

```bash
npm --prefix apps/api test -- actor-context.service.spec.ts --runInBand
```

Esperado: testes passam.

### Task 1: Make Legacy API Client Migration Fail-Safe

**Files:**
- Modify: `apps/api/prisma/migrations/20260611130000_org_safe_access/migration.sql`
- Test/manual verification: `psql` query against staging/prod clone

- [ ] **Step 1: Inspect current legacy clients before edit**

Run:

```bash
rg -n "UPDATE app.api_client|api_client_kind_org_check|CREATE TYPE app.api_client_kind" apps/api/prisma/migrations/20260611130000_org_safe_access/migration.sql
```

Expected: shows current unsafe block:

```sql
UPDATE app.api_client
SET kind = 'PLATFORM'
WHERE org_id IS NULL;
```

- [ ] **Step 2: Replace unsafe mass promotion**

Change the block around api client kind setup to:

```sql
ALTER TABLE app.api_client
  ADD COLUMN IF NOT EXISTS kind app.api_client_kind NOT NULL DEFAULT 'TENANT';

UPDATE app.api_client
SET kind = 'PLATFORM',
    status = 'disabled'
WHERE org_id IS NULL;

ALTER TABLE app.api_client
  ADD CONSTRAINT api_client_kind_org_check
  CHECK (
    (kind = 'TENANT' AND org_id IS NOT NULL)
    OR (kind = 'PLATFORM' AND org_id IS NULL)
  ) NOT VALID;
```

Reason: existing null-org clients satisfy the constraint but cannot authenticate because `ApiKeyGuard` rejects non-active clients.

- [ ] **Step 3: Add audit query to deploy runbook**

Add to deployment notes or release checklist:

```sql
SELECT id, name, status, created_at
FROM app.api_client
WHERE org_id IS NULL
ORDER BY created_at;
```

Each row must be reviewed and intentionally re-enabled only if it is meant to be a platform automation client.

- [ ] **Step 4: Verify guard behavior from code**

Run:

```bash
rg -n "record.client.status !== 'active'|isPlatformAdmin: apiKey.kind === 'PLATFORM'" apps/api/src/auth apps/api/src/attachments
```

Expected: `ApiKeyGuard` rejects disabled clients before actor creation.

- [ ] **Step 5: Validate api client check constraint after data rewrite**

After the rewrite and FK changes, add:

```sql
ALTER TABLE app.api_client
  VALIDATE CONSTRAINT api_client_kind_org_check;
```

Reason: the data rewrite makes existing rows compliant, so validating the constraint catches unexpected bad data during migration instead of leaving a permanently `NOT VALID` constraint.

### Task 2: Ensure PLATFORM Org Exists Before Legacy Backfill

**Files:**
- Modify: `apps/api/prisma/migrations/20260611130000_org_safe_access/migration.sql`
- Modify: `apps/api/prisma/migrations/20260611160000_legacy_farms_to_platform_org/migration.sql`

- [ ] **Step 1: Add idempotent PLATFORM org seed**

After `org_single_platform_kind_idx`, add:

```sql
INSERT INTO app.org (name, slug, kind, status)
SELECT 'LandWatch Platform', 'landwatch-platform', 'PLATFORM', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM app.org WHERE kind = 'PLATFORM'
)
ON CONFLICT (slug) DO NOTHING;
```

Reason: later backfill needs exactly one active platform org target.

> **CORRECTION (revisao):** `slug` e `@unique`. O slug original `'platform'` pode colidir com uma org TENANT pre-existente e abortar a migration. Use um slug improvavel (`landwatch-platform`) + `ON CONFLICT (slug) DO NOTHING`. Se o `ON CONFLICT` cair sem inserir e ainda nao houver org PLATFORM, o `RAISE EXCEPTION` da Task 2 Step 2 (em `160000`) detecta o problema no deploy.

- [ ] **Step 2: Make missing PLATFORM org fatal**

Change `20260611160000_legacy_farms_to_platform_org/migration.sql`:

```sql
IF platform_org_id IS NULL THEN
  RAISE EXCEPTION 'No PLATFORM organization found; legacy farm, analysis and schedule ownership backfill cannot continue.';
END IF;
```

- [ ] **Step 3: Keep existing CAR conflict exception**

Verify this block remains:

```sql
IF conflict_count > 0 THEN
  RAISE EXCEPTION 'Cannot move legacy farms to PLATFORM org: % CAR key conflict(s)', conflict_count;
END IF;
```

### Task 3: Unify Platform Admin Logic for Attachments

**Files:**
- Modify: `apps/api/src/auth/actor-context.service.ts`
- Modify: `apps/api/src/auth/access.service.ts`
- Modify: `apps/api/src/attachments/attachments.service.ts`
- Modify: `apps/api/src/attachments/attachments.controller.ts`
- Test: `apps/api/src/attachments/attachments.service.spec.ts`
- Test: `apps/api/src/attachments/attachments.controller.spec.ts`

> **CORRECTION (revisao) — pre-requisito e tipos:**
> 1. Esta task depende da **Task 0** (senao o novo `isPlatformAdminSubject` async lanca `USER_NOT_FOUND` para admins de env sem row `user`).
> 2. **Resolver o Bloqueador 2 sem unificar os tipos:** o `ActorContext` de attachments tem 4 campos e o do auth tem 9; passar um onde se espera o outro nao compila (origem do `as any`). NAO refatore o modulo inteiro de attachments. Em vez disso, **estreite o parametro** de `AccessService.requirePlatformAdmin` para o minimo que ele realmente le:
>
> ```ts
> // access.service.ts
> requirePlatformAdmin(actor: Pick<ActorContext, 'isPlatformAdmin'>) { ... }
> ```
>
> Com isso, tanto o ator de attachments quanto o do auth satisfazem o parametro por structural typing, e o `as any` da Step 4 some sem mudar nenhum outro call-site. Verifique que `requirePlatformAdmin` so usa `actor.isPlatformAdmin` (confirmado em `access.service.ts:14-20`).
> 3. **Mudanca de fluxo:** nao basta trocar o helper env-only por `actorContext.isPlatformAdminSubject`. O `resolveActor` atual faz `prisma.user.findFirst` antes de chamar o helper; isso manteria o lockout de admin de env sem row `user`. Delegue a resolucao inicial para `ActorContextService.fromSubject(subject, { orgMode: 'tenant', orgId })`, que ja incorpora Task 0, membership PLATFORM, org active e membership tenant. Depois mapeie para o `ActorContext` local de attachments com 4 campos.

- [ ] **Step 1: Expose central platform-admin resolver**

In `ActorContextService`, add or make usable a method that returns the same result as `fromSubject(..., { orgMode: 'platform' })`.

Expected shape:

```ts
async isPlatformAdminSubject(subject: string): Promise<boolean> {
  const actor = await this.fromSubject(subject, { orgMode: 'platform' });
  return actor.isPlatformAdmin;
}
```

- [ ] **Step 2: Inject `ActorContextService` into `AttachmentsService`**

Constructor target:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly actorContext: ActorContextService,
) {}
```

Keep existing test helpers updated with a mock `actorContext`.

O spec atual tem muitas instanciacoes antigas. Antes de editar, conte todas:

```bash
rg -n "new AttachmentsService\(" apps/api/src/attachments/attachments.service.spec.ts
```

Recomendado: criar helper `makeAttachmentsService(prisma)` que injeta um `actorContext` mockado (`fromSubject: jest.fn(...)`) e trocar todas as instanciacoes por esse helper. Isso evita corrigir apenas os novos testes e deixar dezenas de chamadas com aridade antiga.

- [ ] **Step 3: Remove env-only attachment platform check and delegate actor resolution**

Replace local env-only logic:

```ts
private isPlatformAdminSubject(sub: string) {
  const allowlist = (process.env.PLATFORM_ADMIN_SUBS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowlist.length) return false;
  return new Set(allowlist).has(sub);
}
```

with central actor resolution:

```ts
const requestedOrg = this.normalizeOrgHeader(orgHeader);
const actor = await this.actorContext.fromSubject(subject, {
  orgMode: 'tenant',
  orgId: requestedOrg,
});
return {
  userId: actor.userId,
  orgId: actor.orgId,
  isPlatformAdmin: actor.isPlatformAdmin,
  subject: actor.subject,
} satisfies ActorContext;
```

Remove the earlier local `prisma.user.findFirst`, org lookup, and membership lookup from `resolveActor`. Those checks now live in `ActorContextService`.

- [ ] **Step 4: Remove `as any` from attachments controller**

Change:

```ts
await this.access.requirePlatformAdmin(actor as any);
```

to:

```ts
await this.access.requirePlatformAdmin(actor);
```

Isso passa a tipar diretamente por causa do parametro estreitado `Pick<ActorContext, 'isPlatformAdmin'>` (ver bloco CORRECTION desta task). Nao e necessario alterar o tipo de retorno de `resolveActorFromRequest`.

- [ ] **Step 5: Add tests**

Add tests for:

```ts
it('allows platform org admin membership to access attachments', async () => {
  actorContext.fromSubject.mockResolvedValue({
    userId: 'user-1',
    subject: 'platform-member-sub',
    orgId: null,
    orgRole: null,
    isPlatformAdmin: true,
    isPlatformOrgAdmin: true,
    source: 'user',
  });
  const actor = await service.resolveActorFromRequest('platform-member-sub', null);
  expect(actor.isPlatformAdmin).toBe(true);
});

it('rejects tenant user without org header for attachments', async () => {
  actorContext.fromSubject.mockRejectedValue(new ForbiddenException({
    code: 'ORG_REQUIRED',
    message: 'X-Org-Id is required',
  }));
  await expect(service.resolveActorFromRequest('tenant-sub', null)).rejects.toMatchObject({
    response: { code: 'ORG_REQUIRED' },
  });
});
```

Run:

```bash
npm --prefix apps/api test -- attachments.service.spec.ts attachments.controller.spec.ts --runInBand
```

Expected: all selected tests pass.

### Task 4: Make Org Feature Access Opt-In at DB and Prisma Level

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/migrations/20260611130000_org_safe_access/migration.sql` (in-place — ver CORRECTION na Step 3)
- Test: `apps/api/src/auth/access.service.spec.ts`

- [ ] **Step 1: Change Prisma default**

Change:

```prisma
enabled   Boolean    @default(true)
```

to:

```prisma
enabled   Boolean    @default(false)
```

- [ ] **Step 2: Change original migration default if still pre-deploy**

Change:

```sql
enabled boolean NOT NULL DEFAULT true,
```

to:

```sql
enabled boolean NOT NULL DEFAULT false,
```

- [ ] **Step 3: NAO criar forward migration — editar in-place**

> **CORRECTION (revisao):** as migrations `130000`/`150000`/`160000` estao untracked e nunca foram lancadas (verificado via `git status`). Portanto **edite a Step 2 in-place** e **nao** crie a migration `20260616120000_org_feature_default_false`. Apos editar, rode `npx prisma migrate reset` no DB de dev local para reaplicar do zero sem drift de checksum. A unica situacao que exigiria forward migration e se `130000` ja tivesse sido aplicada em staging/prod — o que `git status` desmente.

- [ ] **Step 4: Preserve explicit seed for existing tenant features**

Keep:

```sql
INSERT INTO app.org_feature_access (org_id, feature, enabled)
SELECT o.id, f.feature::app.app_feature, true
...
WHERE o.kind = 'TENANT'
```

This means existing tenant orgs keep initial MVP features, platform orgs do not receive tenant features, and manual rows default to disabled.

- [ ] **Step 5: Deny PLATFORM org tenant context for non-platform-admin users**

In `ActorContextService.fromSubject`, after loading `org`, add:

```ts
if (org.kind === OrgKind.PLATFORM && !isPlatformAdmin) {
  throw new ForbiddenException({
    code: 'ORG_ACCESS_DENIED',
    message: 'User cannot use platform organization as tenant context',
  });
}
```

Reason: even if a platform org member with role `member` exists, they must not get tenant-scoped access to legacy data backfilled into the platform org.

### Task 5: Add Validated Admin Feature DTO and 404 for Missing Org

**Files:**
- Create: `apps/api/src/admin/dto/update-org-features.dto.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin.service.ts`
- Test: `apps/api/src/admin/admin.service.spec.ts`

- [ ] **Step 1: Create DTO**

Create:

```ts
import { AppFeature } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';

const tenantAdminFeatures = [
  AppFeature.FARMS,
  AppFeature.ANALYSES,
  AppFeature.ANALYSIS_CREATE,
  AppFeature.CAR_SEARCH,
  AppFeature.SCHEDULES,
] as const;

export class OrgFeatureToggleDto {
  @IsIn(tenantAdminFeatures)
  feature!: AppFeature;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateOrgFeaturesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrgFeatureToggleDto)
  features!: OrgFeatureToggleDto[];
}
```

> **CORRECTION (revisao):** use `@IsIn(tenantAdminFeatures)`, nao `@IsEnum(tenantAdminFeatures)`. `@IsEnum` e documentado para receber um *objeto enum*; passar um array `as const` (subset do enum) e um truque nao-oficial e fragil. `@IsIn([...valores])` e a forma recomendada para validar contra uma lista explicita de valores. Garanta tambem que `ValidationPipe` roda com `whitelist: true` para rejeitar campos extras no body. (fontes ao final)

- [ ] **Step 2: Use DTO in controller**

Change controller body type:

```ts
@Body() dto: UpdateOrgFeaturesDto
```

- [ ] **Step 3: Validate org exists in service**

Before transaction:

```ts
const org = await this.prisma.org.findUnique({
  where: { id: orgId },
  select: { id: true, kind: true },
});
if (!org) {
  throw new NotFoundException({
    code: 'ORG_NOT_FOUND',
    message: 'Organization not found',
  });
}
if (org.kind !== OrgKind.TENANT) {
  throw new BadRequestException({
    code: 'ORG_FEATURES_TENANT_ONLY',
    message: 'Feature access can only be configured for tenant organizations',
  });
}
```

- [ ] **Step 4: Add tests**

Test missing org:

```ts
it('returns not found when updating features for missing org', async () => {
  process.env.PLATFORM_ADMIN_SUBS = 'admin-sub';
  const prisma = makePrismaMock();
  prisma.org.findUnique.mockResolvedValue(null);
  const service = new AdminService(prisma as any, actorContext as any, access as any);

  await expect(
    service.updateOrgFeatures('admin-sub', 'missing-org', {
      features: [{ feature: 'FARMS', enabled: true }],
    }),
  ).rejects.toMatchObject({ response: { code: 'ORG_NOT_FOUND' } });
});
```

Run:

```bash
npm --prefix apps/api test -- admin.service.spec.ts --runInBand
```

Expected: admin tests pass.

### Task 6: New Tenant Orgs Start With No Features (opt-in puro)

> **DECISAO TRAVADA (2026-06-16):** org TENANT nova **nasce vazia** — nenhuma feature habilitada no `createOrg`. O admin habilita cada feature explicitamente via `PATCH /v1/admin/orgs/:id/features`. NAO seedar features na criacao. (Isto contrasta com o seed das orgs PRE-existentes na Task 4 Step 4, que e um backfill unico de migracao para nao quebrar quem ja opera.)

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts` (garantir que `createOrg` NAO cria rows de feature)
- Modify: `apps/api/docs/authz-matrix.md` (documentar o opt-in)
- Test: `apps/api/src/admin/admin.service.spec.ts`

- [ ] **Step 1: Garantir que `createOrg` nao seeda features**

`createOrg` deve permanecer apenas criando a org (sem `orgFeatureAccess`). Como o default da coluna `enabled` agora e `false` (Task 4) e nenhuma row e inserida, toda feature fica desabilitada ate o admin habilitar. Nao e necessario transacao nem `createMany`.

```ts
async createOrg(subject: string, dto: CreateOrgDto) {
  await this.assertAdmin(subject);
  // ...validacao de nome/slug...
  const kind = dto.kind ?? OrgKind.TENANT;
  return this.prisma.org.create({ data: { name, slug, kind } });
}
```

- [ ] **Step 2: Test — createOrg NAO cria features**

> **Bloqueador 3:** usar 3 args no construtor (igual Task 5/Task 10), com os mocks `actorContext`/`access` da Task 10 Step 3. Executar a Task 10 antes desta (ou juntas).

```ts
it('does not enable any feature when creating a tenant org (opt-in)', async () => {
  const prisma = makePrismaMock();
  prisma.org.create.mockResolvedValue({ id: 'org-1', name: 'Org', slug: 'org', kind: 'TENANT' });
  const service = new AdminService(prisma as any, actorContext as any, access as any);

  await service.createOrg('admin-sub', { name: 'Org' });

  expect(prisma.orgFeatureAccess.createMany).not.toHaveBeenCalled();
  expect(prisma.orgFeatureAccess.upsert).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Doc/UX — sinalizar org "sem features"**

Como `GET /v1/access/me` retorna `features: []` para org recem-criada, o frontend deve tratar esse estado (org sem acesso a nada) de forma clara, e o fluxo de criacao de org no admin deve direcionar o operador a habilitar features. Documentar em `authz-matrix.md`: "Org TENANT nova nasce sem features; habilitar via PATCH /v1/admin/orgs/:id/features antes do primeiro uso."

### Task 7: Remove Unsafe `list()` Overloads Without Actor

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/farms/farms.service.ts`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`
- Test: `apps/api/src/farms/farms.service.spec.ts`

- [ ] **Step 1: Change analyses signature**

Use:

```ts
async list(
  actor: ActorContext,
  params: {
    carKey?: string;
    farmId?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  },
) {
  const { carKey, farmId, startDate, endDate, page, pageSize } = params;
  const where: Prisma.AnalysisWhereInput = actor.isPlatformAdmin
    ? {}
    : { orgId: actor.orgId };
```

- [ ] **Step 2: Change farms signature**

Use:

```ts
async list(actor: ActorContext, params: ListParams) {
  const { q, page, pageSize, includeDocs } = params;
  const scopedWhere = actor.isPlatformAdmin
    ? {}
    : actor.orgId
      ? { OR: [{ orgId: actor.orgId }, { orgId: null }] }
      : { orgId: null };
```

- [ ] **Step 3: Update specs**

Replace old calls:

```ts
await service.list({ page: 1, pageSize: 20 });
```

with:

```ts
await service.list(
  {
    userId: 'user-1',
    subject: 'sub-1',
    orgId: 'org-1',
    orgRole: 'member',
    isPlatformAdmin: false,
    isPlatformOrgAdmin: false,
    source: 'user',
  },
  { page: 1, pageSize: 20 },
);
```

Run:

```bash
npm --prefix apps/api test -- analyses.service.spec.ts farms.service.spec.ts --runInBand
```

Expected: selected tests pass.

### Task 8: Make Platform Analysis Creation Explicit

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Test: `apps/api/src/analyses/automation-analyses.controller.spec.ts`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`

- [ ] **Step 1: Aplicar comportamento travado**

> **CORRECTION (revisao):** o texto original era ambiguo e, pior, deixava a porta aberta para reintroduzir `orgId=null` em analises — exatamente as rows que o backfill da Task 2 elimina. Regra explicita a adotar:

```text
1. Usuario tenant (orgMode='tenant'): X-Org-Id e obrigatorio (fromRequest ja lanca ORG_REQUIRED). Analise herda actor.orgId. Nunca null.
2. Platform admin via UI sem X-Org-Id: REJEITAR criacao com ORG_REQUIRED. Admin de plataforma nao cria analise "global"; se precisar, seleciona uma org via X-Org-Id.
3. API key PLATFORM (kind=PLATFORM, orgId=null): `POST /v1/automation/analyses` exige `X-Org-Id` como org alvo. Sem `X-Org-Id` → `ORG_REQUIRED`. Com `X-Org-Id`, validar org ativa e gravar `analysis.orgId = X-Org-Id`. Nao gravar orgId=null.
```

Resultado: nenhum caminho novo grava `orgId=null`, preservando o invariante pos-backfill (toda analise tem org). Confirme que `assertCanReadAnalysis`/`requireSameOrgOrPlatform` continuam consistentes com isso.

- [ ] **Step 1.1: Add target-org support for platform API keys**

Change `ActorContextService.fromApiKey` signature:

```ts
async fromApiKey(
  apiKey: ApiKeyPrincipal,
  options: { orgId?: string | null } = {},
): Promise<ActorContext> {
```

Rules:

```ts
const requestedOrg = options.orgId ?? null;
if (apiKey.kind === 'TENANT' && requestedOrg && requestedOrg !== apiKey.orgId) {
  throw new ForbiddenException({
    code: 'API_CLIENT_ORG_FORBIDDEN',
    message: 'Tenant API client cannot target another organization',
  });
}
const effectiveOrgId = apiKey.kind === 'PLATFORM' ? requestedOrg : apiKey.orgId;
if (apiKey.kind === 'PLATFORM' && requestedOrg) {
  const org = await this.prisma.org.findUnique({
    where: { id: requestedOrg },
    select: { id: true, status: true, kind: true },
  });
  if (!org) {
    throw new ForbiddenException({
      code: 'ORG_NOT_FOUND',
      message: 'Organization not found',
    });
  }
  if (org.status !== OrgStatus.active) {
    throw new ForbiddenException({
      code: 'ORG_DISABLED',
      message: 'Organization disabled',
    });
  }
  if (org.kind !== OrgKind.TENANT) {
    throw new ForbiddenException({
      code: 'ORG_TARGET_INVALID',
      message: 'Platform API client must target a tenant organization',
    });
  }
}
```

Return `orgId: effectiveOrgId`.

In `AutomationAnalysesController.create`, pass `X-Org-Id` for platform-key create:

```ts
const actor = await this.actor(req, { requireOrgForCreate: true });
```

where helper normalizes `req.headers['x-org-id']` and calls:

```ts
return this.actorContext.fromApiKey(req.apiKey, { orgId });
```

For read endpoints, keep existing behavior: platform API key with `orgId=null` can read by id because `assertCanReadAnalysis` allows platform admins.

- [ ] **Step 2: Remove dead ternary**

Change:

```ts
orgId: actor.isPlatformAdmin ? actor.orgId : actor.orgId,
```

to:

```ts
orgId: actor.orgId,
```

- [ ] **Step 3: Guard explicito — proibir analise sem org para TODOS os atores**

> **CORRECTION (revisao):** o guard original (`!actor.orgId && !actor.isPlatformAdmin`) deixava o platform admin/API key PLATFORM criar analise com `orgId=null`, contradizendo a regra da Step 1. Como a decisao e "nenhuma analise null pos-backfill", o guard deve barrar qualquer criacao sem org resolvida:

```ts
if (!actor.orgId) {
  throw new ForbiddenException({
    code: 'ORG_REQUIRED',
    message: 'Organization context required to create analysis',
  });
}
```

Isso cobre tenant, platform admin UI sem org, e API key PLATFORM sem `X-Org-Id`.

- [ ] **Step 4: Impedir farm cross-org na criacao por platform admin**

Depois de resolver `farm`, aplique a regra org-scoped para todos os atores quando a analise vai ser criada em uma org:

```ts
if (farm && (farm.orgId ?? null) !== null && farm.orgId !== orgId) {
  throw new ForbiddenException({
    code: 'FARM_ORG_FORBIDDEN',
    message: 'Farm belongs to another organization',
  });
}
```

Nao condicione esta checagem a `!actor.isPlatformAdmin` no caminho de create. Platform admin continua podendo ler recursos cross-org, mas criacao com `X-Org-Id` nao pode gravar `analysis.orgId` de uma org e `farmId` de outra.

- [ ] **Step 5: Remover ou fechar caminhos legados de criacao sem actor**

Remova `create(claims, input)` e `createForApiKey(apiKey, input)` se nao houver callers. Se algum caller interno ainda existir, ele deve delegar para `createForActor` depois de resolver `ActorContext` completo; nao mantenha caminho que monta `{ userId, orgId }` parcial e bypassa Task 8.

Verifique:

```bash
rg -n "createForApiKey\(|create\(claims" apps/api/src/analyses
```

- [ ] **Step 6: Tests**

Ajuste os specs de `automation-analyses.controller.spec.ts` para:

```ts
it('requires X-Org-Id when platform api key creates analysis', async () => {
  actorContext.fromApiKey.mockResolvedValue({
    userId: 'm2m-user',
    subject: 'm2m:client-platform',
    orgId: null,
    orgRole: null,
    isPlatformAdmin: true,
    isPlatformOrgAdmin: false,
    source: 'apiKey',
  });
  analysesService.createForActor.mockRejectedValue(
    new ForbiddenException({
      code: 'ORG_REQUIRED',
      message: 'Organization context required to create analysis',
    }),
  );
  // POST without x-org-id returns ORG_REQUIRED
});

it('passes X-Org-Id to ActorContextService for platform api key create', async () => {
  await controller.create(
    { apiKey: { kind: 'PLATFORM', orgId: null }, headers: { 'x-org-id': 'org-1' } } as any,
    dto,
  );
  expect(actorContext.fromApiKey).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'PLATFORM' }),
    { orgId: 'org-1' },
  );
});

it('rejects platform api key create when target org and farm org differ', async () => {
  await expect(
    analysesService.createForActor(
      { ...platformActor, orgId: 'org-a', isPlatformAdmin: true },
      { ...dto, farmId: 'farm-org-b' },
    ),
  ).rejects.toMatchObject({ response: { code: 'FARM_ORG_FORBIDDEN' } });
});
```

### Task 9: Remove Farm UUID Sentinel and Preserve Schedule Org Rule

**Files:**
- Modify: `apps/api/src/farms/farms.service.ts`
- Modify: `apps/api/src/schedules/schedules.service.ts`
- Test: `apps/api/src/farms/farms.service.spec.ts`
- Test: `apps/api/src/schedules/schedules.service.spec.ts`

- [ ] **Step 1: Replace `__none__` sentinel**

Change:

```ts
where: actor.isPlatformAdmin
  ? { id }
  : { id, OR: [{ orgId: actor.orgId ?? '__none__' }, { orgId: null }] },
```

to:

```ts
where: actor.isPlatformAdmin
  ? { id }
  : actor.orgId
    ? { id, OR: [{ orgId: actor.orgId }, { orgId: null }] }
    : { id, orgId: null },
```

- [ ] **Step 2: Keep schedule farm-null rejection**

Preserve:

```ts
if (!actor.isPlatformAdmin && farm.orgId === null) {
  throw new NotFoundException({
    code: 'FARM_NOT_FOUND',
    message: 'Farm not found',
  });
}
```

- [ ] **Step 3: Add regression test**

Test:

```ts
it('does not allow tenant schedule creation for public farm', async () => {
  prisma.farm.findUnique.mockResolvedValue({ id: 'farm-public', orgId: null });
  await expect(service.createForActor(tenantActor, {
    farmId: 'farm-public',
    analysisKind: 'STANDARD',
    frequency: 'DAILY',
  } as any)).rejects.toMatchObject({ response: { code: 'FARM_NOT_FOUND' } });
});
```

### Task 10: Remove Optional Security Dependencies in AdminService

**Files:**
- Modify: `apps/api/src/admin/admin.service.ts`
- Modify: `apps/api/src/admin/admin.service.spec.ts`

> **CORRECTION (revisao) — depende da Task 0 e tem escopo de teste maior:**
> 1. **Depende da Task 0.** `assertAdmin` simplificado delega 100% para `fromSubject`, que chama `resolveUser`. Sem a Task 0, um admin de `PLATFORM_ADMIN_SUBS` (ou dev-bypass) sem row `user` toma `USER_NOT_FOUND`. Nao execute esta task antes da Task 0.
> 2. **O spec atual quebra em massa.** `admin.service.spec.ts` instancia `new AdminService(makePrismaMock() as any)` (1 arg) em ~10 pontos (linhas 42, 51, 63, 79, 95, 109, 114, 127, 138, 147, …) e depende do fast-path do env allowlist (sem mockar DB). Apos remover o `@Optional()`, **todas** precisam virar 3 args e os testes que exercem `assertAdmin` precisam mockar `actorContext.fromSubject` + `access.requirePlatformAdmin`. Recomendado: extrair um helper `makeAdminService(prisma)` no topo do spec que injeta os mocks padrao, e trocar todas as instanciacoes por ele. Conte/atualize todas as ocorrencias:
>
> ```bash
> rg -n "new AdminService\(" apps/api/src/admin/admin.service.spec.ts
> ```

- [ ] **Step 1: Remove optional injection**

Change constructor to:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly actorContext: ActorContextService,
  private readonly access: AccessService,
) {}
```

- [ ] **Step 2: Simplify `assertAdmin`**

Use:

```ts
async assertAdmin(subject: string) {
  const actor = await this.actorContext.fromSubject(subject, {
    orgMode: 'platform',
  });
  await this.access.requirePlatformAdmin(actor);
}
```

- [ ] **Step 3: Update tests with mocks**

Create test mocks:

```ts
const actorContext = {
  fromSubject: jest.fn().mockResolvedValue({
    userId: 'admin-1',
    subject: 'admin-sub',
    orgId: null,
    orgRole: null,
    isPlatformAdmin: true,
    isPlatformOrgAdmin: true,
    source: 'user',
  }),
};
const access = { requirePlatformAdmin: jest.fn().mockResolvedValue(undefined) };
```

Instantiate:

```ts
const service = new AdminService(prisma as any, actorContext as any, access as any);
```

### Task 11: Document Final Access Matrix

**Files:**
- Modify: `apps/api/docs/authz-matrix.md`
- Optional Modify: `docs/status-cards.md`

- [ ] **Step 1: Update attachments row**

Set:

```md
| /v1/attachments/* | AuthGuard + ActiveUserGuard + platform admin check | Platform admins only; tenants cannot access attachments routes. |
```

- [ ] **Step 2: Add platform admin definition**

Add:

```md
Platform admin means either a subject in `PLATFORM_ADMIN_SUBS` or an active user with owner/admin membership in an active org whose `kind` is `PLATFORM`.
```

- [ ] **Step 3: Add schedule rule**

Add:

```md
Schedules require an org-scoped farm. Public or null-org farms cannot be scheduled.
```

- [ ] **Step 4: Add API client migration rule**

Add:

```md
Legacy API clients with `org_id IS NULL` must be audited before deploy. They are disabled by migration and re-enabled only after explicit platform-client approval.
```

### Task 12: Final Verification

**Files:**
- No code file changes.

- [ ] **Step 0: Local migration reset (sem drift de checksum)**

> **CORRECTION (revisao):** como as migrations sao editadas in-place (untracked / nunca lancadas), reaplique do zero no DB de dev antes de rodar testes/e2e e confirme que nao ha drift:

```bash
cd apps/api
npx prisma migrate reset --force
npx prisma migrate status
```

Esperado: `migrate status` reporta "Database schema is up to date" sem migrations pendentes/divergentes.

- [ ] **Step 1: Static checks**

Run:

```bash
npm --prefix apps/api run lint
```

Expected: exit 0.

- [ ] **Step 2: Unit tests**

Run:

```bash
npm --prefix apps/api test -- --runInBand
```

Expected: all API unit tests pass.

- [ ] **Step 3: E2E tests**

Run:

```bash
npm --prefix apps/api run test:e2e
```

Expected: all e2e tests pass or documented external dependency failure.

- [ ] **Step 4: Migration dry-run checklist**

Run against staging/prod clone:

```sql
SELECT id, name, status, created_at FROM app.api_client WHERE org_id IS NULL ORDER BY created_at;
SELECT id, name, slug, status FROM app.org WHERE kind = 'PLATFORM';
SELECT count(*) FROM app.farm WHERE org_id IS NULL;
SELECT count(*) FROM app.analysis WHERE org_id IS NULL;
SELECT count(*) FROM app.analysis_schedule WHERE org_id IS NULL;
```

Expected:

```text
api_client rows reviewed
exactly one PLATFORM org
farm/analysis/schedule null counts become 0 after backfill, unless no legacy data exists
```

## Self-Review

- Spec coverage: covers all validated items from original review plus Claude follow-up: attachments policy, schedule org-only policy, api client migration, platform admin divergence, tenant feature default, admin DTO/404, org creation features, legacy backfill, list overloads, ternary, sentinel, optional deps, docs.
- Placeholder scan: no deferred tasks; each task has concrete files, commands, or code snippets.
- Type consistency: `ActorContext`, `AppFeature`, `OrgKind`, `AccessService`, `ActorContextService`, and DTO names match repo naming.

## Plan Review Corrections — Self-Review (2026-06-16, Claude)

- **Bloqueadores resolvidos:** (1) lockout env/dev-bypass → nova **Task 0** (ordem `fromSubject` + auto-provisionamento de admin de env, espelhando o padrao M2M ja existente em `fromApiKey`); (2) `requirePlatformAdmin` nao-compila → estreitar parametro para `Pick<ActorContext,'isPlatformAdmin'>` (Task 3); (3) aridade do construtor `AdminService` → Tasks 6/10 alinhadas em 3 args + helper de teste; (4) org PLATFORM nao recebe tenant features e nao pode ser usada como tenant context por nao-admin; (5) attachments delega resolucao inicial para `ActorContextService`; (6) API key PLATFORM recebe org alvo via `X-Org-Id`; (7) create de analise impede `farmId` cross-org mesmo para platform admin; (8) specs de attachments atualizam todas as instanciacoes do construtor.
- **Dependencias de ordem declaradas:** Task 0 antes de 3 e 10; Task 10 antes (ou junto) de 6.
- **Verificado contra o repo:** migrations untracked (`git status`), tipo `ActorContext` de attachments com 4 campos (`attachments.service.ts:55`), ausencia de seed do dev-bypass user, muitas instanciacoes de 1 arg em `attachments.service.spec.ts`, `~10` instanciacoes de 1 arg em `admin.service.spec.ts`, ausencia de callers internos nao-teste de `list()`, `AutomationAnalysesController.actor()` ainda sem `X-Org-Id`, e `AnalysesService.createWithActor` ainda pulando checagem de farm org para platform admin.
- **Decisoes de produto TRAVADAS (2026-06-16):** (a) Task 0 — admin de env/dev-bypass e **auto-provisionado** (upsert de user ativo, padrao M2M); (b) Task 8 — **toda** analise exige org resolvida (`ORG_REQUIRED`), nenhuma key PLATFORM cria analise `orgId=null`; (c) Task 6 — org TENANT nova **nasce vazia** (opt-in puro), sem seed de features no `createOrg`; admin habilita via PATCH. Sem itens pendentes.
- **Cleanup recomendado (nao bloqueia):** `AppFeature.ATTACHMENTS` e `ATTACHMENTS_REVIEW` ficam sem uso (anexos e platform-only); documentar como reservados na Task 11 ou remover do enum em migracao futura.

## Referencias

- class-validator README oficial — `@IsIn(values: any[])` valida lista explicita de valores e `@IsEnum(entity: object)` valida objeto enum: https://github.com/typestack/class-validator
- NestJS ValidationPipe oficial — `whitelist` remove propriedades sem decorator; `forbidNonWhitelisted` rejeita propriedades extras quando usado com `whitelist`: https://docs.nestjs.com/techniques/validation
