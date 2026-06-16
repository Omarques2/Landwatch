# Performance / Loading UX — Implementation Plan (3 correções)

> Origem: investigação de performance (3 agentes, read-only) sobre a tela branca no boot e a
> sensação de "travado" em cada troca de rota. Este plano detalha as **3 correções** que atacam
> as 3 causas-raiz, no padrão task-by-task com snippets aterrados no código atual, testes e verificação.

**Goal:** Tornar o boot e as navegações quase instantâneos (sensação de SPA): trocar a tela branca por shell com skeleton em < 1s, reduzir o bundle de entrada de 1,83 MB para uma fração, e eliminar o trabalho redundante (front + backend) que trava cada rota.

**Architecture:**
- **Correção 1 (bundle):** code splitting por rota + lazy das libs de mapa + remoção do Leaflet eager do boot + `manualChunks`. Sem mudança de comportamento, só de empacotamento.
- **Correção 2 (boot não-bloqueante):** o `<router-view>` deixa de ficar em branco — App.vue mostra um skeleton até `router.isReady()`; o guard paraleliza o waterfall de identidade e usa 1 tentativa rápida no boot (retries em background).
- **Correção 3 (trabalho redundante por rota):** front para de refazer `/me`+`/access/me` no AppShell e não bloqueia no mv-status; backend para de fazer ~7 idas sequenciais ao banco por request (write por request removido, ator/feature cacheados com TTL curto + invalidação, e índices compostos).

**Tech Stack:** Vue 3 + Vite + vue-router, TypeScript; NestJS + Prisma + PostgreSQL (Azure remoto, alto RTT); Vitest (web) / Jest (api).

**Non-goals / constraints:**
- Não alterar regras de autorização/segurança (RBAC org já implementado). Cache de authz **só** com TTL curto + invalidação explícita; o default seguro é memoização por-request (zero staleness).
- Não reescrever telas; mudanças são de empacotamento, ordem de carregamento e caching.
- Sem acesso ao Postgres remoto aqui — migration de índice validada por `migrate status`/clone, não contra staging.

---

## Plan Review Corrections — 2026-06-16 (revisão Codex, verificada no código)

> Veredito: **Correções 1, 2.1, 3A, 3B.1, 3B.2, 3B.3 e índices são GO**. As partes de **retry rápido + cache cross-request de authz** foram **revisadas** porque, como estavam, criavam regressão de login/permissão. Mudanças obrigatórias abaixo — todas confirmadas lendo o código:

1. **NÃO reduzir retries no boot (Task 2.3 reescrita).** `getMeCached` ([me.ts:120-131](../../../apps/web/src/auth/me.ts#L120-L131)) retorna `null` tanto em `401/403` (identidade inválida) quanto em **erro transitório no cold boot** (sem cache anterior → `fallback = null`). O guard trata `null` como `/pending` ([auth-guard.ts:43](../../../apps/web/src/router/auth-guard.ts#L43)). "1 tentativa rápida" **aumentaria** o bounce de usuário ativo para `/pending`/login em rede lenta. Correção: **manter os retries** (o skeleton da 2.1 cobre a espera) e **discriminar estados** (`ok | unauthorized | inactive | transient`); o guard só redireciona em `unauthorized/inactive`; em `transient` mantém skeleton/retry.
2. **`getAccessCached` precisa ser chaveado por org (nova Task 2.4).** `accessCache` é **global** ([me.ts:56](../../../apps/web/src/auth/me.ts#L56)) e `/v1/access/me` depende de `X-Org-Id`. Subir o TTL para 30–60s sem chavear por org devolveria features da org errada após troca de org/perfil. TTL de `me` (independente de org) pode subir; o de `access` só depois de chavear por `activeOrgId`.
3. **Paralelizar me+access exige token single-flight (Task 2.2 ajustada).** Ambos chamam `acquireApiToken`, que **não é single-flight** ([auth.ts:88-90](../../../apps/web/src/auth/auth.ts#L88-L90)) — em cold boot dispararia dois `exchangeSession()` em paralelo. Correção: envolver `acquireApiToken` em single-flight (ou adquirir o token uma vez antes das duas chamadas).
4. **Invalidação de cache authz incompleta (Task 3B.4 expandida).** Além de `addMembership/removeMembership/updateUserStatus`, existe `updateMembership` ([admin.service.ts:324](../../../apps/api/src/admin/admin.service.ts#L324)) — trocar role para owner/admin em org PLATFORM muda `isPlatformAdmin`. Invalidar também em `updateMembership`, `updateOrg`, `updateOrgFeatures`. **Cuidado:** admin recebe `userId`, não `subject` → cache por subject exige mapear `userId→identityUserId/entraSub` (ou cachear também por `userId`).
5. **Cache cross-request de authz é OPCIONAL e fica para depois (Task 3B.4 rebaixada).** Entregar e **medir** primeiro: 3B.1 (write condicional), 3B.2 (memo por-request, zero staleness), 3B.3 (menos queries) e índices. Só então avaliar 3B.4 — `user.status`/PLATFORM-admin/membership são sensíveis demais para TTL às cegas.

**Pontos menores corrigidos:** `Farm`/`AnalysisSchedule` já têm índice simples de `orgId` (composto ainda ajuda o ORDER BY; só `Analysis` não tem nenhum); `defineAsyncComponent` em `NewAnalysisView` precisa preservar o ref tipado de `CarSelectMap` por causa de `exportPng` ([NewAnalysisView.vue:348,964](../../../apps/web/src/views/NewAnalysisView.vue#L348)); não bloquear no mv-status exige **gatear o botão "Nova análise"** até o 1º status chegar (`mvBusy` começa `false`).

## Diagnóstico (resumo das causas)

1. **Bundle único 1,83 MB** (≈519 KB gzip) com `maplibre-gl`+`leaflet`+`pmtiles`, sem code splitting — baixa/parseia tudo antes de qualquer pixel. Evidência: `dist/assets/index-*.js` = 1 chunk.
2. **Guard do router bloqueia o 1º paint** num waterfall serial (`refresh → /users/me → /access/me`, cada um com até 3 retries) e o `<router-view>` fica **em branco** ([App.vue:1-7](../../../apps/web/src/App.vue), [auth-guard.ts:41-52](../../../apps/web/src/router/auth-guard.ts)).
3. **Trabalho redundante por rota:** AppShell refaz `/me`+`/access/me` com `force=true` e `await` no mv-status ([AppShellView.vue:237-286](../../../apps/web/src/views/AppShellView.vue)); backend faz **~7 round-trips sequenciais** + 1 write por request antes do handler ([active-user.guard.ts](../../../apps/api/src/auth/active-user.guard.ts), [actor-context.service.ts:78-236](../../../apps/api/src/auth/actor-context.service.ts), [access.service.ts:34-37](../../../apps/api/src/auth/access.service.ts)).

## File Structure

**Correção 1 (frontend build):**
- Modify: `apps/web/src/router/index.ts` — rotas lazy (`() => import()`).
- Modify: `apps/web/src/main.ts` — remover Leaflet eager.
- Create: `apps/web/src/lib/leaflet-setup.ts` (ou mover para o componente que usa Leaflet) — init sob demanda.
- Modify: `apps/web/src/components/maps/AnalysisMap.vue` — init Leaflet local.
- Modify: `apps/web/src/views/{NewAnalysisView,AnalysisDetailView,AnalysisPublicView,FarmDetailView}.vue` e `features/attachments/components/AttachmentsExploreWorkspace.vue` — `defineAsyncComponent` para os mapas.
- Modify: `apps/web/vite.config.ts` — `build.rollupOptions.manualChunks`.

**Correção 2 (boot não-bloqueante):**
- Modify: `apps/web/src/App.vue` — skeleton até `router.isReady()` + barra de progresso por navegação.
- Modify: `apps/web/src/router/auth-guard.ts` — paralelizar `enforceAccess`.
- Modify: `apps/web/src/auth/me.ts` — TTL maior + retry "rápido no boot".
- Modify: `apps/web/src/router/__tests__/auth-guard.test.ts` — cobrir paralelização/fallback.

**Correção 3 (redundância front+back):**
- Modify: `apps/web/src/views/AppShellView.vue` — usar cache + não `await` mv-status.
- Modify: `apps/api/src/users/users.service.ts` — update condicional (sem write por request).
- Modify: `apps/api/src/auth/actor-context.service.ts` — memoização por-request + cache TTL opcional.
- Modify: `apps/api/src/auth/access.service.ts` — feature lookup via cache.
- Modify: `apps/api/src/admin/admin.service.ts` — invalidar cache em mutações (features/membership/status).
- Create: `apps/api/prisma/migrations/<ts>_perf_org_created_at_indexes/migration.sql` — índices compostos.
- Modify: `apps/api/prisma/schema.prisma` — `@@index([orgId, createdAt])` em Analysis/Farm/AnalysisSchedule.
- Specs correspondentes.

---

## Ordem de execução e dependências (revisada)
1. **Correção 1** (bundle) — independente, baixo risco, maior ganho percebido. Pode ir sozinha. **GO.**
2. **Correção 2.1** (skeleton) — independente; entrega o ganho de "não-branco" mesmo sem 2.2/2.3. **GO.**
3. **Correção 3A** (AppShell cache + não-await mv-status + gate do botão) — trivial, independente. **GO.**
4. **Correção 2.2/2.3/2.4** (guard) — **nesta ordem interna**: 2.2 single-flight do token → 2.3 discriminar transient (não cortar retries) → 2.4 accessCache por org → só então subir TTL de access. Mais delicado; testar bastante.
5. **Correção 3B.1 → 3B.2 → 3B.3 → índices (3B.5)** — backend, independente do front. **GO.**
6. **Correção 3B.4** (cache cross-request authz) — **DEFERIDO**: implementar só após medir 4/5 e confirmar que ainda há necessidade.

Cada correção é entregável isolado e reversível. Os GO podem ir já; o grupo 4 e o 3B.4 exigem o cuidado descrito nas Plan Review Corrections.

---

# Correção 1 — Code splitting / bundle (resolve a tela branca)

**Meta:** entry chunk de 1,83 MB → alvo **< 300 KB gzip**; maplibre/leaflet/pmtiles fora de toda rota que não é mapa.

### Task 1.1 — Lazy-load das rotas
**Files:** `apps/web/src/router/index.ts`

- [ ] **Passo 1:** Trocar os imports estáticos das views por dynamic imports nos `component:`. Remover os `import XView from ...` (linhas 6-21) e usar:

```ts
// router/index.ts — exemplo (aplicar a todas as rotas com `component:`)
{ path: "/login", component: () => import("../views/LoginView.vue") },
{ path: "/auth/callback", component: () => import("../views/CallbackView.vue") },
{
  path: "/",
  component: () => import("../views/AppShellView.vue"),
  meta: { requiresAuth: true },
  children: [
    { path: "", redirect: "/analyses/new" },
    { path: "dashboard", component: () => import("../views/DashboardView.vue"), meta: { title: "Dashboard", platformOnly: true } },
    { path: "farms", component: () => import("../views/FarmsView.vue"), meta: { title: "Fazendas", feature: "FARMS" } },
    // ...idem para FarmDetailView, AnalysesView, NewAnalysisView, AnalysisDetailView,
    //    SchedulesView, AttachmentsView, AdminView, FornecedoresView, AccessDeniedView, PendingView
  ],
},
{ path: "/analyses/:id/public", component: () => import("../views/AnalysisPublicView.vue"), meta: { requiresAuth: false, title: "Análise pública" } },
```

> Manter a chamada `router.beforeEach(createAuthNavigationGuard({...}))` (linhas 106-114) intacta — só os `component` mudam. As entradas `redirect` não têm `component`.

- [ ] **Passo 2:** Confirmar que nenhum outro arquivo importa essas views diretamente (a não ser testes):
```bash
rg -n "from \"../views/|from \"@/views/" apps/web/src --glob '!**/__tests__/**'
```
Esperado: só `router/index.ts` (agora via `import()`). Testes que montam views diretamente continuam importando — ok.

### Task 1.2 — Adiar libs de mapa (maplibre-gl/pmtiles) para as rotas de mapa
**Files:** `NewAnalysisView.vue`, `AnalysisDetailView.vue`, `AnalysisPublicView.vue`, `FarmDetailView.vue`, `features/attachments/components/AttachmentsExploreWorkspace.vue`

- [ ] **Passo 1:** Onde o componente de mapa é importado estaticamente (ex.: `NewAnalysisView.vue:286` importa `CarSelectMap`), trocar por `defineAsyncComponent` com fallback de skeleton:

```ts
import { defineAsyncComponent } from "vue";
const CarSelectMap = defineAsyncComponent({
  loader: () => import("@/components/maps/CarSelectMap.vue"),
  // opcional: loadingComponent: MapSkeleton, delay: 0,
});
```

Aplicar análogo a `AnalysisVectorMap`, `AttachmentsVectorMap`, `AnalysisMap` nos respectivos pais. Como já vêm via rota lazy (Task 1.1), o `defineAsyncComponent` garante que a lib pesada só baixa quando o mapa entra em tela (não no `import()` da view).

- [ ] **Passo 1b (preservar ref tipado — CORREÇÃO):** `NewAnalysisView` mantém `searchMapRef = ref<InstanceType<typeof CarSelectMap>>` ([:348](../../../apps/web/src/views/NewAnalysisView.vue#L348)) e chama `searchMapRef.value?.exportPng(...)` ([:964](../../../apps/web/src/views/NewAnalysisView.vue#L964)). Com `defineAsyncComponent`, `typeof CarSelectMap` passa a ser o wrapper async e `InstanceType<...>` não resolve os métodos expostos por `defineExpose`. Tipar o ref contra o **componente real** via import de tipo separado:
```ts
import { defineAsyncComponent } from "vue";
import type CarSelectMapType from "@/components/maps/CarSelectMap.vue"; // só tipo
const CarSelectMap = defineAsyncComponent(() => import("@/components/maps/CarSelectMap.vue"));
const searchMapRef = ref<InstanceType<typeof CarSelectMapType> | null>(null);
```
O `?.` já protege contra null enquanto o chunk carrega; o botão de export deve ficar desabilitado até o mapa montar.

- [ ] **Passo 2:** Verificar que `maplibre-gl`/`pmtiles` não são importados em nível de módulo por nenhum arquivo do shell/boot:
```bash
rg -n "from ['\"]maplibre-gl|from ['\"]pmtiles|from ['\"]leaflet" apps/web/src
```
Esperado: só dentro de `components/maps/*` (carregados sob demanda).

### Task 1.3 — Remover Leaflet eager do boot
**Files:** `apps/web/src/main.ts`, `apps/web/src/components/maps/AnalysisMap.vue` (consumidor real do Leaflet)

- [ ] **Passo 1:** Remover de `main.ts` (linhas 5-8) o `import "leaflet/dist/leaflet.css"` e a chamada `setupLeafletDefaultIcons()`. `main.ts` deve ficar:
```ts
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";

const app = createApp(App);
app.use(router);
app.mount("#app");
```
- [ ] **Passo 2:** Em `AnalysisMap.vue` (único consumidor do Leaflet), importar o CSS e chamar `setupLeafletDefaultIcons()` no `onMounted`/setup do componente (idempotente — proteger com flag de "já inicializado" no `leaflet-icons.ts`).

### Task 1.4 — `manualChunks` no Vite
**Files:** `apps/web/vite.config.ts`

- [ ] **Passo 1:** Adicionar `build.rollupOptions.manualChunks` separando vendors pesados (cacheáveis entre deploys de código de app):
```ts
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl", "pmtiles"],
          leaflet: ["leaflet"],
          ui: ["radix-vue"],
          http: ["axios"],
        },
      },
    },
  },
  server: { /* inalterado */ },
});
```

### Verificação Correção 1
- [ ] `npm --prefix apps/web run build` e inspecionar `dist/assets/`: deve haver **vários** chunks; o `index-*.js` (entry) **não** deve conter maplibre/leaflet:
```bash
ls -la apps/web/dist/assets/*.js
# entry não deve casar com 'maplibre'/'leaflet':
grep -l "maplibre" apps/web/dist/assets/*.js   # deve apontar só p/ chunk de mapa, não o entry
```
- [ ] `npm --prefix apps/web test` (vitest) — testes de views/router continuam passando (imports lazy não quebram montagem direta nos testes).
- [ ] Smoke manual: `/login` e `/dashboard` carregam sem baixar o chunk de mapa (aba Network).

---

# Correção 2 — Boot não-bloqueante + skeleton (a tela branca vira shell instantâneo)

**Meta:** primeiro paint mostra skeleton em < 1s mesmo com auth pendente; waterfall do guard paralelizado; retries não seguram o boot.

### Task 2.1 — Skeleton de app até `router.isReady()`
**Files:** `apps/web/src/App.vue`

- [ ] **Passo 1:** Hoje o `<router-view>` fica vazio enquanto o 1º `beforeEach` resolve. Introduzir um estado de boot que mostra um skeleton de shell até a 1ª navegação resolver, e uma barra de progresso nas navegações seguintes:

```vue
<template>
  <AppBootSkeleton v-if="booting" />
  <template v-else>
    <RouteProgressBar v-if="navigating" />
    <router-view v-slot="{ Component }">
      <Transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
  </template>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AppBootSkeleton from "@/components/AppBootSkeleton.vue";
import RouteProgressBar from "@/components/RouteProgressBar.vue";

const router = useRouter();
const booting = ref(true);
const navigating = ref(false);

// 1º paint imediato (skeleton). Quando a 1ª navegação/guard resolve, troca pelo conteúdo.
router.isReady().finally(() => { booting.value = false; });
router.beforeEach(() => { navigating.value = true; });
router.afterEach(() => { navigating.value = false; });
router.onError(() => { navigating.value = false; });
</script>
```

- [ ] **Passo 2:** Criar `AppBootSkeleton.vue` (layout do shell: sidebar + topo + área com blocos cinza animados) e `RouteProgressBar.vue` (barra fina no topo, estilo NProgress, CSS puro). Sem libs novas.

> Importante: `app.mount()` continua síncrono em `main.ts` (não bloquear no `router.isReady()`); o skeleton é a primeira coisa pintada.

### Task 2.2 — Paralelizar o waterfall do guard (com token single-flight)
**Files:** `apps/web/src/auth/auth.ts`, `apps/web/src/router/auth-guard.ts`

- [ ] **Passo 0 (PRÉ-REQUISITO — CORREÇÃO):** `getMeCached` e `getAccessCached` chamam `acquireApiToken`, que **não é single-flight** ([auth.ts:85-109](../../../apps/web/src/auth/auth.ts#L85-L109)). Paralelizar sem isso dispara **dois `exchangeSession()`/refresh concorrentes** no cold boot (risco de corrida no refresh token). Envolver a aquisição de token em single-flight para concorrentes compartilharem a mesma promessa:
```ts
// auth.ts — single-flight do bootstrap de token
let tokenInflight: Promise<string> | null = null;
export async function acquireApiToken(options: AcquireApiTokenOptions = {}): Promise<string> {
  if (options.forceRefresh) return acquireApiTokenInner(options); // refresh explícito não dedupa
  if (tokenInflight) return tokenInflight;
  tokenInflight = acquireApiTokenInner(options).finally(() => { tokenInflight = null; });
  return tokenInflight;
}
// renomear o corpo atual para acquireApiTokenInner
```
> Alternativa mais simples e igualmente segura: no guard, `await acquireApiToken()` **uma vez** antes de disparar `Promise.all([getMeCached, getAccessCached])`.

- [ ] **Passo 1:** Em `enforceAccess` (linhas 41-52), `me` e `access` são independentes dado um token. Buscar em paralelo, mantendo o fallback `getAccessStatus` só quando `getMeCached` retorna null:

```ts
async function enforceAccess(to: RouteLocationNormalized) {
  const [mePrimary, access] = await Promise.all([
    deps.getMeCached(false),
    deps.getAccessCached(false),
  ]);
  const me = mePrimary ?? (await deps.getAccessStatus());
  if (!me) return "/pending";
  if (!canAccessApp(me)) return "/pending";
  hydrateActiveOrgFromMemberships((me as any).memberships);
  if (!canAccessRoute(to, access)) {
    if (to.path !== "/analyses/new") return "/analyses/new";
    return "/403";
  }
  return true;
}
```

> Observação: hoje `access` só era buscado depois de `me` validar. A mudança busca os dois juntos; no caso (raro) de `me` inválido, o `access` extra é descartado — custo desprezível e elimina 1 RTT serial no caminho feliz (99% dos casos).

### Task 2.3 — Discriminar `transient` vs `unauthorized` (NÃO reduzir retries) — REESCRITA
**Files:** `apps/web/src/auth/me.ts`, `apps/web/src/router/auth-guard.ts`

> **CORREÇÃO (Codex #1):** a ideia original de "1 tentativa rápida no boot" é perigosa. `getMeCached` hoje devolve `null` tanto em `401/403` quanto em **transitório no cold boot** (`fallback=null`, [me.ts:120-131](../../../apps/web/src/auth/me.ts#L120-L131)), e o guard manda `null → /pending`. Cortar retries aumentaria o bounce de usuário ativo. O custo de esperar já foi resolvido pelo **skeleton (Task 2.1)** — não precisamos cortar retries; precisamos **não redirecionar em transitório**.

- [ ] **Passo 1:** Expor um resultado discriminado para o guard, sem quebrar os callers atuais de `getMeCached` (que continuam recebendo `MeResponse | null`). Adicionar uma função `getMeResult()` (ou um estado `lastMeOutcome`) que classifica:
```ts
export type MeOutcome =
  | { kind: "ok"; me: MeResponse }
  | { kind: "inactive"; me: MeResponse }   // status pending/disabled
  | { kind: "unauthorized" }                // 401/403
  | { kind: "transient" };                  // rede/5xx/timeout após retries
```
No `catch` de `getMeCached`/`getAccessCached` ([me.ts:120-134](../../../apps/web/src/auth/me.ts#L120-L134)) já há a distinção `401/403` vs fallback — reusar para marcar `unauthorized` vs `transient`.

- [ ] **Passo 2:** No guard (`enforceAccess`), redirecionar **apenas** em `unauthorized`/`inactive`. Em `transient`, **não** mandar para `/pending`/`/login`: retornar para a rota atual mantendo o skeleton, e disparar um retry em background (o `App.vue` continua no skeleton até resolver, ou mostra um aviso de "reconectando"). Só cair em `/login` quando a sessão realmente é `unauthorized`.
```ts
const meOut = await deps.getMeResult();
if (meOut.kind === "unauthorized") return `/login?returnTo=...`;
if (meOut.kind === "inactive") return "/pending";
if (meOut.kind === "transient") return true; // mantém skeleton; retry em background, NÃO bounce
// kind === "ok": segue com canAccessRoute(...)
```

- [ ] **Passo 3:** TTL do cache de **`me`** (independente de org) pode subir de 5s → 30–60s ([me.ts:59](../../../apps/web/src/auth/me.ts#L59)). **NÃO** subir o TTL de `access` aqui — depende da Task 2.4 (chavear por org) primeiro.

- [ ] **Passo 4 (ler antes):** confirmar a config de retry/timeout:
```bash
rg -n "attempts|baseDelayMs|maxDelayMs|TTL_MS|5_000" apps/web/src/auth/me.ts apps/web/src/auth/resilience.ts
```

### Task 2.4 — `getAccessCached` chaveado por org (pré-requisito p/ TTL maior)
**Files:** `apps/web/src/auth/me.ts`

> **CORREÇÃO (Codex #2):** `accessCache` é um único objeto global ([me.ts:56](../../../apps/web/src/auth/me.ts#L56)), mas `/v1/access/me` varia por `X-Org-Id`. Sem chavear por org, subir o TTL devolve features/role da org errada após troca de org/perfil.

- [ ] **Passo 1:** Trocar `accessCache` por um `Map<string, AccessCacheState>` chaveado pelo org ativo:
```ts
const accessCacheByOrg = new Map<string, AccessCacheState>();
function accessKey() { return getActiveOrgId() ?? "__no_org__"; }
```
`getAccessCached` lê/grava em `accessCacheByOrg.get(accessKey())`; o `inflight`/TTL passam a ser por-org. `clearMeCache()` limpa o Map inteiro.
- [ ] **Passo 2:** Só **depois** desta task, subir o TTL de `access` para 30–60s. `setActiveOrgId`/troca de perfil já chamam `clearMeCache()` ([AppShellView.vue:277](../../../apps/web/src/views/AppShellView.vue#L277)); garantir que **qualquer** troca de org ativa invalide/seleciona a chave correta.
- [ ] **Passo 3:** Teste: com org A em cache, trocar para org B retorna features de B (não de A) mesmo dentro do TTL.

### Verificação Correção 2
- [ ] `apps/web/src/router/__tests__/auth-guard.test.ts`: adicionar casos — (a) caminho feliz chama `getMeCached` e `getAccessCached` em paralelo (mock resolve ambos, navegação `true`); (b) `getMeCached` null → usa `getAccessStatus` → `/pending` se sem status; (c) sem `access` da feature → redireciona `/analyses/new`/`/403`.
- [ ] Smoke: cold load mostra o skeleton imediatamente (não tela branca) e troca para o conteúdo quando auth resolve; com backend lento, continua mostrando skeleton (não trava em branco).
- [ ] `npm --prefix apps/web test`.

---

# Correção 3 — Eliminar trabalho redundante por rota (front + backend)

## 3A — Frontend: AppShell para de refazer o que o guard já fez

### Task 3A.1 — Usar cache e não bloquear no mv-status
**Files:** `apps/web/src/views/AppShellView.vue`

- [ ] **Passo 1:** `loadMe` (linhas 237-249) usa `getMeCached(true)`/`getAccessCached(true)` (`force=true`), refazendo `/me`+`/access/me` que o guard acabou de buscar. Trocar para `false` (aproveita o cache; com o TTL maior da Task 2.3, é hit):
```ts
async function loadMe() {
  meLoading.value = true;
  try {
    me.value = await getMeCached(false);
    hydrateActiveOrgFromMemberships(me.value?.memberships as any);
    access.value = await getAccessCached(false);
  } catch {
    me.value = null;
    access.value = null;
  } finally {
    meLoading.value = false;
  }
}
```
- [ ] **Passo 2:** `onMounted` (linhas 282-286) não deve `await` o mv-status (deixa a sidebar interativa imediatamente; o status chega assíncrono):
```ts
onMounted(async () => {
  await loadMe();
  void fetchLandwatchStatus(); // sem await — não bloqueia o shell
  startLandwatchStatusPolling();
});
```
> `switchDevProfile` continua chamando `clearMeCache()` (linha 277) — troca de perfil força refetch, correto.

- [ ] **Passo 3 (CORREÇÃO — gatear "Nova análise"):** `mvBusy` começa `false` ([AppShellView.vue:142](../../../apps/web/src/views/AppShellView.vue#L142)) e `goNewAnalysis`/`disable-new-analysis` usam `mvBusy || !canCreateAnalysis` ([:22,45,269](../../../apps/web/src/views/AppShellView.vue#L269)). Sem `await` no status, há uma janela em que o botão fica habilitado antes de sabermos se a MV está atualizando. O backend já rejeita via `assertNotRefreshing` (seguro), mas para o UX: gatear o botão também por um flag `mvStatusResolved` (do composable de status, `false` até o 1º `fetchLandwatchStatus` resolver): `:disable-new-analysis="!mvStatusResolved || mvBusy || !canCreateAnalysis"`. Assim o shell aparece na hora, mas o botão só libera quando o status chega (ms depois).

## 3B — Backend: cortar os ~7 round-trips por request

> **Segurança primeiro:** caching de authz é onde bugs nascem. Default seguro = **memoização por-request** (zero staleness). O cache cross-request (TTL) é **opt-in**, com TTL curto **e invalidação explícita** nas mutações admin. As duas camadas abaixo são separáveis.

### Task 3B.1 — Parar o write por request em `upsertFromClaims`
**Files:** `apps/api/src/users/users.service.ts`

- [ ] **Passo 1 (ler antes):** confirmar o fluxo atual:
```bash
rg -n "upsertFromClaims|user.update|touchLastLoginAt|email" apps/api/src/users/users.service.ts
```
- [ ] **Passo 2:** Só emitir `user.update` quando algo **mudou** (email diferente, ou `lastLoginAt` fora de uma janela, ex.: > 1h). Caso contrário, retornar o usuário lido sem escrever. Remove um `UPDATE`+lock de toda request autenticada.

### Task 3B.2 — Memoização do ActorContext por-request (seguro, sem staleness)
**Files:** `apps/api/src/auth/actor-context.service.ts`, `apps/api/src/auth/authed-request.type.ts`

- [ ] **Passo 1:** Estender `AuthedRequest` com um slot de cache:
```ts
// authed-request.type.ts
export type AuthedRequest = Request & {
  user?: Claims;
  apiKey?: ApiKeyPrincipal;
  __actorCache?: Map<string, import('./actor-context.service').ActorContext>;
};
```
- [ ] **Passo 2:** Em `fromRequest`, memoizar por `(orgMode, orgId)` dentro do MESMO request (vários guards/controllers/serviços que resolvem o ator no mesmo request param de repetir as queries):
```ts
async fromRequest(req: AuthedRequest, options: { orgMode: OrgMode }): Promise<ActorContext> {
  const subject = req.user?.sub ? String(req.user.sub) : null;
  if (!subject) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Missing user claims' });
  const orgId = this.normalizeHeader(req.headers['x-org-id']);
  const key = `${options.orgMode}:${orgId ?? ''}`;
  const cache = (req.__actorCache ??= new Map());
  const hit = cache.get(key);
  if (hit) return hit;
  const actor = await this.fromSubject(subject, { ...options, orgId });
  cache.set(key, actor);
  return actor;
}
```
> Zero risco de staleness (vive só durante o request). Ganho: elimina re-resolução quando um endpoint chama `fromRequest` mais de uma vez (ou guard + controller).

### Task 3B.3 — Colapsar `fromSubject` em menos queries
**Files:** `apps/api/src/auth/actor-context.service.ts`

- [ ] **Passo 1:** As 4 queries seriais (`resolveUser`, `platformMembership`, `org.findUnique`, `orgMembership.findUnique`) podem virar **1–2**: um `user.findFirst` com `include` das memberships relevantes (PLATFORM + a org solicitada) e do org. Reescrever `fromSubject` para um único `findFirst` e derivar `isPlatformAdmin`/`orgRole` em memória. Reduz 4 RTT → 1 no caminho tenant.
- [ ] **Passo 2:** Cobrir com `actor-context.service.spec.ts` (env admin, membership PLATFORM, tenant membership, deny PLATFORM org) — os casos atuais devem continuar verdes.

### Task 3B.4 — Cache TTL curto + invalidação (DEFERIDO — só após medir 3B.1–3B.3)
**Files:** `apps/api/src/auth/actor-context.service.ts`, `apps/api/src/auth/access.service.ts`, `apps/api/src/admin/admin.service.ts`, `apps/api/docs/authz-matrix.md`

> **CORREÇÃO (Codex #5):** **NÃO** implementar junto com o resto. Entregar 3B.1 (write condicional) + 3B.2 (memo por-request, zero staleness) + 3B.3 (menos queries) + índices, **medir** o ganho, e só então decidir se 3B.4 é necessário. `user.status`/PLATFORM-admin/membership são sensíveis demais para TTL às cegas; muito provavelmente 3B.1–3B.3 já resolvem sem qualquer staleness.

Se for adiante depois da medição:
- [ ] **Passo 1:** Cache em memória (Map com TTL ex.: **30s**) para `(orgId) → Set<AppFeature enabled>` (o caso menos sensível, usado por `requireTenantFeature`). Considerar **não** cachear `user.status`/membership cross-request (manter no banco / memo por-request).
- [ ] **Passo 2 (invalidação — COMPLETA, Codex #4):** invalidar nas mutações admin. Lista verificada no código:
  - `updateOrgFeatures` → invalidar features da org.
  - `addMembership` ([admin.service.ts](../../../apps/api/src/admin/admin.service.ts)), **`updateMembership`** ([:324](../../../apps/api/src/admin/admin.service.ts#L324)), `removeMembership` → invalidar org/usuário (troca de role muda `isPlatformAdmin` se a org é PLATFORM).
  - `updateUserStatus` → invalidar usuário.
  - `updateOrg` (status/kind) → invalidar org.
- [ ] **Passo 3 (ressalva chave — Codex #4):** os métodos admin recebem **`userId`**, não `subject`. Se o cache for por `subject` (`identityUserId`/`entraSub`), a invalidação por `userId` exige buscar os subjects do usuário **ou** o cache deve ser chaveado/indexado também por `userId`. Definir isto antes de implementar, senão a invalidação não acerta a chave.
- [ ] **Passo 4:** Documentar em `authz-matrix.md` o TTL e as invalidações; TTL curto é a rede de segurança caso uma invalidação falhe.

### Task 3B.5 — Índices compostos `(orgId, createdAt desc)`
**Files:** `apps/api/prisma/schema.prisma`, nova migration

- [ ] **Passo 1:** Adicionar no schema (CORREÇÃO — estado atual verificado):
  - `Analysis`: `@@index([orgId, createdAt(sort: Desc)])` — **prioridade alta: hoje não há índice de `orgId` algum**, então o filtro `orgId=?` + ORDER BY `createdAt desc` faz scan+sort.
  - `Farm`: `@@index([orgId, createdAt(sort: Desc)])` — já existe `farm_org_id_idx` (orgId simples); o composto ainda ajuda o ORDER BY, ganho menor.
  - `AnalysisSchedule`: `@@index([orgId, createdAt(sort: Desc)])` — já existe `analysis_schedule_org_id_idx` (orgId simples); composto ajuda o ORDER BY, ganho menor.
- [ ] **Passo 2:** Gerar migration **nova** (forward) — estes índices são aditivos e idempotentes:
```sql
CREATE INDEX IF NOT EXISTS analysis_org_created_idx ON app.analysis (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS farm_org_created_idx ON app.farm (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_schedule_org_created_idx ON app.analysis_schedule (org_id, created_at DESC);
```
> Em produção, criar com `CONCURRENTLY` (fora de transação) se as tabelas forem grandes — avaliar no deploy.

### Verificação Correção 3
- [ ] `npm --prefix apps/api test` — specs de auth/admin/users continuam verdes; adicionar casos: update condicional não escreve quando nada muda; memoização por-request não re-resolve; invalidação limpa o cache após `updateOrgFeatures`.
- [ ] `npm --prefix apps/api run lint` (escopo dos arquivos tocados).
- [ ] `npx prisma migrate status` (DB local/clone) — migration de índice aplica limpa.
- [ ] `npm --prefix apps/web test` — AppShell continua verde.

---

## Critérios de sucesso (mensuráveis)
- Entry chunk: **1,83 MB → < ~300 KB gzip**; maplibre/leaflet em chunks separados, ausentes em `/login` e `/dashboard`.
- 1º paint: **skeleton visível < 1s** (sem tela branca), mesmo com backend lento.
- Overhead de auth por request: **~7 RTT → ≤ 2 RTT** (após 3B.1–3B.3); navegações repetidas com cache feature em memória.
- Navegação entre rotas já visitadas: sem refetch bloqueante perceptível.

## Riscos e rollback
- **Lazy routes (1.1):** risco de "flash" entre chunks — mitigado pelo skeleton/RouteProgressBar (2.1). Rollback: reverter para imports estáticos.
- **defineAsyncComponent (1.2):** garantir fallback enquanto o chunk de mapa baixa. Rollback: import estático no componente.
- **Cache de authz (3B.4):** risco de permissão obsoleta — mitigado por TTL curto + invalidação; entregável separável (pode-se parar em 3B.3).
- **Migration de índice (3B.5):** aditiva; baixo risco. Usar `CONCURRENTLY` em tabelas grandes.
- **Retry "fast no boot" (2.3):** em rede ruim pode falhar 1ª tentativa — o skeleton permanece e o background retry/refetch cobre; não pior que hoje (hoje trava em branco).

## Self-Review
- Cobertura: ataca as 3 causas-raiz do diagnóstico (bundle, boot bloqueante, redundância front+back) com tasks concretas, snippets aterrados no código atual (router/index.ts, App.vue, auth-guard.ts, main.ts, AppShellView.vue, global-auth.guard.ts, authed-request.type.ts) e verificação por correção.
- Segurança: nenhuma regra de RBAC alterada; cache de authz só com TTL curto + invalidação, com caminho conservador (3B.1–3B.3) sem staleness.
- Independência: cada correção é entregável isolado e reversível; ordem revisada acima.
- **Revisão Codex incorporada (verificada no código):** (1) retries NÃO reduzidos — discriminar `transient` vs `unauthorized` para não bouncear usuário ativo (Task 2.3); (2) `accessCache` chaveado por org antes de subir TTL (Task 2.4); (3) token single-flight antes de paralelizar (Task 2.2); (4) invalidação de cache authz completa incluindo `updateMembership`, com ressalva `userId↔subject` (Task 3B.4); (5) cache cross-request de authz DEFERIDO até medir 3B.1–3B.3; + ref tipado do `CarSelectMap` e gate do botão "Nova análise".
- Pendências a confirmar na execução (passos já incluem "ler antes de editar"): config exata de retry/TTL em `me.ts`/`resilience.ts` (2.3/2.4) e shape de `upsertFromClaims` (3B.1).
- **Segurança:** nenhum caminho GO introduz staleness de authz; o único caching de permissão (3B.4) está deferido e, se feito, é TTL curto + invalidação completa.
