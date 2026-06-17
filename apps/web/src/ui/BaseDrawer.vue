<!-- apps/web/src/ui/BaseDrawer.vue -->
<template>
  <Teleport to="body">
    <Transition name="bd-fade">
      <div
        v-if="open"
        data-drawer-overlay
        class="fixed inset-0 z-[80] bg-black/40"
        :class="overlayClass"
        @click="$emit('close')"
      ></div>
    </Transition>

    <Transition :name="`bd-slide-${side}`">
      <aside
        v-if="open"
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        :aria-label="label ?? 'Painel'"
        tabindex="-1"
        class="fixed z-[90] bg-white shadow-lg dark:bg-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        :class="[panelBaseClass, sizeClass, panelClass]"
        :style="overscrollStyle"
      >
        <div
          v-if="side === 'bottom'"
          class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          aria-hidden="true"
        ></div>
        <div class="h-full overflow-auto" :class="side === 'bottom' ? 'pb-safe-4' : ''">
          <slot />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useBodyScrollLock } from "@/composables/useBodyScrollLock";

const props = defineProps<{
  open: boolean;
  side?: "left" | "right" | "bottom";
  /** Accessible name for the dialog (screen readers). Each sheet passes a label. */
  label?: string;
  widthClass?: string;
  overlayClass?: string;
  panelClass?: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const panelEl = ref<HTMLElement | null>(null);
const openRef = computed(() => props.open);
useBodyScrollLock(openRef);

const side = computed(() => props.side ?? "left");

const panelBaseClass = computed(() => {
  if (side.value === "bottom") {
    return "bottom-0 left-0 right-0 max-h-[88dvh] rounded-t-2xl border-t border-slate-200 dark:border-slate-800";
  }
  return side.value === "right"
    ? "top-0 right-0 h-full border-l border-slate-200 dark:border-slate-800"
    : "top-0 left-0 h-full border-r border-slate-200 dark:border-slate-800";
});

const sizeClass = computed(() => {
  if (side.value === "bottom") return props.widthClass ?? "w-full";
  return props.widthClass ?? "w-80 max-w-[85vw]";
});

const overscrollStyle = { overscrollBehavior: "contain" } as const;

let lastFocused: HTMLElement | null = null;

function focusableEls(): HTMLElement[] {
  if (!panelEl.value) return [];
  // Filter by attributes, NOT layout (offsetParent/getClientRects are always
  // empty in jsdom, which would make the trap untestable and select nothing).
  // The query already excludes [disabled] and tabindex="-1"; additionally drop
  // explicitly hidden nodes.
  return Array.from(
    panelEl.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  // Focus trap: keep Tab/Shift+Tab cycling inside the panel.
  const els = focusableEls();
  if (els.length === 0) {
    event.preventDefault();
    panelEl.value?.focus();
    return;
  }
  const first = els[0]!;
  const last = els[els.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || active === panelEl.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      lastFocused = (document.activeElement as HTMLElement | null) ?? null;
      document.addEventListener("keydown", onKeydown);
      await nextTick();
      (focusableEls()[0] ?? panelEl.value)?.focus();
    } else {
      document.removeEventListener("keydown", onKeydown);
      lastFocused?.focus?.();
      lastFocused = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  lastFocused?.focus?.();
});
</script>

<style scoped>
.bd-fade-enter-active,
.bd-fade-leave-active {
  transition: opacity 200ms ease;
}
.bd-fade-enter-from,
.bd-fade-leave-to {
  opacity: 0;
}

.bd-slide-bottom-enter-active,
.bd-slide-bottom-leave-active,
.bd-slide-left-enter-active,
.bd-slide-left-leave-active,
.bd-slide-right-enter-active,
.bd-slide-right-leave-active {
  transition: transform 200ms ease;
}
.bd-slide-bottom-enter-from,
.bd-slide-bottom-leave-to {
  transform: translateY(100%);
}
.bd-slide-left-enter-from,
.bd-slide-left-leave-to {
  transform: translateX(-100%);
}
.bd-slide-right-enter-from,
.bd-slide-right-leave-to {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .bd-fade-enter-active,
  .bd-fade-leave-active,
  .bd-slide-bottom-enter-active,
  .bd-slide-bottom-leave-active,
  .bd-slide-left-enter-active,
  .bd-slide-left-leave-active,
  .bd-slide-right-enter-active,
  .bd-slide-right-leave-active {
    transition: none;
  }
}
</style>
