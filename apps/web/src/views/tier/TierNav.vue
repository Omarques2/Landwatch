<template>
  <nav class="flex flex-wrap gap-1 border-b border-border">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.to"
      :to="tab.to"
      class="rounded-t-md px-3 py-2 text-sm font-medium transition-colors"
      :class="
        tab.match(route.path)
          ? 'border-b-2 border-foreground text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      "
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { useRoute, RouterLink } from "vue-router";

const route = useRoute();

const SUB = [
  "/tier/proprietarios",
  "/tier/fazendas",
  "/tier/frigorificos",
  "/tier/gtas",
  "/tier/abates",
  "/tier/credito",
  "/tier/cobrancas",
];

const tabs = [
  {
    label: "Tiers",
    to: "/tier",
    // Active on the list (/tier) and on any tier detail (/tier/<uuid>),
    // but not on the other sub-pages.
    match: (p: string) => p === "/tier" || (p.startsWith("/tier/") && !SUB.some((s) => p.startsWith(s))),
  },
  {
    label: "Proprietários",
    to: "/tier/proprietarios",
    match: (p: string) => p.startsWith("/tier/proprietarios"),
  },
  {
    label: "Fazendas",
    to: "/tier/fazendas",
    match: (p: string) => p.startsWith("/tier/fazendas"),
  },
  {
    label: "Frigoríficos",
    to: "/tier/frigorificos",
    match: (p: string) => p.startsWith("/tier/frigorificos"),
  },
  {
    label: "GTAs",
    to: "/tier/gtas",
    match: (p: string) => p.startsWith("/tier/gtas"),
  },
  {
    label: "Abates",
    to: "/tier/abates",
    match: (p: string) => p.startsWith("/tier/abates"),
  },
  {
    label: "Crédito",
    to: "/tier/credito",
    match: (p: string) => p.startsWith("/tier/credito"),
  },
  {
    label: "Pagamentos",
    to: "/tier/cobrancas",
    match: (p: string) => p.startsWith("/tier/cobrancas"),
  },
];
</script>
