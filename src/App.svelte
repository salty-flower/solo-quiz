<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";
import { slide } from "svelte/transition";
import {
  Download,
  Eye,
  EyeOff,
  Moon,
  PanelLeft,
  PanelRight,
  Sun,
  Trash2,
  Upload,
} from "lucide-svelte";
import Button from "./lib/components/ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./lib/components/ui/card";
import Separator from "./lib/components/ui/Separator.svelte";
import Progress from "./lib/components/ui/Progress.svelte";
import Switch from "./lib/components/ui/Switch.svelte";
import Alert from "./lib/components/ui/Alert.svelte";
import { renderWithKatex } from "./lib/katex";
import {
  parseAssessment,
  questionWeight,
  type Assessment,
  type Question,
  type SingleQuestion,
  type MultiQuestion,
  type OrderingQuestion,
  type SubjectiveQuestion,
} from "./lib/schema";
import { type RecentFileEntry } from "./lib/storage";
import {
  findExampleAssessment,
  getExampleAssessments,
} from "./lib/example-assessments";
import {
  buildCsv,
  downloadCsv,
  type CsvQuestionResult,
  type CsvSummary,
} from "./lib/csv";
import { buildSubjectivePrompt } from "./lib/llm";
import {
  createSerializableQuestionResult,
  type AnswerValue,
  type QuestionResult,
  type SubmissionSummary,
} from "./lib/results";
import { preferences } from "./lib/stores/preferences";
import { quiz } from "./lib/stores/quiz";
import ReviewPage from "./lib/review/ReviewPage.svelte";
import { llm } from "./lib/stores/llm";
import { getAttempt } from "./lib/stores/attempts";
import {
  getReviewPath,
  getHomePath,
  navigate,
  routePath,
} from "./lib/stores/router";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

let fileInput: HTMLInputElement | null = null;
let dropActive = false;
let questionContainer: HTMLDivElement | null = null;
let requireAllAnsweredChecked = false;
let assessment: Assessment | null = null;
let questions: Question[] = [];
let answers: Record<string, AnswerValue> = {};
let touchedQuestions = new Set<string>();
let orderingTouched = new Set<string>();
let currentIndex = 0;
let currentQuestion: Question | undefined = undefined;
let currentResult: QuestionResult | null = null;
let parseErrors: { path: string; message: string }[] = [];
let elapsedSec = 0;
let timeLimitSec: number | null = null;
let timeRemaining: number | null = null;
let submitted = false;
let submission: SubmissionSummary | null = null;
let submitDisabledValue = false;
let reviewAttemptId: string | null = null;
const theme = preferences.theme;
const panelVisibility = preferences.panelVisibility;
const sidebarVisible = preferences.sidebarVisible;
const { togglePanel, toggleSidebar, cycleTheme } = preferences;
const {
  assessment: assessmentStore,
  questions: questionsStore,
  answers: answersStore,
  touchedQuestions: touchedQuestionsStore,
  orderingTouched: orderingTouchedStore,
  currentIndex: currentIndexStore,
  currentQuestion: currentQuestionStore,
  currentResult: currentResultStore,
  parseErrors: parseErrorsStore,
  elapsedSec: elapsedSecStore,
  timeLimitSec: timeLimitSecStore,
  timeRemaining: timeRemainingStore,
  submitted: submittedStore,
  submission: submissionStore,
  requireAllAnswered,
  recentFiles,
  answeredCount,
  totalQuestions,
  hasAnyAnswer,
  progressValue,
  submitDisabled,
  refreshRecentFiles,
  handleFile,
  loadRecentAssessment,
  updateTouched,
  setOrderingTouched,
  setCurrentIndex,
  setRequireAllAnswered,
  submitQuiz,
  resetAssessment,
  clearHistory,
  teardown,
} = quiz;
const { reset: resetLlmState } = llm;
const exampleAssessments = getExampleAssessments();

onMount(async () => {
  await refreshRecentFiles();
});

onDestroy(() => {
  teardown();
});

$: if (assessment) {
  resetLlmState();
}

$: if (submitted) {
  resetLlmState();
}
$: reviewAttemptId = parseReviewPath($routePath);
$: requireAllAnsweredChecked = $requireAllAnswered;
$: timeDisplay =
  timeRemaining !== null ? formatTime(timeRemaining) : formatTime(elapsedSec);
$: assessment = $assessmentStore;
$: questions = $questionsStore;
$: answers = $answersStore;
$: touchedQuestions = $touchedQuestionsStore;
$: orderingTouched = $orderingTouchedStore;
$: currentIndex = $currentIndexStore;
$: currentQuestion = $currentQuestionStore;
$: currentResult = $currentResultStore;
$: parseErrors = $parseErrorsStore;
$: elapsedSec = $elapsedSecStore;
$: timeLimitSec = $timeLimitSecStore;
$: timeRemaining = $timeRemainingStore;
$: submitted = $submittedStore;
$: submission = $submissionStore;
$: submitDisabledValue = $submitDisabled;

function formatTime(sec: number): string {
  const minutes = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function parseReviewPath(path: string): string | null {
  if (!path) return null;
  const hashMatch = /#review\/([^/?#]+)/.exec(path);
  if (hashMatch) {
    return decodeURIComponent(hashMatch[1]);
  }
  return null;
}

function openReviewPage() {
  if (!submission) return;
  navigate(getReviewPath(submission.id));
}

function closeReviewPage() {
  const homePath = getHomePath();
  if (reviewAttemptId && !getAttempt(reviewAttemptId)) {
    navigate(homePath);
    return;
  }
  navigate(homePath);
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
  dropActive = false;
  if (!event.dataTransfer) return;
  const file = event.dataTransfer.files?.[0];
  if (file) {
    void handleFile(file);
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  dropActive = true;
}

function onDragLeave(event: DragEvent) {
  event.preventDefault();
  dropActive = false;
}

function handleDropzoneKey(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput?.click();
  }
}

function questionNavStyles(question: Question, index: number): string {
  if (index === currentIndex) {
    return "border-primary bg-primary/10 text-primary";
  }

  if (submission) {
    const result = submission.results[index];
    if (!result) {
      return "border-border";
    }
    if (result.status === "correct") {
      return "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-300";
    }
    if (result.status === "incorrect") {
      return "border-destructive/60 bg-destructive/10 text-destructive";
    }
    return "border-muted-foreground/40 bg-muted/10 text-muted-foreground";
  }

  if (touchedQuestions.has(question.id)) {
    return "border-primary bg-primary/10 text-primary";
  }

  return "border-border";
}

async function navigateTo(index: number) {
  if (index < 0 || index >= questions.length) return;
  setCurrentIndex(index);
  await tick();
  questionContainer?.focus();
}

function exportCsv() {
  if (!submission) return;
  const serializable = submission.results.map(
    (result: QuestionResult, index: number) =>
      createSerializableQuestionResult(result, index),
  );
  const rows: CsvQuestionResult[] = serializable.map(
    (entry: ReturnType<typeof createSerializableQuestionResult>) => ({
      questionNumber: entry.position,
      questionId: entry.questionId,
      questionText: entry.questionText,
      type: entry.type,
      weight: entry.weight,
      tags: entry.tags,
      userAnswer: entry.userAnswer,
      correctAnswer: entry.correctAnswer,
      earned: entry.earned,
      max: entry.max,
      result: entry.status,
    }),
  );
  const summary: CsvSummary = {
    assessmentTitle: submission.assessment.meta.title,
    deterministicScore: submission.deterministicEarned,
    deterministicMax: submission.deterministicMax,
    deterministicPercentage: submission.deterministicPercentage,
    pendingSubjectiveMax: submission.subjectiveMax,
    startedAt: submission.startedAt,
    completedAt: submission.completedAt,
    timeElapsedSec: submission.elapsedSec,
  };
  const csv = buildCsv(summary, rows);
  downloadCsv(
    `${sanitizeFilename(submission.assessment.meta.title)}-results.csv`,
    csv,
  );
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-");
}

function downloadExampleAssessment(id: string) {
  const example = findExampleAssessment(id);
  if (!example) return;

  const blob = new Blob([`${JSON.stringify(example.data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(example.data.meta.title)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportAssessment() {
  if (!assessment) return;
  const blob = new Blob([JSON.stringify(assessment, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(assessment.meta.title)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportJsonSummary() {
  if (!submission) return;
  const summary = submission;
  const serializable = summary.results.map(
    (result: QuestionResult, index: number) =>
      createSerializableQuestionResult(result, index),
  );
  const { assessment: assessed } = summary;
  const data = {
    assessment: {
      title: assessed.meta.title,
      description: assessed.meta.description ?? null,
      timeLimitSec: assessed.meta.timeLimitSec ?? null,
    },
    deterministic: {
      earned: summary.deterministicEarned,
      max: summary.deterministicMax,
      percentage: summary.deterministicPercentage,
    },
    subjective: {
      pendingCount: summary.pendingSubjectiveCount,
      max: summary.subjectiveMax,
    },
    timing: {
      startedAt: summary.startedAt.toISOString(),
      completedAt: summary.completedAt.toISOString(),
      elapsedSec: summary.elapsedSec,
      autoSubmitted: summary.autoSubmitted,
    },
    results: serializable.map(
      (
        entry: ReturnType<typeof createSerializableQuestionResult>,
        index: number,
      ) => {
        const result = summary.results[index];
        return {
          position: entry.position,
          questionId: entry.questionId,
          type: entry.type,
          weight: entry.weight,
          tags: entry.tags,
          status: entry.status,
          earned: entry.earned,
          max: entry.max,
          userAnswer: entry.userAnswer,
          correctAnswer: entry.correctAnswer,
          feedback: entry.feedback,
          rubrics: entry.rubrics,
          llmPrompt: result.requiresManualGrading
            ? buildSubjectivePrompt({
                question: result.question,
                userAnswer: entry.userAnswer,
                maxScore: entry.max,
              })
            : undefined,
        };
      },
    ),
  };
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(assessed.meta.title)}-summary.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function moveOrdering(
  question: OrderingQuestion,
  index: number,
  direction: -1 | 1,
) {
  const current = Array.isArray(answers[question.id])
    ? ([...(answers[question.id] as string[])] as string[])
    : [...question.items];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= current.length) return;
  [current[index], current[targetIndex]] = [
    current[targetIndex],
    current[index],
  ];
  setOrderingTouched(question.id, true);
  updateTouched(question, current);
}

function resetOrdering(question: OrderingQuestion) {
  setOrderingTouched(question.id, false);
  updateTouched(question, [...question.items]);
}
</script>

<svelte:window on:dragover|preventDefault={onDragOver} on:drop={onDrop} />

{#if reviewAttemptId}
  <ReviewPage attemptId={reviewAttemptId} on:close={closeReviewPage} />
{:else}
<div class="min-h-screen bg-background text-foreground">
  <header class="border-b bg-card/30 backdrop-blur">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Solo Quiz Player</h1>
        {#if assessment}
          <p class="text-sm text-muted-foreground">{assessment.meta.title}</p>
        {:else}
          <p class="text-sm text-muted-foreground">Load an assessment JSON to begin.</p>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-3 sm:justify-end">
        <Button
          variant="outline"
          size="icon"
          class="h-9"
          aria-pressed={$sidebarVisible}
          title={$sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          on:click={toggleSidebar}
        >
          {#if $sidebarVisible}
            <PanelLeft class="h-4 w-4" aria-hidden="true" />
          {:else}
            <PanelRight class="h-4 w-4" aria-hidden="true" />
          {/if}
          <span class="sr-only">{$sidebarVisible ? "Hide sidebar" : "Show sidebar"}</span>
        </Button>
        {#if assessment}
          <div class="rounded-md border px-3 py-1 text-sm">
            <span class="font-medium">{timeLimitSec ? "Time Remaining" : "Elapsed"}:</span>
            <span class="ml-2 font-mono">{timeDisplay}</span>
          </div>
          <div class="w-40">
            <Progress value={$progressValue} />
            <p class="mt-1 text-xs text-muted-foreground">
              {$answeredCount} / {$totalQuestions} answered
            </p>
          </div>
        {/if}
        <Button
          variant="ghost"
          size="icon"
          class="h-9"
          aria-pressed={$theme === "dark"}
          title={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          on:click={cycleTheme}
        >
          {#if $theme === "dark"}
            <Moon class="h-4 w-4" aria-hidden="true" />
          {:else}
            <Sun class="h-4 w-4" aria-hidden="true" />
          {/if}
          <span class="sr-only">
            {$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </span>
        </Button>
      </div>
    </div>
  </header>

  <main class={`mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 ${$sidebarVisible ? "lg:flex-row" : ""}`}>
    {#if $sidebarVisible}
      <aside class="w-full space-y-4 lg:w-64" transition:slide={{ duration: 200 }}>
      <Card>
        <CardHeader className="flex items-start justify-between space-y-0">
          <div>
            <CardTitle>Assessment</CardTitle>
            <CardDescription>Import JSON or drag & drop to get started.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            aria-pressed={!$panelVisibility.assessment}
            title={
              $panelVisibility.assessment
                ? "Show assessment panel"
                : "Hide assessment panel"
            }
            on:click={() => togglePanel("assessment")}
          >
            {#if $panelVisibility.assessment}
              <Eye class="h-4 w-4" aria-hidden="true" />
            {:else}
              <EyeOff class="h-4 w-4" aria-hidden="true" />
            {/if}
            <span class="sr-only">
              {$panelVisibility.assessment ? "Show" : "Hide"} assessment panel
            </span>
          </Button>
        </CardHeader>
        {#if !$panelVisibility.assessment}
          <CardContent className="space-y-4">
            <div
              class={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
                dropActive ? "border-primary bg-primary/10" : "border-muted"
              }`}
              on:dragover|preventDefault={onDragOver}
              on:dragleave={onDragLeave}
              on:drop={onDrop}
              role="button"
              tabindex="0"
              aria-label="Load assessment JSON file"
              on:keydown={handleDropzoneKey}
            >
              <p class="font-medium">Drop JSON here</p>
              <p class="text-muted-foreground">or</p>
              <Button
                size="icon"
                variant="secondary"
                title="Choose file"
                on:click={() => fileInput?.click()}
              >
                <Upload class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Choose file</span>
              </Button>
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
                bind:checked={requireAllAnsweredChecked}
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
        <CardHeader className="flex items-start justify-between space-y-0">
          <div>
            <CardTitle>Recent files</CardTitle>
            <CardDescription>Stored in IndexedDB or localStorage when available.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            aria-pressed={!$panelVisibility.recents}
            title={
              $panelVisibility.recents
                ? "Show recent files"
                : "Hide recent files"
            }
            on:click={() => togglePanel("recents")}
          >
            {#if $panelVisibility.recents}
              <Eye class="h-4 w-4" aria-hidden="true" />
            {:else}
              <EyeOff class="h-4 w-4" aria-hidden="true" />
            {/if}
            <span class="sr-only">
              {$panelVisibility.recents ? "Show" : "Hide"} recent files
            </span>
          </Button>
        </CardHeader>
        {#if !$panelVisibility.recents}
          <CardContent className="space-y-3">
            {#if $recentFiles.length === 0}
              <p class="text-sm text-muted-foreground">No recent files yet.</p>
            {:else}
              <ul class="space-y-2 text-sm">
                {#each $recentFiles as file}
                  <li>
                    <button
                      type="button"
                      class="flex w-full flex-col rounded-md border border-border px-3 py-2 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      on:click={() => loadRecentAssessment(file)}
                      title={`Load ${file.name}`}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="line-clamp-1 font-medium">
                          {file.meta?.title ?? file.name}
                        </span>
                        {#if file.meta?.questionCount != null}
                          <span class="text-xs text-muted-foreground">
                            {file.meta.questionCount}
                            {file.meta.questionCount === 1
                              ? " question"
                              : " questions"}
                          </span>
                        {/if}
                      </div>
                      <span class="line-clamp-1 text-xs text-muted-foreground">{file.name}</span>
                      <span class="text-xs text-muted-foreground">{formatter.format(new Date(file.lastOpened))}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              <Button
                variant="ghost"
                size="icon"
                title="Clear history"
                on:click={() => clearHistory()}
                >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Clear history</span>
              </Button>
            {/if}
          </CardContent>
        {/if}
      </Card>

      {#if assessment}
        <Card>
          <CardHeader className="flex items-start justify-between space-y-0">
            <div>
              <CardTitle>Questions</CardTitle>
              <CardDescription>Jump to any question.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              aria-pressed={!$panelVisibility.questions}
              title={
                $panelVisibility.questions
                  ? "Show question navigator"
                  : "Hide question navigator"
              }
              on:click={() => togglePanel("questions")}
            >
              {#if $panelVisibility.questions}
                <Eye class="h-4 w-4" aria-hidden="true" />
              {:else}
                <EyeOff class="h-4 w-4" aria-hidden="true" />
              {/if}
              <span class="sr-only">
                {$panelVisibility.questions ? "Show" : "Hide"} question list
              </span>
            </Button>
          </CardHeader>
          {#if !$panelVisibility.questions}
            <CardContent>
              <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
                {#each questions as question, index}
                  <button
                    type="button"
                    class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${questionNavStyles(
                      question,
                      index,
                    )}`}
                    on:click={() => navigateTo(index)}
                  >
                    {index + 1}
                  </button>
                {/each}
              </nav>
            </CardContent>
          {/if}
        </Card>
      {/if}
      </aside>
    {/if}

    <section class="flex-1 space-y-6">
      {#if parseErrors.length > 0}
        <Alert>
          <p class="font-medium">Unable to load assessment:</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            {#each parseErrors as issue}
              <li><span class="font-mono">{issue.path || "root"}</span>: {issue.message}</li>
            {/each}
          </ul>
        </Alert>
      {/if}

      {#if !assessment}
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Use the sidebar to load a JSON assessment.</CardDescription>
          </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The player runs entirely in your browser. Import assessments, take the quiz offline, and export your
              results as CSV when finished.
            </p>
            <p>Need inspiration? Check out the sample assessment in the repository's <code>examples</code> directory.</p>
          </CardContent>
        </Card>
      {:else if questions.length === 0}
        <Card>
          <CardHeader>
            <CardTitle>No questions available</CardTitle>
            <CardDescription>The loaded assessment does not include any questions.</CardDescription>
          </CardHeader>
        </Card>
      {:else}
        {#if submission}
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
                <Button size="sm" variant="ghost" on:click={resetAssessment}>Retake quiz</Button>
              </div>
            </div>
          </div>
        {/if}

        {#if currentQuestion}
          <Card>
            <CardHeader>
              <CardTitle>Question {currentIndex + 1} of {questions.length}</CardTitle>
              <CardDescription className="space-y-1 text-sm">
                <div class="space-y-2 leading-relaxed">
                  {@html renderWithKatex(currentQuestion.text)}
                </div>
                {#if currentQuestion.tags?.length}
                  <p class="text-xs text-muted-foreground">Tags: {currentQuestion.tags.join(", ")}</p>
                {/if}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                class="space-y-4 focus:outline-none"
                tabindex="-1"
                bind:this={questionContainer}
                aria-live="polite"
              >
                {#if currentQuestion.type === "single"}
                  {@const singleQuestion = currentQuestion as SingleQuestion}
                  {#each singleQuestion.options as option}
                    <label class="flex items-start gap-3 rounded-lg border p-3 transition hover:border-primary focus-within:ring-2 focus-within:ring-primary">
                      <input
                        class="mt-1 h-4 w-4"
                        type="radio"
                        name={`q-${singleQuestion.id}`}
                        value={option.id}
                        checked={(answers[singleQuestion.id] as string) === option.id}
                        on:change={() => updateTouched(singleQuestion, option.id)}
                      />
                      <span class="space-y-1">
                        <span class="text-sm font-medium">
                          {@html renderWithKatex(option.label)}
                        </span>
                        {#if currentResult}
                          <span class="block text-xs text-muted-foreground">
                            {#if currentResult.question.id === singleQuestion.id &&
                            !currentResult.requiresManualGrading &&
                            currentResult.status === "correct" &&
                            option.id === singleQuestion.correct}
                              Correct answer
                            {:else if option.explanation}
                              {@html renderWithKatex(option.explanation)}
                            {/if}
                          </span>
                        {/if}
                      </span>
                    </label>
                  {/each}
                {:else if currentQuestion.type === "multi"}
                  {@const multiQuestion = currentQuestion as MultiQuestion}
                  {#each multiQuestion.options as option}
                    <label class="flex items-start gap-3 rounded-lg border p-3 transition hover:border-primary focus-within:ring-2 focus-within:ring-primary">
                      <input
                        class="mt-1 h-4 w-4"
                        type="checkbox"
                        name={`q-${multiQuestion.id}-${option.id}`}
                        value={option.id}
                        checked={Array.isArray(answers[multiQuestion.id]) && (answers[multiQuestion.id] as string[]).includes(option.id)}
                        on:change={(event) => {
                          const checked = (event.target as HTMLInputElement).checked;
                          const current = Array.isArray(answers[multiQuestion.id])
                            ? ([...(answers[multiQuestion.id] as string[])] as string[])
                            : [];
                          if (checked) {
                            if (!current.includes(option.id)) current.push(option.id);
                          } else {
                            const idx = current.indexOf(option.id);
                            if (idx >= 0) current.splice(idx, 1);
                          }
                          updateTouched(multiQuestion, current);
                        }}
                      />
                      <span class="space-y-1">
                        <span class="text-sm font-medium">
                          {@html renderWithKatex(option.label)}
                        </span>
                        {#if currentResult && option.explanation}
                          <span class="block text-xs text-muted-foreground">
                            {@html renderWithKatex(option.explanation)}
                          </span>
                        {/if}
                      </span>
                    </label>
                  {/each}
                {:else if currentQuestion.type === "fitb"}
                  <textarea
                    class="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Type your answer"
                    value={answers[currentQuestion.id] as string}
                    on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                {:else if currentQuestion.type === "subjective"}
                  {@const subjectiveQuestion = currentQuestion as SubjectiveQuestion}
                  <div class="space-y-3">
                    <textarea
                      class="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Write your response"
                      value={answers[currentQuestion.id] as string}
                      on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLTextAreaElement).value)}
                    ></textarea>
                    {#if currentResult && currentResult.requiresManualGrading}
                      <div class="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        <p class="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">
                          Rubrics
                        </p>
                        <ul class="ml-4 list-disc space-y-1">
                          {#each currentResult.rubrics as rubric}
                            <li>
                              <span class="font-medium text-foreground">
                                {@html renderWithKatex(rubric.title)}
                              </span>
                              <span class="ml-1 text-muted-foreground">
                                {@html renderWithKatex(rubric.description)}
                              </span>
                            </li>
                          {/each}
                        </ul>
                      </div>
                    {/if}
                  </div>
                {:else if currentQuestion.type === "numeric"}
                  <input
                    type="number"
                    inputmode="decimal"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Enter a number"
                    value={answers[currentQuestion.id] as string}
                    on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLInputElement).value)}
                  />
                {:else if currentQuestion.type === "ordering"}
                  {@const orderingQuestion = currentQuestion as OrderingQuestion}
                  <div class="space-y-2">
                    {#each (answers[orderingQuestion.id] as string[]) as item, index}
                      <div class="flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-sm">
                        <span class="flex-1">
                          {@html renderWithKatex(item)}
                        </span>
                        <div class="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={index === 0}
                            on:click={() => moveOrdering(orderingQuestion, index, -1)}
                            aria-label={`Move ${item} up`}
                          >
                            ↑
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={index === (answers[orderingQuestion.id] as string[]).length - 1}
                            on:click={() => moveOrdering(orderingQuestion, index, 1)}
                            aria-label={`Move ${item} down`}
                          >
                            ↓
                          </Button>
                        </div>
                      </div>
                    {/each}
                    <Button variant="ghost" size="sm" on:click={() => resetOrdering(orderingQuestion)}>
                      Reset order
                    </Button>
                  </div>
                {/if}
              </div>
            </CardContent>
            <CardHeader className="flex flex-col items-start gap-2 border-t bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Weight:</span>
                <span class="font-medium">{questionWeight(currentQuestion)}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Status:</span>
                <span class={`font-medium ${
                  currentQuestion && touchedQuestions.has(currentQuestion.id) ? "text-green-600 dark:text-green-300" : ""
                }`}>
                  {currentQuestion && touchedQuestions.has(currentQuestion.id) ? "Answered" : "Pending"}
                </span>
              </div>
            </CardHeader>
          </Card>
        {/if}

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              on:click={() => navigateTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              on:click={() => navigateTo(currentIndex + 1)}
              disabled={currentIndex === questions.length - 1}
            >
              Next
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" on:click={resetAssessment}>Reset answers</Button>
            <Button
              variant="destructive"
              disabled={submitDisabledValue}
              on:click={() => submitQuiz(false)}
            >
              Submit
            </Button>
          </div>
        </div>
      {/if}
    </section>
  </main>
</div>
{/if}

