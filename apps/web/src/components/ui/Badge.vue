<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiBadge", inheritAttrs: false });

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-input text-foreground",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeVariants = VariantProps<typeof badgeVariants>;

const props = defineProps<{
  variant?: BadgeVariants["variant"];
}>();

const attrs = useAttrs();
const classes = computed(() =>
  cn(badgeVariants({ variant: props.variant }), attrs.class as string | undefined),
);
</script>

<template>
  <span v-bind="attrs" :class="classes">
    <slot />
  </span>
</template>
