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
