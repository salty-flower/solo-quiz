<script lang="ts">
import { createEventDispatcher, onDestroy, onMount } from "svelte";
import Button from "../components/ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import Separator from "../components/ui/Separator.svelte";
import StackedBar from "../components/chart/StackedBar.svelte";
import { renderWithKatex } from "../katex";
import { buildSubjectivePrompt } from "../llm";
import type {
  QuestionResult,
  ResultStatus,
  SubmissionSummary,
} from "../results";
import type { LlmFeedback } from "../schema";
import { attempts } from "../stores/attempts";
import { llm } from "../stores/llm";
import { getReviewPath, navigate } from "../stores/router";

export let attemptId: string;

const dispatch = createEventDispatcher<{ close: undefined }>();

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusPalette: Record<
  ResultStatus,
  { label: string; colorClass: string }
> = {
  correct: { label: "Correct", colorClass: "bg-green-500" },
  incorrect: { label: "Incorrect", colorClass: "bg-destructive" },
  pending: { label: "Pending", colorClass: "bg-amber-400" },
};

const statusSortOrder: Record<ResultStatus, number> = {
  incorrect: 0,
  pending: 1,
  correct: 2,
};

const searchInputId = "review-search-filter";

const typeLabels: Record<string, string> = {
  single: "Single choice",
  multi: "Multiple choice",
  fitb: "Fill in the blank",
  numeric: "Numeric",
  ordering: "Ordering",
  subjective: "Subjective",
};

const {
  inputs: llmFeedbackInputs,
  results: llmFeedbackResults,
  errors: llmFeedbackErrors,
  workspaces: llmWorkspaces,
  workspaceErrors: llmWorkspaceErrors,
  workspaceVisibility: llmWorkspaceVisibility,
  copiedPromptQuestionId,
  promptCopyError,
  setInput: setLlmFeedbackInput,
  applyFeedback: applyStoredLlmFeedback,
  clearFeedback: clearStoredLlmFeedback,
  initializeWorkspace,
  setWorkspaceVerdict,
  setWorkspaceScore,
  setWorkspaceFeedback,
  setWorkspaceRubricFraction,
  setWorkspaceRubricComments,
  addWorkspaceImprovement,
  updateWorkspaceImprovement,
  removeWorkspaceImprovement,
  writeWorkspaceToInput,
  hydrateWorkspaceFromFeedback,
  setCopiedPromptQuestionId,
  setPromptCopyError,
  toggleWorkspaceVisibility,
} = llm;

let baseSummary: SubmissionSummary | null = null;
let summary: SubmissionSummary | null = null;
let activeIndex = 0;
let currentResult: QuestionResult | null = null;
let visibleEntries: { result: QuestionResult; index: number }[] = [];
let visibleIndices: number[] = [];
let statusFilter: ResultStatus | "all" = "all";
let sortMode: "original" | "status" | "question" = "original";
let searchTerm = "";
let comparisonAttemptId: string | null = null;
let comparisonSummary: SubmissionSummary | null = null;
let comparisonOptions: SubmissionSummary[] = [];
let comparisonCandidates: SubmissionSummary[] = [];
let promptCopyTimeout: number | null = null;
let showDiffHighlight = true;
let showFeedbackDetails = false;
let scoreMixSegments: { label: string; value: number; colorClass: string }[] =
  [];
let subjectivePendingPoints = 0;
let subjectiveEarnedPoints = 0;
let subjectiveMissedPoints = 0;
let totalSubjectiveMax = 0;
let tagBreakdownRows: BreakdownRow[] = [];
let typeBreakdownRows: BreakdownRow[] = [];
let answerDiffTokens: DiffToken[] = [];
let diffSummary: Record<DiffToken["type"], number> = {
  add: 0,
  remove: 0,
  match: 0,
};

type BreakdownRow = {
  label: string;
  segments: { label: string; value: number; colorClass: string }[];
  total: number;
};

type DiffToken = {
  text: string;
  type: "match" | "add" | "remove";
};

$: baseSummary = $attempts.get(attemptId) ?? null;
$: summary = baseSummary
  ? applyFeedbackToSummary(baseSummary, $llmFeedbackResults)
  : null;
$: totalSubjectiveMax = baseSummary?.subjectiveMax ?? 0;
$: subjectivePendingPoints = summary
  ? summary.results
      .filter(
        (result) => result.requiresManualGrading && result.status === "pending",
      )
      .reduce((sum, result) => sum + result.max, 0)
  : 0;
$: subjectiveEarnedPoints = summary
  ? summary.results
      .filter(
        (result) => result.requiresManualGrading && result.status !== "pending",
      )
      .reduce((sum, result) => sum + (result.earned ?? 0), 0)
  : 0;
$: subjectiveMissedPoints = summary
  ? Math.max(
      totalSubjectiveMax - subjectivePendingPoints - subjectiveEarnedPoints,
      0,
    )
  : 0;
$: if (!summary) {
  activeIndex = 0;
} else if (
  summary.results.length > 0 &&
  activeIndex >= summary.results.length
) {
  activeIndex = summary.results.length - 1;
}
$: comparisonOptions = Array.from($attempts.values()).sort(
  (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
);
$: comparisonCandidates = comparisonOptions.filter(
  (attempt) =>
    attempt.id !== attemptId &&
    (!summary ||
      attempt.assessment.meta.title === summary.assessment.meta.title),
);
$: if (comparisonCandidates.length === 0) {
  comparisonAttemptId = null;
  comparisonSummary = null;
} else if (
  !comparisonAttemptId ||
  !comparisonCandidates.some((attempt) => attempt.id === comparisonAttemptId)
) {
  comparisonAttemptId = comparisonCandidates[0].id;
  comparisonSummary = comparisonCandidates[0];
} else {
  comparisonSummary =
    comparisonCandidates.find(
      (attempt) => attempt.id === comparisonAttemptId,
    ) ?? null;
}
$: {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  visibleEntries = summary
    ? summary.results
        .map((result, index) => ({ result, index }))
        .filter(
          ({ result }) =>
            statusFilter === "all" || result.status === statusFilter,
        )
        .filter(({ result }) => {
          if (!normalizedSearch) return true;
          const haystack = [
            result.question.text,
            result.userAnswer,
            result.correctAnswer,
            result.question.tags?.join(" ") ?? "",
          ]
            .join(" \n")
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
        .sort((a, b) => {
          if (sortMode === "status") {
            return (
              statusSortOrder[a.result.status] -
                statusSortOrder[b.result.status] || a.index - b.index
            );
          }
          if (sortMode === "question") {
            return a.result.question.text.localeCompare(b.result.question.text);
          }
          return a.index - b.index;
        })
    : [];
  visibleIndices = visibleEntries.map((entry) => entry.index);
  if (
    summary &&
    visibleEntries.length > 0 &&
    !visibleIndices.includes(activeIndex)
  ) {
    activeIndex = visibleIndices[0];
  }
}
$: if (summary && summary.results.length > 0) {
  const boundedIndex = Math.min(activeIndex, summary.results.length - 1);
  currentResult =
    visibleEntries.length > 0 ? summary.results[boundedIndex] : null;
} else {
  currentResult = null;
}
$: if (currentResult?.requiresManualGrading) {
  initializeWorkspace(currentResult.question.id, {
    rubrics: currentResult.rubrics,
    maxScore: currentResult.max,
  });
}

$: scoreMixSegments = summary
  ? [
      {
        label: "Deterministic earned",
        value: summary.deterministicEarned,
        colorClass: statusPalette.correct.colorClass,
      },
      {
        label: "Deterministic remaining",
        value: Math.max(
          summary.deterministicMax - summary.deterministicEarned,
          0,
        ),
        colorClass: "bg-muted-foreground/40",
      },
      {
        label: "Subjective earned",
        value: subjectiveEarnedPoints,
        colorClass: "bg-primary",
      },
      {
        label: "Subjective pending",
        value: subjectivePendingPoints,
        colorClass: statusPalette.pending.colorClass,
      },
      {
        label: "Subjective missed",
        value: subjectiveMissedPoints,
        colorClass: statusPalette.incorrect.colorClass,
      },
    ]
  : [];

$: tagBreakdownRows = summary
  ? createBreakdownRows(summary.results, (result) =>
      result.question.tags && result.question.tags.length > 0
        ? result.question.tags.join(", ")
        : "Untagged",
    )
  : [];

$: typeBreakdownRows = summary
  ? createBreakdownRows(
      summary.results,
      (result) => typeLabels[result.question.type] ?? result.question.type,
    )
  : [];

$: answerDiffTokens = currentResult
  ? buildDiffTokens(currentResult.userAnswer, currentResult.correctAnswer)
  : [];

$: diffSummary = answerDiffTokens.reduce(
  (acc, token) => {
    acc[token.type] = (acc[token.type] ?? 0) + 1;
    return acc;
  },
  { match: 0, add: 0, remove: 0 } as Record<DiffToken["type"], number>,
);

onMount(() => {
  const handler = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();
    if (
      tagName === "input" ||
      tagName === "textarea" ||
      target?.isContentEditable
    ) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(-1);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
});

onDestroy(() => {
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
    promptCopyTimeout = null;
  }
  setCopiedPromptQuestionId(null);
  setPromptCopyError(null);
});

function closeReview() {
  dispatch("close");
}

function selectQuestion(index: number) {
  if (!summary) return;
  activeIndex = Math.max(0, Math.min(index, summary.results.length - 1));
}

function moveSelection(delta: number) {
  if (!summary || visibleIndices.length === 0) return;
  const currentPosition = visibleIndices.indexOf(activeIndex);
  const nextPosition =
    currentPosition === -1
      ? 0
      : Math.min(
          visibleIndices.length - 1,
          Math.max(0, currentPosition + delta),
        );
  activeIndex = visibleIndices[nextPosition];
}

function openComparisonReview(id: string | null) {
  if (!id) return;
  navigate(getReviewPath(id));
}

function formatTime(sec: number): string {
  const minutes = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function applyFeedbackToResult(
  result: QuestionResult,
  feedback: LlmFeedback | undefined,
): QuestionResult {
  if (!feedback || !result.requiresManualGrading) return result;

  const isCorrect =
    feedback.verdict === "correct" || feedback.score >= result.max;
  const status: ResultStatus = isCorrect ? "correct" : "incorrect";

  return {
    ...result,
    status,
    earned: feedback.score,
    isCorrect,
    feedback: feedback.feedback ?? result.feedback,
    max: Math.max(result.max, feedback.maxScore),
  };
}

function applyFeedbackToSummary(
  attemptSummary: SubmissionSummary,
  feedbackResults: Record<string, LlmFeedback | undefined>,
): SubmissionSummary {
  const results = attemptSummary.results.map((result) =>
    applyFeedbackToResult(result, feedbackResults[result.question.id]),
  );

  const pendingSubjectiveCount = results.filter(
    (result) => result.requiresManualGrading && result.status === "pending",
  ).length;

  return { ...attemptSummary, results, pendingSubjectiveCount };
}

function statusMeta(result: QuestionResult) {
  if (result.status === "correct") {
    return {
      label: "Correct",
      textClass: "text-green-600 dark:text-green-300",
    };
  }
  if (result.status === "incorrect") {
    return {
      label: "Incorrect",
      textClass: "text-destructive",
    };
  }
  return {
    label: "Pending review",
    textClass: "text-muted-foreground",
  };
}

function buildStatusSegments(counts: Record<ResultStatus, number>) {
  return (Object.keys(statusPalette) as ResultStatus[]).map((status) => ({
    label: statusPalette[status].label,
    value: counts[status] ?? 0,
    colorClass: statusPalette[status].colorClass,
  }));
}

function createBreakdownRows(
  results: QuestionResult[],
  labelForResult: (result: QuestionResult) => string,
): BreakdownRow[] {
  const tally = new Map<string, Record<ResultStatus, number>>();

  for (const result of results) {
    const label = labelForResult(result) || "Unlabeled";
    const counts = tally.get(label) ?? { correct: 0, incorrect: 0, pending: 0 };
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    tally.set(label, counts);
  }

  return Array.from(tally.entries())
    .map(([label, counts]) => ({
      label,
      segments: buildStatusSegments(counts),
      total:
        (counts.correct ?? 0) + (counts.incorrect ?? 0) + (counts.pending ?? 0),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function tokenizeAnswer(text: string): string[] {
  return text.trim().length === 0 ? [] : text.trim().split(/\s+/);
}

function buildDiffTokens(userText: string, referenceText: string): DiffToken[] {
  const userTokens = tokenizeAnswer(userText);
  const referenceTokens = tokenizeAnswer(referenceText);

  const rows = userTokens.length;
  const cols = referenceTokens.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (userTokens[i] === referenceTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (userTokens[i] === referenceTokens[j]) {
      tokens.push({ text: userTokens[i], type: "match" });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: userTokens[i], type: "remove" });
      i += 1;
    } else {
      tokens.push({ text: referenceTokens[j], type: "add" });
      j += 1;
    }
  }

  while (i < rows) {
    tokens.push({ text: userTokens[i], type: "remove" });
    i += 1;
  }

  while (j < cols) {
    tokens.push({ text: referenceTokens[j], type: "add" });
    j += 1;
  }

  return tokens;
}

function diffClass(token: DiffToken, perspective: "user" | "reference") {
  if (token.type === "match") return "text-foreground";
  if (perspective === "user") {
    return token.type === "remove"
      ? "bg-amber-200/80 text-foreground dark:bg-amber-900/60"
      : "text-muted-foreground opacity-75";
  }
  return token.type === "add"
    ? "bg-primary/20 text-foreground"
    : "text-muted-foreground line-through";
}

async function copySubjectivePrompt(result: QuestionResult) {
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
  }
  setCopiedPromptQuestionId(result.question.id);
  try {
    if (!result.requiresManualGrading) {
      throw new Error("Only subjective questions provide prompts.");
    }
    const prompt = buildSubjectivePrompt({
      question: result.question,
      userAnswer: result.userAnswer,
      maxScore: result.max,
    });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setPromptCopyError(null);
  } catch (error) {
    setPromptCopyError(
      error instanceof Error
        ? error.message
        : "Unable to copy prompt to clipboard.",
    );
  }
  promptCopyTimeout = window.setTimeout(() => {
    setCopiedPromptQuestionId(null);
    setPromptCopyError(null);
    promptCopyTimeout = null;
  }, 3000);
}

function applyLlmFeedback(result: QuestionResult) {
  if (!result.requiresManualGrading) return;
  applyStoredLlmFeedback(result.question.id, result.max);
}

function clearLlmFeedback(questionId: string) {
  clearStoredLlmFeedback(questionId);
}

function insertWorkspaceJson(questionId: string) {
  writeWorkspaceToInput(questionId);
}

function loadWorkspaceFromApplied(questionId: string, maxScore: number) {
  const feedback = $llmFeedbackResults[questionId];
  if (!feedback) return;
  hydrateWorkspaceFromFeedback(questionId, feedback, maxScore);
}
</script>

{#if !summary}
  <div class="flex min-h-screen items-center justify-center bg-background text-foreground">
    <div class="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
      <p class="text-lg font-semibold">Attempt unavailable</p>
      <p class="text-sm text-muted-foreground">
        The requested attempt could not be found. It may have been cleared after reloading the page.
      </p>
      <Button on:click={closeReview}>Back to quiz</Button>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-background text-foreground">
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

    <section class="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div class="rounded-lg border bg-card/70 p-4 shadow-sm">
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
                class="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                bind:value={comparisonAttemptId}
                aria-label="Choose attempt to compare"
              >
                {#each comparisonCandidates as attempt (attempt.id)}
                  <option value={attempt.id}>
                    {formatter.format(attempt.completedAt)} — {attempt.deterministicPercentage.toFixed(1)}%
                  </option>
                {/each}
              </select>
              <Button size="sm" variant="outline" on:click={() => openComparisonReview(comparisonAttemptId)}>
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
            </div>
          </div>
        {/if}
      </div>
    </section>

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
              total={summary.deterministicMax + totalSubjectiveMax}
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

    <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside class="lg:w-72">
        <div class="rounded-lg border bg-card">
          <div class="space-y-3 border-b px-4 py-3">
            <div class="flex items-center justify-between text-sm font-semibold">
              <span>Question navigator</span>
              <span class="text-xs font-normal text-muted-foreground">Arrow keys supported</span>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each [
                { value: "all", label: "All" },
                { value: "incorrect", label: "Incorrect" },
                { value: "pending", label: "Pending" },
                { value: "correct", label: "Correct" },
              ] as filter}
                <button
                  class={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    statusFilter === filter.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-input"
                  }`}
                  on:click={() => (statusFilter = filter.value as ResultStatus | "all")}
                >
                  {filter.label}
                </button>
              {/each}
            </div>
            <div class="space-y-2 text-xs">
              <label
                class="font-semibold uppercase tracking-wide text-muted-foreground"
                for={searchInputId}
              >
                Search & sort
              </label>
              <input
                class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Search text, tags, or answers"
                id={searchInputId}
                bind:value={searchTerm}
                aria-label="Search results"
              />
              <select
                class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                bind:value={sortMode}
                aria-label="Sort results"
              >
                <option value="original">Original order</option>
                <option value="status">Status</option>
                <option value="question">Question text A–Z</option>
              </select>
            </div>
          </div>
          <div class="max-h-[70vh] space-y-2 overflow-y-auto p-3">
            {#if visibleEntries.length === 0}
              <p class="text-sm text-muted-foreground">No questions match the current filters.</p>
            {:else}
              {#each visibleEntries as entry (entry.result.question.id)}
                {@const meta = statusMeta(entry.result)}
                <button
                  class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    activeIndex === entry.index
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:border-input"
                  }`}
                  aria-current={activeIndex === entry.index ? "true" : undefined}
                  on:click={() => selectQuestion(entry.index)}
                >
                  <div class="flex items-center justify-between gap-2 text-xs">
                    <span class="font-semibold text-foreground">Question {entry.index + 1}</span>
                    <span class={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                  </div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {@html renderWithKatex(entry.result.question.text)}
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </aside>

      <section class="flex-1 space-y-4">
        {#if currentResult}
          {@const meta = statusMeta(currentResult)}
          {@const visiblePosition = Math.max(visibleIndices.indexOf(activeIndex), 0) + 1}
          <Card>
            <CardHeader>
              <CardTitle>
                Question {visiblePosition} of {visibleEntries.length}
                <span class="text-xs font-normal text-muted-foreground">(original #{activeIndex + 1})</span>
              </CardTitle>
            <CardDescription className="space-y-2 text-sm">
              <div class="space-y-2 leading-relaxed">
                {@html renderWithKatex(currentResult.question.text)}
                </div>
                {#if currentResult.question.tags?.length}
                  <p class="text-xs text-muted-foreground">
                    Tags: {currentResult.question.tags.join(", ")}
                  </p>
                {/if}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs uppercase text-muted-foreground">Score</p>
                  <p class="text-lg font-semibold text-foreground">
                    {currentResult.requiresManualGrading
                      ? `Pending / ${currentResult.max}`
                      : `${currentResult.earned} / ${currentResult.max}`}
                  </p>
                </div>
                <div class="rounded-md border bg-muted/20 p-4">
                  <p class="text-xs uppercase text-muted-foreground">Status</p>
                  <p class={`text-lg font-semibold ${meta.textClass}`}>{meta.label}</p>
                </div>
              </div>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="rounded-md border bg-card/60 p-4">
                  <p class="text-xs uppercase text-muted-foreground">Your answer</p>
                  <div class="mt-2 text-sm font-medium text-foreground">
                    {@html renderWithKatex(currentResult.userAnswer || "—")}
                  </div>
                </div>
                <div class="rounded-md border bg-card/60 p-4">
                  <p class="text-xs uppercase text-muted-foreground">Reference answer</p>
                  <div class="mt-2 text-sm font-medium text-foreground">
                    {@html renderWithKatex(currentResult.correctAnswer || "—")}
                  </div>
                </div>
              </div>

              {#if currentResult.question.type === "single" || currentResult.question.type === "multi"}
                {@const optionQuestion = currentResult.question}
                {@const selectedOptions = new Set(currentResult.selectedOptions ?? [])}
                {@const correctOptions =
                  optionQuestion.type === "single"
                    ? new Set([optionQuestion.correct])
                    : new Set(optionQuestion.correct)}
                <div class="rounded-md border bg-card/60 p-4">
                  <p class="text-xs uppercase text-muted-foreground">Option explanations</p>
                  <div class="mt-3 space-y-2">
                    {#each optionQuestion.options as option}
                      {@const isCorrect = correctOptions.has(option.id)}
                      {@const isSelected = selectedOptions.has(option.id)}
                      <div
                        class={`rounded-md border p-3 text-sm transition ${
                          isCorrect
                            ? "border-green-500/60 bg-green-500/10 dark:border-green-500/40 dark:bg-green-500/20"
                            : isSelected
                              ? "border-primary/50 bg-primary/5"
                              : "border-border bg-muted/30"
                        }`}
                      >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <span class="font-medium text-foreground">
                            {@html renderWithKatex(option.label)}
                          </span>
                          <div class="flex flex-wrap gap-1 text-[0.65rem] font-semibold uppercase tracking-wide">
                            {#if isCorrect}
                              <span class="rounded-full bg-green-600/10 px-2 py-0.5 text-green-700 dark:bg-green-500/20 dark:text-green-100">
                                Correct
                              </span>
                            {/if}
                            {#if isSelected}
                              <span class="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                                Your choice
                              </span>
                            {/if}
                          </div>
                        </div>
                        <div class="mt-2 text-xs text-muted-foreground">
                          {#if option.explanation}
                            {@html renderWithKatex(option.explanation)}
                          {:else}
                            <span>No explanation provided.</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="space-y-3 rounded-md border bg-muted/10 p-4 text-sm">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="text-xs uppercase text-muted-foreground">Answer comparison</p>
                    <p class="text-muted-foreground">
                      Contrast your wording with the expected answer and call out gaps.
                    </p>
                  </div>
                  <label class="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">
                    <input
                      type="checkbox"
                      class="h-3 w-3 rounded border border-input accent-primary"
                      bind:checked={showDiffHighlight}
                    />
                    Highlight differences
                  </label>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="space-y-2 rounded-md border bg-background/80 p-3 leading-relaxed">
                    <p class="text-xs uppercase text-muted-foreground">Your wording</p>
                    {#if showDiffHighlight}
                      {#if answerDiffTokens.length === 0}
                        <p class="text-muted-foreground">No answer provided.</p>
                      {:else}
                        <div class="flex flex-wrap gap-1 text-sm">
                          {#each answerDiffTokens as token, tokenIndex}
                            <span class={`rounded px-1 ${diffClass(token, "user")}`}>
                              {token.text}
                            </span>
                            {#if tokenIndex < answerDiffTokens.length - 1}
                              {" "}
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    {:else}
                      <div class="text-sm text-foreground">
                        {@html renderWithKatex(currentResult.userAnswer || "—")}
                      </div>
                    {/if}
                  </div>
                  <div class="space-y-2 rounded-md border bg-background/80 p-3 leading-relaxed">
                    <p class="text-xs uppercase text-muted-foreground">Reference wording</p>
                    {#if showDiffHighlight}
                      {#if answerDiffTokens.length === 0}
                        <p class="text-muted-foreground">No comparison available.</p>
                      {:else}
                        <div class="flex flex-wrap gap-1 text-sm">
                          {#each answerDiffTokens as token, tokenIndex}
                            <span class={`rounded px-1 ${diffClass(token, "reference")}`}>
                              {token.text}
                            </span>
                            {#if tokenIndex < answerDiffTokens.length - 1}
                              {" "}
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    {:else}
                      <div class="text-sm text-foreground">
                        {@html renderWithKatex(currentResult.correctAnswer || "—")}
                      </div>
                    {/if}
                  </div>
                </div>
                <div class="flex flex-wrap gap-3 text-[0.75rem] text-muted-foreground">
                  <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
                    Matches: {diffSummary.match}
                  </span>
                  <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
                    Missing: {diffSummary.add}
                  </span>
                  <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
                    Extra: {diffSummary.remove}
                  </span>
                </div>
                <details class="rounded-md border bg-card/60 p-3" bind:open={showFeedbackDetails}>
                  <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground">
                    Reference explanation
                  </summary>
                  <div class="mt-2 text-muted-foreground">
                    {@html renderWithKatex(
                      currentResult.feedback ?? "No explanation was provided for this question.",
                    )}
                  </div>
                </details>
              </div>

              {#if currentResult.requiresManualGrading}
                {@const questionId = currentResult.question.id}
                {@const feedbackInput = $llmFeedbackInputs[questionId] ?? ""}
                {@const feedbackError = $llmFeedbackErrors[questionId]}
                {@const feedback = $llmFeedbackResults[questionId]}
                {@const workspace = $llmWorkspaces[questionId]}
                {@const workspaceError = $llmWorkspaceErrors[questionId]}
                {@const isWorkspaceCollapsed =
                  $llmWorkspaceVisibility[questionId] ?? false}
                <Separator />
                <div class="space-y-4">
                  <div class="rounded-md border border-dashed bg-muted/30 p-3 text-[0.75rem] text-muted-foreground">
                    <p class="mb-1 font-semibold uppercase tracking-wide text-foreground">Rubrics</p>
                    <ul class="ml-4 list-disc space-y-1">
                      {#each currentResult.rubrics as rubric}
                        <li>
                          <span class="font-medium text-foreground">
                            {@html renderWithKatex(rubric.title)}
                          </span>
                          <span class="ml-1">
                            {@html renderWithKatex(rubric.description)}
                          </span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                  {#if workspace}
                    {@const verdictOptions = ["correct", "partial", "incorrect"] as const}
                    {@const summaryFieldId = `${questionId}-workspace-summary`}
                    {@const averageFraction =
                      workspace.rubricBreakdown.length > 0
                        ?
                          workspace.rubricBreakdown.reduce(
                            (sum, entry) => sum + entry.achievedFraction,
                            0,
                          ) / workspace.rubricBreakdown.length
                        : 0}
                    {@const suggestedScore =
                      Math.round(averageFraction * workspace.maxScore * 100) / 100}
                    <div class="space-y-4 rounded-md border bg-card/70 p-4 text-sm">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p class="text-xs uppercase text-muted-foreground">LLM grading workspace</p>
                          <p class="text-muted-foreground">
                            Adjust verdict, rubric sliders, and narrative feedback before turning it into JSON.
                          </p>
                        </div>
                        <div class="flex flex-wrap gap-2 text-xs">
                          <Button
                            size="sm"
                            variant="ghost"
                            on:click={() => toggleWorkspaceVisibility(questionId)}
                          >
                            {isWorkspaceCollapsed ? "Show workspace" : "Hide workspace"}
                          </Button>
                          <Button size="sm" variant="outline" on:click={() => insertWorkspaceJson(questionId)}>
                            Insert workspace JSON
                          </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!feedback}
                              on:click={() =>
                                currentResult &&
                                loadWorkspaceFromApplied(questionId, currentResult.max)
                              }
                            >
                              Load from applied JSON
                            </Button>
                        </div>
                      </div>
                      {#if isWorkspaceCollapsed}
                        <p class="text-xs text-muted-foreground">
                          Workspace hidden. Use "Show workspace" to edit rubric sliders or narrative feedback.
                        </p>
                      {:else}
                        <div class="grid gap-3 md:grid-cols-2">
                          <div class="space-y-2 rounded-md border bg-muted/20 p-3">
                            <p class="text-xs uppercase text-muted-foreground">Verdict</p>
                            <div class="flex flex-wrap gap-2">
                            {#each verdictOptions as verdictOption}
                              <button
                                type="button"
                                class={`rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                                  workspace.verdict === verdictOption
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-input text-muted-foreground hover:border-foreground/40"
                                }`}
                                on:click={() => setWorkspaceVerdict(questionId, verdictOption)}
                              >
                                {verdictOption}
                              </button>
                            {/each}
                          </div>
                        </div>
                        <div class="space-y-2 rounded-md border bg-muted/20 p-3">
                          <div class="flex items-center justify-between text-xs uppercase text-muted-foreground">
                            <p>Score</p>
                            <span class="font-mono text-foreground">Max {workspace.maxScore}</span>
                          </div>
                          <div class="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max={workspace.maxScore}
                              step="0.25"
                              class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={workspace.score}
                              on:input={(event) =>
                                setWorkspaceScore(questionId, Number((event.target as HTMLInputElement).value))}
                            />
                            <span class="text-sm text-muted-foreground">/ {workspace.maxScore}</span>
                          </div>
                          <div class="flex items-center justify-between text-[0.7rem] text-muted-foreground">
                            <span>Suggested: {suggestedScore} / {workspace.maxScore}</span>
                            <button
                              type="button"
                              class="font-semibold text-primary underline-offset-2 hover:underline"
                              on:click={() => setWorkspaceScore(questionId, suggestedScore)}
                            >
                              Use suggested
                            </button>
                          </div>
                        </div>
                        </div>
                        <div class="space-y-3">
                          {#each workspace.rubricBreakdown as rubric, rubricIndex}
                            <div class="space-y-2 rounded-md border bg-background/50 p-3">
                              <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <span class="text-foreground">{@html renderWithKatex(rubric.rubric)}</span>
                                <span class="font-mono text-foreground">{Math.round(rubric.achievedFraction * 100)}%</span>
                              </div>
                              {#if rubric.description}
                                <p class="text-xs text-muted-foreground">
                                  {@html renderWithKatex(rubric.description)}
                                </p>
                              {/if}
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={Math.round(rubric.achievedFraction * 100)}
                                class="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
                                on:input={(event) =>
                                  setWorkspaceRubricFraction(
                                    questionId,
                                    rubricIndex,
                                    Number((event.target as HTMLInputElement).value) / 100,
                                  )}
                              />
                              <textarea
                                class="h-20 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                placeholder="Comments for this rubric"
                                value={rubric.comments}
                                on:input={(event) =>
                                  setWorkspaceRubricComments(
                                    questionId,
                                    rubricIndex,
                                    (event.target as HTMLTextAreaElement).value,
                                  )}
                              ></textarea>
                            </div>
                          {/each}
                        </div>
                        <div class="space-y-2">
                          <label
                            class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            for={summaryFieldId}
                          >
                            Feedback summary
                          </label>
                          <textarea
                            id={summaryFieldId}
                            class="h-28 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="Summarize the score justification"
                            value={workspace.feedback}
                            on:input={(event) =>
                              setWorkspaceFeedback(questionId, (event.target as HTMLTextAreaElement).value)}
                          ></textarea>
                        </div>
                        <div class="space-y-2">
                          <div class="flex items-center justify-between">
                            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Suggested improvements
                            </p>
                            <Button size="sm" variant="ghost" on:click={() => addWorkspaceImprovement(questionId)}>
                              Add suggestion
                            </Button>
                          </div>
                          {#if workspace.improvements.length === 0}
                            <p class="text-xs text-muted-foreground">
                              No suggestions yet. Click "Add suggestion" to capture actionable notes.
                            </p>
                          {:else}
                            <div class="space-y-2">
                              {#each workspace.improvements as improvement, improvementIndex}
                                <div class="flex gap-2">
                                  <input
                                    class="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    placeholder={`Suggestion ${improvementIndex + 1}`}
                                    value={improvement}
                                    on:input={(event) =>
                                      updateWorkspaceImprovement(
                                        questionId,
                                        improvementIndex,
                                        (event.target as HTMLInputElement).value,
                                      )}
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    class="h-9 w-9"
                                    aria-label={`Remove suggestion ${improvementIndex + 1}`}
                                    on:click={() => removeWorkspaceImprovement(questionId, improvementIndex)}
                                  >
                                    ×
                                  </Button>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/if}
                      {#if workspaceError}
                        <p class="text-xs text-destructive">{workspaceError}</p>
                      {/if}
                    </div>
                  {/if}
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <Button
                        size="sm"
                        variant="outline"
                        on:click={() => currentResult && copySubjectivePrompt(currentResult)}
                      >
                        Copy LLM prompt
                      </Button>
                    {#if $copiedPromptQuestionId === questionId && !$promptCopyError}
                      <span class="text-muted-foreground">Copied!</span>
                    {/if}
                    {#if $copiedPromptQuestionId === questionId && $promptCopyError}
                      <span class="text-destructive">{$promptCopyError}</span>
                    {/if}
                  </div>
                  <div class="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                    <p class="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Paste LLM feedback JSON
                    </p>
                    <textarea
                      class="h-32 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-[0.8rem] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Paste the model's JSON response here"
                      value={feedbackInput}
                      on:input={(event) =>
                        setLlmFeedbackInput(
                          questionId,
                          (event.target as HTMLTextAreaElement).value,
                        )}
                    ></textarea>
                      <div class="flex flex-wrap items-center gap-2">
                        <Button size="sm" on:click={() => currentResult && applyLlmFeedback(currentResult)}>
                          Apply feedback
                        </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        on:click={() => clearLlmFeedback(questionId)}
                        disabled={!feedbackInput.trim() && !feedback && !feedbackError}
                      >
                        Clear
                      </Button>
                    </div>
                    {#if feedbackError}
                      <p class="text-[0.75rem] text-destructive">{feedbackError}</p>
                    {:else if feedback}
                      <div class="space-y-2 rounded-md border border-muted bg-background/70 p-2 text-[0.75rem]">
                        <p>
                          <span class="font-semibold">Verdict:</span> {feedback.verdict}
                          <span class="ml-2 font-semibold">Score:</span>
                          {feedback.score} / {feedback.maxScore}
                        </p>
                        <p>
                          <span class="font-semibold">Feedback:</span>
                          {" "}{feedback.feedback}
                        </p>
                        <div>
                          <p class="font-semibold">Rubric breakdown:</p>
                          <ul class="ml-4 list-disc space-y-1">
                            {#each feedback.rubricBreakdown as entry}
                              <li>
                                <span class="font-medium">{entry.rubric}:</span>
                                {" "}{entry.comments}
                                <span class="ml-1 text-muted-foreground">
                                  ({Math.round(entry.achievedFraction * 100)}%)
                                </span>
                              </li>
                            {/each}
                          </ul>
                        </div>
                        {#if feedback.improvements.length > 0}
                          <div>
                            <p class="font-semibold">Suggested improvements:</p>
                            <ul class="ml-4 list-disc space-y-1">
                              {#each feedback.improvements as improvement}
                                <li>{improvement}</li>
                              {/each}
                            </ul>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </CardContent>
          </Card>
        {:else if summary}
          <div class="rounded-lg border bg-card/70 p-6 text-sm text-muted-foreground">
            No questions match the current filters. Adjust the search or status chips to continue reviewing.
          </div>
        {:else}
          <div class="rounded-lg border bg-card/70 p-6 text-sm text-muted-foreground">
            No questions were included in this attempt.
          </div>
        {/if}
      </section>
    </main>
  </div>
{/if}
