<!-- src/views/LoginView.vue -->
<template>
  <div class="relative min-h-screen overflow-hidden bg-background text-foreground">
    <!-- color blobs (drift bem leve) -->
    <div class="pointer-events-none absolute inset-0">
      <div class="blob blob-a absolute -top-28 -left-28 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-500/16" />
      <div class="blob blob-b absolute top-20 -right-32 h-[26rem] w-[26rem] rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/12" />
      <div class="blob blob-c absolute -bottom-40 left-1/3 h-[34rem] w-[34rem] rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10" />
    </div>

    <!-- Login card -->
    <div class="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
      <div
        class="w-full max-w-xl rounded-[32px] border border-border bg-card/80 p-10 shadow-2xl backdrop-blur"
      >
        <div class="flex flex-col items-center text-center">
          <img :src="logoUrl" alt="LandWatch" class="h-24 w-24 object-contain" />

          <div class="mt-5 text-3xl font-semibold tracking-tight">
            LandWatch
          </div>

          <div class="mt-2 text-base text-muted-foreground">
            Entre para acessar o LandWatch.
          </div>

          <UiButton
            type="button"
            variant="default"
            size="lg"
            class="mt-8 w-[60%] rounded-2xl px-6 py-4 text-base font-semibold"
            @click="onLogin"
          >
            Entrar / Cadastrar
          </UiButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { useRouter } from "vue-router";
import {
  authClient,
  buildAuthCallbackReturnTo,
  buildAuthPortalLoginUrl,
  getRouteReturnTo,
} from "../auth/sigfarm-auth";
import { getMeCached } from "../auth/me";
import { Button as UiButton } from "@/components/ui";
import logoUrl from "../assets/logo.png";

const route = useRoute();
const router = useRouter();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

async function tryResumeSessionFromLogin() {
  let returnTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : "http://localhost:5173/";
  try {
    returnTo = getRouteReturnTo(route.query.returnTo);
  } catch {
    // keep safe fallback
  }

  try {
    await withTimeout(authClient.exchangeSession(), 6_000, "exchangeSession");
    const me = await withTimeout(getMeCached(true), 8_000, "/users/me");
    if (!me || me.status === "disabled") return;

    const target =
      typeof window !== "undefined" && returnTo.startsWith(window.location.origin)
        ? returnTo.slice(window.location.origin.length) || "/"
        : "/";
    await router.replace(target);
  } catch {
    // no-op: keep user on login page when auto-resume is not possible
  }
}

async function onLogin() {
  const returnTo = getRouteReturnTo(route.query.returnTo);
  const callbackReturnTo = buildAuthCallbackReturnTo(returnTo);
  window.location.assign(buildAuthPortalLoginUrl(callbackReturnTo));
}

onMounted(() => {
  void tryResumeSessionFromLogin();
});
</script>

<style scoped>
/* blobs com drift suave */
.blob {
  will-change: transform;
  filter: blur(64px);
}
.blob-a { animation: blob-drift-a 18s ease-in-out infinite; }
.blob-b { animation: blob-drift-b 22s ease-in-out infinite; animation-delay: -6s; }
.blob-c { animation: blob-drift-c 26s ease-in-out infinite; animation-delay: -10s; }

@keyframes blob-drift-a {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50%      { transform: translate3d(22px, 10px, 0) scale(1.04); }
}
@keyframes blob-drift-b {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50%      { transform: translate3d(-26px, 14px, 0) scale(1.05); }
}
@keyframes blob-drift-c {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50%      { transform: translate3d(18px, -16px, 0) scale(1.03); }
}

/* Acessibilidade: respeita Reduce Motion */
@media (prefers-reduced-motion: reduce) {
  .blob {
    animation: none !important;
  }
}
</style>
