<script lang="ts">
type StackedSegment = {
  label: string;
  value: number;
  colorClass: string;
};

export let label: string;
export let segments: StackedSegment[];
export let total: number | null = null;
export let description: string | null = null;

$: computedTotal =
  total ?? segments.reduce((sum, segment) => sum + segment.value, 0);
</script>

<div class="space-y-2">
  <div class="flex items-baseline justify-between gap-2">
    <div>
      <p class="text-sm font-semibold text-foreground">{label}</p>
      {#if description}
        <p class="text-xs text-muted-foreground">{description}</p>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">{computedTotal} total</p>
  </div>
  <div
    class="flex overflow-hidden rounded-full border bg-muted/60"
    aria-label={description ?? label}
    role="presentation"
  >
    {#if computedTotal === 0}
      <div class="h-3 w-full bg-muted" aria-hidden="true"></div>
    {:else}
      {#each segments as segment (segment.label)}
        <div
          class={`h-3 ${segment.colorClass}`}
          style={`width: ${(segment.value / computedTotal) * 100}%`}
          title={`${segment.label}: ${segment.value}`}
        ></div>
      {/each}
    {/if}
  </div>
  <div class="flex flex-wrap gap-3 text-[0.7rem]">
    {#each segments as segment (segment.label + segment.colorClass)}
      <div class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1">
        <span class={`h-2 w-2 rounded-full ${segment.colorClass}`} aria-hidden="true"></span>
        <span class="font-medium text-foreground">{segment.label}</span>
        <span class="text-muted-foreground">({segment.value})</span>
      </div>
    {/each}
  </div>
</div>
