<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
    <div class="flex flex-col items-center justify-center">
      <!-- Spinner grande -->
      <div class="relative h-20 w-20">
        <!-- Halo / glow -->
        <div
          class="absolute inset-0 rounded-full blur-xl opacity-30 bg-foreground animate-pulse"
        ></div>

        <!-- Ring -->
        <div
          class="absolute inset-0 rounded-full border-[6px] border-border"
        ></div>

        <!-- Parte animada -->
        <div
          class="absolute inset-0 rounded-full border-[6px] border-transparent border-t-foreground animate-spin"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AuthApiError } from "@sigfarm/auth-client-vue";
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authClient, buildProductLoginRoute, getRouteReturnTo } from "../auth/sigfarm-auth";
import { getMeCached } from "../auth/me";

const router = useRouter();
const route = useRoute();
const EXCHANGE_RETRY_ATTEMPTS = import.meta.env.MODE === "test" ? 4 : 12;
const EXCHANGE_RETRY_DELAY_MS = import.meta.env.MODE === "test" ? 250 : 500;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function exchangeSessionWithRetry(): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= EXCHANGE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await withTimeout(authClient.exchangeSession(), 8_000, "exchangeSession");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < EXCHANGE_RETRY_ATTEMPTS && shouldRetryExchangeError(error)) {
        await delay(EXCHANGE_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  throw lastError ?? new Error("exchangeSession failed");
}

function shouldRetryExchangeError(error: unknown): boolean {
  if (error instanceof AuthApiError) {
    return error.status !== 401;
  }
  const maybeStatus =
    (error as { status?: unknown })?.status ??
    (error as { response?: { status?: unknown } })?.response?.status;
  return maybeStatus !== 401;
}

function resolveTargetPath(returnTo: string): string {
  if (typeof window === "undefined") return "/";
  if (!returnTo.startsWith(window.location.origin)) return "/";
  return returnTo.slice(window.location.origin.length) || "/";
}

onMounted(async () => {
  let safeReturnTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : "http://localhost:5173/";
  try {
    safeReturnTo = getRouteReturnTo(route.query.returnTo);
  } catch {
    // Keep callback flow alive even if returnTo parsing fails due bad env/query.
  }

  try {
    let exchangeError: unknown = null;
    try {
      await exchangeSessionWithRetry();
    } catch (error) {
      // Keep flow alive: /users/me probe below may still recover the session via interceptor path.
      exchangeError = error;
    }

    const me = await withTimeout(getMeCached(true), 8_000, "/users/me");
    if (me && me.status !== "disabled") {
      const target = resolveTargetPath(safeReturnTo);
      await router.replace(target);
      return;
    }

    if (exchangeError) {
      throw exchangeError;
    }
    await router.replace("/pending");
  } catch {
    authClient.clearSession();
    const loginRoute = buildProductLoginRoute(safeReturnTo);
    await router.replace(loginRoute);
  }
});
</script>
