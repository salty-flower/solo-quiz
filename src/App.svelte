<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import Button from "./lib/components/ui/Button.svelte";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./lib/components/ui/card";
  import Separator from "./lib/components/ui/Separator.svelte";
  import Progress from "./lib/components/ui/Progress.svelte";
  import Switch from "./lib/components/ui/Switch.svelte";
  import Dialog from "./lib/components/ui/Dialog.svelte";
  import Alert from "./lib/components/ui/Alert.svelte";
  import { renderWithKatex } from "./lib/katex";
  import {
    parseAssessment,
    questionWeight,
    type Assessment,
    type Question,
    type FitbQuestion,
    type MultiQuestion,
    type NumericQuestion,
    type OrderingQuestion,
    type SingleQuestion,
  } from "./lib/schema";
  import {
    clearRecentFiles,
    getRecentFiles,
    touchRecentFile,
    type RecentFileEntry,
  } from "./lib/storage";
  import { buildCsv, downloadCsv, type CsvQuestionResult, type CsvSummary } from "./lib/csv";

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  interface QuestionResult {
    question: Question;
    earned: number;
    max: number;
    isCorrect: boolean;
    userAnswer: string;
    correctAnswer: string;
    feedback?: string;
  }

  interface SubmissionSummary {
    results: QuestionResult[];
    totalScore: number;
    maxScore: number;
    percentage: number;
    startedAt: Date;
    completedAt: Date;
    elapsedSec: number;
    autoSubmitted: boolean;
  }

  type AnswerValue = string | string[] | null;

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

  const SYSTEM_PREFERS_DARK = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

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

  onMount(async () => {
    loadTheme();
    applyTheme();
    recentFiles = await getRecentFiles();
  });

$: if (theme) applyTheme();

  onDestroy(() => {
    if (timerId) {
      window.clearInterval(timerId);
    }
  });

  $: answeredCount = [...touchedQuestions].length;
  $: totalQuestions = questions.length;
  $: currentQuestion = questions[currentIndex];
  $: currentResult = submission ? submission.results[currentIndex] ?? null : null;
  $: progressValue = totalQuestions === 0 ? 0 : Math.round((answeredCount / totalQuestions) * 100);
  $: hasAnyAnswer = answeredCount > 0;
  $: submitDisabled =
    !assessment || submitted || (!hasAnyAnswer || (requireAllAnswered && answeredCount < totalQuestions));
  $: timeDisplay = timeRemaining !== null ? formatTime(timeRemaining) : formatTime(elapsedSec);

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
    questions = data.meta.shuffleQuestions ? shuffle(baseQuestions) : [...baseQuestions];
    answers = {};
    touchedQuestions = new Set();
    orderingTouched = new Set();
    for (const question of questions) {
      if (question.type === "multi" || question.type === "ordering") {
        answers[question.id] = [...(question.type === "ordering" ? question.items : [])];
      } else {
        answers[question.id] = "";
      }
    }
    touchedQuestions = new Set();
    currentIndex = 0;
    parseErrors = [];
    submitted = false;
    submission = null;
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

  function isAnswered(question: Question, value: AnswerValue = answers[question.id]): boolean {
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

  async function navigateTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    currentIndex = index;
    await tick();
    questionContainer?.focus();
  }

  function normalizeFitbAnswer(question: FitbQuestion, value: string): string {
    const mode = question.normalize ?? "trim";
    if (mode === "trim") {
      return value.trim();
    }
    if (mode === "lower") {
      return value.trim().toLowerCase();
    }
    return value;
  }

  function checkQuestion(question: Question, value: AnswerValue): QuestionResult {
    let isCorrect = false;
    let earned = 0;
    const max = questionWeight(question);
    let userAnswer = "";
    let correctAnswer = "";

    switch (question.type) {
      case "single": {
        const single = question as SingleQuestion;
        const selected = typeof value === "string" ? value : "";
        userAnswer = renderOptionLabels(single, selected ? [selected] : []);
        correctAnswer = renderOptionLabels(single, [single.correct]);
        isCorrect = selected === single.correct;
        break;
      }
      case "multi": {
        const multi = question as MultiQuestion;
        const selected = Array.isArray(value) ? (value as string[]) : [];
        userAnswer = renderOptionLabels(multi, selected);
        correctAnswer = renderOptionLabels(multi, multi.correct);
        const normalizedSelected = [...selected].sort();
        const normalizedCorrect = [...multi.correct].sort();
        isCorrect = arraysEqual(normalizedSelected, normalizedCorrect);
        break;
      }
      case "fitb": {
        const fitb = question as FitbQuestion;
        const text = typeof value === "string" ? value : "";
        userAnswer = text;
        const normalized = normalizeFitbAnswer(fitb, text);
        isCorrect = fitb.accept.some((entry) => {
          if (typeof entry === "string") {
            return normalizeFitbAnswer(fitb, entry) === normalized;
          }
          try {
            const regex = new RegExp(entry.pattern, entry.flags);
            return regex.test(text);
          } catch (error) {
            console.warn("Invalid FITB regex", error);
            return false;
          }
        });
        correctAnswer = fitb.accept
          .map((entry) => (typeof entry === "string" ? entry : `/${entry.pattern}/${entry.flags ?? ""}`))
          .join(", ");
        break;
      }
      case "numeric": {
        const numeric = question as NumericQuestion;
        const text = typeof value === "string" ? value.trim() : "";
        userAnswer = text;
        const parsed = Number.parseFloat(text);
        if (!Number.isNaN(parsed)) {
          const tolerance = numeric.tolerance ?? 0;
          isCorrect = Math.abs(parsed - numeric.correct) <= tolerance;
        } else {
          isCorrect = false;
        }
        correctAnswer = numeric.tolerance
          ? `${numeric.correct} ± ${numeric.tolerance}`
          : numeric.correct.toString();
        break;
      }
      case "ordering": {
        const ordering = question as OrderingQuestion;
        const sequence = Array.isArray(value) ? (value as string[]) : ordering.items;
        userAnswer = sequence.join(" → ");
        correctAnswer = ordering.correctOrder.join(" → ");
        isCorrect = arraysEqual(sequence, ordering.correctOrder);
        break;
      }
      default:
        isCorrect = false;
    }

    if (isCorrect) {
      earned = max;
    }

    const feedback = isCorrect ? question.feedback?.correct : question.feedback?.incorrect;
    return { question, earned, max, isCorrect, userAnswer, correctAnswer, feedback };
  }

  function renderOptionLabels(question: SingleQuestion | MultiQuestion, ids: string[]): string {
    const map = new Map(question.options.map((option) => [option.id, option.label] as const));
    return ids.map((id) => map.get(id) ?? id).join(", ");
  }

  function submitQuiz(auto = false) {
    if (!assessment || submitted) return;
    submitted = true;
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    const completedAt = new Date();
    const results = questions.map((question) => checkQuestion(question, answers[question.id]));
    const totalScore = results.reduce((sum, result) => sum + result.earned, 0);
    const maxScore = results.reduce((sum, result) => sum + result.max, 0);
    const percentage = maxScore === 0 ? 0 : (totalScore / maxScore) * 100;
    const elapsed = startedAt ? Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000)) : elapsedSec;
    submission = {
      results,
      totalScore,
      maxScore,
      percentage,
      startedAt: startedAt ?? new Date(),
      completedAt,
      elapsedSec: elapsed,
      autoSubmitted: auto,
    };
    showResultDialog = true;
  }

  function resetAssessment() {
    if (!assessment) return;
    resetState(assessment);
  }

  function exportCsv() {
    if (!assessment || !submission) return;
    const rows: CsvQuestionResult[] = submission.results.map((result, index) => ({
      questionNumber: index + 1,
      questionId: result.question.id,
      questionText: result.question.text,
      type: result.question.type,
      weight: questionWeight(result.question),
      tags: result.question.tags ?? [],
      userAnswer: result.userAnswer,
      correctAnswer: result.correctAnswer,
      isCorrect: result.isCorrect,
    }));
    const summary: CsvSummary = {
      assessmentTitle: assessment.meta.title,
      totalScore: submission.totalScore,
      maxScore: submission.maxScore,
      percentage: submission.percentage,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
      timeElapsedSec: submission.elapsedSec,
    };
    const csv = buildCsv(summary, rows);
    downloadCsv(`${sanitizeFilename(assessment.meta.title)}-results.csv`, csv);
  }

  function sanitizeFilename(value: string): string {
    return value.replace(/[^a-z0-9-_]+/gi, "-");
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

  function toggleTheme(event: CustomEvent<boolean>) {
    theme = event.detail ? "dark" : "light";
  }

  function moveOrdering(question: OrderingQuestion, index: number, direction: -1 | 1) {
    const current = Array.isArray(answers[question.id])
      ? ([...(answers[question.id] as string[])] as string[])
      : [...question.items];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
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
      <div class="flex items-center gap-4">
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
        <div class="flex items-center gap-2 text-sm">
          <span>Dark mode</span>
          <Switch checked={theme === "dark"} on:change={toggleTheme} label="Toggle theme" />
        </div>
      </div>
    </div>
  </header>

  <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
    <aside class="w-full space-y-4 lg:w-64">
      <Card>
        <CardHeader>
          <CardTitle>Assessment</CardTitle>
          <CardDescription>Import JSON or drag & drop to get started.</CardDescription>
        </CardHeader>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent files</CardTitle>
          <CardDescription>IndexedDB is used when available.</CardDescription>
        </CardHeader>
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
      </Card>

      {#if assessment}
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>Jump to any question.</CardDescription>
          </CardHeader>
          <CardContent>
            <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
              {#each questions as question, index}
                <button
                  type="button"
                  class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    index === currentIndex
                      ? "border-primary bg-primary/10 text-primary"
                      : touchedQuestions.has(question.id)
                        ? "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-300"
                        : "border-border"
                  }`}
                  on:click={() => navigateTo(index)}
                >
                  {index + 1}
                </button>
              {/each}
            </nav>
          </CardContent>
        </Card>
      {/if}
    </aside>

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
            <CardDescription>Use the panel on the left to load a JSON assessment.</CardDescription>
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
                  Score: {submission.totalScore} / {submission.maxScore} ({submission.percentage.toFixed(1)}%)
                </p>
                <p class="text-xs text-muted-foreground">
                  Time used: {formatTime(submission.elapsedSec)}
                  {#if submission.autoSubmitted}
                    — auto submitted when the timer expired.
                  {/if}
                </p>
              </div>
              <div class="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" on:click={exportCsv}>Export results CSV</Button>
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
                            {currentResult.isCorrect && currentResult.question.id === singleQuestion.id && option.id === singleQuestion.correct
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
        <span class="font-semibold">Score:</span>
        {" "}
        {submission.totalScore} / {submission.maxScore}
        {" "}({submission.percentage.toFixed(2)}%)
      </p>
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
              <th class="w-24 py-2">Your answer</th>
              <th class="w-24 py-2">Correct answer</th>
              <th class="w-16 py-2 text-center">Score</th>
            </tr>
          </thead>
          <tbody>
            {#each submission.results as result, index}
              <tr class="border-b align-top">
                <td class="py-2">{index + 1}</td>
                <td class="py-2">
                  <div class="font-medium">
                    {@html renderWithKatex(result.question.text)}
                  </div>
                  {#if result.feedback}
                    <p class={`mt-1 text-xs ${result.isCorrect ? "text-green-600" : "text-destructive"}`}>
                      {result.feedback}
                    </p>
                  {/if}
                </td>
                <td class="py-2 text-xs">
                  <div>{@html renderWithKatex(result.userAnswer || "—")}</div>
                </td>
                <td class="py-2 text-xs">
                  <div>{@html renderWithKatex(result.correctAnswer || "—")}</div>
                </td>
                <td class="py-2 text-center font-semibold">
                  {result.isCorrect ? result.max : 0}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </Dialog>
{/if}
