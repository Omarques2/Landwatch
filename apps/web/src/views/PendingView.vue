<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
    <div
      class="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h1 class="text-lg font-semibold text-foreground">
        {{ currentStatus === "disabled" ? "Acesso recusado" : "Aguardando liberação do administrador" }}
      </h1>

      <p class="mt-2 text-sm text-muted-foreground">
        <span v-if="currentStatus === 'disabled'">
          Seu acesso foi recusado. Entre em contato com o administrador para reativar.
        </span>
        <span v-else>
          Seu acesso foi criado, mas ainda não foi ativado. Assim que o administrador liberar, você será redirecionado.
        </span>
      </p>

      <div v-if="statusMessage" class="mt-4 text-xs text-muted-foreground">
        {{ statusMessage }}
      </div>

      <div class="mt-6 flex items-center justify-between gap-3">
        <UiButton
          v-if="currentStatus !== 'disabled'"
          variant="outline"
          size="sm"
          class="h-9 px-4 text-sm"
          :disabled="checking"
          @click="checkNow"
        >
          {{ checking ? "Verificando..." : "Verificar agora" }}
        </UiButton>

        <UiButton
          variant="default"
          size="sm"
          class="h-9 px-4 text-sm"
          @click="onLogout"
        >
          Sair
        </UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { http } from "@/api/http";
import { unwrapData, type ApiEnvelope } from "@/api/envelope";
import { logout } from "../auth/auth";
import { authClient, buildProductLoginRoute, resolveReturnTo } from "../auth/sigfarm-auth";
import { isRetryableHttpError, runWithRetryBackoff } from "../auth/resilience";
import { Button as UiButton } from "@/components/ui";

type MeResponse = {
  status?: "pending" | "active" | "disabled";
  rawStatus?: string;
  memberships?: any[];
};

type FetchMeResult =
  | { kind: "ok"; me: MeResponse | null }
  | { kind: "unauthorized"; me: null }
  | { kind: "transient"; me: null };

const router = useRouter();

const checking = ref(false);
const statusMessage = ref("");
const currentStatus = ref<MeResponse["status"] | null>(null);

let timer: number | null = null;

async function fetchMe(): Promise<FetchMeResult> {
  try {
    const res = await runWithRetryBackoff(
      () => http.get("/v1/users/me"),
      {
        attempts: 3,
        baseDelayMs: 150,
        maxDelayMs: 1_000,
        jitterMs: 80,
        shouldRetry: (error) => isRetryableHttpError(error),
      },
    );
    return { kind: "ok", me: unwrapData(res.data as ApiEnvelope<MeResponse>) };
  } catch (e: any) {
    const status = e?.response?.status;

    // Se perdeu sessão / token inválido, volta para login
    if (status === 401 || status === 403) {
      authClient.clearSession();
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const safeReturnTo = resolveReturnTo(current);
        window.location.assign(buildProductLoginRoute(safeReturnTo));
      }
      return { kind: "unauthorized", me: null };
    }

    return { kind: "transient", me: null };
  }
}

async function checkNow() {
  checking.value = true;
  try {
    const result = await fetchMe();
    if (result.kind === "unauthorized") {
      statusMessage.value = "Sessão expirada. Redirecionando para login...";
      return;
    }
    if (result.kind === "transient") {
      statusMessage.value = "Instabilidade temporária de rede. Vamos tentar novamente automaticamente.";
      return;
    }

    const me = result.me;
    if (!me) {
      statusMessage.value = "Aguardando confirmação de acesso.";
      return;
    }
    const st = me?.status;
    currentStatus.value = st ?? null;

    if (st && st !== "disabled") {
      // usuario autenticado e nao desabilitado -> volta para o app
      router.replace("/");
      return;
    }

    if (st === "disabled") {
      statusMessage.value = "Seu usuário está desativado. Contate o administrador.";
      if (timer) window.clearInterval(timer);
      return;
    }

    // pending ou null
    statusMessage.value = "Ainda pendente. Aguarde a liberação.";
  } finally {
    checking.value = false;
  }
}

async function onLogout() {
  await logout();
}

onMounted(async () => {
  // checa na entrada (boa UX)
  await checkNow();

  // polling leve: a cada 10s
  timer = window.setInterval(() => {
    void checkNow();
  }, 10_000);
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>
