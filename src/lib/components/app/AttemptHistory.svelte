<script lang="ts">
import { ArrowLeftRight, History, RefreshCw } from "lucide-svelte";
import type { SubmissionSummary } from "../../results";
import Button from "../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

export let attempts: SubmissionSummary[] = [];
export let onReview: (attemptId: string) => void;
export let onRetakeIncorrect: (attempt: SubmissionSummary) => void;
export let currentAssessmentTitle: string | null = null;

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

let matchingAttempts: SubmissionSummary[] = [];
let otherAttempts: SubmissionSummary[] = [];

$: matchingAttempts = attempts.filter(
  (attempt) => attempt.assessment.meta.title === currentAssessmentTitle,
);
$: otherAttempts = attempts.filter(
  (attempt) => attempt.assessment.meta.title !== currentAssessmentTitle,
);

function incorrectCount(attempt: SubmissionSummary): number {
  return attempt.results.filter((result) => result.status !== "correct").length;
}
</script>

<Card>
  <CardHeader>
    <div class="flex items-start justify-between gap-3">
      <div>
        <CardTitle className="flex items-center gap-2">
          <History class="h-5 w-5" aria-hidden="true" />
          Attempt history
        </CardTitle>
        <CardDescription>
          Reopen prior runs, compare outcomes, or retake only the questions that tripped you up.
        </CardDescription>
      </div>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {#if attempts.length === 0}
      <p class="text-sm text-muted-foreground">No attempts recorded yet.</p>
    {:else}
      {#if matchingAttempts.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-foreground">This assessment</h3>
          <ul class="space-y-2">
            {#each matchingAttempts as attempt (attempt.id)}
              {@const remaining = incorrectCount(attempt)}
              <li class="rounded-md border bg-card/70 p-3 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <div>
                    <p class="font-semibold">{attempt.assessment.meta.title}</p>
                    <p class="text-xs text-muted-foreground">
                      Completed {formatter.format(attempt.completedAt)} ·
                      {attempt.deterministicEarned} / {attempt.deterministicMax}
                      ({attempt.deterministicPercentage.toFixed(1)}%)
                    </p>
                  </div>
                  <div class="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" on:click={() => onReview(attempt.id)}>
                      <ArrowLeftRight class="mr-1 h-4 w-4" aria-hidden="true" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      on:click={() => onRetakeIncorrect(attempt)}
                      disabled={remaining === 0}
                      title={remaining === 0
                        ? "All questions were correct"
                        : "Start a fresh attempt with missed questions"}
                    >
                      <RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
                      Retake incorrect
                    </Button>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">
                  {#if remaining === 0}
                    Perfect score on deterministic grading.
                  {:else}
                    {remaining} {remaining === 1 ? "question" : "questions"} to revisit.
                  {/if}
                </p>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if otherAttempts.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold text-foreground">Other assessments</h3>
          <ul class="space-y-2">
            {#each otherAttempts as attempt (attempt.id)}
              {@const remaining = incorrectCount(attempt)}
              <li class="rounded-md border bg-card/70 p-3 text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  <div>
                    <p class="font-semibold">{attempt.assessment.meta.title}</p>
                    <p class="text-xs text-muted-foreground">
                      Completed {formatter.format(attempt.completedAt)} ·
                      {attempt.deterministicEarned} / {attempt.deterministicMax}
                      ({attempt.deterministicPercentage.toFixed(1)}%)
                    </p>
                  </div>
                  <div class="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" on:click={() => onReview(attempt.id)}>
                      <ArrowLeftRight class="mr-1 h-4 w-4" aria-hidden="true" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      on:click={() => onRetakeIncorrect(attempt)}
                      disabled={remaining === 0}
                      title={remaining === 0
                        ? "All questions were correct"
                        : "Start a fresh attempt with missed questions"}
                    >
                      <RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
                      Retake incorrect
                    </Button>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">
                  {#if remaining === 0}
                    Perfect score on deterministic grading.
                  {:else}
                    {remaining} {remaining === 1 ? "question" : "questions"} to revisit.
                  {/if}
                </p>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </CardContent>
</Card>
