# Mobile UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LandWatch genuinely usable on mobile — fix the broken map interaction (touch search + feature inspect), make `/analyses/search` map-first, and bring every primary screen (`/analyses/search`, `/analyses/new`, `/analyses`, `/analyses/:id`, `/farms`, `/analyses/:id/public`) up to mobile UI/UX best practices.

**Architecture:** Vue 3 `<script setup>` + Vite + Tailwind v4 + MapLibre GL. Work bottom-up: (1) global foundation tokens, (2) one accessible bottom-sheet primitive + two composables, (3) shared mobile map UX baked into both map components, (4) per-screen refactors that consume those primitives. Mobile-only behavior is gated by a reactive `(pointer: coarse)` composable so desktop is untouched.

**Tech Stack:** Vue 3.5, Tailwind v4 (`h-dvh`, `pointer-coarse:`, `motion-reduce:`, arbitrary `env(safe-area-inset-*)`), MapLibre GL 5.9, vitest 3 + @vue/test-utils + jsdom.

**Validated against:** Vercel Web Interface Guidelines (touch targets, `overscroll-behavior: contain` in sheets, `env(safe-area-inset-*)`, `min-w-0` for truncation, `line-clamp`, `focus-visible`, icon-button `aria-label`, honor `prefers-reduced-motion`, `touch-action: manipulation`).

**Commands (run from `apps/web/`):**
- Test: `npm test -- --run`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Dev (manual mobile check): `npm run dev` → open browser DevTools device toolbar @ 390×844 (iPhone 12/13).

**Testing note:** MapLibre needs WebGL, unavailable in jsdom. Map components are verified manually at mobile viewport; pure logic (composables, URL state util, sheet a11y, button variants) is unit-tested with vitest. Every visual task ends with a manual-verification step.

---

## File Structure

**New files:**
- `apps/web/src/composables/useCoarsePointer.ts` — reactive `matchMedia('(pointer: coarse)')`; single source of truth for "is this a touch device".
- `apps/web/src/composables/useBodyScrollLock.ts` — lock `<body>` scroll while a sheet/overlay is open.
- `apps/web/src/composables/useMapAutoResize.ts` — `ResizeObserver` that calls a map's `refresh()` when its container resizes (sheet/sticky-bar/expand toggles).
- `apps/web/src/components/maps/MapCrosshair.vue` — center crosshair overlay (pointer-events-none).
- `apps/web/src/lib/search-query.ts` — parse/serialize `/analyses/search` state (`lat`,`lng`,`radius`,`carKey`) to/from the URL query.
- Tests: `apps/web/src/composables/__tests__/useCoarsePointer.spec.ts`, `apps/web/src/lib/__tests__/search-query.spec.ts`, `apps/web/src/ui/__tests__/BaseDrawer.spec.ts`.

**Modified files:**
- `apps/web/index.html` — viewport `viewport-fit=cover`.
- `apps/web/src/assets/main.css` — safe-area tokens, `touch-action`, `overflow-x` guard, reduced-motion already present.
- `apps/web/src/components/ui/button.ts` — `pointer-coarse:` min 44px sizing.
- `apps/web/src/components/ui/Input.vue` — 16px font on mobile (no iOS zoom) + comfortable height.
- `apps/web/src/ui/BaseDrawer.vue` — add `side="bottom"` + a11y (role/aria-modal/`aria-label`/Escape/focus trap + focus return/focus-visible ring/scroll-lock/overscroll-contain/safe-area/visual grab handle).
- `apps/web/src/components/ui/Sheet.vue` — widen `side` prop type to include `"bottom"`.
- `apps/web/src/views/AppShellView.vue` — `h-dvh w-full`, safe-area topbar, route-aware global CTA.
- `apps/web/src/components/maps/CarSelectMap.vue` — crosshair, tap-to-inspect sheet, overlap sheet, control reposition, `getMapCenter()`, `touch-action`, auto-resize.
- `apps/web/src/components/maps/AnalysisVectorMap.vue` — tap-to-inspect sheet, overlap sheet, touch "attachments" action, control reposition, auto-resize.
- `apps/web/src/views/NewAnalysisView.vue` — map-first mobile layout, "Ajustar busca" sheet, sticky contextual CTA, expand map, URL state.
- `apps/web/src/views/AnalysisDetailView.vue` — action row wrap, attachments bottom sheet, expand map, touch attachments path.
- `apps/web/src/views/AnalysisPublicView.vue` — action grid/wrap, responsive padding, expand map, attachment text wrap + safe-area (the existing full-screen overlay is kept, not converted to a sheet).
- `apps/web/src/views/AnalysesView.vue` — card/touch polish, responsive padding, filter sheet via BaseDrawer.
- `apps/web/src/views/FarmsView.vue` — touch targets, long-text wrapping, mobile create dialog.

---

## Phase 1 — Global foundation

### Task 1: Viewport meta for safe areas

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1: Update the viewport meta**

Replace:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```
with:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/index.html
git commit -m "feat(mobile): enable viewport-fit=cover for safe-area insets"
```

---

### Task 2: Global CSS — safe-area helpers, touch-action, overflow guard

**Files:**
- Modify: `apps/web/src/assets/main.css`

- [ ] **Step 1: Append helpers after the `@layer base` block (after line 82)**

```css
@layer base {
  /* Kill the 300ms tap delay and double-tap zoom on interactive controls. */
  button,
  a,
  [role="button"],
  input,
  select,
  textarea,
  label {
    touch-action: manipulation;
  }
  /* Guard against horizontal scroll leaks from wide rows/maps on mobile. */
  html,
  body {
    overflow-x: hidden;
  }
}

/* Safe-area utilities (notch / home indicator). Used by topbar + sticky bars + sheets. */
.pt-safe {
  padding-top: env(safe-area-inset-top, 0px);
}
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.pl-safe {
  padding-left: env(safe-area-inset-left, 0px);
}
.pr-safe {
  padding-right: env(safe-area-inset-right, 0px);
}
/* Additive variants so a sticky bar keeps its own padding PLUS the inset. */
.pb-safe-3 {
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
}
.pb-safe-4 {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 2: Verify dev server renders with no console errors**

Run: `npm run dev` → open app → confirm no CSS parse errors in console. Stop server.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/assets/main.css
git commit -m "feat(mobile): add safe-area utils, touch-action, overflow-x guard"
```

---

### Task 3: Systemic touch target sizing on buttons

**Files:**
- Modify: `apps/web/src/components/ui/button.ts:18-23`

- [ ] **Step 1: Replace the `size` variants**

Replace:
```ts
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
```
with:
```ts
      size: {
        // pointer-coarse bumps every control to the 44px touch-target minimum
        // on touch devices, while desktop keeps the denser sizing.
        sm: "h-8 px-3 pointer-coarse:h-11 pointer-coarse:px-4",
        md: "h-9 px-4 pointer-coarse:h-11",
        lg: "h-10 px-6 pointer-coarse:h-11",
        icon: "h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11",
      },
```

- [ ] **Step 2: Verify existing button tests still pass**

Run: `npm test -- --run src/components/ui`
Expected: PASS (class strings changed but tests assert behavior/variants, not exact heights; if a test pins `h-9`, update it to expect the new string).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/button.ts
git commit -m "feat(mobile): enforce 44px touch targets on buttons via pointer-coarse"
```

---

### Task 4: Input — prevent iOS zoom + comfortable mobile height

**Files:**
- Modify: `apps/web/src/components/ui/Input.vue:24-31`

- [ ] **Step 1: Update the base classes**

Replace the `cn(` block:
```ts
  cn(
    "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
    "text-foreground shadow-sm placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
```
with:
```ts
  cn(
    // 16px (text-base) on touch prevents iOS Safari auto-zoom on focus; 14px on desktop.
    "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm",
    "pointer-coarse:h-11",
    "text-foreground shadow-sm placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    attrs.class as string | undefined,
  ),
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck` → no errors. `npm test -- --run` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/Input.vue
git commit -m "feat(mobile): 16px input font on touch (no iOS zoom) + 44px height"
```

---

### Task 5: `useCoarsePointer` composable (TDD)

**Files:**
- Create: `apps/web/src/composables/useCoarsePointer.ts`
- Test: `apps/web/src/composables/__tests__/useCoarsePointer.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/composables/__tests__/useCoarsePointer.spec.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCoarsePointer } from "../useCoarsePointer";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: "(pointer: coarse)",
    addEventListener: (_: string, cb: any) => listeners.add(cb),
    removeEventListener: (_: string, cb: any) => listeners.delete(cb),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", () => mql);
  return {
    mql,
    emit: (next: boolean) => {
      (mql as any).matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe("useCoarsePointer", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("reflects the initial match", () => {
    stubMatchMedia(true);
    const { isCoarsePointer } = useCoarsePointer();
    expect(isCoarsePointer.value).toBe(true);
  });

  it("updates reactively when the media query changes", () => {
    const { emit } = stubMatchMedia(false);
    const { isCoarsePointer } = useCoarsePointer();
    expect(isCoarsePointer.value).toBe(false);
    emit(true);
    expect(isCoarsePointer.value).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/composables/__tests__/useCoarsePointer.spec.ts`
Expected: FAIL — cannot find module `../useCoarsePointer`.

- [ ] **Step 3: Implement the composable**

```ts
// apps/web/src/composables/useCoarsePointer.ts
import { onScopeDispose, ref } from "vue";

/**
 * Reactive `(pointer: coarse)` detector — the single gate for mobile/touch-only
 * UI behavior (crosshair, bottom sheets, expand button). SSR-safe.
 */
export function useCoarsePointer() {
  const isCoarsePointer = ref(false);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return { isCoarsePointer };
  }
  const mql = window.matchMedia("(pointer: coarse)");
  isCoarsePointer.value = mql.matches;
  const onChange = (event: MediaQueryListEvent) => {
    isCoarsePointer.value = event.matches;
  };
  mql.addEventListener("change", onChange);
  onScopeDispose(() => mql.removeEventListener("change", onChange));
  return { isCoarsePointer };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/composables/__tests__/useCoarsePointer.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/composables/useCoarsePointer.ts apps/web/src/composables/__tests__/useCoarsePointer.spec.ts
git commit -m "feat(mobile): add useCoarsePointer composable"
```

---

### Task 6: `useBodyScrollLock` composable

**Files:**
- Create: `apps/web/src/composables/useBodyScrollLock.ts`

- [ ] **Step 1: Implement**

```ts
// apps/web/src/composables/useBodyScrollLock.ts
import { watch, onScopeDispose, type Ref } from "vue";

/**
 * Locks <body> scroll while `active` is true. Used by overlay drawers/sheets so
 * the page behind a sheet does not scroll (Vercel guideline: lock background scroll).
 * Reference-counted so multiple open sheets don't fight over the body style.
 */
let lockCount = 0;
let savedOverflow = "";

function lock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
  }
}

export function useBodyScrollLock(active: Ref<boolean>) {
  watch(
    active,
    (isActive, wasActive) => {
      if (isActive && !wasActive) lock();
      else if (!isActive && wasActive) unlock();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    if (active.value) unlock();
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/composables/useBodyScrollLock.ts
git commit -m "feat(mobile): add useBodyScrollLock composable"
```

---

## Phase 2 — Accessible bottom sheet

### Task 7: Extend `BaseDrawer` with `side="bottom"` + a11y (TDD)

**Files:**
- Modify: `apps/web/src/ui/BaseDrawer.vue`
- Test: `apps/web/src/ui/__tests__/BaseDrawer.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/ui/__tests__/BaseDrawer.spec.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseDrawer from "../BaseDrawer.vue";

describe("BaseDrawer", () => {
  it("renders an accessible dialog when open", () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: "<p>content</p>" },
      attachTo: document.body,
    });
    const panel = document.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    // Accessible name present (defaults to "Painel" when no label prop).
    expect((panel?.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it("uses the label prop as the accessible name", () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom", label: "Ajustar busca" },
      attachTo: document.body,
    });
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Ajustar busca",
    );
    wrapper.unmount();
  });

  it("traps Tab and Shift+Tab inside the panel", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: '<button id="a">a</button><button id="b">b</button>' },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    const a = document.getElementById("a") as HTMLButtonElement;
    const b = document.getElementById("b") as HTMLButtonElement;
    // Tab from the last focusable wraps to the first.
    b.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement).toBe(a);
    // Shift+Tab from the first wraps to the last.
    a.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(b);
    wrapper.unmount();
  });

  it("emits close on Escape keydown", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      attachTo: document.body,
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toBeTruthy();
    wrapper.unmount();
  });

  it("emits close when the overlay is clicked", async () => {
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      attachTo: document.body,
    });
    const overlay = document.querySelector("[data-drawer-overlay]") as HTMLElement;
    overlay.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("close")).toBeTruthy();
    wrapper.unmount();
  });

  it("returns focus to the trigger on close", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const wrapper = mount(BaseDrawer, {
      props: { open: true, side: "bottom" },
      slots: { default: "<button>inside</button>" },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ open: false });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/__tests__/BaseDrawer.spec.ts`
Expected: FAIL — no `[role="dialog"]` / no Escape handling / no focus return yet.

- [ ] **Step 3: Rewrite `BaseDrawer.vue`**

```vue
<!-- apps/web/src/ui/BaseDrawer.vue -->
<template>
  <Teleport to="body">
    <div v-if="open" class="relative">
      <div
        data-drawer-overlay
        class="fixed inset-0 z-40 bg-black/40"
        :class="overlayClass"
        @click="$emit('close')"
      ></div>

      <aside
        ref="panelEl"
        role="dialog"
        aria-modal="true"
        :aria-label="label ?? 'Painel'"
        tabindex="-1"
        class="fixed z-50 bg-white shadow-lg transition-transform duration-200 ease-out dark:bg-slate-900 motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        :class="[panelBaseClass, openTranslateClass, sizeClass, panelClass]"
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
    </div>
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

const openTranslateClass = computed(() => {
  if (props.open) return "translate-x-0 translate-y-0";
  if (side.value === "bottom") return "translate-y-full";
  return side.value === "right" ? "translate-x-full" : "-translate-x-full";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/ui/__tests__/BaseDrawer.spec.ts`
Expected: PASS (6 tests: renders+name, label, Tab trap, Escape, overlay, focus return).

> Note: the bottom grab handle is a **visual affordance only** (no drag-to-dismiss gesture). Dismissal is via overlay click + Escape. Do not claim a drag gesture in verification steps.

- [ ] **Step 5: Regression-check the existing nav drawer**

Run: `npm run dev` → open app on desktop → toggle the mobile nav (shrink window < `lg`) → drawer still slides from left, overlay click + Escape close it. Stop server.

- [ ] **Step 6: Typecheck + full tests**

Run: `npm run typecheck` then `npm test -- --run`
Expected: no errors; all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/BaseDrawer.vue apps/web/src/ui/__tests__/BaseDrawer.spec.ts
git commit -m "feat(mobile): add accessible bottom-sheet side + a11y to BaseDrawer"
```

---

### Task 8: Widen `Sheet` to accept `side="bottom"`

**Files:**
- Modify: `apps/web/src/components/ui/Sheet.vue:7`

`Sheet.vue` already forwards `side`/`widthClass`/`overlayClass`/`panelClass` to `BaseDrawer`, but its prop type is `side?: "left" | "right"`. Every `<UiSheet side="bottom">` (Tasks 12, 13, 16, 18, 20) would fail `vue-tsc`. Widen the type. **Blocker — must land before any task that renders a bottom sheet.**

- [ ] **Step 1: Widen the `side` prop type**

In `apps/web/src/components/ui/Sheet.vue`, change:
```ts
  side?: "left" | "right";
```
to:
```ts
  side?: "left" | "right" | "bottom";
```

- [ ] **Step 2: Confirm `:side="side"` is bound on `<BaseDrawer>`**

Confirm the template binds `:side="side"`. It does in current code; if missing, add it.

- [ ] **Step 3: Confirm `Sheet` is exported from the UI barrel**

Open `apps/web/src/components/ui/index.ts`. Confirm `export { default as Sheet } from "./Sheet.vue";` exists. If not, add it.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/Sheet.vue apps/web/src/components/ui/index.ts
git commit -m "feat(ui): allow Sheet side=bottom"
```

---

## Phase 3 — Shared mobile map UX

### Task 9: `useMapAutoResize` composable

**Files:**
- Create: `apps/web/src/composables/useMapAutoResize.ts`

- [ ] **Step 1: Implement**

```ts
// apps/web/src/composables/useMapAutoResize.ts
import { onBeforeUnmount, onMounted, type Ref } from "vue";

/**
 * Calls `onResize` whenever the watched element changes size — needed because
 * MapLibre must be told to `resize()` when the container grows/shrinks (sheet
 * opens, sticky bar appears, expand toggles). No-op where ResizeObserver is absent.
 */
export function useMapAutoResize(target: Ref<HTMLElement | null>, onResize: () => void) {
  let observer: ResizeObserver | null = null;
  onMounted(() => {
    if (typeof ResizeObserver === "undefined" || !target.value) return;
    observer = new ResizeObserver(() => onResize());
    observer.observe(target.value);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/composables/useMapAutoResize.ts
git commit -m "feat(mobile): add useMapAutoResize composable"
```

---

### Task 10: `MapCrosshair` overlay component

**Files:**
- Create: `apps/web/src/components/maps/MapCrosshair.vue`

- [ ] **Step 1: Implement**

```vue
<!-- apps/web/src/components/maps/MapCrosshair.vue -->
<template>
  <div
    class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
    aria-hidden="true"
  >
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
      <circle cx="22" cy="22" r="11" stroke="#dc2626" stroke-width="2.5" fill="rgba(220,38,38,0.08)" />
      <line x1="22" y1="2" x2="22" y2="13" stroke="#dc2626" stroke-width="2.5" />
      <line x1="22" y1="31" x2="22" y2="42" stroke="#dc2626" stroke-width="2.5" />
      <line x1="2" y1="22" x2="13" y2="22" stroke="#dc2626" stroke-width="2.5" />
      <line x1="31" y1="22" x2="42" y2="22" stroke="#dc2626" stroke-width="2.5" />
      <circle cx="22" cy="22" r="2" fill="#dc2626" />
    </svg>
  </div>
</template>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds (component compiles; it is wired up in Task 12).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/maps/MapCrosshair.vue
git commit -m "feat(mobile): add MapCrosshair overlay component"
```

---

### Task 11: `CarSelectMap` — expose `getMapCenter()` + touch-action + auto-resize

**Files:**
- Modify: `apps/web/src/components/maps/CarSelectMap.vue`

- [ ] **Step 1: Add the auto-resize import and coarse-pointer gate**

In the `<script setup>` import block (after line 104), add:
```ts
import { useCoarsePointer } from "@/composables/useCoarsePointer";
import { useMapAutoResize } from "@/composables/useMapAutoResize";
```

After `const mapEl = ref<HTMLDivElement | null>(null);` (line 187), add:
```ts
const { isCoarsePointer } = useCoarsePointer();
useMapAutoResize(mapEl, () => map?.resize());
```

- [ ] **Step 2: Add `touch-action: none` to the map element so one-finger pan drives the map (crosshair model)**

Modify the map container at line 11:
```html
<div ref="mapEl" class="h-full w-full touch-none rounded-xl border border-border"></div>
```

- [ ] **Step 3: Expose `getMapCenter()`**

Add this function before `defineExpose` (before line 1300):
```ts
function getMapCenter(): { lat: number; lng: number } | null {
  if (!map) return null;
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng };
}
```

Update the `defineExpose` block (line 1300) to:
```ts
defineExpose({
  refresh,
  captureCurrentPng,
  exportPng,
  getMapCenter,
  legacyOffscreenExportMapBlob: buildExportMapBlob,
});
```

- [ ] **Step 4: Move zoom control to bottom-right on touch (avoid top-left collision)**

Replace line 510:
```ts
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");
```
with:
```ts
  map.addControl(
    new maplibregl.NavigationControl({ visualizePitch: false }),
    isCoarsePointer.value ? "bottom-right" : "top-left",
  );
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/maps/CarSelectMap.vue
git commit -m "feat(mobile): CarSelectMap exposes center, touch-action, auto-resize, control reposition"
```

---

### Task 12: `CarSelectMap` — crosshair + tap-to-inspect bottom sheet

**Files:**
- Modify: `apps/web/src/components/maps/CarSelectMap.vue`

This replaces hover-only info and the off-screen overlap popover with a single mobile bottom sheet that lists the tapped CAR(s) (key + area) and selects on choice. Desktop behavior (hover popup, inline popover) is unchanged.

- [ ] **Step 1: Import the bottom sheet + crosshair**

In the import block, add:
```ts
import MapCrosshair from "@/components/maps/MapCrosshair.vue";
import { Sheet as UiSheet } from "@/components/ui";
```

- [ ] **Step 2: Add the mobile sheet state**

After the `overlapSelector` ref (after line 228), add:
```ts
const mobileSheet = ref<{ open: boolean; candidates: OverlapCandidate[] }>({
  open: false,
  candidates: [],
});
function closeMobileSheet() {
  mobileSheet.value = { open: false, candidates: [] };
}
function chooseMobileCandidate(featureKey: string) {
  closeMobileSheet();
  emit("update:selectedCarKey", featureKey === props.selectedCarKey ? "" : featureKey);
}
```

- [ ] **Step 3: Route taps to the sheet on touch**

In `bindMapEvents`, replace the body of the `map.on("click", ...)` handler (lines 933-949) with:
```ts
  map.on("click", (event) => {
    contextMenu.value.open = false;
    const features = map?.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() }) ?? [];
    const candidates = normalizeOverlapCandidates(features as maplibregl.MapGeoJSONFeature[]);

    if (isCoarsePointer.value) {
      // Mobile: every tap with results opens the bottom sheet (selection + info),
      // INCLUDING a single CAR — the choice always happens inside the sheet so
      // the user sees the CAR key + area before committing.
      if (!candidates.length) {
        closeMobileSheet();
        emit("update:selectedCarKey", "");
        return;
      }
      mobileSheet.value = { open: true, candidates };
      return;
    }

    // Desktop: inline popover for overlaps, direct toggle otherwise.
    if (!candidates.length) {
      closeOverlapSelector();
      emit("update:selectedCarKey", "");
      return;
    }
    if (candidates.length === 1) {
      closeOverlapSelector();
      const nextKey = candidates[0]?.featureKey ?? "";
      emit("update:selectedCarKey", nextKey === props.selectedCarKey ? "" : nextKey);
      return;
    }
    openOverlapSelector(candidates, event.point);
  });
```

- [ ] **Step 4: Render the crosshair + sheet in the template**

Inside the inner `<div class="relative h-full w-full">` (after the map element `<div ref="mapEl" ...>` at line 11), add the crosshair:
```html
<MapCrosshair v-if="isCoarsePointer && hasRenderableSearch" />
```

At the end of the template, just before the final two closing `</div></div>` (before line 89), add the sheet:
```html
<UiSheet :open="mobileSheet.open" side="bottom" label="CARs neste ponto" @close="closeMobileSheet">
  <div class="px-4 pt-3">
    <div class="text-sm font-semibold">
      {{ mobileSheet.candidates.length > 1 ? "CARs neste ponto" : "CAR selecionado" }}
    </div>
    <ul class="mt-3 space-y-2">
      <li v-for="candidate in mobileSheet.candidates" :key="candidate.featureKey">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left active:scale-[0.99]"
          @click="chooseMobileCandidate(candidate.featureKey)"
        >
          <span class="min-w-0 flex-1 break-all font-mono text-xs font-semibold">
            {{ candidate.featureKey }}
          </span>
          <span v-if="candidate.areaHa !== null" class="shrink-0 text-xs text-muted-foreground">
            {{ formatAreaHa(candidate.areaHa) }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</UiSheet>
```

- [ ] **Step 5: Close the sheet when the search changes**

In the `watch(() => props.activeSearch, ...)` callback (line 1327), add `closeMobileSheet();` next to the existing `closeOverlapSelector();`. Do the same in the `watch(() => props.fallbackFeatures, ...)` callback (line 1338).

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 7: Manual mobile verification**

Run: `npm run dev` → device toolbar @ 390×844 → `/analyses/search` (after Task 16 wires the view, re-verify; for now verify the component renders crosshair and the sheet opens on tap once a search exists). Stop server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/maps/CarSelectMap.vue
git commit -m "feat(mobile): CarSelectMap crosshair + tap-to-inspect bottom sheet"
```

---

### Task 13: `AnalysisVectorMap` — tap-to-inspect sheet + touch attachments action + reposition + auto-resize

**Files:**
- Modify: `apps/web/src/components/maps/AnalysisVectorMap.vue`

- [ ] **Step 1: Imports + gate + auto-resize**

This file already imports from `@/components/ui` (`import { useToast } from "@/components/ui";`, line 46). **Merge** `Sheet`/`Button` into that existing import — do NOT add a second statement from the same module (eslint `import/no-duplicates` would fail). Change line 46 to:
```ts
import { useToast, Sheet as UiSheet, Button as UiButton } from "@/components/ui";
```
Then add the two composable imports after the import block (line 60):
```ts
import { useCoarsePointer } from "@/composables/useCoarsePointer";
import { useMapAutoResize } from "@/composables/useMapAutoResize";
```

After `const mapEl = ref<HTMLDivElement | null>(null);` (line 118), add:
```ts
const { isCoarsePointer } = useCoarsePointer();
useMapAutoResize(mapEl, () => map?.resize());

const mobileSheet = ref<{
  open: boolean;
  candidates: AnalysisOverlapCandidate[];
}>({ open: false, candidates: [] });
function closeMobileSheet() {
  mobileSheet.value = { open: false, candidates: [] };
}
function pickMobileFeature(candidate: AnalysisOverlapCandidate) {
  closeMobileSheet();
  selectFeature(candidate, false);
}
function requestAttachmentsForCandidate(candidate: AnalysisOverlapCandidate) {
  closeMobileSheet();
  emit("feature-attachments", {
    datasetCode: candidate.datasetCode,
    featureId: candidate.featureId ?? null,
    selectedFeatures: [candidate],
  });
}
```

- [ ] **Step 2: Add the new emit**

Update the `defineEmits` block (line 113-115) to:
```ts
const emit = defineEmits<{
  (event: "feature-contextmenu", payload: FeatureContextPayload): void;
  (event: "feature-attachments", payload: {
    datasetCode: string;
    featureId: string | null;
    selectedFeatures: AnalysisOverlapCandidate[];
  }): void;
}>();
```

- [ ] **Step 3: `touch-action: none` on the map element**

Line 3:
```html
<div ref="mapEl" class="h-full w-full touch-none rounded-xl border border-border"></div>
```

- [ ] **Step 4: Route taps to the sheet on touch**

In `bindMapEvents`, at the very top of the `map.on("click", ...)` handler (line 399), insert before the existing `const additive = ...` line:
```ts
    if (isCoarsePointer.value) {
      const touched = map.queryRenderedFeatures(event.point, { layers: interactiveLayerIds() });
      const touchedCandidates = normalizeRenderedCandidates(touched as maplibregl.MapGeoJSONFeature[]);
      if (!touchedCandidates.length) {
        closeMobileSheet();
        selectedFeatures = [];
        syncLegendVisibility();
        return;
      }
      mobileSheet.value = { open: true, candidates: touchedCandidates };
      return;
    }
```

- [ ] **Step 5: Reposition zoom control on touch**

Line 646:
```ts
  map.addControl(
    new maplibregl.NavigationControl({ visualizePitch: false }),
    isCoarsePointer.value ? "bottom-right" : "top-left",
  );
```

- [ ] **Step 6: Render the sheet**

Before the final `</div>` of the template (before line 29), add:
```html
<UiSheet :open="mobileSheet.open" side="bottom" label="Áreas neste ponto" @close="closeMobileSheet">
  <div class="px-4 pt-3">
    <div class="text-sm font-semibold">Áreas neste ponto</div>
    <ul class="mt-3 space-y-2">
      <li v-for="candidate in mobileSheet.candidates" :key="`${candidate.datasetCode}:${candidate.featureId}`">
        <div class="rounded-xl border border-border bg-background px-3 py-3">
          <button type="button" class="block w-full text-left" @click="pickMobileFeature(candidate)">
            <span class="block break-words font-medium">{{ candidate.label }}</span>
            <span class="mt-0.5 block break-all text-[11px] text-muted-foreground">
              {{ candidate.datasetCode }} · Feature ID: {{ candidate.featureId }}
            </span>
          </button>
          <UiButton
            v-if="enableContextMenu"
            size="sm"
            variant="outline"
            class="mt-3"
            @click="requestAttachmentsForCandidate(candidate)"
          >
            Ir para Anexos
          </UiButton>
        </div>
      </li>
    </ul>
  </div>
</UiSheet>
```

- [ ] **Step 7: Close sheet on source change**

In the `watch(() => props.vectorSource, ...)` callback (line 657), add `closeMobileSheet();` at the start of the callback body.

- [ ] **Step 8: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/maps/AnalysisVectorMap.vue
git commit -m "feat(mobile): AnalysisVectorMap tap-to-inspect sheet + touch attachments action"
```

---

## Phase 4 — `/analyses/search` map-first + URL state

### Task 14: `search-query` URL-state util (TDD)

**Files:**
- Create: `apps/web/src/lib/search-query.ts`
- Test: `apps/web/src/lib/__tests__/search-query.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/search-query.spec.ts
import { describe, it, expect } from "vitest";
import { parseSearchQuery, serializeSearchQuery } from "../search-query";

describe("search-query", () => {
  it("parses valid lat/lng/radius/carKey", () => {
    const r = parseSearchQuery({ lat: "-22.0", lng: "-49.2", radius: "10", carKey: "SP-123" });
    expect(r).toEqual({ lat: -22.0, lng: -49.2, radiusKm: 10, carKey: "SP-123" });
  });

  it("returns nulls for missing/invalid values", () => {
    const r = parseSearchQuery({ lat: "abc", radius: "999" });
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
    expect(r.radiusKm).toBeNull(); // out of 1..50 range
    expect(r.carKey).toBeNull();
  });

  it("serializes only present values", () => {
    expect(serializeSearchQuery({ lat: -22, lng: -49.2, radiusKm: 5, carKey: "" })).toEqual({
      lat: "-22",
      lng: "-49.2",
      radius: "5",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --run src/lib/__tests__/search-query.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/search-query.ts
export type ParsedSearchQuery = {
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  carKey: string | null;
};

type RawQuery = Record<string, unknown>;

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseSearchQuery(query: RawQuery): ParsedSearchQuery {
  const lat = num(query.lat);
  const lng = num(query.lng);
  const radiusRaw = num(query.radius);
  const radiusKm = radiusRaw !== null && radiusRaw >= 1 && radiusRaw <= 50 ? radiusRaw : null;
  const carKeyRaw = typeof query.carKey === "string" ? query.carKey.trim() : "";
  return {
    lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
    radiusKm,
    carKey: carKeyRaw || null,
  };
}

export function serializeSearchQuery(input: {
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  carKey: string | null | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.lat !== null && input.lat !== undefined) out.lat = String(input.lat);
  if (input.lng !== null && input.lng !== undefined) out.lng = String(input.lng);
  if (input.radiusKm !== null && input.radiusKm !== undefined) out.radius = String(input.radiusKm);
  if (input.carKey) out.carKey = input.carKey;
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- --run src/lib/__tests__/search-query.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/search-query.ts apps/web/src/lib/__tests__/search-query.spec.ts
git commit -m "feat(mobile): add search-query URL-state util"
```

---

### Task 15: `NewAnalysisView` — sync search state to URL

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`

- [ ] **Step 1: Import the util**

After line 287 (`import { mvBusy } ...`), add:
```ts
import { parseSearchQuery, serializeSearchQuery } from "@/lib/search-query";
```

- [ ] **Step 2: Hydrate from the URL on mount (search mode only)**

In `onMounted` (line 972-981), after the existing `carKey` handling, add:
```ts
  if (viewMode.value === "search") {
    const parsed = parseSearchQuery(route.query as Record<string, unknown>);
    if (parsed.lat !== null && parsed.lng !== null) {
      applySearchCoordinates(parsed.lat, parsed.lng);
    }
    if (parsed.radiusKm !== null) searchRadiusKm.value = parsed.radiusKm;
    if (parsed.carKey) analysisForm.carKey = maskCarKey(parsed.carKey);
  }
```

- [ ] **Step 3: Push state to the URL after a search and on CAR selection**

Add this helper after `updateCenter` (line 945):
```ts
function syncSearchUrl() {
  if (viewMode.value !== "search") return;
  const lat = parseCoordinate(center.lat, "lat");
  const lng = parseCoordinate(center.lng, "lng");
  const query = serializeSearchQuery({
    lat,
    lng,
    radiusKm: searchRadiusKm.value,
    carKey: analysisForm.carKey || null,
  });
  void router.replace({ path: route.path, query });
}
```

In `runCarSearch`, at the end of the `finally` block (after line 628 `searchBusy.value = false;`), add:
```ts
    syncSearchUrl();
```

Do **not** add the sync into the existing `watch(() => analysisForm.carKey, ...)` (line 992) — that watcher early-returns when the value is empty (`if (!value) return;`), so clearing a CAR would leave a stale `carKey` in the URL. Add a dedicated watcher after the existing carKey watcher (~line 1003) that always fires:
```ts
watch(
  () => analysisForm.carKey,
  () => syncSearchUrl(),
);
```
`serializeSearchQuery` omits `carKey` when empty, so deselecting drops it from the URL.

- [ ] **Step 4: Typecheck + tests**

Run: `npm run typecheck` then `npm test -- --run`
Expected: no errors; PASS.

- [ ] **Step 5: Manual verification**

Run: `npm run dev` → `/analyses/search` → run a search → confirm URL gains `?lat=&lng=&radius=`; select a CAR → URL gains `&carKey=`; reload → state restored. Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue
git commit -m "feat(mobile): persist CAR search state in URL"
```

---

### Task 16: `NewAnalysisView` — map-first mobile layout, "Ajustar busca" sheet, sticky CTA, expand

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`

Desktop (`md+`) keeps the current layout. Mobile (`< md`) becomes map-first: map is the hero, controls live in a bottom sheet, a sticky bar holds the contextual primary action, and an expand button gives a near-fullscreen map.

- [ ] **Step 1: Add imports + mobile state**

This file already imports a block from `@/components/ui` (Button, Dialog, Input, Label… lines 274-283). **Merge** `Sheet as UiSheet` into that existing block (add the line `Sheet as UiSheet,` inside the `{ … }`) — do NOT add a second `from "@/components/ui"` statement (eslint `import/no-duplicates`). Then add the lucide + composable imports as new lines:
```ts
import { Maximize2, Minimize2, Search, SlidersHorizontal } from "lucide-vue-next";
import { useCoarsePointer } from "@/composables/useCoarsePointer";
```

After `const searchMapRef = ...` (line 348), add:
```ts
const { isCoarsePointer } = useCoarsePointer();
const adjustSheetOpen = ref(false);
const mapExpanded = ref(false);

function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  void nextTick(() => searchMapRef.value?.refresh());
}

async function searchAtMapCenter() {
  if (mvBusy.value) {
    searchMessage.value = "Base geoespacial em atualização. Aguarde para buscar CARs.";
    return;
  }
  const c = searchMapRef.value?.getMapCenter();
  if (!c) {
    searchMessage.value = "Mapa ainda não está pronto.";
    return;
  }
  await runCarSearch({ lat: c.lat, lng: c.lng, radiusMeters: searchRadiusKm.value * 1000 });
}

async function searchCarsFromSheet() {
  // Don't close on an invalid/blocked attempt. `searchCars()` already no-ops on
  // mvBusy / invalid coords (setting searchMessage); only close once it actually
  // ran. The sheet "Buscar" button is also :disabled on !canSearch / mvBusy /
  // searchBusy, so this is the second guard, not the only one.
  if (mvBusy.value || searchBusy.value || !canSearch.value) return;
  adjustSheetOpen.value = false;
  await searchCars();
}
```

Add `nextTick` to the existing vue import on line 270:
```ts
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
```

- [ ] **Step 2: Restructure the search `<section>` template**

Replace the entire search-mode `<section v-else ...>` block (lines 122-248) with the structure below. It keeps the original desktop controls inside a `hidden md:block` wrapper and adds the mobile-only map-first layout.

```html
<section
  v-else
  class="search-card rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
>
  <div
    v-if="mvBusy"
    class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 search-controls"
  >
    Base geoespacial em atualização. A busca por CARs está temporariamente indisponível.
  </div>

  <!-- DESKTOP controls (unchanged behavior) -->
  <div class="hidden md:block">
    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,280px)] search-controls">
      <div>
        <UiLabel>Latitude</UiLabel>
        <UiInput
          :model-value="center.lat"
          data-testid="gps-lat"
          placeholder="-10.0000 ou 10° 00' 00&quot; S"
          @update:model-value="onSearchLatInput"
        />
      </div>
      <div>
        <UiLabel>Longitude</UiLabel>
        <div class="flex gap-2">
          <UiInput
            :model-value="center.lng"
            data-testid="gps-lng"
            placeholder="-50.0000 ou 50° 00' 00&quot; W"
            @update:model-value="onSearchLngInput"
          />
          <UiButton
            size="icon"
            variant="outline"
            data-testid="gps-button"
            class="shrink-0"
            :disabled="mvBusy || gpsLoading || searchBusy"
            title="Usar minha localização"
            aria-label="Usar minha localização"
            @click="useMyLocation"
          >
            <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
            <LocateFixed v-else class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <label class="flex min-w-0 flex-col gap-2">
        <span class="text-sm font-medium">Raio</span>
        <div class="search-radius-card">
          <input
            v-model.number="searchRadiusKm"
            data-testid="search-radius"
            class="search-radius-slider"
            type="range"
            min="1"
            max="50"
            step="1"
          />
          <span class="search-radius-pill">{{ searchRadiusKm }} km</span>
        </div>
      </label>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2 search-controls">
      <UiButton size="sm" :disabled="!canSearch || mvBusy || searchBusy" @click="searchCars">
        Buscar CARs
      </UiButton>
      <UiButton
        size="sm"
        class="shadow-sm"
        :class="!analysisForm.carKey || mvBusy || searchBusy ? 'opacity-50' : ''"
        :disabled="!analysisForm.carKey || mvBusy || searchBusy"
        @click="goToAnalysisTab"
      >
        Gerar análise
      </UiButton>
      <UiButton
        size="sm"
        variant="outline"
        :disabled="!canExportSearch || searchBusy || mapLoading || pngBusy"
        @click="downloadSearchPng"
      >
        <Loader2 v-if="pngBusy" class="mr-2 h-3.5 w-3.5 animate-spin" />
        {{ pngBusy ? "Gerando PNG" : "Baixar PNG" }}
      </UiButton>
      <label
        class="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
        data-testid="hide-unselected-toggle"
      >
        <input v-model="hideUnselectedCars" type="checkbox" class="h-4 w-4 accent-emerald-600" />
        <span>Ocultar CARs não selecionados</span>
      </label>
      <label
        class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
        data-testid="auto-zoom-toggle"
      >
        <input v-model="searchAutoZoom" type="checkbox" class="h-4 w-4 accent-emerald-600" />
        <span>Auto zoom</span>
      </label>
    </div>
    <div v-if="searchMessage" class="mt-2 text-xs text-muted-foreground search-controls">
      {{ searchMessage }}
    </div>
  </div>

  <!-- MOBILE: map-first -->
  <div class="md:hidden">
    <div class="mb-2 flex items-center justify-between gap-2">
      <UiButton size="sm" variant="outline" class="gap-2" @click="adjustSheetOpen = true">
        <SlidersHorizontal class="h-4 w-4" /> Ajustar busca
      </UiButton>
      <span class="truncate text-xs text-muted-foreground">
        {{ center.lat && center.lng ? `${center.lat}, ${center.lng} · ${searchRadiusKm} km` : "Defina um ponto" }}
      </span>
    </div>
    <p v-if="searchMessage" class="mb-2 text-xs text-muted-foreground">{{ searchMessage }}</p>
  </div>

  <!-- MAP (shared; expands to fullscreen on mobile) -->
  <div
    :class="
      mapExpanded
        ? 'fixed inset-0 z-[60] bg-background p-2 pb-safe-3'
        : 'search-map-frame mt-1 md:mt-3'
    "
  >
    <div class="relative h-full w-full">
      <CarSelectMap
        ref="searchMapRef"
        v-model:selected-car-key="analysisForm.carKey"
        :center="centerValue"
        :active-search="activeSearch"
        :fallback-features="fallbackCars"
        :disabled="mvBusy"
        :hide-unselected-cars="hideUnselectedCars"
        :loading="searchBusy"
        :auto-zoom-on-export="searchAutoZoom"
        @center-change="updateCenter"
        @search-here="searchCarsFromMap"
        @loading-change="onMapLoadingChange"
      />
      <!-- Expand / collapse toggle (touch only) -->
      <UiButton
        v-if="isCoarsePointer"
        size="icon"
        variant="outline"
        class="absolute right-3 top-3 z-30 bg-background/92"
        :aria-label="mapExpanded ? 'Recolher mapa' : 'Expandir mapa'"
        @click="toggleMapExpanded"
      >
        <Minimize2 v-if="mapExpanded" class="h-4 w-4" />
        <Maximize2 v-else class="h-4 w-4" />
      </UiButton>
    </div>
  </div>

  <!-- MOBILE sticky contextual CTA -->
  <div
    class="sticky bottom-0 z-30 -mx-4 mt-3 flex gap-2 border-t border-border bg-card/95 px-4 pb-safe-3 pt-3 backdrop-blur md:hidden"
    :class="mapExpanded ? 'hidden' : ''"
  >
    <UiButton
      v-if="!analysisForm.carKey"
      class="flex-1 gap-2"
      data-testid="search-at-center"
      :disabled="mvBusy || searchBusy"
      @click="searchAtMapCenter"
    >
      <Loader2 v-if="searchBusy" class="h-4 w-4 animate-spin" />
      <Search v-else class="h-4 w-4" />
      Buscar neste ponto
    </UiButton>
    <UiButton
      v-else
      class="flex-1"
      :disabled="mvBusy || searchBusy"
      @click="goToAnalysisTab"
    >
      Gerar análise
    </UiButton>
  </div>

  <!-- MOBILE "Ajustar busca" bottom sheet -->
  <UiSheet :open="adjustSheetOpen" side="bottom" label="Ajustar busca" @close="adjustSheetOpen = false">
    <div class="grid gap-3 px-4 pt-3">
      <div class="text-sm font-semibold">Ajustar busca</div>
      <div>
        <UiLabel>Latitude</UiLabel>
        <UiInput
          :model-value="center.lat"
          placeholder="-10.0000 ou 10° 00' 00&quot; S"
          @update:model-value="onSearchLatInput"
        />
      </div>
      <div>
        <UiLabel>Longitude</UiLabel>
        <UiInput
          :model-value="center.lng"
          placeholder="-50.0000 ou 50° 00' 00&quot; W"
          @update:model-value="onSearchLngInput"
        />
      </div>
      <UiButton
        variant="outline"
        class="gap-2"
        :disabled="mvBusy || gpsLoading || searchBusy"
        @click="useMyLocation"
      >
        <Loader2 v-if="gpsLoading" class="h-4 w-4 animate-spin" />
        <LocateFixed v-else class="h-4 w-4" />
        Usar minha localização
      </UiButton>
      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium">Raio: {{ searchRadiusKm }} km</span>
        <input
          v-model.number="searchRadiusKm"
          class="search-radius-slider"
          type="range"
          min="1"
          max="50"
          step="1"
        />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium">
          <input v-model="hideUnselectedCars" type="checkbox" class="h-5 w-5 accent-emerald-600" />
          <span>Ocultar não selec.</span>
        </label>
        <label class="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium">
          <input v-model="searchAutoZoom" type="checkbox" class="h-5 w-5 accent-emerald-600" />
          <span>Auto zoom</span>
        </label>
      </div>
      <UiButton
        class="mt-1"
        data-testid="sheet-search"
        :disabled="!canSearch || mvBusy || searchBusy"
        @click="searchCarsFromSheet"
      >
        Buscar CARs
      </UiButton>
      <UiButton
        variant="outline"
        :disabled="!canExportSearch || searchBusy || mapLoading || pngBusy"
        @click="downloadSearchPng"
      >
        <Loader2 v-if="pngBusy" class="mr-2 h-3.5 w-3.5 animate-spin" />
        {{ pngBusy ? "Gerando PNG" : "Baixar PNG" }}
      </UiButton>
    </div>
  </UiSheet>
</section>
```

- [ ] **Step 3: Update the map frame height for mobile in `<style scoped>`**

Replace the `.search-map-frame` rule (line 1049-1051):
```css
.search-map-frame {
  height: clamp(360px, 70dvh, 760px);
}
@media (min-width: 768px) {
  .search-map-frame {
    height: clamp(320px, calc(100dvh - 360px), 720px);
  }
}
```

- [ ] **Step 3b: Fix the invalid double-`hsl()` in `.search-radius-card`**

`--border` and `--background` are already `hsl(...)` values, so the existing `hsl(var(--border))` / `hsl(var(--background))` compile to invalid `hsl(hsl(...))` (the border silently fails to render). In `<style scoped>`, replace the `.search-radius-card` rule (line ~1019) with:
```css
.search-radius-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.875rem;
  background: var(--background);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
```

- [ ] **Step 4: Typecheck + build + tests**

Run: `npm run typecheck` then `npm run build` then `npm test -- --run`
Expected: no errors; build succeeds; PASS.

- [ ] **Step 5: Manual mobile verification @ 390×844**

Run: `npm run dev` → `/analyses/search`:
- Map is the hero; crosshair centered.
- Tap "Ajustar busca" → sheet opens with lat/lng/GPS/raio/toggles; Escape + overlay click close it (grab handle is a visual affordance, not a drag gesture); background does not scroll; focus is trapped inside and returns to the trigger on close.
- "Buscar neste ponto" runs a search at the crosshair; results render; sticky CTA flips to "Gerar análise" once a CAR is tapped/selected.
- Tap a CAR → bottom sheet lists it (mono CAR key, area); choosing selects it.
- "Expandir mapa" → map fills screen; collapse returns. Zoom control sits bottom-right, no overlap.
Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue
git commit -m "feat(mobile): map-first /analyses/search with adjust sheet, sticky CTA, expand"
```

---

### Task 17: `NewAnalysisView` — form (analysis) mode mobile polish

**Files:**
- Modify: `apps/web/src/views/NewAnalysisView.vue`

- [ ] **Step 1: Responsive root padding**

Line 3: change `px-6 py-6` to `px-4 py-4 sm:px-6 sm:py-6`:
```html
<div class="new-analysis-root mx-auto flex max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6">
```

- [ ] **Step 2: Responsive card padding + emphasize CAR field**

Line 5: change the analysis `<section>` `p-6` to `p-4 sm:p-6`:
```html
<section v-if="viewMode === 'analysis'" class="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
```

For the CAR input (line 25-35) add `font-mono` so the CAR reads clearly and wraps predictably — change its class binding by adding `class="font-mono"`:
```html
<UiInput
  id="analysis-car"
  class="font-mono"
  :model-value="analysisForm.carKey"
  placeholder="Selecione no mapa ou digite"
  inputmode="text"
  autocapitalize="characters"
  maxlength="64"
  @update:model-value="onCarInput"
  @blur="onCarCommit"
  @keydown.enter.prevent="onCarCommit"
/>
```

- [ ] **Step 3: Make the submit button full-width on mobile**

Line 104-108: change the submit `UiButton` class to `mt-2 w-full gap-2 sm:w-auto`:
```html
<UiButton
  class="mt-2 inline-flex w-full items-center justify-center gap-2 sm:w-auto"
  data-testid="analysis-submit"
  :disabled="isSubmitting || mvBusy"
  @click="submitAnalysis"
>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 5: Manual verification @ 390×844**

Run: `npm run dev` → `/analyses/new` → form fits without horizontal scroll; CAR shows monospaced; submit is full-width; inputs do not zoom on focus. Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/NewAnalysisView.vue
git commit -m "feat(mobile): /analyses/new form padding, mono CAR, full-width submit"
```

---

## Phase 5 — Detail, Public, lists, shell

### Task 18: `AnalysisDetailView` — action wrap, expand map, attachments bottom sheet, touch attachments

**Files:**
- Modify: `apps/web/src/views/AnalysisDetailView.vue`

- [ ] **Step 1: Responsive root + card padding**

Line 2: `px-6 py-6` → `px-4 py-4 sm:px-6 sm:py-6`.
Lines 108 and 230 (`report-card ... p-6`): `p-6` → `p-4 sm:p-6` on both `<section>` cards.

- [ ] **Step 2: Wrap the action row (fixes "Baixar PDF" cutoff)**

Line 71: change `<div class="flex gap-2">` to:
```html
<div class="flex w-full flex-wrap gap-2 sm:w-auto">
```
And add `class="grow sm:grow-0"` is not needed; instead ensure each button can shrink — the wrap is sufficient. Leave button sizes as-is (they are already `sm`, now 44px on touch via Task 3).

- [ ] **Step 3: Imports + expand/attachments-sheet state**

After `import AnalysisVectorMap ...` (line 368), add the lines below. **Do not** add `Sheet`/`UiSheet` here — the `@/components/ui` import is widened to include `Sheet` in Step 5 (the existing `import { Button as UiButton, Dialog as UiDialog } from "@/components/ui"` on line 348 becomes `Button, Dialog, Sheet`). Adding it here too would duplicate the import.
```ts
import { Maximize2, Minimize2 } from "lucide-vue-next";
import { useCoarsePointer } from "@/composables/useCoarsePointer";
import type { AnalysisOverlapCandidate as OverlapCandidate } from "@/features/analyses/analysis-vector-map";
```

After `const activeLegendCode = ref<string | null>(null);` (line 483), add:
```ts
const { isCoarsePointer } = useCoarsePointer();
const mapExpanded = ref(false);
const mapRef = ref<{ refresh: () => void } | null>(null);
function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  void nextTick(() => mapRef.value?.refresh());
}
async function onMapFeatureAttachments(payload: {
  datasetCode: string;
  featureId: string | null;
  selectedFeatures: OverlapCandidate[];
}) {
  const analysisId = analysis.value?.id;
  if (!analysisId || !payload.datasetCode) return;
  await router.push({
    path: "/attachments",
    query: {
      tab: "explore",
      fromAnalysisId: analysisId,
      datasetCode: payload.datasetCode,
      featureId: payload.featureId ?? undefined,
      carKey: analysis.value?.carKey ?? undefined,
    },
  });
}
```

Add `nextTick` to the vue import (line 346):
```ts
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
```

- [ ] **Step 4: Wire the map frame: ref, expand class, expand button, new emit**

Replace the map frame wrapper (lines 156-199, the `<div class="report-map-row mt-4">` block) so the inner frame supports expand and the map carries `ref` + `@feature-attachments`:

```html
<div class="report-map-row mt-4">
  <div
    :class="
      mapExpanded
        ? 'fixed inset-0 z-[60] bg-background p-2 pb-safe-3'
        : 'analysis-map-frame report-map-col relative h-[420px] sm:h-[560px]'
    "
  >
    <div
      v-if="mapLoading"
      class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
    >
      <div class="flex flex-col items-center gap-3">
        <div class="h-8 w-64 animate-pulse rounded-full bg-muted"></div>
        <div class="h-4 w-40 animate-pulse rounded-full bg-muted"></div>
        <div class="text-xs text-muted-foreground">Carregando mapa...</div>
      </div>
    </div>
    <AnalysisVectorMap
      v-else-if="vectorMap?.vectorSource"
      ref="mapRef"
      :vector-source="vectorMap?.vectorSource ?? null"
      :legend-items="vectorMap?.legendItems ?? []"
      :active-legend-code="activeLegendCode"
      :car-key="analysis?.carKey ?? null"
      auth-mode="private"
      :enable-context-menu="true"
      @feature-contextmenu="onMapFeatureContextMenu"
      @feature-attachments="onMapFeatureAttachments"
    />
    <div
      v-else-if="analysis?.status === 'completed'"
      class="grid h-full place-items-center text-sm text-muted-foreground"
    >
      Nenhuma geometria disponível.
    </div>
    <div
      v-if="showAnalysisOverlay"
      class="absolute inset-0 grid place-items-center rounded-xl border border-dashed border-border bg-background/90 backdrop-blur-sm"
    >
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="inline-flex items-center gap-3 text-2xl font-semibold">
          <span class="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground"></span>
          {{ statusLabel(displayStatus) }}
        </div>
        <div class="max-w-xs text-sm text-muted-foreground">
          Estamos processando sua análise. Assim que terminar, o mapa e os resultados serão exibidos.
        </div>
      </div>
    </div>
    <UiButton
      v-if="isCoarsePointer && vectorMap?.vectorSource && !mapLoading"
      size="icon"
      variant="outline"
      class="absolute right-3 top-3 z-30 bg-background/92"
      :aria-label="mapExpanded ? 'Recolher mapa' : 'Expandir mapa'"
      @click="toggleMapExpanded"
    >
      <Minimize2 v-if="mapExpanded" class="h-4 w-4" />
      <Maximize2 v-else class="h-4 w-4" />
    </UiButton>
  </div>
</div>
```

- [ ] **Step 5: Convert the attachments modal to a bottom sheet on mobile**

The attachments modal becomes a bottom sheet on touch and stays a centered dialog on desktop, driven by one dynamic `<component>`.

First, ensure the imports + component map are in place. Replace the existing UI import (line 348) and add a local component map after the imports — a string `:is="'UiSheet'"` does NOT resolve under `<script setup>`, so `<component :is>` must reference the real component objects:
```ts
// replaces: import { Button as UiButton, Dialog as UiDialog } from "@/components/ui";
import { Button as UiButton, Dialog as UiDialog, Sheet as UiSheet } from "@/components/ui";
// after the import block:
const dynComponents = { UiSheet, UiDialog };
```

Then replace the whole `UiDialog` block (lines 277-325) with the final form below (note `label` for the sheet's accessible name):
```html
<component
  :is="isCoarsePointer ? dynComponents.UiSheet : dynComponents.UiDialog"
  v-bind="isCoarsePointer ? { open: attachmentsOpen, side: 'bottom', label: 'Anexos da análise' } : { open: attachmentsOpen, maxWidthClass: 'max-w-3xl' }"
  @close="attachmentsOpen = false"
>
  <div class="flex max-h-[82vh] min-h-[320px] flex-col">
    <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
      <div class="text-lg font-semibold text-foreground">Anexos da análise</div>
      <UiButton variant="ghost" size="sm" @click="attachmentsOpen = false">Fechar</UiButton>
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
      <div v-if="attachmentsLoading" class="text-sm text-muted-foreground">Carregando anexos...</div>
      <div v-else-if="analysisAttachments.length === 0" class="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
        Nenhum anexo efetivo para esta análise.
      </div>
      <div v-else class="grid gap-3">
        <article
          v-for="attachment in analysisAttachments"
          :key="`${attachment.id}:${attachment.target.id}`"
          class="rounded-2xl border border-border bg-card p-4 text-sm"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="line-clamp-2 break-words font-semibold text-foreground">{{ attachment.originalFilename }}</div>
              <div class="mt-1 break-words text-xs text-muted-foreground">
                {{ attachment.categoryName }} • {{ attachment.target.datasetCode }} • featureId={{ attachment.target.featureId ?? '-' }}
              </div>
            </div>
            <span
              class="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              :class="attachment.isJustification ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-sky-200 bg-sky-50 text-sky-700'"
            >
              {{ attachment.isJustification ? 'Justificativa' : 'Informativo' }}
            </span>
          </div>
          <div class="mt-3">
            <UiButton variant="outline" size="sm" @click="downloadAnalysisAttachment(attachment.id, attachment.originalFilename)">
              Baixar
            </UiButton>
          </div>
        </article>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-4 pb-safe-3 sm:px-6">
      <UiButton variant="outline" :disabled="analysisAttachments.length === 0" @click="downloadAnalysisAttachmentsZip">
        Baixar ZIP
      </UiButton>
      <UiButton variant="outline" @click="goToAttachmentsFromAnalysisModal">
        Gerenciar no módulo de Anexos
      </UiButton>
    </div>
  </div>
</component>
```

(The import widening + `dynComponents` map were added at the top of this step — nothing further to register here.)

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 7: Manual verification @ 390×844**

Run: `npm run dev` → open a completed analysis `/analyses/:id`:
- Action buttons wrap to 2 rows, none cut off.
- Map is `420px`; "Expandir mapa" works.
- Tap a non-CAR feature → bottom sheet shows info + "Ir para Anexos" navigates correctly.
- "Anexos" opens a bottom sheet; long filenames clamp to 2 lines; ZIP/Gerenciar footer reachable with safe-area padding.
Stop server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/views/AnalysisDetailView.vue
git commit -m "feat(mobile): detail action wrap, expand map, attachments sheet, touch attachments"
```

---

### Task 19: `AnalysisPublicView` — action grid/wrap, padding, expand map, attachment text wrap

**Files:**
- Modify: `apps/web/src/views/AnalysisPublicView.vue`

- [ ] **Step 1: Responsive root padding**

Line 2: `px-6 py-6` → `px-4 py-4 sm:px-6 sm:py-6`.

- [ ] **Step 2: Make `.public-card` padding responsive**

In `<style scoped>`, change `.public-card` `padding: 16px;` to:
```css
.public-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 12px;
}
@media (min-width: 640px) {
  .public-card {
    padding: 16px;
  }
}
```

- [ ] **Step 3: Wrap the public action buttons (fixes cutoff)**

Line 55: change `<div class="mt-3 flex gap-2">` to a wrapping grid that goes 2-up on mobile:
```html
<div class="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
```

- [ ] **Step 4: Imports + expand state**

After `import AnalysisVectorMap ...` (line 282), add:
```ts
import { Maximize2, Minimize2 } from "lucide-vue-next";
import { Button as UiButton } from "@/components/ui";
import { useCoarsePointer } from "@/composables/useCoarsePointer";
```
After `const pdfDownloading = ref(false);` (line 357), add:
```ts
const { isCoarsePointer } = useCoarsePointer();
const mapExpanded = ref(false);
const mapRef = ref<{ refresh: () => void } | null>(null);
function toggleMapExpanded() {
  mapExpanded.value = !mapExpanded.value;
  void nextTick(() => mapRef.value?.refresh());
}
```
Add `nextTick` to the vue import (line 266):
```ts
import { computed, nextTick, onMounted, ref } from "vue";
```

- [ ] **Step 5: Wire expand into the map frame**

Replace the map frame block (lines 115-135, the `<div class="analysis-map-frame relative h-[560px]">` wrapper) with:
```html
<div
  :class="
    mapExpanded
      ? 'fixed inset-0 z-[60] bg-background p-2 pb-safe-3'
      : 'analysis-map-frame relative h-[420px] sm:h-[560px]'
  "
>
  <div
    v-if="mapLoading || isLoading"
    class="grid h-full place-items-center rounded-xl border border-dashed border-border bg-muted/20"
  >
    <div class="loading-spinner" aria-label="Carregando"></div>
  </div>
  <AnalysisVectorMap
    v-else-if="vectorMap?.vectorSource"
    ref="mapRef"
    :vector-source="vectorMap?.vectorSource ?? null"
    :legend-items="vectorMap?.legendItems ?? []"
    :active-legend-code="activeLegendCode"
    auth-mode="public"
  />
  <div
    v-else-if="analysis?.status === 'completed'"
    class="grid h-full place-items-center text-sm text-muted-foreground"
  >
    Nenhuma geometria disponível.
  </div>
  <UiButton
    v-if="isCoarsePointer && vectorMap?.vectorSource && !mapLoading && !isLoading"
    size="icon"
    variant="outline"
    class="absolute right-3 top-3 z-30 bg-background/92"
    :aria-label="mapExpanded ? 'Recolher mapa' : 'Expandir mapa'"
    @click="toggleMapExpanded"
  >
    <Minimize2 v-if="mapExpanded" class="h-4 w-4" />
    <Maximize2 v-else class="h-4 w-4" />
  </UiButton>
</div>
```

- [ ] **Step 6: Attachments overlay polish (text wrap + safe-area)**

The public attachments modal is already a hand-rolled `fixed inset-0` full-screen overlay (lines 208-260) — it is **not** converted to `UiSheet` (it already fills the screen on mobile; a sheet would be redundant). Apply the mandatory polish: change line 229 filename `truncate` → `line-clamp-2 break-words`, add `break-words` to the metadata line, and add `pb-safe-3` to the footer container (line 250) so the ZIP button clears the home indicator.

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 8: Manual verification @ 390×844**

Run: `npm run dev` → open a public report `/analyses/:id/public`:
- Action buttons sit in a 2-col grid, none cut off.
- Map `420px`; expand works; tap feature → info sheet.
- Attachments overlay: filenames clamp; footer reachable.
Stop server.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/views/AnalysisPublicView.vue
git commit -m "feat(mobile): public action grid, padding, expand map, attachment text wrap"
```

---

### Task 20: `AnalysesView` — list/touch polish + filter via bottom sheet

**Files:**
- Modify: `apps/web/src/views/AnalysesView.vue`

- [ ] **Step 1: Responsive root + card padding**

Line 2: `px-6 py-6` → `px-4 py-4 sm:px-6 sm:py-6`.
Line 24: `p-6` → `p-4 sm:p-6`.

- [ ] **Step 2: CAR wraps in the card meta line**

Line 124-126 (the meta `<div class="text-xs text-muted-foreground">`): wrap the CAR in a `break-all` span:
```html
<div class="text-xs text-muted-foreground">
  {{ formatDate(analysis.analysisDate) }} ·
  <span class="break-all font-mono">{{ analysis.carKey }}</span>
</div>
```
Add `min-w-0` to the parent flex child (line 120 `<div>`):
```html
<div class="min-w-0">
```

- [ ] **Step 3: Convert the filter `UiDialog` to a bottom sheet on mobile**

Convert the filter `UiDialog` (line 173) to a bottom sheet on touch using the same dynamic-component pattern as Task 18.

Setup (do this first):
- **Merge** `Sheet as UiSheet` into the existing `@/components/ui` import block (lines 248-258) — add `Sheet as UiSheet,` inside the `{ … }`; do NOT add a second `from "@/components/ui"` statement.
- Add `import { useCoarsePointer } from "@/composables/useCoarsePointer";` as a new line.
- Near the other refs add: `const { isCoarsePointer } = useCoarsePointer();`
- After the import block add: `const dynComponents = { UiSheet, UiDialog };`

Then replace the `<UiDialog ...>` / `</UiDialog>` wrapper (keeping its children) with:
```html
<component
  :is="isCoarsePointer ? dynComponents.UiSheet : dynComponents.UiDialog"
  v-bind="isCoarsePointer ? { open: filtersOpen, side: 'bottom', label: 'Filtros' } : { open: filtersOpen }"
  @close="filtersOpen = false"
>
  <!-- keep existing UiDialogHeader + filter grid + UiDialogFooter children unchanged -->
</component>
```

- [ ] **Step 4: Typecheck + build + tests**

Run: `npm run typecheck` then `npm run build` then `npm test -- --run`
Expected: no errors; PASS (existing `analysis-filter-*` testids preserved).

- [ ] **Step 5: Manual verification @ 390×844**

Run: `npm run dev` → `/analyses`:
- Cards single column; CAR wraps, no horizontal scroll.
- "Filtros" opens a bottom sheet; apply/clear work; background locked.
Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/AnalysesView.vue
git commit -m "feat(mobile): analyses list padding, CAR wrap, filter bottom sheet"
```

---

### Task 21: `FarmsView` — touch + long text + mobile create dialog

**Files:**
- Modify: `apps/web/src/views/FarmsView.vue`

- [ ] **Step 1: Responsive root + card padding**

Line 2: `px-6 py-6` → `px-4 py-4 sm:px-6 sm:py-6`.
Line 16: `p-6` → `p-4 sm:p-6`.

- [ ] **Step 2: Wrap long CAR + docs summary**

Line 48-52 (the farm meta block): add `min-w-0` to the wrapper `<div>` (line 47) and `break-all` to the CAR/summary line:
```html
<div class="min-w-0">
  <div class="font-semibold">{{ farm.name }}</div>
  <div class="break-all text-xs text-muted-foreground">
    <span class="font-mono">{{ farm.carKey }}</span> · {{ formatDocumentsSummary(farm) }}
  </div>
</div>
```

- [ ] **Step 3: Make the create dialog mobile-friendly**

The create dialog uses `UiDialog max-w-xl`. Add responsive padding to its body and a safe-area footer. Line 188 body `<div class="grid gap-4 p-6">` → `p-4 sm:p-6`. Line 244 footer add `pb-safe-3`:
```html
<UiDialogFooter class="flex flex-wrap items-center gap-2 border-t border-border px-4 py-4 pb-safe-3 sm:px-6">
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 5: Manual verification @ 390×844**

Run: `npm run dev` → `/farms`:
- Long CAR wraps; icon action buttons are ≥44px; create dialog fields fit; footer reachable.
Stop server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/FarmsView.vue
git commit -m "feat(mobile): farms touch targets, long-text wrap, mobile create dialog"
```

---

### Task 22: `AppShellView` — dvh, safe-area topbar, route-aware global CTA

**Files:**
- Modify: `apps/web/src/views/AppShellView.vue`

- [ ] **Step 1: dvh + safe area**

Line 3: `h-screen w-screen` → `h-dvh w-full`. Line 6: `flex h-screen` → `flex h-dvh`.
Line 51 topbar: a fixed `h-[var(--topbar-h)]` combined with `pt-safe` eats the notch inset *into* the 72px and squashes the menu/title/CTA on notched devices. Use `min-height` + `h-auto` so the inset is added on top of the bar instead of subtracted from it:
```html
<div class="app-topbar border-b border-border bg-card px-4 pl-safe pr-safe pt-safe min-h-[calc(var(--topbar-h)+env(safe-area-inset-top,0px))] h-auto flex items-center">
```

- [ ] **Step 2: Hide the redundant global "Nova análise" CTA on the create/search routes**

The view already renders its own primary action on `/analyses/new` and `/analyses/search`, so the topbar CTA is redundant there. Add a computed and gate the button.

After `const canCreateAnalysis = computed(...)` (line 192), add:
```ts
const hideTopbarCta = computed(
  () => activeKey.value === "new-analysis" || activeKey.value === "car-search",
);
```

Line 93-103: change the CTA `v-if`:
```html
<UiButton
  v-if="canCreateAnalysis && !hideTopbarCta"
  variant="default"
  size="md"
  class="h-9 px-4 pointer-coarse:h-11"
  :disabled="mvBusy"
  :title="mvBusy ? 'Base geoespacial em atualização' : 'Nova análise'"
  @click="goNewAnalysis"
>
  Nova análise
</UiButton>
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck` then `npm run build`
Expected: no errors.

- [ ] **Step 4: Manual verification @ 390×844**

Run: `npm run dev`:
- No content cut off at the bottom (dvh); topbar respects the notch.
- On `/analyses/new` and `/analyses/search` the topbar "Nova análise" is gone (no duplication); it shows on `/analyses`, `/farms`.
Stop server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/AppShellView.vue
git commit -m "feat(mobile): shell dvh, safe-area topbar, route-aware global CTA"
```

---

## Phase 6 — Final verification

### Task 23: Full regression + mobile sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run, from `apps/web/`:
```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```
Expected: lint clean, no type errors, all tests PASS, build succeeds. Fix anything that fails before continuing.

- [ ] **Step 2: Mobile manual sweep @ 390×844 (DevTools device toolbar)**

Walk the primary flow and confirm each:
- [ ] `/analyses/search`: map-first, crosshair, "Ajustar busca" sheet (Esc/overlay/handle close, no background scroll), "Buscar neste ponto", tap-CAR sheet (mono key + area), sticky CTA flips to "Gerar análise", expand map, zoom control bottom-right (no overlap), URL holds `lat/lng/radius/carKey` across reload.
- [ ] `/analyses/new`: no horizontal scroll, mono CAR, full-width submit, inputs don't zoom on focus.
- [ ] `/analyses`: single-col cards, CAR wraps, filter bottom sheet.
- [ ] `/analyses/:id`: actions wrap (no cutoff), expand map, feature tap → info + "Ir para Anexos", attachments sheet with clamped filenames.
- [ ] `/analyses/:id/public`: action grid (no cutoff), expand map, attachment text wraps.
- [ ] `/farms`: long CAR wraps, ≥44px icon buttons, mobile create dialog.
- [ ] Shell: dvh (nothing clipped), notch-safe topbar, no duplicate "Nova análise" on create/search routes.
- [ ] Desktop regression @ 1440 wide: all screens behave as before (hover popups on maps, inline overlap popover, top-left zoom control, dense buttons, desktop search controls).

- [ ] **Step 3: Commit any fixes found during the sweep**

```bash
git add -A
git commit -m "fix(mobile): address issues found in final mobile/desktop sweep"
```

---

## Self-Review (completed during authoring)

**Spec coverage** — every approved item maps to a task:
- Foundation (viewport, dvh, safe-area, touch-action, overflow guard, touch targets, input zoom): Tasks 1–4, 22.
- `useCoarsePointer`, scroll lock, auto-resize: Tasks 5, 6, 9.
- Accessible bottom sheet (role, aria-modal, Escape, focus trap + focus return, scroll lock, overscroll-contain, safe-area, visual handle): Task 7. `Sheet` prop type widened to accept `side="bottom"`: Task 8 (blocker).
- Map crosshair + tap-to-inspect + overlap sheet + control reposition + getMapCenter: Tasks 10–13.
- Map-first `/analyses/search` + Ajustar-busca sheet + sticky CTA + expand: Task 16.
- Search state in URL: Tasks 14–15.
- Form polish: Task 17.
- Detail (action wrap, expand, attachments sheet, touch attachments): Task 18.
- Public (action grid, padding, expand, text wrap): Task 19.
- Analyses list + Farms polish + long text: Tasks 20–21.
- Topbar redundant CTA + dvh + safe-area: Task 22.
- Final regression + mobile/desktop sweep: Task 23.

**Type consistency** — `getMapCenter()` returns `{lat,lng}|null` (defined Task 11, consumed Task 16); `feature-attachments` payload shape identical in emit (Task 13) and handler (Task 18); `OverlapCandidate`/`AnalysisOverlapCandidate` imported from `@/features/analyses/analysis-vector-map`; `dynComponents` pattern reused identically in Tasks 18/20; `Sheet` `side` prop type widened (Task 8) so `side="bottom"` typechecks everywhere it is used (Tasks 12/13/16/18/20).

**Codex round-2 fixes applied** — (1) Task 8 widens `Sheet.vue` type to `"left"|"right"|"bottom"` (blocker: `vue-tsc` would break otherwise). (2) Task 12 always opens the bottom sheet on touch, including a single CAR (no auto-select bypass). (3) Task 22 topbar uses `min-h-[calc(var(--topbar-h)+env(safe-area-inset-top))] h-auto` so the notch inset doesn't squash content. (4) Task 16 uses the `Search` lucide icon instead of an emoji. (5) Task 7 implements a real focus trap + focus-return (honors the "a11y" claim); grab handle is documented as visual-only. (6) Task 15 adds a dedicated `carKey` watcher so deselecting drops `carKey` from the URL (no stale param). (7) Task 16 fixes the pre-existing invalid `hsl(var(--border))` double-wrap in `.search-radius-card`.

**Codex round-3 fixes applied** — (1) `BaseDrawer` gets a real accessible name via a `label` prop → `aria-label` (default `"Painel"`); every sheet passes a label (`Ajustar busca`, `CARs neste ponto`, `Áreas neste ponto`, `Anexos da análise`, `Filtros`). (2) The panel keeps `outline-none` but adds `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` so the guideline (no `outline-none` without a focus-visible replacement) is honored. (3) `focusableEls` no longer filters by `offsetParent`/layout (always empty in jsdom) — it filters by attributes only, so the focus trap is real *and* testable; Task 7 adds a deterministic Tab + Shift+Tab cycle test and an `aria-label` test (6 tests total). (4) Task 16 replaces the inline `searchCars(); close` with `searchCarsFromSheet()` that guards on `mvBusy`/`searchBusy`/`canSearch` and closes only on a valid attempt. (5) Task 18's dynamic-component step shows only the final `dynComponents`-based form (no string `:is` then "switch" ambiguity); import widening + `dynComponents` map are stated up-front. (6) Tasks 13/16/18/20 explicitly **merge** `Sheet`/`Button` into the file's existing `@/components/ui` import (eslint `import/no-duplicates` would otherwise fail); Task 18's stray duplicate `Sheet` import removed. (7) Task 19 retitled to "attachment text wrap" — the public overlay stays full-screen (no sheet); the text-wrap + safe-area polish is mandatory, not optional.

**Placeholder scan** — no TBD/TODO; every code step shows full code.
