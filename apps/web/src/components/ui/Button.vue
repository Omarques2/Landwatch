<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { buttonVariants, type ButtonVariants } from "./button";
import { cn } from "@/lib/utils";

defineOptions({ name: "UiButton", inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    as?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "default",
    size: "md",
    as: "button",
    type: "button",
    disabled: false,
  },
);

const attrs = useAttrs();
const classes = computed(() =>
  cn(buttonVariants({ variant: props.variant, size: props.size }), attrs.class as string | undefined),
);
</script>

<template>
  <component
    :is="as"
    v-bind="attrs"
    :class="classes"
    :type="as === 'button' ? type : undefined"
    :disabled="as === 'button' ? disabled : undefined"
  >
    <slot />
  </component>
</template>
