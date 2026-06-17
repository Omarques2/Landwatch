<template>
  <div class="route-progress" role="progressbar" aria-label="Carregando">
    <div class="route-progress__bar"></div>
  </div>
</template>

<script setup lang="ts">
// Thin indeterminate top progress bar shown during route transitions, so a
// navigation that waits on the guard/chunk feels responsive instead of frozen.
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 9999;
  background: transparent;
  overflow: hidden;
  pointer-events: none;
}
.route-progress__bar {
  height: 100%;
  width: 40%;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
  animation: route-progress-indeterminate 1s ease-in-out infinite;
}
@keyframes route-progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}
</style>
