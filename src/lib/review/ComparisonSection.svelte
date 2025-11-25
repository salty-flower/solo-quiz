<script lang="ts">
import { createEventDispatcher } from "svelte";
import Button from "../components/ui/Button.svelte";
import type { SubmissionSummary } from "../results";

export let summary: SubmissionSummary;
export let comparisonCandidates: SubmissionSummary[];
export let comparisonAttemptId: string | null;
export let formatter: Intl.DateTimeFormat;
export let formatTime: (sec: number) => string;

const dispatch = createEventDispatcher<{
  select: string;
  open: string;
}>();

function handleSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  dispatch("select", value);
}

function openComparison() {
  if (comparisonAttemptId) {
    dispatch("open", comparisonAttemptId);
  }
}
</script>

<section class="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
  <div class="rounded-lg border bg-card/70 p-4 shadow-xs">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <p class="text-xs uppercase text-muted-foreground">Attempt history</p>
        <p class="text-sm text-muted-foreground">
          Compare this run against earlier attempts on the same assessment.
        </p>
      </div>
      {#if comparisonCandidates.length > 0}
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <select
            class="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            bind:value={comparisonAttemptId}
            aria-label="Choose attempt to compare"
            on:change={handleSelect}
          >
            {#each comparisonCandidates as attempt (attempt.id)}
              <option value={attempt.id}>
                {formatter.format(attempt.completedAt)} — {attempt.deterministicPercentage.toFixed(1)}%
              </option>
            {/each}
          </select>
          <Button size="sm" variant="outline" on:click={openComparison}>
            View attempt
          </Button>
        </div>
      {/if}
    </div>

    {#if comparisonCandidates.length === 0}
      <p class="mt-2 text-sm text-muted-foreground">
        No other attempts recorded for this assessment yet. Finish a run to unlock comparisons.
      </p>
    {:else}
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="rounded-md border bg-background/70 p-3 text-sm">
          <p class="text-xs uppercase text-muted-foreground">Current attempt</p>
          <p class="font-semibold text-foreground">{summary.assessment.meta.title}</p>
          <ul class="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Deterministic: {summary.deterministicEarned} / {summary.deterministicMax}</li>
            <li>Subjective pending: {summary.subjectiveMax}</li>
            <li>Elapsed: {formatTime(summary.elapsedSec)}</li>
          </ul>
        </div>
        <div class="rounded-md border bg-background/70 p-3 text-sm">
          <p class="text-xs uppercase text-muted-foreground">Comparison attempt</p>
          {#if comparisonAttemptId}
            {@const comparisonSummary = comparisonCandidates.find((attempt) => attempt.id === comparisonAttemptId)}
            {#if comparisonSummary}
              <p class="font-semibold text-foreground">{comparisonSummary.assessment.meta.title}</p>
              <ul class="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>
                  Deterministic: {comparisonSummary.deterministicEarned} /
                  {comparisonSummary.deterministicMax}
                </li>
                <li>Subjective pending: {comparisonSummary.subjectiveMax}</li>
                <li>Elapsed: {formatTime(comparisonSummary.elapsedSec)}</li>
              </ul>
            {:else}
              <p class="text-xs text-muted-foreground">Select an attempt to compare.</p>
            {/if}
          {:else}
            <p class="text-xs text-muted-foreground">Select an attempt to compare.</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</section>
