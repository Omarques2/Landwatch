# Fornecedores + Lakehouse Fabric Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Entregar a nova aba `Fornecedores` com indicadores, tabela filtrável, drill-down de GTAs pendentes e edição de CAR integrada ao Microsoft Fabric Lakehouse.

**Architecture:** Criar um módulo `fornecedores` no backend (NestJS) com leitura via SQL analytics endpoint do Lakehouse e escrita via job Spark/Notebook no Fabric (sem DML direto no SQL endpoint). Expor endpoints para summary, listagem filtrável, pendências por fornecedor e atualização de CAR. No frontend (Vue 3), adicionar rota/sidebar e view com cards de KPI, grid estilo “excel filter”, drill-down de GTAs e modal de edição.

**Tech Stack:** NestJS 11, Vue 3 + Vite + Vitest, Axios, Microsoft Fabric REST API, SQL analytics endpoint do Lakehouse, Jest.

---

### Task 1: Planejar contrato e configuração de integração Fabric

**Files:**
- Modify: `planning.md`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/src/config/config.schema.ts`
- Create: `apps/api/src/fornecedores/fabric-lakehouse.config.ts`

**Step 1: Write the failing test**
- Criar teste de validação de config para garantir que modo de escrita `spark_job` exige variáveis obrigatórias.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/config/config.schema.spec.ts`  
Expected: FAIL com ausência das novas chaves.

**Step 3: Write minimal implementation**
- Adicionar env vars de leitura/escrita do Lakehouse.
- Definir defaults seguros e validação fail-fast.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/config/config.schema.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add planning.md apps/api/.env.example apps/api/src/config/config.schema.ts apps/api/src/fornecedores/fabric-lakehouse.config.ts
git commit -m "chore(plan): add fornecedores lakehouse fabric configuration"
```

---

### Task 2: Implementar módulo backend de Fornecedores

**Files:**
- Create: `apps/api/src/fornecedores/fornecedores.module.ts`
- Create: `apps/api/src/fornecedores/fornecedores.controller.ts`
- Create: `apps/api/src/fornecedores/fornecedores.service.ts`
- Create: `apps/api/src/fornecedores/fabric-lakehouse.repository.ts`
- Create: `apps/api/src/fornecedores/fabric-client.service.ts`
- Create: `apps/api/src/fornecedores/dto/list-fornecedores.query.ts`
- Create: `apps/api/src/fornecedores/dto/list-gta-pendencias.query.ts`
- Create: `apps/api/src/fornecedores/dto/update-fornecedor-car.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/fornecedores/fornecedores.service.spec.ts`
- Test: `apps/api/src/fornecedores/fornecedores.controller.spec.ts`

**Step 1: Write the failing test**
- `FornecedoresService` deve:
  - retornar indicadores agregados;
  - listar fornecedores com paginação/filtros;
  - retornar GTAs por fornecedor;
  - validar atualização de CAR.
- `FornecedoresController` deve delegar corretamente para service.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/fornecedores/fornecedores.service.spec.ts src/fornecedores/fornecedores.controller.spec.ts`  
Expected: FAIL porque módulo/serviços ainda não existem.

**Step 3: Write minimal implementation**
- Implementar leitura via SQL endpoint e escrita via Fabric job (`run-on-demand item job`).
- Mapear erros de integração para HTTP codes consistentes.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/fornecedores/fornecedores.service.spec.ts src/fornecedores/fornecedores.controller.spec.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/fornecedores src/app.module.ts
git commit -m "feat(api): add fornecedores endpoints backed by fabric lakehouse"
```

---

### Task 3: Adicionar aba/rota/view de Fornecedores no frontend

**Files:**
- Create: `apps/web/src/views/FornecedoresView.vue`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/views/AppShellView.vue`
- Test: `apps/web/src/views/__tests__/FornecedoresView.test.ts`
- Test: `apps/web/src/views/__tests__/AppShellView.test.ts`

**Step 1: Write the failing test**
- Garantir render de cards/KPIs.
- Garantir filtros por coluna na grid.
- Garantir drill-down de GTAs por fornecedor.
- Garantir abertura de modal por duplo clique e submit de atualização de CAR.
- Garantir item `Fornecedores` no sidebar.

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/views/__tests__/FornecedoresView.test.ts src/views/__tests__/AppShellView.test.ts` (from `apps/web`)  
Expected: FAIL porque rota/view/item ainda não existem.

**Step 3: Write minimal implementation**
- Implementar tela com:
  - indicadores;
  - tabela paginada com filtros por coluna;
  - seção de pendências por fornecedor selecionado;
  - modal de edição de CAR.

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/views/__tests__/FornecedoresView.test.ts src/views/__tests__/AppShellView.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/views/FornecedoresView.vue src/router/index.ts src/views/AppShellView.vue src/views/__tests__/FornecedoresView.test.ts src/views/__tests__/AppShellView.test.ts
git commit -m "feat(web): add fornecedores tab with KPIs filters drill-down and car modal"
```

---

### Task 4: Validação integrada + documentação operacional

**Files:**
- Create: `docs/fabric-lakehouse-fornecedores.md`
- Modify: `planning.md`

**Step 1: Write validation checklist**
- Checklist de credenciais, permissões, conectividade SQL endpoint e job de escrita.

**Step 2: Run checks**

Run: `npm run test` (apps/api e apps/web)  
Expected: PASS nas suites alteradas.

**Step 3: Write minimal documentation**
- Documentar:
  - fluxo de leitura (SQL endpoint);
  - fluxo de escrita (Spark job);
  - limitações conhecidas (latência de sync do SQL endpoint).

**Step 4: Verify docs consistency**
- Conferir se env vars e endpoints batem com implementação.

**Step 5: Commit**

```bash
git add docs/fabric-lakehouse-fornecedores.md planning.md
git commit -m "docs: add fornecedores fabric lakehouse integration guide"
```
