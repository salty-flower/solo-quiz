<script lang="ts">
import StackedBar from "../components/chart/StackedBar.svelte";
import type { BreakdownRow } from "./breakdown";

export let scoreMixSegments: {
  label: string;
  value: number;
  colorClass: string;
}[];
export let deterministicMax: number;
export let totalSubjectiveMax: number;
export let tagBreakdownRows: BreakdownRow[];
export let typeBreakdownRows: BreakdownRow[];
</script>

<section class="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
  <div class="grid gap-4 lg:grid-cols-3">
    <div class="rounded-lg border bg-card/70 p-4 shadow-sm">
      <p class="text-xs uppercase text-muted-foreground">Score mix</p>
      <p class="text-sm text-muted-foreground">
        Balance between deterministic scoring and subjective reviews.
      </p>
      <div class="mt-3">
        <StackedBar
          label="Deterministic vs. subjective"
          description="Earned, remaining, and pending points"
          segments={scoreMixSegments}
          total={deterministicMax + totalSubjectiveMax}
        />
      </div>
    </div>
    <div class="rounded-lg border bg-card/70 p-4 shadow-sm">
      <p class="text-xs uppercase text-muted-foreground">Tag coverage</p>
      <p class="text-sm text-muted-foreground">
        Which tags saw correct, incorrect, or pending outcomes.
      </p>
      {#if tagBreakdownRows.length > 0}
        <div class="mt-3 space-y-3">
          {#each tagBreakdownRows as breakdown (breakdown.label)}
            <StackedBar
              label={breakdown.label}
              description="Per-tag results"
              segments={breakdown.segments}
              total={breakdown.total}
            />
          {/each}
        </div>
      {:else}
        <p class="mt-3 text-sm text-muted-foreground">
          No tags were attached to this assessment.
        </p>
      {/if}
    </div>
    <div class="rounded-lg border bg-card/70 p-4 shadow-sm">
      <p class="text-xs uppercase text-muted-foreground">Question types</p>
      <p class="text-sm text-muted-foreground">
        How each format performed across the attempt.
      </p>
      {#if typeBreakdownRows.length > 0}
        <div class="mt-3 space-y-3">
          {#each typeBreakdownRows as breakdown (breakdown.label)}
            <StackedBar
              label={breakdown.label}
              description="Per-type results"
              segments={breakdown.segments}
              total={breakdown.total}
            />
          {/each}
        </div>
      {:else}
        <p class="mt-3 text-sm text-muted-foreground">No question types to summarize.</p>
      {/if}
    </div>
  </div>
</section>
