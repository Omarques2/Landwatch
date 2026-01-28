import { createRouter, createWebHistory } from "vue-router";
import { getActiveAccount, initAuthOnce } from "../auth/auth";

import LoginView from "../views/LoginView.vue";
import CallbackView from "../views/CallbackView.vue";
import HomeView from "../views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/auth/callback", component: CallbackView },
    { path: "/", component: HomeView, meta: { requiresAuth: true } },
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
