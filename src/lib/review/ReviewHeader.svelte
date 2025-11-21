<script lang="ts">
import { createEventDispatcher } from "svelte";
import Button from "../components/ui/Button.svelte";
import type { SubmissionSummary } from "../results";

export let summary: SubmissionSummary;
export let formatter: Intl.DateTimeFormat;
export let totalSubjectiveMax: number;
export let subjectivePendingPoints: number;
export let formatTime: (sec: number) => string;

const dispatch = createEventDispatcher<{ close: undefined }>();

function closeReview() {
  dispatch("close");
}
</script>

<header class="border-b bg-card/40">
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
    <div>
      <p class="text-xs uppercase tracking-wide text-muted-foreground">Review attempt</p>
      <h1 class="text-2xl font-semibold">{summary.assessment.meta.title}</h1>
      <p class="text-sm text-muted-foreground">
        Attempt ID: <span class="font-mono">{summary.id}</span>
      </p>
      <p class="text-sm text-muted-foreground">
        Started {formatter.format(summary.startedAt)} · Completed {formatter.format(summary.completedAt)}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Button variant="outline" on:click={closeReview}>Back to quiz</Button>
    </div>
  </div>
  <div class="mx-auto w-full max-w-6xl px-4 pb-5">
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-lg border bg-card/80 p-4">
        <p class="text-xs uppercase text-muted-foreground">Deterministic score</p>
        <p class="text-2xl font-semibold">{summary.deterministicEarned} / {summary.deterministicMax}</p>
        <p class="text-sm text-muted-foreground">{summary.deterministicPercentage.toFixed(1)}%</p>
      </div>
      <div class="rounded-lg border bg-card/80 p-4">
        <p class="text-xs uppercase text-muted-foreground">Subjective review</p>
        {#if totalSubjectiveMax > 0}
          <p class="text-2xl font-semibold">{subjectivePendingPoints}</p>
          <p class="text-sm text-muted-foreground">
            Pending across {summary.pendingSubjectiveCount}
            {summary.pendingSubjectiveCount === 1 ? "question" : "questions"}
          </p>
          {#if summary.pendingSubjectiveCount === 0}
            <p class="text-xs text-green-600 dark:text-green-300">
              All subjective questions have been reviewed.
            </p>
          {:else if subjectivePendingPoints < totalSubjectiveMax}
            <p class="text-xs text-muted-foreground">
              {totalSubjectiveMax - subjectivePendingPoints} points already graded.
            </p>
          {/if}
        {:else}
          <p class="text-lg font-semibold">None required</p>
          <p class="text-sm text-muted-foreground">This attempt has no subjective scoring.</p>
        {/if}
      </div>
      <div class="rounded-lg border bg-card/80 p-4">
        <p class="text-xs uppercase text-muted-foreground">Time used</p>
        <p class="text-2xl font-semibold">{formatTime(summary.elapsedSec)}</p>
        <p class="text-sm text-muted-foreground">
          {summary.autoSubmitted ? "Auto-submitted when timer expired" : "Submitted manually"}
        </p>
      </div>
      <div class="rounded-lg border bg-card/80 p-4">
        <p class="text-xs uppercase text-muted-foreground">Questions</p>
        <p class="text-2xl font-semibold">{summary.results.length}</p>
        <p class="text-sm text-muted-foreground">Reviewed in this attempt</p>
      </div>
    </div>
  </div>
</header>
