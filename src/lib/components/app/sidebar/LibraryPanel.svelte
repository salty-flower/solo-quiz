<script lang="ts">
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  History,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-svelte";
import { slide } from "svelte/transition";
import Button from "../../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import Separator from "../../ui/Separator.svelte";
import type { SubmissionSummary } from "../../../results";
import type { PanelKey, PanelVisibility } from "../../../stores/preferences";
import type { RecentFileEntry } from "../../../storage";
import { fingerprintKey } from "../../../utils/assessment-fingerprint";
import type { AssessmentFingerprint } from "../../../utils/assessment-fingerprint";

type RecentWithAttempts = {
  file: RecentFileEntry;
  title: string;
  fingerprint: AssessmentFingerprint | null;
  attempts: SubmissionSummary[];
};

export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let recentFiles: RecentFileEntry[] = [];
export let recentWithAttempts: RecentWithAttempts[] = [];
export let currentAssessmentTitle: string | null = null;
export let loadRecentAssessment: (
  file: RecentFileEntry,
) => void | Promise<void>;
export let onReview: (attemptId: string) => void;
export let onRetakeIncorrect: (attempt: SubmissionSummary) => void;
export let orphanedAttempts: SubmissionSummary[] = [];
export let formatter: Intl.DateTimeFormat;
export let incorrectCount: (attempt: SubmissionSummary) => number;
export let deleteRecentHistory: (names: string[]) => Promise<void> | void;
export let deleteAttempt: (attemptId: string) => Promise<void> | void;
export let deleteAttemptsByFingerprint: (
  fingerprint: AssessmentFingerprint | null,
  title: string,
) => Promise<void> | void;

$: deleteAllLabel = recentWithAttempts.some(
  (entry) => entry.attempts.length === 0,
)
  ? "Delete all files without attempts"
  : "Delete all files and matching attempts";

async function deleteRecent(entry: RecentWithAttempts) {
  await deleteRecentHistory([entry.file.name]);
  if (entry.attempts.length > 0) {
    await deleteAttemptsByFingerprint(entry.fingerprint, entry.title);
  }
}

async function deleteAllRecentFiles() {
  if (recentWithAttempts.length === 0) return;

  const withoutAttempts = recentWithAttempts.filter(
    (entry) => entry.attempts.length === 0,
  );
  if (withoutAttempts.length > 0) {
    await deleteRecentHistory(withoutAttempts.map((entry) => entry.file.name));
    return;
  }

  await deleteRecentHistory(recentWithAttempts.map((entry) => entry.file.name));
  const uniqueAttempts = new Map<
    string,
    { fingerprint: AssessmentFingerprint | null; title: string }
  >();
  for (const entry of recentWithAttempts) {
    const key =
      entry.fingerprint !== null
        ? fingerprintKey(entry.fingerprint)
        : `title::${entry.title}`;
    if (!uniqueAttempts.has(key)) {
      uniqueAttempts.set(key, {
        fingerprint: entry.fingerprint,
        title: entry.title,
      });
    }
  }
  await Promise.all(
    [...uniqueAttempts.values()].map((entry) =>
      deleteAttemptsByFingerprint(entry.fingerprint, entry.title),
    ),
  );
}
</script>

<Card>
  <CardHeader className="space-y-2">
    <div class="flex items-start gap-2">
      <CardTitle className="flex-1">Library</CardTitle>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto h-8 w-8"
        aria-pressed={!panelVisibility.recents}
        title={panelVisibility.recents ? "Show library panel" : "Hide library panel"}
        on:click={() => togglePanel("recents")}
      >
        {#if panelVisibility.recents}
          <Eye class="h-4 w-4" aria-hidden="true" />
        {:else}
          <EyeOff class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">
          {panelVisibility.recents ? "Show" : "Hide"} library panel
        </span>
      </Button>
    </div>
    <CardDescription>
      Open recent files and review attempts connected to each assessment.
    </CardDescription>
  </CardHeader>
  {#if !panelVisibility.recents}
    <div transition:slide={{ duration: 200 }}>
      <CardContent className="space-y-4">
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <p class="flex items-center gap-2 text-sm font-medium">
            <Upload class="h-4 w-4" aria-hidden="true" />
            Recent files
          </p>
          {#if recentFiles.length > 0}
            <Button
              variant="ghost"
              size="icon"
              title={deleteAllLabel}
              aria-label={deleteAllLabel}
              on:click={() => deleteAllRecentFiles()}
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              <span class="sr-only">{deleteAllLabel}</span>
            </Button>
          {/if}
        </div>

        {#if recentWithAttempts.length === 0}
          <p class="text-sm text-muted-foreground">No recent files yet.</p>
        {:else}
          <ul class="space-y-3 text-sm">
            {#each recentWithAttempts as entry (entry.file.name + entry.file.lastOpened)}
              <li class="rounded-md border border-border bg-card/70 p-3">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium leading-tight">{entry.title}</span>
                      {#if entry.title === currentAssessmentTitle}
                        <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Current</span>
                      {/if}
                    </div>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span class="break-all sm:break-normal">{entry.file.name}</span>
                      {#if entry.file.meta?.questionCount != null}
                        <span>· {entry.file.meta.questionCount} {entry.file.meta.questionCount === 1 ? "question" : "questions"}</span>
                      {/if}
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Last opened {formatter.format(new Date(entry.file.lastOpened))}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      class="grow sm:grow-0"
                      on:click={() => loadRecentAssessment(entry.file)}
                      title={`Load ${entry.title}`}
                    >
                      Open
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="h-8 w-8"
                      title={`Delete ${entry.title} and its attempts`}
                      aria-label={`Delete ${entry.title} and its attempts`}
                      on:click={() => deleteRecent(entry)}
                    >
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                      <span class="sr-only">Delete {entry.title}</span>
                    </Button>
                  </div>
                </div>

                {#if entry.attempts.length > 0}
                  <details class="mt-3 space-y-2 rounded-md border bg-muted/60 p-3 text-sm" open={entry.title === currentAssessmentTitle}>
                    <summary class="flex cursor-pointer items-center justify-between font-medium">
                      <span class="flex items-center gap-2">
                        <History class="h-4 w-4" aria-hidden="true" />
                        Past attempts
                      </span>
                      <span class="text-xs text-muted-foreground">{entry.attempts.length}</span>
                    </summary>
                    <div class="space-y-2">
                      {#each entry.attempts as attempt (attempt.id)}
                        {@const remaining = incorrectCount(attempt)}
                        <div class="rounded-md border bg-background p-2">
                          <p class="text-xs text-muted-foreground">
                            Completed {formatter.format(attempt.completedAt)} ·
                            {attempt.deterministicEarned} / {attempt.deterministicMax}
                            ({attempt.deterministicPercentage.toFixed(1)}%)
                          </p>
                          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {#if remaining === 0}
                              Perfect score on deterministic grading.
                            {:else}
                              {remaining} {remaining === 1 ? "question" : "questions"} to revisit.
                            {/if}
                          </div>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <Button size="sm" variant="outline" on:click={() => onReview(attempt.id)}>
                              <ArrowLeftRight class="mr-1 h-4 w-4" aria-hidden="true" />
                              Review
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              on:click={() => onRetakeIncorrect(attempt)}
                              disabled={remaining === 0}
                              title={
                                remaining === 0
                                  ? "All questions were correct"
                                  : "Start a fresh attempt with missed questions"
                              }
                            >
                              <RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
                              Retake incorrect
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              class="h-8 w-8"
                              title="Delete this attempt"
                              aria-label={`Delete attempt from ${entry.title}`}
                              on:click={() => deleteAttempt(attempt.id)}
                            >
                              <Trash2 class="h-4 w-4" aria-hidden="true" />
                              <span class="sr-only">
                                Delete attempt from {entry.title} completed {formatter.format(attempt.completedAt)}
                              </span>
                            </Button>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if orphanedAttempts.length > 0}
        <Separator />
        <div class="space-y-2">
          <p class="flex items-center gap-2 text-sm font-medium">
            <History class="h-4 w-4" aria-hidden="true" />
            Attempts without a recent file
          </p>
          <ul class="space-y-2 text-sm">
            {#each orphanedAttempts as attempt (attempt.id)}
              {@const remaining = incorrectCount(attempt)}
              <li class="rounded-md border bg-card/70 p-3">
                <p class="font-semibold">{attempt.assessment.meta.title}</p>
                <p class="text-xs text-muted-foreground">
                  Completed {formatter.format(attempt.completedAt)} ·
                  {attempt.deterministicEarned} / {attempt.deterministicMax}
                  ({attempt.deterministicPercentage.toFixed(1)}%)
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {#if remaining === 0}
                    Perfect score on deterministic grading.
                  {:else}
                    {remaining} {remaining === 1 ? "question" : "questions"} to revisit.
                  {/if}
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" on:click={() => onReview(attempt.id)}>
                    <ArrowLeftRight class="mr-1 h-4 w-4" aria-hidden="true" />
                    Review
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    on:click={() => onRetakeIncorrect(attempt)}
                    disabled={remaining === 0}
                    title={
                      remaining === 0
                        ? "All questions were correct"
                        : "Start a fresh attempt with missed questions"
                    }
                  >
                    <RefreshCw class="mr-1 h-4 w-4" aria-hidden="true" />
                    Retake incorrect
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8"
                    title="Delete this attempt"
                    aria-label={`Delete attempt from ${attempt.assessment.meta.title}`}
                    on:click={() => deleteAttempt(attempt.id)}
                  >
                    <Trash2 class="h-4 w-4" aria-hidden="true" />
                    <span class="sr-only">
                      Delete attempt from {attempt.assessment.meta.title} completed
                      {" "}
                      {formatter.format(attempt.completedAt)}
                    </span>
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      </CardContent>
    </div>
  {/if}
</Card>
