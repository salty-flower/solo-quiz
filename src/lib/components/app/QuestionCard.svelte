<script lang="ts">
import Button from "../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { renderWithKatex } from "../../katex";
import {
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
</script>

<Card>
  <CardHeader>
    <CardTitle>Question {index + 1} of {totalQuestions}</CardTitle>
    <CardDescription className="space-y-1 text-sm">
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
      <div class="space-y-2 leading-relaxed">
        {@html renderWithKatex(question.text)}
      </div>
      {#if question.tags?.length}
        <p class="text-xs text-muted-foreground">Tags: {question.tags.join(", ")}</p>
      {/if}
    </CardDescription>
  </CardHeader>
  <CardContent>
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
