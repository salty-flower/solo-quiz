<script lang="ts">
import Button from "../ui/Button.svelte";
import type { SubmissionSummary } from "../../results";

export let submission: SubmissionSummary;
export let formatTime: (sec: number) => string;
export let openReviewPage: () => void;
export let exportCsv: () => void;
export let exportJsonSummary: () => void;
export let exportAssessment: () => void;
export let resetAssessment: () => void;
export let retakeIncorrect: () => void;
</script>

<div class="rounded-lg border bg-card p-4 text-sm">
  <div class="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start">
    <div>
      <p class="text-lg font-semibold">
        Deterministic score: {submission.deterministicEarned} / {submission.deterministicMax}
        ({submission.deterministicPercentage.toFixed(1)}%)
      </p>
      <p class="text-xs text-muted-foreground">
        Time used: {formatTime(submission.elapsedSec)}
        {#if submission.autoSubmitted}
          — auto submitted when the timer expired.
        {/if}
      </p>
      {#if submission.subjectiveMax > 0}
        <p class="text-xs text-muted-foreground">
        Pending subjective points: {submission.subjectiveMax} across {submission.pendingSubjectiveCount}
        {submission.pendingSubjectiveCount === 1 ? "question" : "questions"}.
      </p>
    {/if}
    </div>
    <div class="ml-auto flex w-full flex-col gap-3 md:w-auto">
      <Button class="w-full md:w-auto" size="sm" on:click={openReviewPage}>
        Review results
      </Button>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" on:click={exportCsv}>Export results CSV</Button>
        <Button size="sm" variant="outline" on:click={exportJsonSummary}>
          Export JSON summary
        </Button>
        <Button size="sm" variant="outline" on:click={exportAssessment}>Download assessment JSON</Button>
      </div>
      <div class="flex flex-wrap gap-2 border-t pt-3 md:border-t-0 md:pt-0">
        <Button size="sm" variant="secondary" on:click={retakeIncorrect}>
          Retake incorrect
        </Button>
        <Button size="sm" variant="destructive" on:click={resetAssessment}>Retake quiz</Button>
      </div>
    </div>
  </div>
</div>
