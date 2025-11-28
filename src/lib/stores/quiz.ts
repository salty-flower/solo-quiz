import { get, derived, writable } from "svelte/store";
import { parseAssessment, type Assessment, type Question } from "../schema";
import {
  clearRecentFiles,
  getRecentFiles,
  removeRecentFiles,
  touchRecentFile,
  type RecentFileEntry,
} from "../storage";
import {
  evaluateSubmission,
  type AnswerValue,
  type SubmissionSummary,
} from "../results";
import { TIMER_INTERVAL_MS } from "../constants";
import { registerAttempt } from "./attempts";
import { getReviewPath, navigate } from "./router";
import { createAssessmentFingerprint } from "../utils/assessment-fingerprint";

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isAnswered(
  question: Question,
  value: AnswerValue | undefined,
): boolean {
  if (value == null) return false;
  if (question.type === "ordering") {
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

function createQuizStore() {
  const assessment = writable<Assessment | null>(null);
  const questions = writable<Question[]>([]);
  const answers = writable<Record<string, AnswerValue>>({});
  const notes = writable<Record<string, string>>({});
  const touchedQuestions = writable<Set<string>>(new Set());
  const orderingTouched = writable<Set<string>>(new Set());
  const orderingInitial = writable<Record<string, string[]>>({});
  const currentIndex = writable(0);
  const parseErrors = writable<{ path: string; message: string }[]>([]);
  const startedAt = writable<Date | null>(null);
  const elapsedSec = writable(0);
  const timeLimitSec = writable<number | null>(null);
  const timeRemaining = writable<number | null>(null);
  const submitted = writable(false);
  const submission = writable<SubmissionSummary | null>(null);
  const requireAllAnswered = writable(false);
  const noBackMode = writable(false);
  const recentFiles = writable<RecentFileEntry[]>([]);

  const answeredCount = derived(
    touchedQuestions,
    ($touchedQuestions) => $touchedQuestions.size,
  );
  const totalQuestions = derived(questions, ($questions) => $questions.length);
  const currentQuestion = derived(
    [questions, currentIndex],
    ([$questions, $currentIndex]) => $questions[$currentIndex],
  );
  const currentResult = derived(
    [submission, currentIndex],
    ([$submission, $currentIndex]) =>
      $submission ? ($submission.results[$currentIndex] ?? null) : null,
  );
  const hasAnyAnswer = derived(
    answeredCount,
    ($answeredCount) => $answeredCount > 0,
  );
  const submitDisabled = derived(
    [
      assessment,
      submitted,
      hasAnyAnswer,
      requireAllAnswered,
      totalQuestions,
      answeredCount,
    ],
    ([
      $assessment,
      $submitted,
      $hasAnyAnswer,
      $requireAllAnswered,
      $totalQuestions,
      $answeredCount,
    ]) =>
      !$assessment ||
      $submitted ||
      !$hasAnyAnswer ||
      ($requireAllAnswered && $answeredCount < $totalQuestions),
  );

  const progressValue = derived(
    [answeredCount, totalQuestions],
    ([$answeredCount, $totalQuestions]) =>
      $totalQuestions === 0
        ? 0
        : Math.round(($answeredCount / $totalQuestions) * 100),
  );

  let timerId: number | null = null;

  function stopTimer() {
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  async function refreshRecentFiles() {
    recentFiles.set(await getRecentFiles());
  }

  function initializeAnswers(list: Question[]) {
    const result: Record<string, AnswerValue> = {};
    const initialNotes: Record<string, string> = {};
    const initialOrdering: Record<string, string[]> = {};
    for (const question of list) {
      initialNotes[question.id] = "";
      if (question.type === "multi") {
        result[question.id] = [];
      } else if (question.type === "ordering") {
        const sequence =
          question.shuffleItems === false
            ? [...question.items]
            : shuffle(question.items);
        initialOrdering[question.id] = sequence;
        result[question.id] = sequence;
      } else {
        result[question.id] = "";
      }
    }
    orderingInitial.set(initialOrdering);
    notes.set(initialNotes);
    return result;
  }

  /**
   * Applies an assessment to the quiz state, initializing answers, timers,
   * and ordering while respecting shuffle preferences. The helper also resets
   * prior submission state so users start fresh on new loads or retakes.
   */
  function applyAssessment(
    data: Assessment,
    options?: { questions?: Question[] },
  ) {
    stopTimer();
    assessment.set(data);
    const baseQuestions = options?.questions ?? data.questions;
    const orderedQuestions = data.meta.shuffleQuestions
      ? shuffle(baseQuestions)
      : [...baseQuestions];
    questions.set(orderedQuestions);
    answers.set(initializeAnswers(orderedQuestions));
    touchedQuestions.set(new Set());
    orderingTouched.set(new Set());
    currentIndex.set(0);
    parseErrors.set([]);
    submitted.set(false);
    submission.set(null);
    startedAt.set(new Date());
    elapsedSec.set(0);
    const limit = data.meta.timeLimitSec ?? null;
    timeLimitSec.set(limit);
    timeRemaining.set(limit);
    timerId = window.setInterval(() => {
      const started = get(startedAt);
      const limitValue = get(timeLimitSec);
      if (!started) return;
      const elapsed = Math.floor((Date.now() - started.getTime()) / 1000);
      elapsedSec.set(elapsed);
      if (limitValue !== null) {
        const remaining = Math.max(0, limitValue - elapsed);
        timeRemaining.set(remaining);
        if (remaining === 0 && !get(submitted)) {
          submitQuiz(true);
        }
      }
    }, TIMER_INTERVAL_MS);
  }

  async function loadAssessment(
    data: Assessment,
    source?: { name: string; content?: string },
  ) {
    applyAssessment(data);
    if (source?.name) {
      const meta = {
        title: data.meta.title,
        questionCount: data.questions.length,
        fingerprint: createAssessmentFingerprint(data),
      };
      await touchRecentFile(source.name, source.content, meta);
      await refreshRecentFiles();
    }
  }

  async function importAssessmentContent(content: string, sourceName: string) {
    try {
      const raw = JSON.parse(content);
      const result = parseAssessment(raw);
      if (!result.ok) {
        parseErrors.set(result.issues);
        assessment.set(null);
        questions.set([]);
        return { ok: false };
      }
      await loadAssessment(result.data, { name: sourceName, content });
      return { ok: true };
    } catch (error) {
      parseErrors.set([
        { path: sourceName, message: (error as Error).message },
      ]);
      assessment.set(null);
      questions.set([]);
      return { ok: false };
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    return importAssessmentContent(text, file.name);
  }

  async function handleClipboardContent(content: string) {
    return importAssessmentContent(content, "Clipboard assessment");
  }

  async function loadRecentAssessment(entry: RecentFileEntry) {
    if (!entry.data) {
      parseErrors.set([
        {
          path: entry.name,
          message: "Cached data missing; please re-import the file.",
        },
      ]);
      assessment.set(null);
      questions.set([]);
      return;
    }

    try {
      const raw = JSON.parse(entry.data);
      const result = parseAssessment(raw);
      if (!result.ok) {
        parseErrors.set(result.issues);
        assessment.set(null);
        questions.set([]);
        return;
      }
      await loadAssessment(result.data, {
        name: entry.name,
        content: entry.data,
      });
    } catch (error) {
      parseErrors.set([
        { path: entry.name, message: (error as Error).message },
      ]);
      assessment.set(null);
      questions.set([]);
    }
  }

  function updateTouched(question: Question, value: AnswerValue) {
    answers.update((prev) => ({ ...prev, [question.id]: value }));
    const answered =
      question.type === "ordering"
        ? get(orderingTouched).has(question.id)
        : isAnswered(question, value);
    touchedQuestions.update((prev) => {
      const clone = new Set(prev);
      if (answered) {
        clone.add(question.id);
      } else {
        clone.delete(question.id);
      }
      return clone;
    });
  }

  function updateNote(questionId: string, value: string) {
    notes.update((prev) => ({ ...prev, [questionId]: value }));
  }

  function setOrderingTouched(questionId: string, value: boolean) {
    orderingTouched.update((prev) => {
      const clone = new Set(prev);
      if (value) {
        clone.add(questionId);
      } else {
        clone.delete(questionId);
      }
      return clone;
    });
  }

  function setCurrentIndex(index: number) {
    currentIndex.set(index);
  }

  function setRequireAllAnswered(value: boolean) {
    requireAllAnswered.set(value);
  }

  function setNoBackMode(value: boolean) {
    noBackMode.set(value);
  }

  function submitQuiz(auto = false) {
    const currentAssessment = get(assessment);
    if (!currentAssessment || get(submitted)) return;
    submitted.set(true);
    stopTimer();
    const summary = evaluateSubmission({
      assessment: currentAssessment,
      questions: get(questions),
      answers: get(answers),
      notes: get(notes),
      startedAt: get(startedAt),
      completedAt: new Date(),
      elapsedSec: get(elapsedSec),
      autoSubmitted: auto,
    });
    submission.set(summary);
    registerAttempt(summary);
    navigate(getReviewPath(summary.id));
  }

  function retakeIncorrectQuestions(previous: SubmissionSummary) {
    const needsRetake = previous.results.filter(
      (result) => result.status !== "correct",
    );
    const questionPool =
      needsRetake.length > 0
        ? needsRetake.map((result) => result.question)
        : previous.assessment.questions;
    applyAssessment(previous.assessment, { questions: questionPool });
  }

  function resetAssessment() {
    const current = get(assessment);
    if (!current) return;
    applyAssessment(current);
  }

  async function clearHistory() {
    await clearRecentFiles();
    await refreshRecentFiles();
  }

  async function deleteRecentHistory(names: string[]) {
    await removeRecentFiles(names);
    await refreshRecentFiles();
  }

  function teardown() {
    stopTimer();
  }

  return {
    assessment,
    questions,
    answers,
    notes,
    touchedQuestions,
    orderingTouched,
    orderingInitial,
    currentIndex,
    parseErrors,
    startedAt,
    elapsedSec,
    timeLimitSec,
    timeRemaining,
    submitted,
    submission,
    requireAllAnswered,
    noBackMode,
    recentFiles,
    answeredCount,
    totalQuestions,
    currentQuestion,
    currentResult,
    hasAnyAnswer,
    submitDisabled,
    progressValue,
    refreshRecentFiles,
    loadAssessment,
    handleFile,
    handleClipboardContent,
    loadRecentAssessment,
    updateTouched,
    updateNote,
    setOrderingTouched,
    setCurrentIndex,
    setRequireAllAnswered,
    setNoBackMode,
    submitQuiz,
    retakeIncorrectQuestions,
    resetAssessment,
    clearHistory,
    deleteRecentHistory,
    teardown,
  };
}

export const quiz = createQuizStore();
