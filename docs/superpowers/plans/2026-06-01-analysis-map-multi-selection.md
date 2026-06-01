# Analysis Map Multi-Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecionar até 20 feições temáticas no mapa de análise com `Ctrl`/`Meta` + clique e encaminhar conjunto para Anexos.

**Architecture:** Helpers puros controlam coleção, filtro MapLibre e query repetida. Componentes Vue integram gestos, toast, menu direito e hidratação da rota sem alterar API ou MVT.

**Tech Stack:** Vue 3, TypeScript, MapLibre GL, Vue Router, Vitest.

---

### Task 1: Helpers de seleção e query

**Files:**
- Modify: `apps/web/src/features/analyses/analysis-vector-map.ts`
- Test: `apps/web/src/features/analyses/analysis-vector-map.spec.ts`
- Modify: `apps/web/src/features/attachments/types.ts`
- Modify: `apps/web/src/features/attachments/query-state.ts`
- Test: `apps/web/src/features/attachments/query-state.spec.ts`

- [ ] Escrever testes falhos para substituição, toggle, limite, filtro e `target` repetido.
- [ ] Rodar testes focados e confirmar falha esperada.
- [ ] Implementar helpers mínimos.
- [ ] Rodar testes focados e confirmar sucesso.

### Task 2: Integração Vue

**Files:**
- Modify: `apps/web/src/components/maps/AnalysisVectorMap.vue`
- Modify: `apps/web/src/views/AnalysisDetailView.vue`
- Test: `apps/web/src/views/__tests__/AnalysisDetailView.test.ts`
- Modify: `apps/web/src/views/AttachmentsView.vue`
- Test: `apps/web/src/views/__tests__/AttachmentsView.test.ts`

- [ ] Escrever testes falhos para rota múltipla e hidratação de Anexos.
- [ ] Rodar testes focados e confirmar falha esperada.
- [ ] Integrar coleção, modificadores, toast e rota.
- [ ] Rodar testes focados e confirmar sucesso.

### Task 3: Verificação

- [ ] Rodar testes web focados.
- [ ] Rodar `npm run typecheck`.
- [ ] Rodar suíte web.
- [ ] Rodar `npm run build`.
- [ ] Rodar `git diff --check` somente leitura.
