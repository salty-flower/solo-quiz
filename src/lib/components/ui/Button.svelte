<script lang="ts">
import { createEventDispatcher } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";

export let type: HTMLButtonAttributes["type"] = "button";
export let variant:
  | "default"
  | "outline-solid"
  | "ghost"
  | "secondary"
  | "destructive" = "default";
export let size: "default" | "sm" | "lg" | "icon" = "default";
export let disabled = false;
export let className = "";

const dispatch = createEventDispatcher<{ click: MouseEvent }>();

function handleClick(event: MouseEvent) {
  dispatch("click", event);
}

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background";

const variants: Record<typeof variant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const sizes: Record<typeof size, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
};
</script>

<button
  {type}
  class={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
  {disabled}
  on:click={handleClick}
  {...$$restProps}
>
  <slot />
</button>
