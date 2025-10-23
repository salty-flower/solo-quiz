<script lang="ts">
  export let className = "";
</script>

<div class={`w-full rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive ${className}`} {...$$restProps}>
  <slot />
</div>
