<script lang="ts">
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { renderWithKatex } from "../katex";
import type {
  QuestionResult,
  ResultStatus,
  SubjectiveQuestionResult,
} from "../results";
import AnswerDiff from "./AnswerDiff.svelte";
import { statusMeta } from "./status";
import LlmWorkspaceSection from "./LlmWorkspaceSection.svelte";
import type { DiffToken } from "./diff";

export let currentResult: QuestionResult;
export let activeIndex: number;
export let visiblePosition: number;
export let visibleEntriesLength: number;
export let showDiffHighlight: boolean;
export let showFeedbackDetails: boolean;
export let answerDiffTokens: DiffToken[];
export let diffSummary: Record<DiffToken["type"], number>;

let meta: ReturnType<typeof statusMeta>;
let subjectiveResult: SubjectiveQuestionResult | null;

$: meta = statusMeta(currentResult as { status: ResultStatus });
$: subjectiveResult = currentResult.requiresManualGrading
  ? (currentResult as SubjectiveQuestionResult)
  : null;
</script>

<Card>
  <CardHeader>
    <CardTitle>
      Question {visiblePosition} of {visibleEntriesLength}
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

    <AnswerDiff
      userAnswer={currentResult.userAnswer}
      referenceAnswer={currentResult.correctAnswer}
      tokens={answerDiffTokens}
      bind:showDiffHighlight
      showFeedbackDetails={showFeedbackDetails}
      diffSummary={diffSummary}
      feedback={currentResult.feedback}
    />

    {#if subjectiveResult}
      <LlmWorkspaceSection result={subjectiveResult} />
    {/if}
  </CardContent>
</Card>
