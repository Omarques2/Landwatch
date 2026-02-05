import { createRouter, createWebHistory } from "vue-router";
import { getActiveAccount, initAuthOnce } from "../auth/auth";

import LoginView from "../views/LoginView.vue";
import CallbackView from "../views/CallbackView.vue";
import AppShellView from "../views/AppShellView.vue";
import FarmsView from "../views/FarmsView.vue";
import AnalysesView from "../views/AnalysesView.vue";
import NewAnalysisView from "../views/NewAnalysisView.vue";
import AnalysisDetailView from "../views/AnalysisDetailView.vue";
import AnalysisPrintView from "../views/AnalysisPrintView.vue";
import AnalysisPublicView from "../views/AnalysisPublicView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/auth/callback", component: CallbackView },
    {
      path: "/",
      component: AppShellView,
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/farms" },
        { path: "farms", component: FarmsView, meta: { title: "Fazendas" } },
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

router.beforeEach(async (to) => {
  await initAuthOnce();
  const acc = getActiveAccount();

  if (to.path === "/login" && acc) return "/";
  if (!to.meta.requiresAuth) return true;
  if (!acc) return "/login";
  return true;
});

export default router;
