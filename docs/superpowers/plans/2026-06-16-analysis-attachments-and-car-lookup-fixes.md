# Fix Plan — Analysis Attachments 403 & CAR Lookup 404 (tenant)

> Origem: teste local (`testeLocalLandwatch.har`). Dois erros de rede observados como tenant
> (X-Org-Id = `776fd355-...` = org TENANT "Teste", **não** platform admin):
>
> ```
> 404 GET /v1/farms/by-car?carKey=SP-3542503-...   → {"code":"FARM_NOT_FOUND"}
> 403 GET /v1/attachments/analysis/c3ea5365-...    → {"code":"PLATFORM_ADMIN_REQUIRED"}
> ```

## Requisito de produto (do usuário)

- Org **não** platform-admin **NÃO** acessa a aba/área administrativa de Anexos (workspace, datasets, categorias, review, pending, events, upload).
- Org **não** platform-admin **PRECISA** ver/baixar os **anexos da própria análise** na tela de análise.
- Tenant nunca pode ver anexos/análises de **outra** organização.

---

## Erro 1 — 404 em `GET /v1/farms/by-car` (autofill de CAR)

### Causa raiz (confirmada)
A fazenda desse CAR existe, mas pertence à org **PLATFORM** (Sigfarm). A requisição é de uma org **TENANT**. [`farms.service.ts`](../../../apps/api/src/farms/farms.service.ts) `getByCarKeyForActor` busca, por segurança, apenas `orgId = actor.orgId` e depois `orgId = null` (pública) — **nunca** a org PLATFORM. Logo o lookup lança `FARM_NOT_FOUND` → 404.

O endpoint só é consumido por [`NewAnalysisView.vue`](../../../apps/web/src/views/NewAnalysisView.vue) `autoFillFarm` (linha ~424), que:
- já trata "sem match" (`if (!match) { ... return }`, linha ~436);
- já engole exceções no `catch`.

Ou seja: **não há bug funcional e não há vazamento** — o 404 é apenas ruído vermelho no Network/console. A isolação de escopo (tenant não enxerga farm PLATFORM) está **correta** e deve ser mantida.

### Avaliação da proposta do Codex
Concordo com o diagnóstico. A proposta de "retornar `200 {data:null}`" é a correta. A alternativa de "criar endpoint novo `/lookup-by-car`" é desnecessária: `by-car` **já é** semanticamente um lookup de conveniência (autofill) e tem **um único** consumidor que já suporta `null`.

### Fix recomendado (mínimo e robusto)
Transformar `by-car` em lookup que não erra quando não há match no escopo do ator.

- [`farms.controller.ts`](../../../apps/api/src/farms/farms.controller.ts) `getByCar`: retornar `{ data: null }` quando não encontrado no escopo, em vez de propagar 404.
- Implementação: adicionar `farms.service.findByCarKeyForActor(actor, carKey)` que retorna `Farm | null` (mesma lógica de escopo do `getByCarKeyForActor`, mas **sem** lançar). O `getByCarKeyForActor` (que lança) permanece para quem precisa do 404 — verificar se há outros consumidores antes de alterar a assinatura; hoje só o controller usa.
- **Não** liberar tenant a ver/sugestar dados de farm PLATFORM (decisão de isolamento mantida).

```ts
// farms.controller.ts
@Get('by-car')
async getByCar(@Req() req: AuthedRequest, @Query() query: FarmByCarQuery) {
  const actor = await this.actorContext.fromRequest(req, { orgMode: 'tenant' });
  await this.access.requireTenantFeature(actor, 'FARMS');
  // Retorna o valor CRU (farm | null). O EnvelopeInterceptor global embrulha
  // em { data, correlationId }; data === null quando não há match no escopo.
  return this.farms.findByCarKeyForActor(actor, query.carKey);
}
```

> **CORREÇÃO (Codex #1) — double-envelope:** existe `EnvelopeInterceptor` global ([`common/http/envelope.interceptor.ts`](../../../apps/api/src/common/http/envelope.interceptor.ts)) que já embrulha tudo em `{ data, correlationId }` (e mapeia `undefined → null`). Retornar `{ data: farm }` produziria `{ data: { data: farm } }` e quebraria o `unwrapData()` do front. Controller deve retornar **`farm` cru ou `null`**.

> **CORREÇÃO (Codex #3) — ambiguidade continua 400:** `getByCarKeyForActor` hoje lança `FARM_CAR_KEY_AMBIGUOUS` (400) quando platform admin sem org acha o CAR em múltiplos escopos. O novo `findByCarKeyForActor` deve preservar isso: **"não encontrado no escopo" → `null`; "ambíguo" → continua lançando 400**. Só o caso not-found vira `null`.

Implementação no service (extrair a lógica de escopo, lançar só na ambiguidade):

```ts
// farms.service.ts — retorna shapedFarm | null; lança 400 em ambiguidade
async findByCarKeyForActor(actor: ActorContext, carKeyInput: string) {
  const carKey = this.normalizeCarKey(carKeyInput);
  let farm = null;
  if (actor.isPlatformAdmin && !actor.orgId) {
    const matches = await this.prisma.farm.findMany({ where: { carKey }, take: 2, select: { id: true } });
    if (matches.length > 1) {
      throw new BadRequestException({ code: 'FARM_CAR_KEY_AMBIGUOUS', message: 'CAR key exists in multiple scopes' });
    }
    farm = await this.prisma.farm.findFirst({ where: { carKey }, include: { documents: true, _count: { select: { documents: true } } } });
  } else {
    farm =
      (await this.prisma.farm.findFirst({ where: { carKey, orgId: actor.orgId }, include: { documents: true, _count: { select: { documents: true } } } })) ??
      (await this.prisma.farm.findFirst({ where: { carKey, orgId: null }, include: { documents: true, _count: { select: { documents: true } } } }));
  }
  return farm ? this.shapeFarm(farm) : null;
}

// getByCarKeyForActor passa a delegar (mantém o 404 para quem precisar)
async getByCarKeyForActor(actor: ActorContext, carKeyInput: string) {
  const farm = await this.findByCarKeyForActor(actor, carKeyInput);
  if (!farm) throw new NotFoundException({ code: 'FARM_NOT_FOUND', message: 'Farm not found' });
  return farm;
}
```

### Testes
- tenant, CAR só existe em org PLATFORM → `200 { data: null }` (sem 404).
- tenant, CAR existe na própria org → `200 { data: farm }`.
- tenant, CAR público (orgId null) → `200 { data: farm }`.
- platform admin, CAR em qualquer org → `200 { data: farm }`.

---

## Erro 2 — 403 em `GET /v1/attachments/analysis/:id` (anexos da análise)

### Causa raiz (confirmada — bug real de autorização)
Em [`attachments.controller.ts`](../../../apps/api/src/attachments/attachments.controller.ts), **todas** as rotas chamam o helper `resolveActor(req)`, que termina com `this.access.requirePlatformAdmin(actor)`. Isso é correto para as rotas administrativas, mas é aplicado **também** às rotas analysis-scoped:

```
GET  /v1/attachments/analysis/:analysisId          (listar anexos da análise)
POST /v1/attachments/analysis/:analysisId/zip       (zip dos anexos da análise)
GET  /v1/attachments/:id/download                   (download individual — usado pela tela de análise)
```

Resultado: o tenant nunca chega na query (que **já é segura**, via `scopeFilterForActor`) — toma 403 `PLATFORM_ADMIN_REQUIRED` no controller.

Evidência: a análise `c3ea...` é da org TENANT e tem 2 anexos `PLATFORM_FEATURE / PUBLIC / APPROVED`. O `scopeFilterForActor` ([`attachments.service.ts:4477`](../../../apps/api/src/attachments/attachments.service.ts)) já liberaria esses anexos para o tenant (PLATFORM_FEATURE + PUBLIC). O bloqueio é **só** no controller.

### Avaliação da proposta do Codex
Diagnóstico **correto** e completo nos pontos essenciais:
- separar rotas admin (platform-only) de rotas analysis-scoped (tenant-acessíveis);
- **não** basta remover `requirePlatformAdmin` — é obrigatório adicionar `assertCanReadAnalysis(actor, analysisId)`, senão um tenant poderia sondar `analysisId` de outra org (a query por escopo ainda revelaria anexos PLATFORM/PUBLIC vinculados àquela análise → vazamento de metadados);
- download individual precisa ser **contextual à análise** (provar leitura da análise + pertencimento ao snapshot efetivo), não a rota global.

Refino e proponho uma opção mais robusta para o download.

### Fix recomendado

#### Parte 1 — Resolver de ator sem gate de platform admin
Criar no controller um segundo resolver para rotas analysis-scoped, que resolve o ator (identidade + org via `X-Org-Id`) **sem** exigir platform admin:

```ts
// attachments.controller.ts
private async resolveAnalysisViewerActor(req: AuthedRequest) {
  if (!req.user?.sub) {
    throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing user claims' });
  }
  // NÃO chama requirePlatformAdmin — apenas resolve identidade + org.
  return this.attachments.resolveActorFromRequest(
    String(req.user.sub),
    req.headers['x-org-id'],
  );
}
```

`resolveActor` (com `requirePlatformAdmin`) permanece em **todas** as rotas administrativas:
`datasets`, `capabilities`, `categories*`, `features/*`, `analyses/:id/targets` (plural — seleção/admin), `map-filters`, `tiles`, `pmtiles`, `mine`, `pending`, `events`, `permissions/*`, `:id`, `:id/events`, `:id` PATCH, `:id/targets*`, `:id/revoke`, e o `:id/download` global.

#### Parte 2 — Autorização por análise nas rotas analysis-scoped
Injetar `AccessService` no `AttachmentsController` e, nas rotas de análise, validar leitura da análise **antes** de listar/baixar:

```ts
@Get('analysis/:analysisId')
async listAnalysisAttachments(@Req() req, @Param('analysisId') analysisId) {
  const actor = await this.resolveAnalysisViewerActor(req);
  await this.access.assertCanReadAnalysis(actor, analysisId); // 404/403 cross-org
  return this.attachments.listAnalysisAttachments(actor, analysisId);
}

@Post('analysis/:analysisId/zip')
async downloadAnalysisZip(@Req() req, @Param('analysisId') analysisId, @Res({passthrough:true}) res) {
  const actor = await this.resolveAnalysisViewerActor(req);
  await this.access.assertCanReadAnalysis(actor, analysisId);
  // ...resto inalterado (downloadAnalysisZip já aplica scopeFilterForActor)
}
```

`listAnalysisAttachments`/`downloadAnalysisZip` no service **já** aplicam `scopeFilterForActor` (defense-in-depth) — manter. A camada nova é o `assertCanReadAnalysis` (impede sondar análise de outra org).

#### Parte 3 — Download individual contextual (opção mais robusta que o global)
A tela de análise hoje usa o **global** `GET /v1/attachments/:id/download` ([`AnalysisDetailView.vue:928`](../../../apps/web/src/views/AnalysisDetailView.vue)). Em vez de enfraquecer essa rota, criar uma rota **analysis-scoped** espelhando o padrão público já existente [`downloadPublicAnalysisAttachment`](../../../apps/api/src/attachments/attachments.service.ts):

```ts
// nova rota
@Get('analysis/:analysisId/:attachmentId/download')
async downloadAnalysisAttachment(@Req() req, @Param('analysisId') analysisId, @Param('attachmentId') attachmentId, @Res({passthrough:true}) res) {
  const actor = await this.resolveAnalysisViewerActor(req);
  await this.access.assertCanReadAnalysis(actor, analysisId);
  const file = await this.attachments.downloadAnalysisAttachmentForActor(actor, analysisId, attachmentId, req.ip ?? null);
  // ...setHeader + StreamableFile
}
```

```ts
// attachments.service.ts — espelha downloadPublicAnalysisAttachment, mas com escopo do ator
async downloadAnalysisAttachmentForActor(actor, analysisId, attachmentId, ip) {
  await this.ensureAnalysisEffectiveSnapshot(analysisId);
  const snapshot = await this.prisma.analysisAttachmentEffective.findFirst({
    where: {
      analysisId,
      attachmentId,
      capturedTargetStatus: AttachmentTargetStatus.APPROVED,
      ...this.scopeFilterForActor(actor), // PLATFORM/PUBLIC ou própria org
    },
    include: { attachment: true },
  });
  if (!snapshot) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found for this analysis' });
  await this.appendDownloadEvent(snapshot.attachmentId, actor, ip, false);
  return {
    filename: snapshot.attachment.originalFilename,
    contentType: snapshot.attachment.contentType,
    stream: await this.openAttachmentReadStream(snapshot.attachment),
  };
}
```

> **CORREÇÃO (Codex #2) — snippet do download:** `appendDownloadEvent(attachmentId, actor, ip, zip)` espera `ActorContext | null` no 2º parâmetro (não `actor.userId`/string). E os campos do retorno vêm de `snapshot.attachment` (`originalFilename`, `contentType`) + `openAttachmentReadStream(snapshot.attachment)`. Assinatura confirmada em [`attachments.service.ts:4457`](../../../apps/api/src/attachments/attachments.service.ts).

> **Nota de tipos:** `assertCanReadAnalysis`/`requireSameOrgOrPlatform` recebem o `ActorContext` completo do auth, mas o ator local de attachments tem 4 campos. Estreitar o parâmetro desses métodos para `Pick<ActorContext, 'isPlatformAdmin' | 'orgId'>` (mesmo padrão já aplicado a `requirePlatformAdmin`) para aceitar o ator de attachments sem `as any`.

Garante duas provas: (a) ator pode ler a análise; (b) o anexo pertence ao **snapshot efetivo** daquela análise e está no escopo do ator. O `:id/download` global permanece **platform-admin only**.

#### Parte 4 — Frontend
- [`AnalysisDetailView.vue`](../../../apps/web/src/views/AnalysisDetailView.vue): trocar o download individual de
  `GET /v1/attachments/${attachmentId}/download` →
  `GET /v1/attachments/analysis/${analysisId}/${attachmentId}/download`.
- Sidebar/aba "Anexos" (administrativa): confirmar que já é ocultada para não-platform-admin via `isPlatformAdmin` de `GET /v1/access/me`. Os anexos **da análise** são renderizados dentro da tela de análise, não pela aba admin — esse caminho deve continuar visível.

### Opção alternativa (preferível a médio prazo) — mover rotas analysis-scoped
A causa-raiz é arquitetural: rotas tenant-acessíveis convivem no mesmo controller que assume platform-admin. Mais robusto a longo prazo: **mover** as 3 rotas analysis-scoped para um controller próprio sob `/v1/analyses/:analysisId/attachments*` (ou dentro do `AnalysesController`), onde a autorização "ler análise" é natural e não há risco de herdar o gate admin. Requer ajuste de paths no front. Recomendo registrar como follow-up; o fix in-place (Partes 1–4) resolve o incidente já.

### Testes (Jest + e2e)
- tenant lê anexos da própria análise → `200` (com PLATFORM_FEATURE/PUBLIC visíveis).
- tenant baixa zip da própria análise → `200`.
- tenant baixa anexo individual da própria análise (rota nova) → `200`.
- tenant tenta `/attachments/analysis/:id` de análise de **outra** org → `403/404` (via `assertCanReadAnalysis`).
- tenant tenta `/attachments/analysis/:analysisId/:attachmentId/download` com `attachmentId` que **não** pertence ao snapshot → `404 ATTACHMENT_NOT_FOUND`.
- tenant tenta rota admin (`/attachments/datasets`, `/attachments/:id/download` global) → `403 PLATFORM_ADMIN_REQUIRED`.
- platform admin continua acessando tudo.

---

## Não-objetivos / riscos
- **Não** dar a tenant acesso à área administrativa de anexos (mantido).
- **Não** expor farm/anexos de outra org (garantido por `scopeFilterForActor` + `assertCanReadAnalysis`).
- **Não** enfraquecer o `:id/download` global (continua platform-admin).
- Risco baixo: a única mudança de contrato é `by-car` (404→200 null) — consumidor único já compatível.

## Checklist de implementação
- [ ] `farms.service.findByCarKeyForActor` (null em not-found, **400 em ambiguidade**) + `getByCarKeyForActor` delega; `farms.controller` by-car retorna **valor cru** (sem `{ data }`).
- [ ] `AccessService`: estreitar `assertCanReadAnalysis`/`requireSameOrgOrPlatform` para `Pick<ActorContext,'isPlatformAdmin'|'orgId'>`.
- [ ] `AttachmentsController`: `AccessService` **já injetado** (Codex #ajuste — checklist anterior desatualizado); adicionar `resolveAnalysisViewerActor` (sem platform-admin).
- [ ] Rotas `analysis/:id`, `analysis/:id/zip` usam viewer resolver + `assertCanReadAnalysis`.
- [ ] Nova rota `analysis/:analysisId/:attachmentId/download` + `downloadAnalysisAttachmentForActor` no service.
- [ ] Frontend: download individual da análise usa a rota nova; atualizar testes do Vue para esperar `/v1/attachments/analysis/:analysisId/:attachmentId/download`.
- [ ] Testes: incluir cobertura do **envelope real** do `by-car` (não pode produzir `{data:{data}}`); ambiguidade 400.
- [ ] Verificar sidebar oculta aba admin para não-platform-admin (driven por `isPlatformAdmin` de `/v1/access/me`).
