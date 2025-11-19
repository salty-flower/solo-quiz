<script lang="ts">
import { createEventDispatcher, onDestroy } from "svelte";
import Button from "../components/ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import Separator from "../components/ui/Separator.svelte";
import { renderWithKatex } from "../katex";
import { buildSubjectivePrompt } from "../llm";
import type { QuestionResult, SubmissionSummary } from "../results";
import { attempts } from "../stores/attempts";
import { llm } from "../stores/llm";

export let attemptId: string;

const dispatch = createEventDispatcher<{ close: undefined }>();

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const {
  inputs: llmFeedbackInputs,
  results: llmFeedbackResults,
  errors: llmFeedbackErrors,
  workspaces: llmWorkspaces,
  workspaceErrors: llmWorkspaceErrors,
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
} = llm;

let summary: SubmissionSummary | null = null;
let activeIndex = 0;
let currentResult: QuestionResult | null = null;
let promptCopyTimeout: number | null = null;

$: summary = $attempts.get(attemptId) ?? null;
$: if (!summary) {
  activeIndex = 0;
} else if (
  summary.results.length > 0 &&
  activeIndex >= summary.results.length
) {
  activeIndex = summary.results.length - 1;
}
$: currentResult =
  summary && summary.results.length > 0
    ? summary.results[Math.min(activeIndex, summary.results.length - 1)]
    : null;
$: if (currentResult?.requiresManualGrading) {
  initializeWorkspace(currentResult.question.id, {
    rubrics: currentResult.rubrics,
    maxScore: currentResult.max,
  });
}

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

function formatTime(sec: number): string {
  const minutes = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  applyStoredLlmFeedback(result.question.id);
}

function clearLlmFeedback(questionId: string) {
  clearStoredLlmFeedback(questionId);
}

function insertWorkspaceJson(questionId: string) {
  writeWorkspaceToInput(questionId);
}

function loadWorkspaceFromApplied(questionId: string) {
  const feedback = $llmFeedbackResults[questionId];
  if (!feedback) return;
  hydrateWorkspaceFromFeedback(questionId, feedback);
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
            {#if summary.subjectiveMax > 0}
              <p class="text-2xl font-semibold">{summary.subjectiveMax}</p>
              <p class="text-sm text-muted-foreground">
                Pending across {summary.pendingSubjectiveCount}
                {summary.pendingSubjectiveCount === 1 ? "question" : "questions"}
              </p>
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

    <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <aside class="lg:w-72">
        <div class="rounded-lg border bg-card">
          <div class="border-b px-4 py-3 text-sm font-semibold">Question navigator</div>
          <div class="max-h-[70vh] space-y-2 overflow-y-auto p-3">
            {#each summary.results as result, index}
              {@const meta = statusMeta(result)}
              <button
                class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  activeIndex === index
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:border-input"
                }`}
                aria-current={activeIndex === index ? "true" : undefined}
                on:click={() => selectQuestion(index)}
              >
                <div class="flex items-center justify-between gap-2 text-xs">
                  <span class="font-semibold text-foreground">Question {index + 1}</span>
                  <span class={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                </div>
                <div class="mt-1 text-xs text-muted-foreground">
                  {@html renderWithKatex(result.question.text)}
                </div>
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <section class="flex-1 space-y-4">
        {#if currentResult}
          {@const meta = statusMeta(currentResult)}
          <Card>
            <CardHeader>
              <CardTitle>Question {activeIndex + 1} of {summary.results.length}</CardTitle>
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

              {#if currentResult.feedback}
                <div class="rounded-md border bg-muted/10 p-4 text-sm">
                  <p class={`font-semibold ${meta.textClass}`}>Feedback</p>
                  <div class="mt-2 text-muted-foreground">
                    {@html renderWithKatex(currentResult.feedback)}
                  </div>
                </div>
              {/if}

              {#if currentResult.requiresManualGrading}
                {@const questionId = currentResult.question.id}
                {@const feedbackInput = $llmFeedbackInputs[questionId] ?? ""}
                {@const feedbackError = $llmFeedbackErrors[questionId]}
                {@const feedback = $llmFeedbackResults[questionId]}
                {@const workspace = $llmWorkspaces[questionId]}
                {@const workspaceError = $llmWorkspaceErrors[questionId]}
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
                          <Button size="sm" variant="outline" on:click={() => insertWorkspaceJson(questionId)}>
                            Insert workspace JSON
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!feedback}
                            on:click={() => loadWorkspaceFromApplied(questionId)}
                          >
                            Load from applied JSON
                          </Button>
                        </div>
                      </div>
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
                      {#if workspaceError}
                        <p class="text-xs text-destructive">{workspaceError}</p>
                      {/if}
                    </div>
                  {/if}
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <Button size="sm" variant="outline" on:click={() => copySubjectivePrompt(currentResult)}>
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
                      <Button size="sm" on:click={() => applyLlmFeedback(currentResult)}>
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
        {:else}
          <div class="rounded-lg border bg-card/70 p-6 text-sm text-muted-foreground">
            No questions were included in this attempt.
          </div>
        {/if}
      </section>
    </main>
  </div>
{/if}
