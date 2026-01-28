<template>
  <UiCard class="border-border/60 bg-card/80 shadow-sm backdrop-blur">
    <UiCardContent class="px-2.5 py-2 sm:px-3">
      <!-- Grid garante centralização real do título -->
      <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <!-- Left: Home/App -->
        <UiButton
          type="button"
          variant="outline"
          size="sm"
          class="h-9 gap-2 px-3"
          title="Voltar para o App"
          aria-label="Voltar para o App"
          @click="$emit('back')"
        >
          <IconArrowLeft class="h-4 w-4" />
          <span class="hidden sm:inline">App</span>
        </UiButton>

        <!-- Center: Admin / Section -->
        <div class="min-w-0 justify-self-center text-center">
          <div
            class="inline-flex max-w-full items-center gap-2 truncate
                   text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base"
          >
            <span class="truncate">Admin</span>
            <span class="text-slate-400 dark:text-slate-500">/</span>
            <span class="truncate">{{ displayTitle }}</span>
          </div>

          <!-- Subtitle só em telas maiores para não aumentar altura no mobile -->
          <div
            v-if="displaySubtitle"
            class="mt-0.5 hidden max-w-[70vw] truncate text-xs text-slate-500 dark:text-slate-400 lg:block"
          >
            {{ displaySubtitle }}
          </div>
        </div>

        <!-- Right: actions -->
        <div class="flex items-center justify-self-end gap-2">
          <UiButton
            type="button"
            variant="outline"
            size="sm"
            class="h-9 gap-2 px-3"
            :disabled="loadingAny"
            title="Recarregar"
            aria-label="Recarregar"
            @click="$emit('reload')"
          >
            <IconRefresh class="h-4 w-4" :class="loadingAny ? 'animate-spin' : ''" />
            <span class="hidden sm:inline">{{ loadingAny ? "Carregando..." : "Recarregar" }}</span>
          </UiButton>

          <UiButton
            v-if="showSearch"
            type="button"
            variant="outline"
            size="sm"
            class="hidden h-9 px-3 sm:inline-flex"
            @click="$emit('search')"
          >
            Buscar (Ctrl+K)
          </UiButton>

          <ThemeToggle :show-label="true" size="sm" />
        </div>
      </div>
    </UiCardContent>
  </UiCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Button as UiButton,
  Card as UiCard,
  CardContent as UiCardContent,
} from "@/components/ui";
import ThemeToggle from "@/ui/theme/ThemeToggle.vue";
import IconRefresh from "@/components/icons/IconRefresh.vue";
import IconArrowLeft from "@/components/icons/IconArrowLeft.vue";

const props = withDefaults(
  defineProps<{
    /**
     * LEGADO: AdminView usa :section="title"
     */
    section?: string;

    /**
     * NOVO: uso mais explícito
     */
    title?: string;
    subtitle?: string;

    loadingAny: boolean;
    showSearch?: boolean;
  }>(),
  {
    section: "",
    showSearch: false,
    subtitle: "",
    title: "",
  }
);

defineEmits<{
  (e: "reload"): void;
  (e: "back"): void;   // agora é o “App/Home”
  (e: "search"): void;
}>();

const displayTitle = computed(() => props.title?.trim() || props.section?.trim() || "");
const displaySubtitle = computed(() => props.subtitle?.trim() || "");
</script>
