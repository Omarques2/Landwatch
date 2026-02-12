# EPIC-12 Scheduled Analyses + Alerts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar agendamentos de analises (comum e DETER preventiva), execucao diaria automatizada (interim via GitHub Actions) e alertas de nova interseccao exibidos no dashboard.

**Architecture:** O backend ganha um dominio novo de schedules/alerts e estende o fluxo de analise com `analysisKind` (`STANDARD` e `DETER`). A execucao automatica usa endpoint interno protegido por token, chamado por workflow diario do GitHub Actions, enquanto o worker completo (BullMQ) nao entra em producao. O frontend ganha nova aba `Agendamento` no sidebar, fluxo simples de criacao e visualizacao de alertas no dashboard.

**Tech Stack:** NestJS, Prisma/Postgres, Vue 3, GitHub Actions (cron), Vitest/Jest.

---

## Scope v1 (interim, sem worker completo)
- Agendamento por fazenda com frequencia `WEEKLY`, `BIWEEKLY`, `MONTHLY`.
- Dois tipos de execucao: `STANDARD` e `DETER`.
- Execucao diaria de schedules vencidos via endpoint interno.
- Deteccao de novidades por diferenca contra a ultima analise concluida do mesmo tipo.
- Persistencia e exibicao de alertas no dashboard.
- UX amigavel na nova tela de agendamento.

## Out of scope (v1)
- Notificacoes por email/WhatsApp.
- Configuracao por horario customizado por schedule (v1 usa janela diaria).
- Worker BullMQ dedicado para schedules (fica para fase seguinte).

---

### Task 1: Modelagem Prisma para schedules + alerts + tipo de analise

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_epic12_schedules_alerts/migration.sql`
- Test: `apps/api/src/analyses/analyses.service.spec.ts`

**Step 1: Write the failing test**

```ts
it("persists analysis kind for new analyses", async () => {
  // expect analysisKind to exist and default to STANDARD
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/analyses/analyses.service.spec.ts`
Expected: FAIL com campo/enums inexistentes.

**Step 3: Write minimal implementation**
- Adicionar enum `AnalysisKind` em Prisma: `STANDARD`, `DETER`.
- Adicionar `analysisKind` em `Analysis`.
- Criar tabelas:
  - `AnalysisSchedule` (farmId, analysisKind, frequency, nextRunAt, lastRunAt, isActive, timezone, createdByUserId)
  - `AnalysisAlert` (farmId, scheduleId, analysisId, analysisKind, alertType, newIntersectionCount, payload, status)

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/analyses/analyses.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add schedules alerts schema and analysis kind"
```

---

### Task 2: API de agendamento (CRUD simples e amigavel)

**Files:**
- Create: `apps/api/src/schedules/schedules.module.ts`
- Create: `apps/api/src/schedules/schedules.controller.ts`
- Create: `apps/api/src/schedules/schedules.service.ts`
- Create: `apps/api/src/schedules/dto/create-schedule.dto.ts`
- Create: `apps/api/src/schedules/dto/update-schedule.dto.ts`
- Test: `apps/api/src/schedules/schedules.service.spec.ts`

**Step 1: Write the failing test**

```ts
it("creates weekly schedule for STANDARD analysis", async () => {
  // expect nextRunAt calculation and persisted schedule
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/schedules/schedules.service.spec.ts`
Expected: FAIL (module/service missing).

**Step 3: Write minimal implementation**
- Endpoints:
  - `POST /v1/schedules`
  - `GET /v1/schedules`
  - `PATCH /v1/schedules/:id`
  - `POST /v1/schedules/:id/pause`
  - `POST /v1/schedules/:id/resume`
- Validacoes:
  - frequencia obrigatoria (`WEEKLY|BIWEEKLY|MONTHLY`)
  - `analysisKind` obrigatorio (`STANDARD|DETER`)
  - `farmId` obrigatorio

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/schedules/schedules.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/schedules
git commit -m "feat(api): add schedules CRUD endpoints"
```

---

### Task 3: Endpoint interno para execucao diaria de schedules vencidos

**Files:**
- Create: `apps/api/src/schedules/internal-schedules.controller.ts`
- Modify: `apps/api/src/schedules/schedules.service.ts`
- Modify: `apps/api/src/config/config.schema.ts`
- Test: `apps/api/src/schedules/internal-schedules.controller.spec.ts`

**Step 1: Write the failing test**

```ts
it("rejects request without x-job-token", async () => {
  // expect 401/403
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/schedules/internal-schedules.controller.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Endpoint `POST /internal/schedules/run-due`.
- Header obrigatorio `x-job-token`.
- Novo env: `SCHEDULES_JOB_TOKEN`.
- Fluxo:
  - carregar schedules `isActive = true` e `nextRunAt <= now`
  - criar analise por schedule (kind STANDARD/DETER)
  - recalcular `nextRunAt`
  - retornar resumo (`processed`, `created`, `failed`).

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/schedules/internal-schedules.controller.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/schedules apps/api/src/config/config.schema.ts
git commit -m "feat(api): add internal run-due schedules endpoint with job token"
```

---

### Task 4: Suporte real a analise DETER no runner/detail

**Files:**
- Modify: `apps/api/src/analyses/analyses.service.ts`
- Modify: `apps/api/src/analyses/analysis-runner.service.ts`
- Modify: `apps/api/src/analyses/analysis-detail.service.ts`
- Test: `apps/api/src/analyses/analysis-runner.service.spec.ts`
- Test: `apps/api/src/analyses/analysis-detail.service.spec.ts`

**Step 1: Write the failing test**

```ts
it("keeps DETER intersections for DETER analysis kind", async () => {
  // expect DETER rows persisted for kind DETER
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/analyses/analysis-runner.service.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `STANDARD`: comportamento atual (exclui DETER).
- `DETER`: incluir somente DETER + base SICAR quando necessario para mapa.
- Detalhe DETER simplificado:
  - mapa + legenda enxuta
  - sem grupos sociais/documentais/CNPJ.

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/analyses/analysis-runner.service.spec.ts apps/api/src/analyses/analysis-detail.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/analyses
git commit -m "feat(api): support DETER analysis kind with simplified detail"
```

---

### Task 5: Motor de alerta por nova interseccao

**Files:**
- Create: `apps/api/src/alerts/alerts.module.ts`
- Create: `apps/api/src/alerts/alerts.service.ts`
- Create: `apps/api/src/alerts/alerts.controller.ts`
- Modify: `apps/api/src/analyses/analysis-runner.service.ts`
- Test: `apps/api/src/alerts/alerts.service.spec.ts`

**Step 1: Write the failing test**

```ts
it("creates alert when current analysis has new intersections compared to previous run", async () => {
  // expect AnalysisAlert row persisted
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/alerts/alerts.service.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Diferenca por chave (`datasetCode + featureId`).
- Gera alerta so quando houver novidade.
- Alert payload com:
  - `newKeys`
  - `analysisKind`
  - `previousAnalysisId`
  - `currentAnalysisId`

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/alerts/alerts.service.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/alerts apps/api/src/analyses/analysis-runner.service.ts
git commit -m "feat(api): create alerts on new intersections"
```

---

### Task 6: Dashboard com card/lista de alertas

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Create: `apps/api/src/alerts/dto/list-alerts.query.ts`
- Modify: `apps/web/src/views/DashboardView.vue`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Test: `apps/web/src/views/__tests__/DashboardView.test.ts`

**Step 1: Write the failing test**

```ts
it("returns newAlerts count in dashboard summary", async () => {
  // expect counts.newAlerts
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/src/dashboard/dashboard.service.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Backend: incluir `newAlerts` no summary e lista curta de alertas.
- Frontend: card "Alertas novos" + lista "Novidades detectadas" com CTA.

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/api/src/dashboard/dashboard.service.spec.ts apps/web/src/views/__tests__/DashboardView.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/dashboard apps/web/src/views/DashboardView.vue
git commit -m "feat(dashboard): add new alerts indicators and list"
```

---

### Task 7: Web UX da aba Agendamento (sidebar + telas + formulario)

**Files:**
- Modify: `apps/web/src/views/AppShellView.vue`
- Modify: `apps/web/src/router/index.ts`
- Create: `apps/web/src/views/SchedulesView.vue`
- Create: `apps/web/src/views/__tests__/SchedulesView.test.ts`
- Modify: `apps/web/src/components/SidebarNav.vue` (se precisar de badge)

**Step 1: Write the failing test**

```ts
it("shows schedule creation form with analysis type and frequency options", async () => {
  // expect STANDARD/DETER and WEEKLY/BIWEEKLY/MONTHLY controls
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/web/src/views/__tests__/SchedulesView.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Nova rota `/schedules`.
- Novo item no sidebar: `Agendamento`.
- Tela com:
  - lista de agendamentos ativos
  - formulario curto de criacao (fazenda, tipo, frequencia, ativo/inativo)
  - estados vazios/skeleton.

**Step 4: Run test to verify it passes**

Run: `npm run test -- apps/web/src/views/__tests__/SchedulesView.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/views/SchedulesView.vue apps/web/src/router/index.ts apps/web/src/views/AppShellView.vue
git commit -m "feat(web): add schedules sidebar tab and management screen"
```

---

### Task 8: Workflow diario no GitHub Actions (interim scheduler)

**Files:**
- Create: `.github/workflows/cron-run-schedules.yml`
- Modify: `docs/env-validation.md`
- Modify: `docs/status-cards.md`

**Step 1: Write the failing test**
- N/A para YAML de workflow. Criar checklist de validacao manual.

**Step 2: Run validation**

Run: `gh workflow view "Cron - Run Schedules" --yaml` (ou validar sintaxe no PR).
Expected: workflow reconhecido.

**Step 3: Write minimal implementation**
- `cron` diario.
- `workflow_dispatch`.
- chamadas para staging e prod:
  - `POST $API_BASE_URL/internal/schedules/run-due`
  - header `x-job-token: $SCHEDULES_JOB_TOKEN_*`

**Step 4: Verify passes**
- Trigger manual do workflow e validar HTTP 2xx.

**Step 5: Commit**

```bash
git add .github/workflows/cron-run-schedules.yml docs/env-validation.md docs/status-cards.md
git commit -m "chore(ci): add daily schedule runner workflow"
```

---

### Task 9: Testes integrados, docs e hardening final

**Files:**
- Modify: `apps/api/test/full.e2e-spec.ts` (ou novo spec de schedules)
- Modify: `docs/vision.md`
- Modify: `planning.md`

**Step 1: Write the failing test**

```ts
it("runs due schedules and creates alerts only for new intersections", async () => {
  // end-to-end happy path
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- apps/api/test/<schedule-alert-spec>.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Ajustar gaps de integracao.
- Confirmar sem regressao em analise normal.

**Step 4: Run tests to verify all green**

Run:
- `npm run test -- apps/api`
- `npm run test -- apps/web`
- `npm run typecheck --workspace apps/web` (ou equivalente)

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api apps/web docs
git commit -m "feat: deliver scheduled analyses v1 with alerts and daily cron runner"
```

---

## UX acceptance checklist (global)
- Usuario entende claramente a diferenca entre analise `Completa` e `DETER preventiva`.
- Criar agendamento leva no maximo 1 minuto (fluxo curto).
- Tela mostra proxima execucao de forma legivel.
- Dashboard destaca alertas novos sem ruido.
- Estado vazio e erro com linguagem simples (sem mensagem tecnica).

## Operacao acceptance checklist (global)
- Rodada diaria nao duplica execucoes no mesmo dia para mesmo schedule.
- Endpoint interno bloqueia chamadas sem token.
- Logs mostram contagem de due/created/failed por ambiente.
- Falhas em um schedule nao interrompem o lote inteiro.

## Rollout sugerido
1. Staging com apenas `STANDARD`.
2. Habilitar `DETER` em staging.
3. Habilitar cron diario em staging por 3 dias.
4. Promover para prod com `workflow_dispatch`.
5. Ativar cron diario em prod.

