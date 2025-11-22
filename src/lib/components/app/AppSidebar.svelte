<script lang="ts">
import { slide } from "svelte/transition";
import AssessmentPanel from "./sidebar/AssessmentPanel.svelte";
import LibraryPanel from "./sidebar/LibraryPanel.svelte";
import QuestionNavigator from "./sidebar/QuestionNavigator.svelte";
import type { Question } from "../../schema";
import type { PanelVisibility, PanelKey } from "../../stores/preferences";
import type { RecentFileEntry } from "../../storage";
import type { ExampleAssessment } from "../../example-assessments";
import type { SubmissionSummary } from "../../results";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let requireAllAnsweredChecked = false;
export let setRequireAllAnswered: (value: boolean) => void;
export let exampleAssessments: ExampleAssessment[] = [];
export let recentFiles: RecentFileEntry[] = [];
export let loadRecentAssessment: (
  file: RecentFileEntry,
) => Promise<void> | void;
export let attempts: SubmissionSummary[] = [];
export let onReview: (attemptId: string) => void;
export let onRetakeIncorrect: (attempt: SubmissionSummary) => void;
export let deleteRecentHistory: (names: string[]) => Promise<void> | void;
export let deleteAttempt: (attemptId: string) => Promise<void> | void;
export let deleteAttemptsByTitle: (title: string) => Promise<void> | void;
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
    isDropActive ? "outline outline-2 outline-primary" : ""
  }`}
  aria-label="Sidebar"
  on:dragover|preventDefault={onDragOver}
  on:dragleave={onDragLeave}
  on:drop|preventDefault={onDrop}
  transition:slide
>
  {#if questions.length > 0}
    <QuestionNavigator
      {panelVisibility}
      {togglePanel}
      {questions}
      {questionNavStatus}
      {questionNavStyles}
      {navigateTo}
    />
  {/if}

  <AssessmentPanel
    {panelVisibility}
    {togglePanel}
    {requireAllAnsweredChecked}
    {setRequireAllAnswered}
    {exampleAssessments}
    {downloadExampleAssessment}
    {handleFile}
  />

  <LibraryPanel
    {panelVisibility}
    {togglePanel}
    {recentFiles}
    {recentWithAttempts}
    deleteRecentHistory={deleteRecentHistory}
    {currentAssessmentTitle}
    {loadRecentAssessment}
    {onReview}
    {onRetakeIncorrect}
    {orphanedAttempts}
    {formatter}
    {incorrectCount}
    {deleteAttempt}
    {deleteAttemptsByTitle}
  />
</aside>
