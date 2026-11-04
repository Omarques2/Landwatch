<template>
  <div
    ref="root"
    class="space-y-3 [&:fullscreen]:overflow-auto [&:fullscreen]:bg-background [&:fullscreen]:p-6"
    data-testid="gee-compare"
  >
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <div class="flex items-center rounded-lg border border-border">
        <UiButton variant="ghost" size="icon" aria-label="Diminuir zoom" @click="zoomBy(1 / 1.5)">
          <Minus class="h-4 w-4" />
        </UiButton>
        <span class="w-12 text-center text-xs tabular-nums text-muted-foreground" data-testid="gee-zoom"
          >{{ Math.round(view.scale * 100) }}%</span
        >
        <UiButton variant="ghost" size="icon" aria-label="Aumentar zoom" @click="zoomBy(1.5)">
          <Plus class="h-4 w-4" />
        </UiButton>
        <UiButton variant="ghost" size="icon" aria-label="Restaurar enquadramento" @click="reset">
          <RotateCcw class="h-4 w-4" />
        </UiButton>
      </div>
      <template v-if="overlayUrl">
        <label for="gee-opacity" class="ml-1 text-xs text-muted-foreground">Cores</label>
        <input
          id="gee-opacity"
          v-model.number="opacity"
          type="range"
          min="0"
          max="100"
          step="5"
          class="w-28 accent-primary"
        />
        <span class="w-9 text-xs tabular-nums text-muted-foreground">{{ opacity }}%</span>
      </template>
      <UiButton variant="outline" size="sm" class="ml-auto" @click="toggleFullscreen">
        <Maximize2 class="mr-1.5 h-4 w-4" />Tela cheia
      </UiButton>
    </div>

    <div class="grid gap-4" :class="beforeUrl ? 'md:grid-cols-2' : ''">
      <figure v-for="frame in frames" :key="frame.key" class="min-w-0">
        <figcaption class="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div>
            <span class="font-medium">{{ frame.title }}</span>
            <span class="block text-xs text-muted-foreground">{{ frame.caption }}</span>
          </div>
          <slot :name="`${frame.key}-actions`" />
        </figcaption>
        <div
          class="relative touch-none select-none overflow-hidden rounded-xl bg-muted"
          :class="view.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''"
          :data-testid="frame.key === 'after' ? 'gee-layered-preview' : undefined"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dblclick="reset"
        >
          <div class="relative origin-top-left" :style="transform">
            <template v-if="frame.key === 'before'">
              <img
                :key="beforeUrl"
                class="block h-auto w-full"
                draggable="false"
                :src="beforeUrl"
                :alt="overlayUrl ? 'Composição Landsat 5 do período anterior' : beforeTitle"
                @load="emit('settled', 'before', true)"
                @error="emit('settled', 'before', false)"
              />
            </template>
            <template v-else>
              <img
                :key="baseUrl"
                class="block h-auto w-full"
                draggable="false"
                :src="baseUrl"
                :alt="overlayUrl ? 'Composição Landsat 8 do período posterior' : afterTitle"
                @load="emit('settled', 'base', true)"
                @error="emit('settled', 'base', false)"
              />
              <img
                v-if="overlayUrl"
                :key="overlayUrl"
                class="pointer-events-none absolute inset-0 h-full w-full"
                draggable="false"
                :style="{ opacity: opacity / 100 }"
                :src="overlayUrl"
                alt="Mudança de SAVI: vermelho indica redução, amarelo pouca mudança e verde aumento"
                @load="emit('settled', 'overlay', true)"
                @error="emit('settled', 'overlay', false)"
              />
            </template>
          </div>
        </div>
      </figure>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-vue-next";
import { Button as UiButton } from "@/components/ui";

// Without beforeUrl/overlayUrl it shows a single image with the same zoom controls.
const props = withDefaults(
  defineProps<{
    beforeUrl?: string;
    baseUrl: string;
    overlayUrl?: string;
    beforeCaption?: string;
    beforeTitle?: string;
    afterTitle?: string;
    afterCaption: string;
  }>(),
  {
    beforeUrl: "",
    overlayUrl: "",
    beforeCaption: "",
    beforeTitle: "Antes · Landsat 5",
    afterTitle: "Depois · Landsat 8 + mudança de SAVI",
  },
);
const emit = defineEmits<{ (e: "settled", layer: "before" | "base" | "overlay", ok: boolean): void }>();

const MAX_SCALE = 8;
const root = ref<HTMLElement | null>(null);
const opacity = ref(35);
// Shared by all frames so before/after always show the same spot. x/y are fractions of the frame size.
const view = reactive({ scale: 1, x: 0, y: 0 });
const pointers = new Map<number, { x: number; y: number }>();
let pinchDistance = 0;

const frames = computed(() => [
  ...(props.beforeUrl ? [{ key: "before", title: props.beforeTitle, caption: props.beforeCaption }] : []),
  { key: "after", title: props.afterTitle, caption: props.afterCaption },
]);
const transform = computed(() => ({
  transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.scale})`,
}));

// Zooms around a point given as a fraction of the frame (0.5, 0.5 = center).
function zoomAt(factor: number, px = 0.5, py = 0.5) {
  const scale = Math.min(Math.max(view.scale * factor, 1), MAX_SCALE);
  const ratio = scale / view.scale;
  view.scale = scale;
  panTo(px - (px - view.x) * ratio, py - (py - view.y) * ratio);
}

function panTo(x: number, y: number) {
  view.x = Math.min(Math.max(x, 1 - view.scale), 0);
  view.y = Math.min(Math.max(y, 1 - view.scale), 0);
}

function zoomBy(factor: number) {
  zoomAt(factor);
}

function reset() {
  Object.assign(view, { scale: 1, x: 0, y: 0 });
}

function relative(event: PointerEvent | WheelEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return { rect, px: (event.clientX - rect.left) / rect.width, py: (event.clientY - rect.top) / rect.height };
}

function onWheel(event: WheelEvent) {
  const { px, py } = relative(event);
  zoomAt(event.deltaY < 0 ? 1.2 : 1 / 1.2, px, py);
}

function onPointerDown(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  pinchDistance = distance();
}

function onPointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const { rect, px, py } = relative(event);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const next = distance();
    if (pinchDistance) zoomAt(next / pinchDistance, px, py);
    pinchDistance = next;
    return;
  }
  panTo(view.x + (event.clientX - previous.x) / rect.width, view.y + (event.clientY - previous.y) / rect.height);
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  pinchDistance = distance();
}

function distance() {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void root.value?.requestFullscreen?.();
}
</script>
