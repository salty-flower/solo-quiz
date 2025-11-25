<script lang="ts">
export let className = "";
</script>

<div class={`rounded-lg border bg-card text-card-foreground shadow-xs ${className}`} {...$$restProps}>
  <slot />
</div>
