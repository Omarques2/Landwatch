<!-- src/views/LoginView.vue -->
<template>
  <div class="relative min-h-screen overflow-hidden bg-background text-foreground">
    <!-- Farm fields background (SVG) -->
    <svg
      class="pointer-events-none absolute inset-0 h-full w-full login-bg opacity-[0.42] dark:opacity-[0.25]"
      viewBox="0 0 1400 900"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="baseWash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#E7E6DA" stop-opacity="0.7" />
          <stop offset="1" stop-color="#D6D9C5" stop-opacity="0.55" />
        </linearGradient>

        <linearGradient id="fieldGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#708E70" stop-opacity="0.82" />
          <stop offset="1" stop-color="#4F6D54" stop-opacity="0.86" />
        </linearGradient>

        <linearGradient id="fieldOlive" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8A9C6A" stop-opacity="0.82" />
          <stop offset="1" stop-color="#6B7C53" stop-opacity="0.86" />
        </linearGradient>

        <linearGradient id="fieldGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#C9B27C" stop-opacity="0.82" />
          <stop offset="1" stop-color="#AA8B59" stop-opacity="0.86" />
        </linearGradient>

        <linearGradient id="fieldWheat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#E0C7A1" stop-opacity="0.82" />
          <stop offset="1" stop-color="#C6A479" stop-opacity="0.86" />
        </linearGradient>

        <linearGradient id="fieldSoil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#8E6A54" stop-opacity="0.78" />
          <stop offset="1" stop-color="#6B4A3A" stop-opacity="0.82" />
        </linearGradient>

        <linearGradient id="fieldMint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7AA594" stop-opacity="0.78" />
          <stop offset="1" stop-color="#5E8677" stop-opacity="0.82" />
        </linearGradient>

        <linearGradient id="river" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#6C8FA3" stop-opacity="0.6" />
          <stop offset="1" stop-color="#3B6C79" stop-opacity="0.65" />
        </linearGradient>

        <pattern
          id="rowsA"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-18)"
        >
          <path d="M0 0 H18" stroke="#F1E7C9" stroke-opacity="0.35" stroke-width="1" />
        </pattern>

        <pattern
          id="rowsB"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(12)"
        >
          <path d="M0 0 H16" stroke="#D8E5C0" stroke-opacity="0.35" stroke-width="1" />
        </pattern>

        <pattern
          id="rowsC"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-6)"
        >
          <path d="M0 0 H14" stroke="#E8D7B2" stroke-opacity="0.35" stroke-width="1" />
        </pattern>

        <radialGradient id="sunGlow" cx="20%" cy="10%" r="60%">
          <stop offset="0" stop-color="#FFF1D2" stop-opacity="0.38" />
          <stop offset="1" stop-color="#FFF1D2" stop-opacity="0" />
        </radialGradient>

        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.25" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1400" height="900" fill="url(#baseWash)" />
      <rect x="0" y="0" width="1400" height="900" fill="url(#sunGlow)" opacity="0.55" />
      <rect x="0" y="0" width="1400" height="900" fill="url(#mist)" opacity="0.5" />

      <!-- ========= Fields / parcels ========= -->
      <g class="svg-anim float-a">
        <polygon points="60,120 380,70 520,180 180,240" fill="url(#fieldWheat)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="180,240 520,180 640,280 240,340" fill="url(#fieldGold)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="60,120 180,240 80,320 10,230" fill="url(#fieldGreen)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="520,180 760,160 860,270 640,280" fill="url(#fieldOlive)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="760,160 1040,120 1120,230 860,270" fill="url(#fieldWheat)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="1040,120 1330,160 1310,300 1120,230" fill="url(#fieldSoil)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="240,340 640,280 720,410 320,470" fill="url(#fieldGreen)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="640,280 860,270 960,380 720,410" fill="url(#fieldMint)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="860,270 1120,230 1200,360 960,380" fill="url(#fieldGold)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="1120,230 1310,300 1290,420 1200,360" fill="url(#fieldWheat)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="80,320 240,340 320,470 120,520" fill="url(#fieldSoil)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="320,470 720,410 820,560 380,620" fill="url(#fieldWheat)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="720,410 960,380 1060,520 820,560" fill="url(#fieldGreen)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="960,380 1200,360 1240,520 1060,520" fill="url(#fieldOlive)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="120,520 380,620 300,760 80,690" fill="url(#fieldGreen)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="380,620 820,560 900,710 300,760" fill="url(#fieldGold)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="820,560 1060,520 1160,700 900,710" fill="url(#fieldWheat)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="1060,520 1240,520 1340,680 1160,700" fill="url(#fieldSoil)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="80,690 300,760 260,860 40,820" fill="url(#fieldOlive)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="300,760 900,710 980,840 260,860" fill="url(#fieldMint)" stroke="#7A7B6E" stroke-opacity="0.35" />
        <polygon points="900,710 1160,700 1300,860 980,840" fill="url(#fieldGreen)" stroke="#7A7B6E" stroke-opacity="0.35" />
      </g>

      <!-- ========= Crop rows overlay ========= -->
      <g class="svg-anim float-b" opacity="0.55">
        <polygon points="60,120 380,70 520,180 180,240" fill="url(#rowsA)" />
        <polygon points="180,240 520,180 640,280 240,340" fill="url(#rowsA)" />
        <polygon points="760,160 1040,120 1120,230 860,270" fill="url(#rowsC)" />
        <polygon points="240,340 640,280 720,410 320,470" fill="url(#rowsB)" />
        <polygon points="960,380 1200,360 1240,520 1060,520" fill="url(#rowsC)" />
        <polygon points="320,470 720,410 820,560 380,620" fill="url(#rowsA)" />
        <polygon points="380,620 820,560 900,710 300,760" fill="url(#rowsB)" />
        <polygon points="300,760 900,710 980,840 260,860" fill="url(#rowsA)" />
      </g>

      <!-- ========= Roads ========= -->
      <g class="svg-anim float-c" stroke="#B7B09C" stroke-opacity="0.6" stroke-width="10" stroke-linecap="round">
        <path d="M80 320 L520 180 L1100 120" />
        <path d="M240 340 L320 470 L380 620 L300 760" />
        <path d="M640 280 L720 410 L820 560 L900 710" />
        <path d="M960 380 L1060 520 L1160 700" />
      </g>
      <g class="svg-anim float-d" stroke="#E0D8C7" stroke-opacity="0.45" stroke-width="4" stroke-linecap="round">
        <path d="M120 520 L320 470" />
        <path d="M1200 360 L1290 420" />
        <path d="M820 560 L1060 520" />
      </g>

      <!-- ========= River ========= -->
      <path
        class="svg-anim breathe-a"
        d="M1400 520 C 1220 480, 1100 560, 980 520 C 880 490, 760 560, 640 530 C 520 500, 360 580, 200 520"
        stroke="url(#river)"
        stroke-width="26"
        stroke-linecap="round"
        opacity="0.55"
      />
      <path
        class="svg-anim breathe-b"
        d="M1400 520 C 1220 480, 1100 560, 980 520 C 880 490, 760 560, 640 530 C 520 500, 360 580, 200 520"
        stroke="#BFE0E6"
        stroke-width="6"
        stroke-linecap="round"
        opacity="0.5"
      />

      <!-- ========= Tree clusters ========= -->
      <g class="svg-anim float-e" fill="#2F5D38" fill-opacity="0.5">
        <circle cx="210" cy="210" r="14" />
        <circle cx="230" cy="200" r="10" />
        <circle cx="250" cy="220" r="12" />
        <circle cx="1080" cy="240" r="14" />
        <circle cx="1100" cy="230" r="10" />
        <circle cx="1120" cy="250" r="12" />
        <circle cx="520" cy="640" r="14" />
        <circle cx="540" cy="630" r="10" />
        <circle cx="560" cy="650" r="12" />
        <circle cx="980" cy="760" r="14" />
        <circle cx="1000" cy="750" r="10" />
        <circle cx="1020" cy="770" r="12" />
      </g>

      <!-- ========= Farm houses ========= -->
      <g class="svg-anim float-f">
        <rect x="670" y="300" width="24" height="18" fill="#E9E3D4" opacity="0.75" />
        <polygon points="670,300 682,288 694,300" fill="#A55B45" opacity="0.8" />
        <rect x="1180" y="420" width="22" height="16" fill="#E9E3D4" opacity="0.75" />
        <polygon points="1180,420 1191,410 1202,420" fill="#A55B45" opacity="0.8" />
        <rect x="360" y="700" width="22" height="16" fill="#E9E3D4" opacity="0.75" />
        <polygon points="360,700 371,690 382,700" fill="#A55B45" opacity="0.8" />
      </g>

      <!-- ========= Irrigation circles ========= -->
      <g class="svg-anim float-g" stroke="#DDE9CF" stroke-opacity="0.6" fill="none">
        <circle cx="1010" cy="200" r="66" stroke-width="3" />
        <circle cx="1010" cy="200" r="38" stroke-width="2" />
        <circle cx="360" cy="520" r="44" stroke-width="2.5" />
      </g>
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
