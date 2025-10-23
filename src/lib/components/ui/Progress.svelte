<script lang="ts">
  export let value = 0;
  export let className = "";
</script>

<div class={`relative h-2 w-full overflow-hidden rounded-full bg-muted ${className}`} {...$$restProps}>
  <div
    class="h-full flex-1 bg-primary transition-all"
    style={`transform: translateX(-${100 - Math.min(100, Math.max(0, value))}%)`}
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
  ></div>
</div>
