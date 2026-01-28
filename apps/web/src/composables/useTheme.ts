// src/composables/useTheme.ts
import { computed, ref } from "vue";

export type ThemeMode = "light" | "dark" | "system";
const STORAGE_KEY = "theme"; // mantém o seu mesmo storage key

const mode = ref<ThemeMode>("system");
const systemPrefersDark = ref(false);

let mq: MediaQueryList | null = null;
let initialized = false;

function readSystem(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function applyToDom() {
  const dark =
    mode.value === "dark" ? true :
    mode.value === "light" ? false :
    systemPrefersDark.value;

  const root = document.documentElement;
  root.classList.toggle("dark", dark);

  // opcional, mas melhora inputs/scrollbars em alguns browsers
  root.style.colorScheme = dark ? "dark" : "light";
}

function load() {
  const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
  mode.value = saved;
}

function setTheme(next: ThemeMode) {
  mode.value = next;
  localStorage.setItem(STORAGE_KEY, next);
  applyToDom();
}

function toggle() {
  // Se estiver em system, “trava” manual no oposto do estado efetivo atual
  const effectiveDark =
    mode.value === "dark" ? true :
    mode.value === "light" ? false :
    systemPrefersDark.value;

  setTheme(effectiveDark ? "light" : "dark");
}

function initTheme() {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined") return;

  load();
  systemPrefersDark.value = readSystem();
  applyToDom();

  mq = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  mq?.addEventListener?.("change", () => {
    systemPrefersDark.value = readSystem();
    if (mode.value === "system") applyToDom();
  });
}

// inicializa imediatamente ao importar (SPA)
initTheme();

export function useTheme() {
  const isDark = computed(() => {
    if (mode.value === "dark") return true;
    if (mode.value === "light") return false;
    return systemPrefersDark.value;
  });

  return { mode, isDark, setTheme, toggle };
}
