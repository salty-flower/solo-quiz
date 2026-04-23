<script lang="ts">
import Button from "../ui/Button.svelte";
import QuestionImage from "../QuestionImage.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { renderWithKatex } from "../../katex";
import {
  type MatchingQuestion,
  questionWeight,
  type AssessmentContext,
  type MultiQuestion,
  type OrderingQuestion,
  type Question,
  type SingleQuestion,
  type SubjectiveQuestion,
} from "../../schema";
import type { AnswerValue, QuestionResult } from "../../results";

export let question: Question;
export let index: number;
export let totalQuestions: number;
export let answers: Record<string, AnswerValue>;
export let notes: Record<string, string>;
export let orderingInitials: Record<string, string[]>;
export let currentResult: QuestionResult | null = null;
export let context: AssessmentContext | null = null;
export let touchedQuestions: Set<string>;
export let updateTouched: (question: Question, value: AnswerValue) => void;
export let updateNote: (questionId: string, value: string) => void;
export let setOrderingTouched: (id: string, value: boolean) => void;
export let questionElement: HTMLDivElement | null = null;

function moveOrdering(
  question: OrderingQuestion,
  itemIndex: number,
  direction: -1 | 1,
) {
  const currentValue = answers[question.id];
  const current =
    Array.isArray(currentValue) && currentValue.length > 0
      ? ([...currentValue] as string[])
      : [...(orderingInitials[question.id] ?? question.items)];
  const targetIndex = itemIndex + direction;
  if (targetIndex < 0 || targetIndex >= current.length) return;
  [current[itemIndex], current[targetIndex]] = [
    current[targetIndex],
    current[itemIndex],
  ];
  setOrderingTouched(question.id, true);
  updateTouched(question, current);
}

function resetOrdering(question: OrderingQuestion) {
  const initialSequence = orderingInitials[question.id] ?? question.items;
  setOrderingTouched(question.id, false);
  updateTouched(question, [...initialSequence]);
}

function formatPartLabel(label: string) {
  return /^[([{].*[)\]}]$/.test(label.trim())
    ? `Part ${label.trim()}`
    : `Part (${label.trim()})`;
}

function getMatchingSelections(
  question: MatchingQuestion,
): Record<string, string> {
  const current = answers[question.id];
  if (
    typeof current !== "object" ||
    current == null ||
    Array.isArray(current)
  ) {
    return {};
  }
  return { ...current };
}

function updateMatchingSelection(
  question: MatchingQuestion,
  promptId: string,
  optionId: string,
) {
  const next = getMatchingSelections(question);
  if (!optionId) {
    delete next[promptId];
    updateTouched(question, next);
    return;
  }

  for (const [otherPromptId, selectedOptionId] of Object.entries(next)) {
    if (otherPromptId !== promptId && selectedOptionId === optionId) {
      delete next[otherPromptId];
    }
  }

  next[promptId] = optionId;
  updateTouched(question, next);
}

function matchingOptionTaken(
  question: MatchingQuestion,
  promptId: string,
  optionId: string,
) {
  return Object.entries(getMatchingSelections(question)).some(
    ([otherPromptId, selectedOptionId]) =>
      otherPromptId !== promptId && selectedOptionId === optionId,
  );
}
</script>

<Card>
  <CardHeader className="space-y-4 pb-4">
    {#if question.part}
      <div class="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {#if question.part.title}
          <span class="rounded-full bg-muted px-2 py-1 font-semibold text-foreground">
            {@html renderWithKatex(question.part.title)}
          </span>
        {/if}
        <span>{formatPartLabel(question.part.label)}</span>
      </div>
    {/if}
    <CardTitle>Question {index + 1} of {totalQuestions}</CardTitle>
    <CardDescription className="space-y-3 text-sm leading-relaxed">
      {#if context}
        <div class="space-y-2 rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
          {#if context.title}
            <p class="text-xs font-semibold uppercase text-muted-foreground">
              {@html renderWithKatex(context.title)}
            </p>
          {/if}
          <div class="space-y-2 text-muted-foreground">
            {@html renderWithKatex(context.body)}
          </div>
        </div>
      {/if}
      {#if question.image}
        <QuestionImage image={question.image} />
      {/if}
      <div class="space-y-2 leading-relaxed">
        {@html renderWithKatex(question.text)}
      </div>
      {#if question.tags?.length}
        <p class="text-xs text-muted-foreground">Tags: {question.tags.join(", ")}</p>
      {/if}
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-6 pt-4">
    <div
      class="space-y-4 focus:outline-hidden"
      tabindex="-1"
      bind:this={questionElement}
      aria-live="polite"
    >
      {#if question.type === "single"}
        {@const singleQuestion = question as SingleQuestion}
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
      {:else if question.type === "multi"}
        {@const multiQuestion = question as MultiQuestion}
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
      {:else if question.type === "fitb"}
        <textarea
          class="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Type your answer"
          value={answers[question.id] as string}
          on:input={(event) => updateTouched(question, (event.target as HTMLTextAreaElement).value)}
        ></textarea>
      {:else if question.type === "subjective"}
        {@const subjectiveQuestion = question as SubjectiveQuestion}
        <div class="space-y-3">
          <textarea
            class="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Write your response"
            value={answers[question.id] as string}
            on:input={(event) => updateTouched(question, (event.target as HTMLTextAreaElement).value)}
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
                    {#if rubric.weight != null}
                      <span class="ml-2 font-mono uppercase tracking-wide text-muted-foreground">
                        Weight {rubric.weight}
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {:else if question.type === "numeric"}
        <input
          type="number"
          inputmode="decimal"
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Enter a number"
          value={answers[question.id] as string}
          on:input={(event) => updateTouched(question, (event.target as HTMLInputElement).value)}
        />
      {:else if question.type === "ordering"}
        {@const orderingQuestion = question as OrderingQuestion}
        {@const orderingSequence =
          Array.isArray(answers[orderingQuestion.id]) &&
          (answers[orderingQuestion.id] as string[]).length > 0
            ? (answers[orderingQuestion.id] as string[])
            : orderingInitials[orderingQuestion.id] ?? orderingQuestion.items}
        <div class="space-y-2">
          {#each orderingSequence as item, itemIndex}
            <div class="flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-sm">
              <span class="flex-1">
                {@html renderWithKatex(item)}
              </span>
              <div class="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={itemIndex === 0}
                  on:click={() => moveOrdering(orderingQuestion, itemIndex, -1)}
                  aria-label={`Move ${item} up`}
                >
                  ↑
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={itemIndex === (answers[orderingQuestion.id] as string[]).length - 1}
                  on:click={() => moveOrdering(orderingQuestion, itemIndex, 1)}
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
      {:else if question.type === "matching"}
        {@const matchingQuestion = question as MatchingQuestion}
        {@const matchingSelections = getMatchingSelections(matchingQuestion)}
        <div class="space-y-3">
          {#each matchingQuestion.prompts as prompt}
            <div class="grid gap-3 rounded-lg border bg-card/60 p-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] md:items-center">
              <div class="space-y-1">
                <p class="text-sm font-medium text-foreground">
                  {@html renderWithKatex(prompt.prompt)}
                </p>
                {#if prompt.explanation}
                  <p class="text-xs text-muted-foreground">
                    {@html renderWithKatex(prompt.explanation)}
                  </p>
                {/if}
              </div>
              <label class="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Match</span>
                <select
                  class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  value={matchingSelections[prompt.id] ?? ""}
                  on:change={(event) =>
                    updateMatchingSelection(
                      matchingQuestion,
                      prompt.id,
                      (event.target as HTMLSelectElement).value,
                    )}
                >
                  <option value="">Choose a definition</option>
                  {#each matchingQuestion.options as option}
                    <option
                      value={option.id}
                      disabled={matchingOptionTaken(
                        matchingQuestion,
                        prompt.id,
                        option.id,
                      )}
                    >
                      {option.label}
                    </option>
                  {/each}
                </select>
              </label>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="space-y-2 rounded-md border bg-muted/20 p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-foreground">Notes</p>
        <p class="text-xs text-muted-foreground">Not graded</p>
      </div>
      <textarea
        class="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Jot down any reminders or scratch work"
        value={notes[question.id] ?? ""}
        on:input={(event) =>
          updateNote(question.id, (event.target as HTMLTextAreaElement).value)
        }
      ></textarea>
    </div>
  </CardContent>
  <CardHeader className="flex flex-col items-start gap-2 border-t bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Weight:</span>
      <span class="font-medium">{questionWeight(question)}</span>
    </div>
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Status:</span>
      <span class={`font-medium ${question && touchedQuestions.has(question.id) ? "text-green-600 dark:text-green-300" : ""}`}>
        {question && touchedQuestions.has(question.id) ? "Answered" : "Pending"}
      </span>
    </div>
  </CardHeader>
</Card>
