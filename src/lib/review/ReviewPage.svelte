<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";
import Button from "../components/ui/Button.svelte";
import type {
  QuestionResult,
  ResultStatus,
  SubmissionSummary,
} from "../results";
import type { AssessmentContext, LlmFeedback } from "../schema";
import { attempts } from "../stores/attempts";
import { llm } from "../stores/llm";
import { getReviewPath, navigate } from "../stores/router";
import { formatCountdown } from "../utils/time";
import BreakdownCharts from "./BreakdownCharts.svelte";
import ComparisonSection from "./ComparisonSection.svelte";
import { createBreakdownRows, type BreakdownRow } from "./breakdown";
import { buildDiffTokens, summarizeDiff, type DiffToken } from "./diff";
import QuestionDetail from "./QuestionDetail.svelte";
import QuestionNavigator from "./QuestionNavigator.svelte";
import ReviewHeader from "./ReviewHeader.svelte";
import { statusPalette, statusSortOrder } from "./status";

export let attemptId: string;

const dispatch = createEventDispatcher<{ close: undefined }>();

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const searchInputId = "review-search-filter";
const formatTime = formatCountdown;

const typeLabels: Record<string, string> = {
  single: "Single choice",
  multi: "Multiple choice",
  fitb: "Fill in the blank",
  numeric: "Numeric",
  ordering: "Ordering",
  subjective: "Subjective",
};

const { results: llmFeedbackResults, initializeWorkspace } = llm;

let baseSummary: SubmissionSummary | null = null;
let summary: SubmissionSummary | null = null;
let activeIndex = 0;
let currentResult: QuestionResult | null = null;
let currentContext: AssessmentContext | null = null;
let visibleEntries: { result: QuestionResult; index: number }[] = [];
let visibleIndices: number[] = [];
let statusFilter: ResultStatus | "all" = "all";
let sortMode: "original" | "status" | "question" = "original";
let searchTerm = "";
let comparisonAttemptId: string | null = null;
let comparisonCandidates: SubmissionSummary[] = [];
let showDiffHighlight = true;
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
let wordDiffEligible = false;
let contextMap = new Map<string, AssessmentContext>();

const wordDiffEligibilityRules: Partial<
  Record<
    QuestionResult["question"]["type"],
    (result: QuestionResult) => boolean
  >
> = {
  subjective: (result) => Boolean(result.correctAnswer?.trim()),
  fitb: (result) => Boolean(result.correctAnswer?.trim()),
};

function isWordDiffEligible(result: QuestionResult) {
  const rule = wordDiffEligibilityRules[result.question.type];
  return rule ? rule(result) : false;
}

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
$: comparisonCandidates = Array.from($attempts.values())
  .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
  .filter(
    (attempt) =>
      attempt.id !== attemptId &&
      (!summary ||
        attempt.assessment.meta.title === summary.assessment.meta.title),
  );
$: if (comparisonCandidates.length === 0) {
  comparisonAttemptId = null;
} else if (
  !comparisonAttemptId ||
  !comparisonCandidates.some((attempt) => attempt.id === comparisonAttemptId)
) {
  comparisonAttemptId = comparisonCandidates[0].id;
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
            result.userNote ?? "",
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
$: contextMap = summary?.assessment.contexts?.length
  ? new Map(summary.assessment.contexts.map((context) => [context.id, context]))
  : new Map();
$: currentContext =
  currentResult?.question.contextId != null
    ? (contextMap.get(currentResult.question.contextId) ?? null)
    : null;
$: wordDiffEligible = currentResult ? isWordDiffEligible(currentResult) : false;
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
$: answerDiffTokens =
  currentResult && wordDiffEligible
    ? buildDiffTokens(currentResult.userAnswer, currentResult.correctAnswer)
    : [];
$: diffSummary = summarizeDiff(answerDiffTokens);

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
    <ReviewHeader
      summary={summary}
      formatter={formatter}
      totalSubjectiveMax={totalSubjectiveMax}
      subjectivePendingPoints={subjectivePendingPoints}
      formatTime={formatTime}
      on:close={closeReview}
    />

    <ComparisonSection
      summary={summary}
      comparisonCandidates={comparisonCandidates}
      comparisonAttemptId={comparisonAttemptId}
      formatter={formatter}
      formatTime={formatTime}
      on:select={(event) => (comparisonAttemptId = event.detail)}
      on:open={(event) => openComparisonReview(event.detail)}
    />

    <BreakdownCharts
      scoreMixSegments={scoreMixSegments}
      deterministicMax={summary.deterministicMax}
      totalSubjectiveMax={totalSubjectiveMax}
      tagBreakdownRows={tagBreakdownRows}
      typeBreakdownRows={typeBreakdownRows}
    />

    <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <QuestionNavigator
        visibleEntries={visibleEntries}
        statusFilter={statusFilter}
        sortMode={sortMode}
        searchTerm={searchTerm}
        searchInputId={searchInputId}
        activeIndex={activeIndex}
        on:select={(event) => selectQuestion(event.detail)}
        on:filter={(event) => (statusFilter = event.detail)}
        on:sort={(event) => (sortMode = event.detail)}
        on:search={(event) => (searchTerm = event.detail)}
      />

      <section class="flex-1 space-y-4">
        {#if currentResult}
          {@const visiblePosition = Math.max(visibleIndices.indexOf(activeIndex), 0) + 1}
          <QuestionDetail
            currentResult={currentResult}
            activeIndex={activeIndex}
            visiblePosition={visiblePosition}
            visibleEntriesLength={visibleEntries.length}
            context={currentContext}
            bind:showDiffHighlight
            answerDiffTokens={answerDiffTokens}
            diffSummary={diffSummary}
            wordDiffEligible={wordDiffEligible}
          />
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
