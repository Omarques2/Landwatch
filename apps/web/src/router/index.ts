import { createRouter, createWebHistory } from "vue-router";
import { authClient } from "../auth/sigfarm-auth";
import { acquireApiToken } from "../auth/auth";
import {
  getAccessCached,
  getAccessStatus,
  getMeCached,
  getMeResult,
} from "../auth/me";
import { createAuthNavigationGuard } from "./auth-guard";

// Lazy-loaded views: each view (and its heavy deps like maplibre/leaflet) is
// split into its own chunk so the initial bundle stays small and routes that
// never render a map don't download map libraries.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: () => import("../views/LoginView.vue") },
    { path: "/auth/callback", component: () => import("../views/CallbackView.vue") },
    {
      path: "/pending",
      component: () => import("../views/PendingView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/",
      component: () => import("../views/AppShellView.vue"),
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/analyses/new" },
        {
          path: "dashboard",
          component: () => import("../views/DashboardView.vue"),
          meta: { title: "Dashboard", platformOnly: true },
        },
        {
          path: "farms",
          component: () => import("../views/FarmsView.vue"),
          meta: { title: "Fazendas", feature: "FARMS" },
        },
        {
          path: "farms/:id",
          component: () => import("../views/FarmDetailView.vue"),
          meta: { title: "Detalhe da fazenda", feature: "FARMS" },
        },
        {
          path: "analyses",
          component: () => import("../views/AnalysesView.vue"),
          meta: { title: "Análises", feature: "ANALYSES" },
        },
        {
          path: "analyses/new",
          component: () => import("../views/NewAnalysisView.vue"),
          meta: { title: "Nova análise", feature: "ANALYSIS_CREATE" },
        },
        {
          path: "analyses/search",
          component: () => import("../views/NewAnalysisView.vue"),
          meta: { title: "Buscar CAR", feature: "CAR_SEARCH" },
        },
        {
          path: "analyses/:id",
          component: () => import("../views/AnalysisDetailView.vue"),
          meta: { title: "Detalhe da análise", feature: "ANALYSES" },
        },
        {
          path: "schedules",
          component: () => import("../views/SchedulesView.vue"),
          meta: { title: "Agendamento", feature: "SCHEDULES" },
        },
        {
          path: "attachments",
          component: () => import("../views/AttachmentsView.vue"),
          meta: { title: "Anexos", platformOnly: true },
        },
        {
          path: "admin",
          component: () => import("../views/AdminView.vue"),
          meta: { title: "Painel Admin", platformOnly: true },
        },
        {
          path: "fornecedores",
          component: () => import("../views/FornecedoresView.vue"),
          meta: { title: "Fornecedores", platformOnly: true },
        },
        {
          path: "403",
          component: () => import("../views/AccessDeniedView.vue"),
          meta: { title: "Acesso negado" },
        },
      ],
    },
    {
      path: "/analyses/:id/public",
      component: () => import("../views/AnalysisPublicView.vue"),
      meta: { requiresAuth: false, title: "Análise pública" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(
  createAuthNavigationGuard({
    acquireToken: () => acquireApiToken({ reason: "auth-guard" }),
    ensureSession: () => authClient.ensureSession(),
    exchangeSession: () => authClient.exchangeSession(),
    getMeCached,
    getMeResult,
    getAccessStatus,
    getAccessCached,
  }),
);

export default router;
