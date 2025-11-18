<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";
import { slide } from "svelte/transition";
import { Download, Moon, PanelLeft, PanelRight, Sun } from "lucide-svelte";
import Button from "./lib/components/ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./lib/components/ui/card";
import Separator from "./lib/components/ui/Separator.svelte";
import Progress from "./lib/components/ui/Progress.svelte";
import Switch from "./lib/components/ui/Switch.svelte";
import Dialog from "./lib/components/ui/Dialog.svelte";
import Alert from "./lib/components/ui/Alert.svelte";
import { renderWithKatex } from "./lib/katex";
import {
  llmFeedbackSchema,
  parseAssessment,
  questionWeight,
  type Assessment,
  type Question,
  type SingleQuestion,
  type MultiQuestion,
  type OrderingQuestion,
  type SubjectiveQuestion,
  type LlmFeedback,
} from "./lib/schema";
import {
  clearRecentFiles,
  getRecentFiles,
  touchRecentFile,
  type RecentFileEntry,
} from "./lib/storage";
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
  evaluateSubmission,
  type AnswerValue,
  type QuestionResult,
  type SubmissionSummary,
} from "./lib/results";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

let fileInput: HTMLInputElement | null = null;
let dropActive = false;
let recentFiles: RecentFileEntry[] = [];
let assessment: Assessment | null = null;
let questions: Question[] = [];
let answers: Record<string, AnswerValue> = {};
let touchedQuestions = new Set<string>();
let currentIndex = 0;
let currentQuestion: Question | undefined = undefined;
let currentResult: QuestionResult | null = null;
let parseErrors: { path: string; message: string }[] = [];
let startedAt: Date | null = null;
let elapsedSec = 0;
let timerId: number | null = null;
let timeLimitSec: number | null = null;
let timeRemaining: number | null = null;
let submitted = false;
let submission: SubmissionSummary | null = null;
let showResultDialog = false;
let requireAllAnswered = false;
let questionContainer: HTMLDivElement | null = null;
let theme: "light" | "dark" = "light";
let orderingTouched = new Set<string>();
let copiedPromptQuestionId: string | null = null;
let promptCopyError: string | null = null;
let promptCopyTimeout: number | null = null;
let llmFeedbackInputs: Record<string, string> = {};
let llmFeedbackResults: Record<string, LlmFeedback | undefined> = {};
let llmFeedbackErrors: Record<string, string | null> = {};
type PanelKey = "assessment" | "recents" | "questions";
type PanelVisibility = Record<PanelKey, boolean>;
const PANEL_STORAGE_KEY = "solo-quiz-panel-visibility-v1";
const SIDEBAR_STORAGE_KEY = "solo-quiz-sidebar-visible-v1";
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  assessment: false,
  recents: false,
  questions: false,
};
let panelVisibility: PanelVisibility = { ...DEFAULT_PANEL_VISIBILITY };
let sidebarVisible = true;
const exampleAssessments = getExampleAssessments();

const SYSTEM_PREFERS_DARK = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function loadTheme() {
  if (typeof localStorage === "undefined") return;
  const stored = localStorage.getItem("solo-quiz-theme");
  if (stored === "light" || stored === "dark") {
    theme = stored;
    return;
  }
  theme = SYSTEM_PREFERS_DARK() ? "dark" : "light";
}

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("solo-quiz-theme", theme);
  }
}

function loadPanelVisibility(): PanelVisibility {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_PANEL_VISIBILITY };
  }

  const stored = localStorage.getItem(PANEL_STORAGE_KEY);
  if (!stored) {
    return { ...DEFAULT_PANEL_VISIBILITY };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<PanelVisibility>;
    const result: PanelVisibility = { ...DEFAULT_PANEL_VISIBILITY };
    for (const key of Object.keys(result) as PanelKey[]) {
      if (typeof parsed[key] === "boolean") {
        result[key] = parsed[key] as boolean;
      }
    }
    return result;
  } catch (error) {
    console.warn("Unable to parse panel preferences; resetting", error);
    localStorage.removeItem(PANEL_STORAGE_KEY);
    return { ...DEFAULT_PANEL_VISIBILITY };
  }
}

function savePanelVisibility(value: PanelVisibility) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to store panel preferences", error);
  }
}

function loadSidebarVisibility() {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) return true;
    return JSON.parse(stored) === true;
  } catch (error) {
    console.warn("Unable to parse sidebar preference; resetting", error);
    localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    return true;
  }
}

function saveSidebarVisibility(value: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to store sidebar preference", error);
  }
}

function togglePanel(key: PanelKey) {
  panelVisibility = { ...panelVisibility, [key]: !panelVisibility[key] };
}

function toggleSidebar() {
  sidebarVisible = !sidebarVisible;
}

onMount(async () => {
  loadTheme();
  applyTheme();
  panelVisibility = loadPanelVisibility();
  sidebarVisible = loadSidebarVisibility();
  recentFiles = await getRecentFiles();
});

$: if (theme) applyTheme();
$: savePanelVisibility(panelVisibility);
$: saveSidebarVisibility(sidebarVisible);

onDestroy(() => {
  if (timerId) {
    window.clearInterval(timerId);
  }
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
  }
});

$: answeredCount = [...touchedQuestions].length;
$: totalQuestions = questions.length;
$: currentQuestion = questions[currentIndex];
$: currentResult = submission
  ? (submission.results[currentIndex] ?? null)
  : null;
$: progressValue =
  totalQuestions === 0 ? 0 : Math.round((answeredCount / totalQuestions) * 100);
$: hasAnyAnswer = answeredCount > 0;
$: submitDisabled =
  !assessment ||
  submitted ||
  !hasAnyAnswer ||
  (requireAllAnswered && answeredCount < totalQuestions);
$: timeDisplay =
  timeRemaining !== null ? formatTime(timeRemaining) : formatTime(elapsedSec);

function formatTime(sec: number): string {
  const minutes = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function resetState(data: Assessment, sourceName?: string) {
  assessment = data;
  const baseQuestions = data.questions;
  questions = data.meta.shuffleQuestions
    ? shuffle(baseQuestions)
    : [...baseQuestions];
  answers = {};
  touchedQuestions = new Set();
  orderingTouched = new Set();
  copiedPromptQuestionId = null;
  promptCopyError = null;
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
    promptCopyTimeout = null;
  }
  llmFeedbackInputs = {};
  llmFeedbackResults = {};
  llmFeedbackErrors = {};
  for (const question of questions) {
    if (question.type === "multi" || question.type === "ordering") {
      answers[question.id] = [
        ...(question.type === "ordering" ? question.items : []),
      ];
    } else {
      answers[question.id] = "";
    }
  }
  touchedQuestions = new Set();
  currentIndex = 0;
  parseErrors = [];
  submitted = false;
  submission = null;
  showResultDialog = false;
  startedAt = new Date();
  elapsedSec = 0;
  timeLimitSec = data.meta.timeLimitSec ?? null;
  timeRemaining = timeLimitSec;
  if (timerId) {
    window.clearInterval(timerId);
  }
  timerId = window.setInterval(() => {
    if (!startedAt) return;
    elapsedSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    if (timeLimitSec !== null) {
      const remaining = Math.max(0, timeLimitSec - elapsedSec);
      timeRemaining = remaining;
      if (remaining === 0 && !submitted) {
        submitQuiz(true);
      }
    }
  }, 1000);
  if (sourceName) {
    touchRecentFile(sourceName).then(async () => {
      recentFiles = await getRecentFiles();
    });
  }
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function handleFile(file: File) {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const result = parseAssessment(raw);
    if (!result.ok) {
      parseErrors = result.issues;
      assessment = null;
      questions = [];
      return;
    }
    resetState(result.data, file.name);
  } catch (error) {
    parseErrors = [{ path: "file", message: (error as Error).message }];
    assessment = null;
    questions = [];
  }
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  void handleFile(files[0]);
  target.value = "";
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  dropActive = false;
  if (!event.dataTransfer) return;
  const file = event.dataTransfer.files?.[0];
  if (file) {
    void handleFile(file);
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  dropActive = true;
}

function onDragLeave(event: DragEvent) {
  event.preventDefault();
  dropActive = false;
}

function handleDropzoneKey(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput?.click();
  }
}

function updateTouched(question: Question, value: AnswerValue) {
  answers = { ...answers, [question.id]: value };
  const answered = isAnswered(question, value);
  const clone = new Set(touchedQuestions);
  if (answered) {
    clone.add(question.id);
  } else {
    clone.delete(question.id);
  }
  touchedQuestions = clone;
}

function isAnswered(
  question: Question,
  value: AnswerValue = answers[question.id],
): boolean {
  if (value == null) return false;
  if (question.type === "ordering") {
    if (!orderingTouched.has(question.id)) {
      return false;
    }
    const arr = value as string[];
    return arr.length > 0;
  }
  if (question.type === "multi") {
    const arr = value as string[];
    return arr.length > 0;
  }
  const str = String(value);
  return str.trim().length > 0;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, index) => val === b[index]);
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
  currentIndex = index;
  await tick();
  questionContainer?.focus();
}

function submitQuiz(auto = false) {
  if (!assessment || submitted) return;
  submitted = true;
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
  llmFeedbackInputs = {};
  llmFeedbackResults = {};
  llmFeedbackErrors = {};
  const completedAt = new Date();
  submission = evaluateSubmission({
    assessment,
    questions,
    answers,
    startedAt,
    completedAt,
    elapsedSec,
    autoSubmitted: auto,
  });
  showResultDialog = true;
}

function resetAssessment() {
  if (!assessment) return;
  resetState(assessment);
}

function exportCsv() {
  if (!submission) return;
  const serializable = submission.results.map((result, index) =>
    createSerializableQuestionResult(result, index),
  );
  const rows: CsvQuestionResult[] = serializable.map((entry) => ({
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
  }));
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

function downloadExampleAssessment(id: string) {
  const example = findExampleAssessment(id);
  if (!example) return;

  const blob = new Blob([`${JSON.stringify(example.data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(example.data.meta.title)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportAssessment() {
  if (!assessment) return;
  const blob = new Blob([JSON.stringify(assessment, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(assessment.meta.title)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportJsonSummary() {
  if (!submission) return;
  const summary = submission;
  const serializable = summary.results.map((result, index) =>
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
      earned: submission.deterministicEarned,
      max: submission.deterministicMax,
      percentage: submission.deterministicPercentage,
    },
    subjective: {
      pendingCount: submission.pendingSubjectiveCount,
      max: submission.subjectiveMax,
    },
    timing: {
      startedAt: submission.startedAt.toISOString(),
      completedAt: submission.completedAt.toISOString(),
      elapsedSec: submission.elapsedSec,
      autoSubmitted: submission.autoSubmitted,
    },
    results: serializable.map((entry, index) => {
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
    }),
  };
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(assessed.meta.title)}-summary.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
}

async function copySubjectivePrompt(result: QuestionResult) {
  if (promptCopyTimeout) {
    window.clearTimeout(promptCopyTimeout);
  }
  copiedPromptQuestionId = result.question.id;
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
    promptCopyError = null;
  } catch (error) {
    promptCopyError =
      error instanceof Error
        ? error.message
        : "Unable to copy prompt to clipboard.";
  }
  promptCopyTimeout = window.setTimeout(() => {
    copiedPromptQuestionId = null;
    promptCopyError = null;
    promptCopyTimeout = null;
  }, 3000);
}

function setLlmFeedbackInput(questionId: string, value: string) {
  llmFeedbackInputs = { ...llmFeedbackInputs, [questionId]: value };
}

function applyLlmFeedback(result: QuestionResult) {
  if (!result.requiresManualGrading) return;
  const questionId = result.question.id;
  const raw = llmFeedbackInputs[questionId]?.trim();
  if (!raw) {
    llmFeedbackErrors = {
      ...llmFeedbackErrors,
      [questionId]: "Paste the JSON feedback before applying.",
    };
    llmFeedbackResults = { ...llmFeedbackResults, [questionId]: undefined };
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const feedback = llmFeedbackSchema.parse(parsed) as LlmFeedback;
    llmFeedbackResults = { ...llmFeedbackResults, [questionId]: feedback };
    llmFeedbackErrors = { ...llmFeedbackErrors, [questionId]: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to parse feedback. Ensure valid JSON.";
    llmFeedbackErrors = { ...llmFeedbackErrors, [questionId]: message };
    llmFeedbackResults = { ...llmFeedbackResults, [questionId]: undefined };
  }
}

function clearLlmFeedback(questionId: string) {
  llmFeedbackInputs = { ...llmFeedbackInputs, [questionId]: "" };
  llmFeedbackResults = { ...llmFeedbackResults, [questionId]: undefined };
  llmFeedbackErrors = { ...llmFeedbackErrors, [questionId]: null };
}

function moveOrdering(
  question: OrderingQuestion,
  index: number,
  direction: -1 | 1,
) {
  const current = Array.isArray(answers[question.id])
    ? ([...(answers[question.id] as string[])] as string[])
    : [...question.items];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= current.length) return;
  [current[index], current[targetIndex]] = [
    current[targetIndex],
    current[index],
  ];
  setOrderingTouched(question.id, true);
  updateTouched(question, current);
}

function resetOrdering(question: OrderingQuestion) {
  setOrderingTouched(question.id, false);
  updateTouched(question, [...question.items]);
}

function setOrderingTouched(questionId: string, value: boolean) {
  const clone = new Set(orderingTouched);
  if (value) {
    clone.add(questionId);
  } else {
    clone.delete(questionId);
  }
  orderingTouched = clone;
}
</script>

<svelte:window on:dragover|preventDefault={onDragOver} on:drop={onDrop} />

<div class="min-h-screen bg-background text-foreground">
  <header class="border-b bg-card/30 backdrop-blur">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">Solo Quiz Player</h1>
        {#if assessment}
          <p class="text-sm text-muted-foreground">{assessment.meta.title}</p>
        {:else}
          <p class="text-sm text-muted-foreground">Load an assessment JSON to begin.</p>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-3 sm:justify-end">
        <Button
          variant="outline"
          size="icon"
          class="h-9"
          aria-pressed={sidebarVisible}
          title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
          on:click={toggleSidebar}
        >
          {#if sidebarVisible}
            <PanelLeft class="h-4 w-4" aria-hidden="true" />
          {:else}
            <PanelRight class="h-4 w-4" aria-hidden="true" />
          {/if}
          <span class="sr-only">{sidebarVisible ? "Hide sidebar" : "Show sidebar"}</span>
        </Button>
        {#if assessment}
          <div class="rounded-md border px-3 py-1 text-sm">
            <span class="font-medium">{timeLimitSec ? "Time Remaining" : "Elapsed"}:</span>
            <span class="ml-2 font-mono">{timeDisplay}</span>
          </div>
          <div class="w-40">
            <Progress value={progressValue} />
            <p class="mt-1 text-xs text-muted-foreground">{answeredCount} / {totalQuestions} answered</p>
          </div>
        {/if}
        <Button
          variant="ghost"
          size="icon"
          class="h-9"
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          on:click={toggleTheme}
        >
          {#if theme === "dark"}
            <Moon class="h-4 w-4" aria-hidden="true" />
          {:else}
            <Sun class="h-4 w-4" aria-hidden="true" />
          {/if}
          <span class="sr-only">
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </span>
        </Button>
      </div>
    </div>
  </header>

  <main class={`mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 ${sidebarVisible ? "lg:flex-row" : ""}`}>
    {#if sidebarVisible}
      <aside class="w-full space-y-4 lg:w-64" transition:slide={{ duration: 200 }}>
      <Card>
        <CardHeader className="flex items-start justify-between space-y-0">
          <div>
            <CardTitle>Assessment</CardTitle>
            <CardDescription>Import JSON or drag & drop to get started.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs"
            aria-pressed={!panelVisibility.assessment}
            on:click={() => togglePanel("assessment")}
          >
            {panelVisibility.assessment ? "Show" : "Hide"}
          </Button>
        </CardHeader>
        {#if !panelVisibility.assessment}
          <CardContent className="space-y-4">
            <div
              class={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
                dropActive ? "border-primary bg-primary/10" : "border-muted"
              }`}
              on:dragover|preventDefault={onDragOver}
              on:dragleave={onDragLeave}
              on:drop={onDrop}
              role="button"
              tabindex="0"
              aria-label="Load assessment JSON file"
              on:keydown={handleDropzoneKey}
            >
              <p class="font-medium">Drop JSON here</p>
              <p class="text-muted-foreground">or</p>
              <Button on:click={() => fileInput?.click()}>Choose File</Button>
              <input
                class="hidden"
                type="file"
                accept="application/json"
                bind:this={fileInput}
                on:change={onFileInputChange}
              />
            </div>
            <Separator />
            <label class="flex items-center justify-between text-sm">
              <span>Require all answers before submit</span>
              <Switch bind:checked={requireAllAnswered} label="Require all answers" />
            </label>
            <Separator />
            <div class="space-y-2">
              <p class="text-sm font-medium">Example assessments</p>
              {#each exampleAssessments as example}
                <div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <p class="font-medium">{example.data.meta.title}</p>
                  <Button
                    size="icon"
                    variant="outline"
                    class="ml-auto"
                    title={`Download ${example.data.meta.title}`}
                    on:click={() => downloadExampleAssessment(example.id)}
                  >
                    <Download class="h-4 w-4" aria-hidden="true" />
                    <span class="sr-only">Download {example.data.meta.title}</span>
                  </Button>
                </div>
              {/each}
            </div>
          </CardContent>
        {/if}
      </Card>

      <Card>
        <CardHeader className="flex items-start justify-between space-y-0">
          <div>
            <CardTitle>Recent files</CardTitle>
            <CardDescription>Stored in IndexedDB or localStorage when available.</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs"
            aria-pressed={!panelVisibility.recents}
            on:click={() => togglePanel("recents")}
          >
            {panelVisibility.recents ? "Show" : "Hide"}
          </Button>
        </CardHeader>
        {#if !panelVisibility.recents}
          <CardContent className="space-y-3">
            {#if recentFiles.length === 0}
              <p class="text-sm text-muted-foreground">No recent files yet.</p>
            {:else}
              <ul class="space-y-2 text-sm">
                {#each recentFiles as file}
                  <li class="flex flex-col rounded-md border border-border px-3 py-2">
                    <span class="font-medium">{file.name}</span>
                    <span class="text-xs text-muted-foreground">{formatter.format(new Date(file.lastOpened))}</span>
                  </li>
                {/each}
              </ul>
              <Button variant="ghost" size="sm" on:click={() => clearRecentFiles().then(async () => (recentFiles = await getRecentFiles()))}>
                Clear history
              </Button>
            {/if}
          </CardContent>
        {/if}
      </Card>

      {#if assessment}
        <Card>
          <CardHeader className="flex items-start justify-between space-y-0">
            <div>
              <CardTitle>Questions</CardTitle>
              <CardDescription>Jump to any question.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 px-2 text-xs"
              aria-pressed={!panelVisibility.questions}
              on:click={() => togglePanel("questions")}
            >
              {panelVisibility.questions ? "Show" : "Hide"}
            </Button>
          </CardHeader>
          {#if !panelVisibility.questions}
            <CardContent>
              <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
                {#each questions as question, index}
                  <button
                    type="button"
                    class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${questionNavStyles(
                      question,
                      index,
                    )}`}
                    on:click={() => navigateTo(index)}
                  >
                    {index + 1}
                  </button>
                {/each}
              </nav>
            </CardContent>
          {/if}
        </Card>
      {/if}
      </aside>
    {/if}

    <section class="flex-1 space-y-6">
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
          <div class="rounded-lg border bg-card p-4 text-sm">
            <div class="flex flex-wrap items-center gap-4">
              <div>
                <p class="text-lg font-semibold">
                  Deterministic score: {submission.deterministicEarned} / {submission.deterministicMax}
                  ({submission.deterministicPercentage.toFixed(1)}%)
                </p>
                <p class="text-xs text-muted-foreground">
                  Time used: {formatTime(submission.elapsedSec)}
                  {#if submission.autoSubmitted}
                    — auto submitted when the timer expired.
                  {/if}
                </p>
                {#if submission.subjectiveMax > 0}
                  <p class="text-xs text-muted-foreground">
                    Pending subjective points: {submission.subjectiveMax} across {submission.pendingSubjectiveCount}
                    {submission.pendingSubjectiveCount === 1 ? "question" : "questions"}.
                  </p>
                {/if}
              </div>
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" on:click={() => (showResultDialog = true)}>
                  View summary
                </Button>
                <Button size="sm" on:click={exportCsv}>Export results CSV</Button>
                <Button size="sm" variant="outline" on:click={exportJsonSummary}>
                  Export JSON summary
                </Button>
                <Button size="sm" variant="outline" on:click={exportAssessment}>Download assessment JSON</Button>
                <Button size="sm" variant="ghost" on:click={resetAssessment}>Retake quiz</Button>
              </div>
            </div>
          </div>
        {/if}

        {#if currentQuestion}
          <Card>
            <CardHeader>
              <CardTitle>Question {currentIndex + 1} of {questions.length}</CardTitle>
              <CardDescription className="space-y-1 text-sm">
                <div class="space-y-2 leading-relaxed">
                  {@html renderWithKatex(currentQuestion.text)}
                </div>
                {#if currentQuestion.tags?.length}
                  <p class="text-xs text-muted-foreground">Tags: {currentQuestion.tags.join(", ")}</p>
                {/if}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                class="space-y-4 focus:outline-none"
                tabindex="-1"
                bind:this={questionContainer}
                aria-live="polite"
              >
                {#if currentQuestion.type === "single"}
                  {@const singleQuestion = currentQuestion as SingleQuestion}
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
                            {currentResult.question.id === singleQuestion.id &&
                            !currentResult.requiresManualGrading &&
                            currentResult.status === "correct" &&
                            option.id === singleQuestion.correct
                              ? "Correct answer"
                              : option.explanation}
                          </span>
                        {/if}
                      </span>
                    </label>
                  {/each}
                {:else if currentQuestion.type === "multi"}
                  {@const multiQuestion = currentQuestion as MultiQuestion}
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
                        {#if currentResult}
                          <span class="block text-xs text-muted-foreground">{option.explanation}</span>
                        {/if}
                      </span>
                    </label>
                  {/each}
                {:else if currentQuestion.type === "fitb"}
                  <textarea
                    class="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Type your answer"
                    value={answers[currentQuestion.id] as string}
                    on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                {:else if currentQuestion.type === "subjective"}
                  {@const subjectiveQuestion = currentQuestion as SubjectiveQuestion}
                  <div class="space-y-3">
                    <textarea
                      class="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Write your response"
                      value={answers[currentQuestion.id] as string}
                      on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLTextAreaElement).value)}
                    ></textarea>
                    <div class="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                      <p class="mb-2 font-semibold uppercase tracking-wide text-muted-foreground">
                        Rubrics
                      </p>
                      {#if currentResult && currentResult.requiresManualGrading}
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
                      {:else}
                        <p class="ml-1 text-muted-foreground">
                          Rubrics will be available when reviewing your submission.
                        </p>
                      {/if}
                    </div>
                  </div>
                {:else if currentQuestion.type === "numeric"}
                  <input
                    type="number"
                    inputmode="decimal"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Enter a number"
                    value={answers[currentQuestion.id] as string}
                    on:input={(event) => updateTouched(currentQuestion, (event.target as HTMLInputElement).value)}
                  />
                {:else if currentQuestion.type === "ordering"}
                  {@const orderingQuestion = currentQuestion as OrderingQuestion}
                  <div class="space-y-2">
                    {#each (answers[orderingQuestion.id] as string[]) as item, index}
                      <div class="flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-sm">
                        <span class="flex-1">
                          {@html renderWithKatex(item)}
                        </span>
                        <div class="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={index === 0}
                            on:click={() => moveOrdering(orderingQuestion, index, -1)}
                            aria-label={`Move ${item} up`}
                          >
                            ↑
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={index === (answers[orderingQuestion.id] as string[]).length - 1}
                            on:click={() => moveOrdering(orderingQuestion, index, 1)}
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
            </CardContent>
            <CardHeader className="flex flex-col items-start gap-2 border-t bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Weight:</span>
                <span class="font-medium">{questionWeight(currentQuestion)}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Status:</span>
                <span class={`font-medium ${
                  currentQuestion && touchedQuestions.has(currentQuestion.id) ? "text-green-600 dark:text-green-300" : ""
                }`}>
                  {currentQuestion && touchedQuestions.has(currentQuestion.id) ? "Answered" : "Pending"}
                </span>
              </div>
            </CardHeader>
          </Card>
        {/if}

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              on:click={() => navigateTo(currentIndex - 1)}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              on:click={() => navigateTo(currentIndex + 1)}
              disabled={currentIndex === questions.length - 1}
            >
              Next
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <Button variant="ghost" on:click={resetAssessment}>Reset answers</Button>
            <Button variant="destructive" disabled={submitDisabled} on:click={() => submitQuiz(false)}>Submit</Button>
          </div>
        </div>
      {/if}
    </section>
  </main>
</div>

{#if submission}
  <Dialog open={showResultDialog} title="Quiz summary" on:close={() => (showResultDialog = false)}>
    <div class="space-y-3 text-sm">
      <p>
        <span class="font-semibold">Deterministic score:</span>
        {" "}
        {submission.deterministicEarned} / {submission.deterministicMax}
        {" "}({submission.deterministicPercentage.toFixed(2)}%)
      </p>
      {#if submission.subjectiveMax > 0}
        <p>
          <span class="font-semibold">Pending subjective:</span>
          {" "}
          {submission.subjectiveMax} points across {submission.pendingSubjectiveCount}
          {submission.pendingSubjectiveCount === 1 ? "question" : "questions"}.
        </p>
      {/if}
      <p>
        <span class="font-semibold">Started:</span> {formatter.format(submission.startedAt)}
        <br />
        <span class="font-semibold">Completed:</span> {formatter.format(submission.completedAt)}
      </p>
      <p>
        <span class="font-semibold">Time used:</span> {formatTime(submission.elapsedSec)}
        {#if submission.autoSubmitted}
          — auto submitted when the timer expired.
        {/if}
      </p>
      <Separator />
      <div class="max-h-80 overflow-y-auto pr-2 text-xs">
        <table class="w-full table-fixed border-collapse text-left">
          <thead class="sticky top-0 bg-background">
            <tr class="border-b">
              <th class="w-12 py-2">#</th>
              <th class="py-2">Question</th>
              <th class="w-28 py-2">Your answer</th>
              <th class="w-28 py-2">Reference</th>
              <th class="w-20 py-2 text-center">Earned</th>
              <th class="w-24 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each submission.results as result, index}
              {@const statusClass =
                result.status === "correct"
                  ? "text-green-600 dark:text-green-300"
                  : result.status === "incorrect"
                    ? "text-destructive"
                    : "text-muted-foreground"}
              {@const statusLabel =
                result.status === "pending"
                  ? "Pending review"
                  : result.status === "correct"
                    ? "Correct"
                    : "Incorrect"}
              <tr class="border-b align-top">
                <td class="py-2">{index + 1}</td>
                <td class="py-2">
                  <div class="font-medium">
                    {@html renderWithKatex(result.question.text)}
                  </div>
                  {#if result.feedback}
                    <p class={`mt-1 text-xs ${statusClass}`}>
                      {@html renderWithKatex(result.feedback)}
                    </p>
                  {/if}
                  {#if result.requiresManualGrading}
                    {@const questionId = result.question.id}
                    {@const feedbackInput = llmFeedbackInputs[questionId] ?? ""}
                    {@const feedbackError = llmFeedbackErrors[questionId]}
                    {@const feedback = llmFeedbackResults[questionId]}
                    <div class="mt-2 space-y-3">
                      <div class="rounded-md border border-dashed bg-muted/30 p-2 text-[0.7rem] text-muted-foreground">
                        <p class="mb-1 font-semibold uppercase tracking-wide">Rubrics</p>
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
                      <div class="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" on:click={() => copySubjectivePrompt(result)}>
                          Copy LLM prompt
                        </Button>
                        {#if copiedPromptQuestionId === questionId && !promptCopyError}
                          <span class="text-xs text-muted-foreground">Copied!</span>
                        {/if}
                        {#if copiedPromptQuestionId === questionId && promptCopyError}
                          <span class="text-xs text-destructive">{promptCopyError}</span>
                        {/if}
                      </div>
                      <div class="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                        <p class="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          Paste LLM feedback JSON
                        </p>
                        <textarea
                          class="h-24 w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-[0.75rem] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          placeholder="Paste the model's JSON response here"
                          value={feedbackInput}
                          on:input={(event) =>
                            setLlmFeedbackInput(
                              questionId,
                              (event.target as HTMLTextAreaElement).value,
                            )}
                        ></textarea>
                        <div class="flex flex-wrap items-center gap-2">
                          <Button size="sm" on:click={() => applyLlmFeedback(result)}>
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
                          <p class="text-[0.7rem] text-destructive">{feedbackError}</p>
                        {:else if feedback}
                          <div class="space-y-2 rounded-md border border-muted bg-background/70 p-2 text-[0.7rem]">
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
                </td>
                <td class="py-2 text-xs">
                  <div>{@html renderWithKatex(result.userAnswer || "—")}</div>
                </td>
                <td class="py-2 text-xs">
                  <div>{@html renderWithKatex(result.correctAnswer || "—")}</div>
                </td>
                <td class="py-2 text-center font-semibold">
                  {result.requiresManualGrading
                    ? `— / ${result.max}`
                    : `${result.earned} / ${result.max}`}
                </td>
                <td class={`py-2 text-center text-xs font-semibold ${statusClass}`}>
                  {statusLabel}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </Dialog>
{/if}
