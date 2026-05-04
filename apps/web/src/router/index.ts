import { createRouter, createWebHistory } from "vue-router";
import { authClient } from "../auth/sigfarm-auth";
import { getAccessStatus, getMeCached } from "../auth/me";
import { createAuthNavigationGuard } from "./auth-guard";

import LoginView from "../views/LoginView.vue";
import CallbackView from "../views/CallbackView.vue";
import PendingView from "../views/PendingView.vue";
import AppShellView from "../views/AppShellView.vue";
import DashboardView from "../views/DashboardView.vue";
import FarmsView from "../views/FarmsView.vue";
import FarmDetailView from "../views/FarmDetailView.vue";
import AnalysesView from "../views/AnalysesView.vue";
import NewAnalysisView from "../views/NewAnalysisView.vue";
import AnalysisDetailView from "../views/AnalysisDetailView.vue";
import AnalysisPrintView from "../views/AnalysisPrintView.vue";
import AnalysisPublicView from "../views/AnalysisPublicView.vue";
import SchedulesView from "../views/SchedulesView.vue";
import FornecedoresView from "../views/FornecedoresView.vue";
import AttachmentsView from "../views/AttachmentsView.vue";
import AdminView from "../views/AdminView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/auth/callback", component: CallbackView },
    { path: "/pending", component: PendingView, meta: { requiresAuth: true } },
    {
      path: "/",
      component: AppShellView,
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/dashboard" },
        { path: "dashboard", component: DashboardView, meta: { title: "Dashboard" } },
        { path: "farms", component: FarmsView, meta: { title: "Fazendas" } },
        {
          path: "farms/:id",
          component: FarmDetailView,
          meta: { title: "Detalhe da fazenda" },
        },
        { path: "analyses", component: AnalysesView, meta: { title: "Análises" } },
        {
          path: "analyses/new",
          component: NewAnalysisView,
          meta: { title: "Nova análise" },
        },
        {
          path: "analyses/search",
          component: NewAnalysisView,
          meta: { title: "Buscar CAR" },
        },
        {
          path: "analyses/:id",
          component: AnalysisDetailView,
          meta: { title: "Detalhe da análise" },
        },
        {
          path: "schedules",
          component: SchedulesView,
          meta: { title: "Agendamento" },
        },
        {
          path: "attachments",
          component: AttachmentsView,
          meta: { title: "Anexos" },
        },
        {
          path: "admin",
          component: AdminView,
          meta: { title: "Painel Admin" },
        },
        {
          path: "fornecedores",
          component: FornecedoresView,
          meta: { title: "Fornecedores" },
        },
      ],
    },
    {
      path: "/analyses/:id/print",
      component: AnalysisPrintView,
      meta: { requiresAuth: true, title: "Impressão da análise" },
    },
    {
      path: "/analyses/:id/public",
      component: AnalysisPublicView,
      meta: { requiresAuth: false, title: "Análise pública" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(
  createAuthNavigationGuard({
    ensureSession: () => authClient.ensureSession(),
    exchangeSession: () => authClient.exchangeSession(),
    getMeCached,
    getAccessStatus,
  }),
);

export default router;
