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
  <div class="flex flex-wrap items-center gap-4">
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
    <div class="ml-auto flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" on:click={openReviewPage}>
        View summary
      </Button>
      <Button size="sm" on:click={exportCsv}>Export results CSV</Button>
      <Button size="sm" variant="outline" on:click={exportJsonSummary}>
        Export JSON summary
      </Button>
      <Button size="sm" variant="outline" on:click={exportAssessment}>Download assessment JSON</Button>
      <Button size="sm" variant="secondary" on:click={retakeIncorrect}>
        Retake incorrect
      </Button>
      <Button size="sm" variant="ghost" on:click={resetAssessment}>Retake quiz</Button>
    </div>
  </div>
</div>
