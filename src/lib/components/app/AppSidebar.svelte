<script lang="ts">
import { Upload } from "lucide-svelte";
import AssessmentPanel from "./sidebar/AssessmentPanel.svelte";
import LibraryPanel from "./sidebar/LibraryPanel.svelte";
import QuestionNavigator from "./sidebar/QuestionNavigator.svelte";
import type { Question } from "../../schema";
import type { PanelVisibility, PanelKey } from "../../stores/preferences";
import type { RecentFileEntry } from "../../storage";
import type { ExampleAssessment } from "../../example-assessments";
import type { SubmissionSummary } from "../../results";
import {
  createAssessmentFingerprint,
  normalizeFingerprint,
  fingerprintsMatch,
} from "../../utils/assessment-fingerprint";

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
export let deleteAttemptsByFingerprint: (
  fingerprint: ReturnType<typeof normalizeFingerprint>,
  title: string,
) => Promise<void> | void;
export let currentAssessmentTitle: string | null = null;
export let questions: Question[] = [];
export let currentIndex = 0;
export let submitted = false;
export let noBackModeEnabled = false;
export let questionNavStyles: (question: Question, index: number) => string;
export let questionNavStatus: (
  question: Question,
  index: number,
) => { label: string; indicator: string };
export let navigateTo: (index: number) => void | Promise<void>;
export let downloadExampleAssessment: (id: string) => void;
export let handleFile: (file: File) => Promise<void> | void;
export let clipboardSupported = false;
export let importFromClipboard: () => Promise<void> | void;

let isDropActive = false;
let recentWithAttempts: {
  file: RecentFileEntry;
  title: string;
  fingerprint: ReturnType<typeof normalizeFingerprint>;
  attempts: SubmissionSummary[];
}[] = [];
let orphanedAttempts: SubmissionSummary[] = [];

$: {
  const attemptFingerprints = attempts.map((attempt) => ({
    attempt,
    fingerprint: createAssessmentFingerprint(attempt.assessment),
  }));

  recentWithAttempts = recentFiles.map((file) => {
    const title = file.meta?.title ?? file.name;
    const fingerprint = normalizeFingerprint(file.meta);
    const matches = attemptFingerprints.filter(
      ({ fingerprint: attemptFingerprint }) =>
        fingerprint
          ? fingerprintsMatch(attemptFingerprint, fingerprint)
          : attemptFingerprint.title === title,
    );

    return {
      file,
      title,
      fingerprint,
      attempts: matches.map(({ attempt }) => attempt),
    };
  });

  const linkedAttemptIds = new Set(
    recentWithAttempts.flatMap((entry) =>
      entry.attempts.map((attempt) => attempt.id),
    ),
  );
  orphanedAttempts = attempts.filter(
    (attempt) => !linkedAttemptIds.has(attempt.id),
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
  class={`relative w-full space-y-4 lg:w-full ${
    isDropActive ? "outline-solid outline-2 outline-primary" : ""
  }`}
  aria-label="Sidebar"
  on:dragover|preventDefault={onDragOver}
  on:dragleave={onDragLeave}
  on:drop|preventDefault={onDrop}
>
  {#if isDropActive}
    <div
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-xs"
      aria-hidden="true"
    >
      <div
        class="flex items-center gap-2 rounded-lg border border-dashed border-primary bg-primary/10 px-4 py-3 text-sm font-medium text-primary shadow-sm"
      >
        <Upload class="h-4 w-4" aria-hidden="true" />
        <span>Drop to import assessment</span>
      </div>
    </div>
  {/if}

  {#if questions.length > 0}
    <QuestionNavigator
      {panelVisibility}
      {togglePanel}
      {questions}
      {currentIndex}
      {submitted}
      {noBackModeEnabled}
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
    {noBackModeEnabled}
    {exampleAssessments}
    {downloadExampleAssessment}
    {handleFile}
    {clipboardSupported}
    {importFromClipboard}
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
    deleteAttemptsByFingerprint={deleteAttemptsByFingerprint}
  />
</aside>
