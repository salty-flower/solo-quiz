<script lang="ts">
import { onDestroy } from "svelte";
import Button from "../components/ui/Button.svelte";
import Separator from "../components/ui/Separator.svelte";
import { buildSubjectivePrompt } from "../llm";
import { renderWithKatex } from "../katex";
import type { LlmFeedback } from "../schema";
import type { SubjectiveQuestionResult } from "../results";
import { llm, type GradingWorkspace } from "../stores/llm";

export let result: SubjectiveQuestionResult;

const {
  inputs,
  errors,
  results,
  workspaces,
  workspaceErrors,
  workspaceVisibility,
  copiedPromptQuestionId,
  promptCopyError,
  setInput,
  applyFeedback: applyFeedbackToStore,
  clearFeedback: clearFeedbackInStore,
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
  toggleWorkspaceVisibility,
  setCopiedPromptQuestionId,
  setPromptCopyError,
} = llm;

let feedbackInput: string;
let feedbackError: string | null | undefined;
let feedback: LlmFeedback | undefined;
let workspace: GradingWorkspace | undefined;
let workspaceError: string | null | undefined;
let isWorkspaceCollapsed: boolean;
let questionId: string;
let promptCopyTimeout: number | null = null;

$: questionId = result.question.id;
$: feedbackInput = $inputs[questionId] ?? "";
$: feedbackError = $errors[questionId];
$: feedback = $results[questionId];
$: workspace = $workspaces[questionId];
$: workspaceError = $workspaceErrors[questionId];
$: isWorkspaceCollapsed = $workspaceVisibility[questionId] ?? false;

function setFeedbackInput(value: string) {
  setInput(questionId, value);
}

function setWorkspaceVerdictValue(verdict: GradingWorkspace["verdict"]) {
  setWorkspaceVerdict(questionId, verdict);
}

function setWorkspaceScoreValue(score: number) {
  setWorkspaceScore(questionId, score);
}

function setWorkspaceFeedbackValue(feedbackValue: string) {
  setWorkspaceFeedback(questionId, feedbackValue);
}

function setWorkspaceRubricFractionValue(index: number, value: number) {
  setWorkspaceRubricFraction(questionId, index, value);
}

function setWorkspaceRubricCommentsValue(index: number, value: string) {
  setWorkspaceRubricComments(questionId, index, value);
}

function addWorkspaceImprovementEntry() {
  addWorkspaceImprovement(questionId);
}

function updateWorkspaceImprovementEntry(index: number, value: string) {
  updateWorkspaceImprovement(questionId, index, value);
}

function removeWorkspaceImprovementEntry(index: number) {
  removeWorkspaceImprovement(questionId, index);
}

function insertWorkspaceJson() {
  writeWorkspaceToInput(questionId);
}

function loadWorkspaceFromApplied() {
  const applied = $results[questionId];
  if (!applied) return;
  hydrateWorkspaceFromFeedback(questionId, applied, result.max);
}

function toggleWorkspace() {
  toggleWorkspaceVisibility(questionId);
}

function applyFeedbackForQuestion() {
  applyFeedbackToStore(questionId, result.max);
}

function clearFeedbackForQuestion() {
  clearFeedbackInStore(questionId);
}

async function copyPrompt() {
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
  }
  setCopiedPromptQuestionId(questionId);
  try {
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

onDestroy(() => {
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
    promptCopyTimeout = null;
  }
  setCopiedPromptQuestionId(null);
  setPromptCopyError(null);
});
</script>

<Separator />
<div class="space-y-4">
  <div class="rounded-md border border-dashed bg-muted/30 p-3 text-[0.75rem] text-muted-foreground">
    <p class="mb-1 font-semibold uppercase tracking-wide text-foreground">Rubrics</p>
    <ul class="ml-4 list-disc space-y-1">
      {#each result.rubrics as rubric}
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
    {@const summaryFieldId = `${result.question.id}-workspace-summary`}
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
          <Button size="sm" variant="ghost" on:click={toggleWorkspace}>
            {isWorkspaceCollapsed ? "Show workspace" : "Hide workspace"}
          </Button>
          <Button size="sm" variant="outline" on:click={insertWorkspaceJson}>
            Insert workspace JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!feedback}
            on:click={loadWorkspaceFromApplied}
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
                  on:click={() => setWorkspaceVerdictValue(verdictOption)}
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
                  setWorkspaceScoreValue(
                    Number((event.target as HTMLInputElement).value),
                  )}
              />
              <span class="text-sm text-muted-foreground">/ {workspace.maxScore}</span>
            </div>
            <div class="flex items-center justify-between text-[0.7rem] text-muted-foreground">
              <span>Suggested: {suggestedScore} / {workspace.maxScore}</span>
              <button
                type="button"
                class="font-semibold text-primary underline-offset-2 hover:underline"
                on:click={() => setWorkspaceScoreValue(suggestedScore)}
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
                  setWorkspaceRubricFractionValue(
                    rubricIndex,
                    Number((event.target as HTMLInputElement).value) / 100,
                  )}
              />
              <textarea
                class="h-20 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Comments for this rubric"
                value={rubric.comments}
                on:input={(event) =>
                  setWorkspaceRubricCommentsValue(
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
              setWorkspaceFeedbackValue(
                (event.target as HTMLTextAreaElement).value,
              )}
          ></textarea>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested improvements
            </p>
            <Button size="sm" variant="ghost" on:click={addWorkspaceImprovementEntry}>
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
                    updateWorkspaceImprovementEntry(
                      improvementIndex,
                      (event.target as HTMLInputElement).value,
                    )}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-9 w-9"
                  aria-label={`Remove suggestion ${improvementIndex + 1}`}
                  on:click={() => removeWorkspaceImprovementEntry(improvementIndex)}
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
      <Button size="sm" variant="outline" on:click={copyPrompt}>
        Copy LLM prompt
      </Button>
    {#if $copiedPromptQuestionId === result.question.id && !$promptCopyError}
      <span class="text-muted-foreground">Copied!</span>
    {/if}
    {#if $copiedPromptQuestionId === result.question.id && $promptCopyError}
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
      on:input={(event) => setFeedbackInput((event.target as HTMLTextAreaElement).value)}
    ></textarea>
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" on:click={applyFeedbackForQuestion}>
        Apply feedback
      </Button>
      <Button
        size="sm"
        variant="ghost"
        on:click={clearFeedbackForQuestion}
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
