<!-- src/views/LoginView.vue -->
<template>
  <div class="relative min-h-screen overflow-hidden bg-background text-foreground">
    <!-- BI background (SVG) -->
    <svg
      class="pointer-events-none absolute inset-0 h-full w-full login-bg opacity-[0.42] dark:opacity-[0.25]"
      viewBox="0 0 1400 900"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path d="M 44 0 L 0 0 0 44" stroke="currentColor" stroke-opacity="0.10" stroke-width="1" />
        </pattern>

        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="white" stop-opacity="1" />
          <stop offset="1" stop-color="white" stop-opacity="0.12" />
        </linearGradient>

        <mask id="fadeMask">
          <rect x="0" y="0" width="1400" height="900" fill="url(#fade)" />
        </mask>

        <!-- leve highlight (não parece skeleton/loading) -->
        <radialGradient id="softSpot" cx="50%" cy="45%" r="65%">
          <stop offset="0" stop-color="white" stop-opacity="0.22" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- grid -->
      <rect x="0" y="0" width="1400" height="900" fill="url(#grid)" mask="url(#fadeMask)" />
      <rect x="0" y="0" width="1400" height="900" fill="url(#softSpot)" opacity="0.22" />

      <!-- ========= Top-left: Large dashboard card ========= -->
      <g transform="translate(110,120)">
        <g class="svg-anim float-a">
          <rect x="0" y="0" width="520" height="320" rx="28" fill="currentColor" fill-opacity="0.05" />
          <rect x="30" y="28" width="260" height="16" rx="8" fill="currentColor" fill-opacity="0.15" />
          <rect x="30" y="58" width="180" height="12" rx="6" fill="currentColor" fill-opacity="0.10" />
          <rect x="30" y="80" width="140" height="12" rx="6" fill="currentColor" fill-opacity="0.10" />

          <!-- KPI chips -->
          <rect x="30" y="110" width="120" height="30" rx="15" fill="currentColor" fill-opacity="0.09" />
          <rect x="160" y="110" width="140" height="30" rx="15" fill="currentColor" fill-opacity="0.09" />
          <rect x="310" y="110" width="110" height="30" rx="15" fill="currentColor" fill-opacity="0.09" />

          <!-- two panels -->
          <rect x="30" y="155" width="300" height="125" rx="18" fill="currentColor" fill-opacity="0.10" />
          <rect x="344" y="155" width="146" height="125" rx="18" fill="currentColor" fill-opacity="0.10" />

          <!-- footer strip -->
          <rect x="30" y="290" width="460" height="16" rx="8" fill="currentColor" fill-opacity="0.08" />
        </g>
      </g>

      <!-- ========= Top-right: Card + table ========= -->
      <g transform="translate(780,120)">
        <g class="svg-anim float-b">
          <rect x="0" y="0" width="500" height="300" rx="28" fill="currentColor" fill-opacity="0.05" />
          <rect x="30" y="28" width="220" height="16" rx="8" fill="currentColor" fill-opacity="0.15" />

          <!-- mini table header -->
          <rect x="30" y="70" width="440" height="34" rx="12" fill="currentColor" fill-opacity="0.10" />
          <!-- rows -->
          <rect x="30" y="112" width="440" height="26" rx="10" fill="currentColor" fill-opacity="0.08" />
          <rect x="30" y="144" width="440" height="26" rx="10" fill="currentColor" fill-opacity="0.08" />
          <rect x="30" y="176" width="440" height="26" rx="10" fill="currentColor" fill-opacity="0.08" />
          <rect x="30" y="208" width="440" height="26" rx="10" fill="currentColor" fill-opacity="0.08" />

          <rect x="30" y="248" width="240" height="14" rx="7" fill="currentColor" fill-opacity="0.10" />
        </g>
      </g>

      <!-- ========= Mid-left: bar chart ========= -->
      <g transform="translate(160,520)">
        <g class="svg-anim float-c" fill="currentColor" fill-opacity="0.10">
          <rect x="0" y="150" width="36" height="90" rx="10" />
          <rect x="56" y="110" width="36" height="130" rx="10" />
          <rect x="112" y="170" width="36" height="70" rx="10" />
          <rect x="168" y="80" width="36" height="160" rx="10" />
          <rect x="224" y="120" width="36" height="120" rx="10" />
          <rect x="280" y="95" width="36" height="145" rx="10" />
          <rect x="336" y="140" width="36" height="100" rx="10" />
        </g>
      </g>

      <!-- ========= Mid: small cards ========= -->
      <g transform="translate(520,520)">
        <g class="svg-anim float-d">
          <rect x="0" y="0" width="260" height="140" rx="24" fill="currentColor" fill-opacity="0.05" />
          <rect x="22" y="22" width="140" height="14" rx="7" fill="currentColor" fill-opacity="0.14" />
          <rect x="22" y="50" width="216" height="70" rx="16" fill="currentColor" fill-opacity="0.10" />
        </g>
      </g>

      <g transform="translate(520,680)">
        <g class="svg-anim float-e">
          <rect x="0" y="0" width="260" height="140" rx="24" fill="currentColor" fill-opacity="0.05" />
          <rect x="22" y="22" width="160" height="14" rx="7" fill="currentColor" fill-opacity="0.14" />
          <rect x="22" y="50" width="120" height="12" rx="6" fill="currentColor" fill-opacity="0.10" />
          <rect x="22" y="72" width="200" height="12" rx="6" fill="currentColor" fill-opacity="0.10" />
          <rect x="22" y="98" width="180" height="12" rx="6" fill="currentColor" fill-opacity="0.10" />
        </g>
      </g>

      <!-- ========= Right: donut charts ========= -->
      <g transform="translate(1040,560)">
        <g class="svg-anim float-f">
          <circle cx="0" cy="0" r="62" stroke="currentColor" stroke-opacity="0.10" stroke-width="18" />
          <path
            d="M 0 -62 A 62 62 0 0 1 54 30"
            stroke="currentColor"
            stroke-opacity="0.22"
            stroke-width="18"
            stroke-linecap="round"
          />
          <path
            d="M 54 30 A 62 62 0 0 1 -26 56"
            stroke="currentColor"
            stroke-opacity="0.16"
            stroke-width="18"
            stroke-linecap="round"
          />
        </g>
      </g>

      <g transform="translate(1220,700)">
        <g class="svg-anim float-g">
          <circle cx="0" cy="0" r="48" stroke="currentColor" stroke-opacity="0.10" stroke-width="16" />
          <path
            d="M 0 -48 A 48 48 0 0 1 41 24"
            stroke="currentColor"
            stroke-opacity="0.20"
            stroke-width="16"
            stroke-linecap="round"
          />
        </g>
      </g>

      <!-- ========= Line charts (só “breathing” leve) ========= -->
      <path
        class="svg-anim breathe-a"
        d="M790 520 C 880 430, 970 650, 1060 520 C 1140 410, 1230 600, 1310 470"
        stroke="currentColor"
        stroke-opacity="0.18"
        stroke-width="3.2"
        stroke-linecap="round"
      />
      <path
        class="svg-anim breathe-b"
        d="M790 560 C 860 520, 980 700, 1060 560 C 1140 440, 1230 650, 1310 520"
        stroke="currentColor"
        stroke-opacity="0.12"
        stroke-width="3.2"
        stroke-linecap="round"
      />
    </svg>

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
import { login } from "../auth/auth";
import { Button as UiButton } from "@/components/ui";
import logoUrl from "../assets/logo.png";

async function onLogin() {
  await login();
}
</script>

<style scoped>
/* drift bem leve do “canvas” do background */
.login-bg {
  animation: bg-drift 22s ease-in-out infinite;
}

/* base para qualquer coisa animada dentro do SVG */
.svg-anim {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity;
}

/* floats (amplitudes pequenas e tempos longos) */
.float-a { animation: float-y 14s ease-in-out infinite; }
.float-b { animation: float-y 16s ease-in-out infinite; animation-delay: -3s; }
.float-c { animation: float-y 13s ease-in-out infinite; animation-delay: -6s; }
.float-d { animation: float-y 15s ease-in-out infinite; animation-delay: -5s; }
.float-e { animation: float-y 17s ease-in-out infinite; animation-delay: -8s; }
.float-f { animation: float-y 12s ease-in-out infinite; animation-delay: -4s; }
.float-g { animation: float-y 18s ease-in-out infinite; animation-delay: -9s; }

/* “breathing” leve nos traços */
.breathe-a { animation: breathe 10s ease-in-out infinite; }
.breathe-b { animation: breathe 12s ease-in-out infinite; animation-delay: -4s; }

/* blobs com drift suave */
.blob {
  will-change: transform;
  filter: blur(64px);
}
.blob-a { animation: blob-drift-a 18s ease-in-out infinite; }
.blob-b { animation: blob-drift-b 22s ease-in-out infinite; animation-delay: -6s; }
.blob-c { animation: blob-drift-c 26s ease-in-out infinite; animation-delay: -10s; }

@keyframes float-y {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(0, -14px, 0); }
}

@keyframes breathe {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.78; }
}

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

@keyframes bg-drift {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(10px, -6px, 0); }
}

/* Acessibilidade: respeita Reduce Motion */
@media (prefers-reduced-motion: reduce) {
  .login-bg,
  .svg-anim,
  .blob {
    animation: none !important;
  }
}
</style>
