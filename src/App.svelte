<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";
import Alert from "./lib/components/ui/Alert.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./lib/components/ui/card";
import AppHeader from "./lib/components/app/AppHeader.svelte";
import AppSidebar from "./lib/components/app/AppSidebar.svelte";
import AttemptHistory from "./lib/components/app/AttemptHistory.svelte";
import QuestionCard from "./lib/components/app/QuestionCard.svelte";
import QuizNavigation from "./lib/components/app/QuizNavigation.svelte";
import SubmissionSummaryBanner from "./lib/components/app/SubmissionSummaryBanner.svelte";
import { parseAssessment, type Assessment, type Question } from "./lib/schema";
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
import { attemptList, getAttempt } from "./lib/stores/attempts";
import {
  getReviewPath,
  getHomePath,
  navigate,
  routePath,
} from "./lib/stores/router";
import { formatCountdown } from "./lib/utils/time";
import { triggerDownload } from "./lib/utils/download";
import { storageNotice } from "./lib/storage-notices";

let questionElement: HTMLDivElement | null = null;
let requireAllAnsweredChecked = false;
let assessment: Assessment | null = null;
let questions: Question[] = [];
let answers: Record<string, AnswerValue> = {};
let touchedQuestions = new Set<string>();
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
  retakeIncorrectQuestions,
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
  timeRemaining !== null
    ? formatCountdown(timeRemaining)
    : formatCountdown(elapsedSec);
$: assessment = $assessmentStore;
$: questions = $questionsStore;
$: answers = $answersStore;
$: touchedQuestions = $touchedQuestionsStore;
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

const formatTime = formatCountdown;

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

function openAttemptHistoryReview(attemptId: string) {
  navigate(getReviewPath(attemptId));
}

function onWindowDragOver(event: DragEvent) {
  event.preventDefault();
}

function onWindowDrop(event: DragEvent) {
  event.preventDefault();
  if (!event.dataTransfer) return;
  const file = event.dataTransfer.files?.[0];
  if (file) {
    void handleFile(file);
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
  questionElement?.focus();
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

function downloadJsonFile(filename: string, payload: unknown) {
  triggerDownload(
    filename,
    [`${JSON.stringify(payload, null, 2)}\n`],
    "application/json;charset=utf-8",
  );
}

function downloadExampleAssessment(id: string) {
  const example = findExampleAssessment(id);
  if (!example) return;

  downloadJsonFile(
    `${sanitizeFilename(example.data.meta.title)}.json`,
    example.data,
  );
}

function exportAssessment() {
  if (!assessment) return;
  downloadJsonFile(
    `${sanitizeFilename(assessment.meta.title)}.json`,
    assessment,
  );
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
  downloadJsonFile(
    `${sanitizeFilename(assessed.meta.title)}-summary.json`,
    data,
  );
}
</script>

<svelte:window on:dragover={onWindowDragOver} on:drop={onWindowDrop} />

{#if reviewAttemptId}
  <ReviewPage attemptId={reviewAttemptId} on:close={closeReviewPage} />
{:else}
  <div class="min-h-screen bg-background text-foreground">
    <AppHeader
      {assessment}
      {timeLimitSec}
      timeDisplay={timeDisplay}
      answeredCount={$answeredCount}
      totalQuestions={$totalQuestions}
      progressValue={$progressValue}
      sidebarVisible={$sidebarVisible}
      toggleSidebar={toggleSidebar}
      theme={$theme}
      cycleTheme={cycleTheme}
    />

    <main class={`mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 ${$sidebarVisible ? "lg:flex-row" : ""}`}>
      {#if $sidebarVisible}
        <AppSidebar
          {assessment}
          panelVisibility={$panelVisibility}
          togglePanel={togglePanel}
          requireAllAnsweredChecked={requireAllAnsweredChecked}
          setRequireAllAnswered={setRequireAllAnswered}
          {exampleAssessments}
          recentFiles={$recentFiles}
          loadRecentAssessment={loadRecentAssessment}
          clearHistory={clearHistory}
          {questions}
          {questionNavStyles}
          {navigateTo}
          downloadExampleAssessment={downloadExampleAssessment}
          handleFile={handleFile}
        />
      {/if}

      <section class="flex-1 space-y-6">
        {#if $storageNotice}
          <Alert>
            <p class="font-medium">Storage notice</p>
            <p class="text-sm text-muted-foreground">{$storageNotice}</p>
          </Alert>
        {/if}

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

        {#if $attemptList.length > 0}
          <AttemptHistory
            attempts={$attemptList}
            onReview={openAttemptHistoryReview}
            onRetakeIncorrect={retakeIncorrectQuestions}
            currentAssessmentTitle={assessment ? assessment.meta.title : null}
          />
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
            <SubmissionSummaryBanner
              {submission}
              {formatTime}
              {openReviewPage}
              {exportCsv}
              {exportJsonSummary}
              {exportAssessment}
              retakeIncorrect={() => submission && retakeIncorrectQuestions(submission)}
              {resetAssessment}
            />
          {/if}

          {#if currentQuestion}
            <QuestionCard
              question={currentQuestion}
              index={currentIndex}
              totalQuestions={questions.length}
              {answers}
              {currentResult}
              {touchedQuestions}
              {updateTouched}
              {setOrderingTouched}
              bind:questionElement
            />
          {/if}

          <QuizNavigation
            currentIndex={currentIndex}
            questionCount={questions.length}
            {navigateTo}
            {resetAssessment}
            submitDisabled={submitDisabledValue}
            submitQuiz={submitQuiz}
          />
        {/if}
      </section>
    </main>
  </div>
{/if}

