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
          Seu acesso foi criado, mas ainda não foi ativado. Quando administrador liberar, clique em verificar novamente ou atualize página.
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
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { logout } from "../auth/auth";
import { authClient, buildProductLoginRoute, resolveReturnTo } from "../auth/sigfarm-auth";
import { getAccessStatus } from "../auth/me";
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

async function fetchMe(): Promise<FetchMeResult> {
  try {
    return { kind: "ok", me: await getAccessStatus() };
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
      statusMessage.value = "Instabilidade temporaria de rede. Tente novamente em instantes.";
      return;
    }

    const me = result.me;
    if (!me) {
      statusMessage.value = "Aguardando confirmação de acesso.";
      return;
    }
    const st = me?.status;
    currentStatus.value = st ?? null;

    if (st === "active") {
      router.replace("/");
      return;
    }

    if (st === "disabled") {
      statusMessage.value = "Seu usuário está desativado. Contate o administrador.";
      return;
    }

    statusMessage.value = "Ainda pendente. Aguarde a liberação.";
  } finally {
    checking.value = false;
  }
}

async function onLogout() {
  await logout();
}

onMounted(async () => {
  await checkNow();
});
</script>
