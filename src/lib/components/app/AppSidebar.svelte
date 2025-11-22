<script lang="ts">
import { slide } from "svelte/transition";
import {
  ArrowLeftRight,
  Download,
  Eye,
  EyeOff,
  History,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-svelte";
import Button from "../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import Separator from "../ui/Separator.svelte";
import Switch from "../ui/Switch.svelte";
import type { Assessment, Question } from "../../schema";
import type { PanelVisibility, PanelKey } from "../../stores/preferences";
import type { RecentFileEntry } from "../../storage";
import type { ExampleAssessment } from "../../example-assessments";
import type { SubmissionSummary } from "../../results";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

export let assessment: Assessment | null = null;
export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let requireAllAnsweredChecked = false;
export let setRequireAllAnswered: (value: boolean) => void;
export let exampleAssessments: ExampleAssessment[] = [];
export let recentFiles: RecentFileEntry[] = [];
export let loadRecentAssessment: (
  file: RecentFileEntry,
) => Promise<void> | void;
export let clearHistory: () => void;
export let attempts: SubmissionSummary[] = [];
export let onReview: (attemptId: string) => void;
export let onRetakeIncorrect: (attempt: SubmissionSummary) => void;
export let currentAssessmentTitle: string | null = null;
export let questions: Question[] = [];
export let questionNavStyles: (question: Question, index: number) => string;
export let questionNavStatus: (
  question: Question,
  index: number,
) => { label: string; indicator: string };
export let navigateTo: (index: number) => void | Promise<void>;
export let downloadExampleAssessment: (id: string) => void;
export let handleFile: (file: File) => Promise<void> | void;

let fileInput: HTMLInputElement | null = null;
let isDropActive = false;
let recentWithAttempts: {
  file: RecentFileEntry;
  title: string;
  attempts: SubmissionSummary[];
}[] = [];
let orphanedAttempts: SubmissionSummary[] = [];

$: {
  const grouped = new Map<string, SubmissionSummary[]>();
  for (const attempt of attempts) {
    const title = attempt.assessment.meta.title;
    const list = grouped.get(title) ?? [];
    list.push(attempt);
    grouped.set(title, list);
  }

  recentWithAttempts = recentFiles.map((file) => {
    const title = file.meta?.title ?? file.name;
    return { file, title, attempts: grouped.get(title) ?? [] };
  });

  const recentTitles = new Set(recentWithAttempts.map((entry) => entry.title));
  orphanedAttempts = attempts.filter(
    (attempt) => !recentTitles.has(attempt.assessment.meta.title),
  );
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  void handleFile(files[0]);
  target.value = "";
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDropActive = false;
  if (!event.dataTransfer || !event.dataTransfer.files?.length) return;
  const file = event.dataTransfer.files[0];
  if (file) {
    void handleFile(file);
  }
}

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  isDropActive = true;
}

function onDragLeave(event: DragEvent) {
  event.preventDefault();
  isDropActive = false;
}

function incorrectCount(attempt: SubmissionSummary): number {
  return attempt.results.filter((result) => result.status !== "correct").length;
}
</script>

<aside
  class={`w-full space-y-4 lg:w-64 ${
    isDropActive
      ? "rounded-xl border-2 border-dashed border-primary/60 bg-primary/5"
      : ""
  }`}
  transition:slide={{ duration: 200 }}
  on:dragover={onDragOver}
  on:dragenter={onDragOver}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
>
  {#if assessment}
    <Card>
      <CardHeader className="space-y-2">
        <div class="flex items-start gap-2">
          <CardTitle className="flex-1">Questions</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            class="ml-auto h-8 w-8"
            aria-pressed={!panelVisibility.questions}
            title={
              panelVisibility.questions
                ? "Show question navigator"
                : "Hide question navigator"
            }
            on:click={() => togglePanel("questions")}
          >
            {#if panelVisibility.questions}
              <Eye class="h-4 w-4" aria-hidden="true" />
            {:else}
              <EyeOff class="h-4 w-4" aria-hidden="true" />
            {/if}
            <span class="sr-only">
              {panelVisibility.questions ? "Show" : "Hide"} question list
            </span>
          </Button>
        </div>
        <CardDescription>Jump to any question.</CardDescription>
      </CardHeader>
      {#if !panelVisibility.questions}
        <CardContent>
          <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
            {#each questions as question, index}
              {@const status = questionNavStatus(question, index)}
              <button
                type="button"
                class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${questionNavStyles(
                  question,
                  index,
                )}`}
                on:click={() => navigateTo(index)}
                aria-label={status.label}
                title={status.label}
              >
                <span aria-hidden="true" class="mr-1 text-xs">{status.indicator}</span>
                <span aria-hidden="true">{index + 1}</span>
                <span class="sr-only">{status.label}</span>
              </button>
            {/each}
          </nav>
        </CardContent>
      {/if}
    </Card>
  {/if}

  <Card>
    <CardHeader className="space-y-2">
      <div class="flex items-start gap-2">
        <CardTitle className="flex-1">Assessment</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          class="ml-auto h-8 w-8"
          aria-pressed={!panelVisibility.assessment}
          title={
            panelVisibility.assessment
              ? "Show assessment panel"
              : "Hide assessment panel"
          }
          on:click={() => togglePanel("assessment")}
        >
          {#if panelVisibility.assessment}
            <Eye class="h-4 w-4" aria-hidden="true" />
          {:else}
            <EyeOff class="h-4 w-4" aria-hidden="true" />
          {/if}
          <span class="sr-only">
            {panelVisibility.assessment ? "Show" : "Hide"} assessment panel
          </span>
        </Button>
      </div>
      <CardDescription>
        Select a JSON assessment or drop a file anywhere on the sidebar to begin.
      </CardDescription>
    </CardHeader>
    {#if !panelVisibility.assessment}
      <CardContent className="space-y-4">
        <div class="flex items-start gap-3">
          <Button
            size="sm"
            variant="secondary"
            class="shrink-0"
            title="Choose file"
            on:click={() => fileInput?.click()}
          >
            <Upload class="mr-2 h-4 w-4" aria-hidden="true" />
            Import JSON
          </Button>
          <p class="text-xs text-muted-foreground">
            You can also drag and drop an assessment file anywhere on this sidebar.
          </p>
          <input
            class="hidden"
            type="file"
            accept="application/json"
            bind:this={fileInput}
            on:change={onFileInputChange}
          />
        </div>
        <Separator />
        <label class="flex items-center justify-between text-sm">
          <span>Require all answers before submit</span>
          <Switch
            checked={requireAllAnsweredChecked}
            label="Require all answers"
            on:change={(event) => setRequireAllAnswered(event.detail)}
          />
        </label>
        <Separator />
        <div class="space-y-2">
          <p class="text-sm font-medium">Example assessments</p>
          {#each exampleAssessments as example}
            <div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <p class="font-medium">{example.data.meta.title}</p>
              <Button
                size="icon"
                variant="outline"
                class="ml-auto"
                title={`Download ${example.data.meta.title}`}
                on:click={() => downloadExampleAssessment(example.id)}
              >
                <Download class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Download {example.data.meta.title}</span>
              </Button>
            </div>
          {/each}
        </div>
      </CardContent>
    {/if}
  </Card>

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
                title="Clear recent files"
                on:click={() => clearHistory()}
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Clear recent files</span>
              </Button>
            {/if}
          </div>

          {#if recentWithAttempts.length === 0}
            <p class="text-sm text-muted-foreground">No recent files yet.</p>
          {:else}
            <ul class="space-y-3 text-sm">
              {#each recentWithAttempts as entry (entry.file.name + entry.file.lastOpened)}
                <li class="rounded-md border border-border bg-card/70 p-3">
                  <div class="flex items-start gap-3">
                    <div class="flex-1 space-y-1">
                      <div class="flex items-center gap-2">
                        <span class="line-clamp-1 font-medium">{entry.title}</span>
                        {#if entry.title === currentAssessmentTitle}
                          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Current</span>
                        {/if}
                      </div>
                      <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span class="line-clamp-1">{entry.file.name}</span>
                        {#if entry.file.meta?.questionCount != null}
                          <span>· {entry.file.meta.questionCount} {entry.file.meta.questionCount === 1 ? "question" : "questions"}</span>
                        {/if}
                      </div>
                      <p class="text-xs text-muted-foreground">
                        Last opened {formatter.format(new Date(entry.file.lastOpened))}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      class="shrink-0"
                      on:click={() => loadRecentAssessment(entry.file)}
                      title={`Load ${entry.title}`}
                    >
                      Open
                    </Button>
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
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </CardContent>
    {/if}
  </Card>
</aside>
