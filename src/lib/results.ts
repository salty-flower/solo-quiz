import {
  questionWeight,
  type Assessment,
  type FitbQuestion,
  type MultiQuestion,
  type NumericQuestion,
  type OrderingQuestion,
  type Question,
  type SingleQuestion,
  type SubjectiveQuestion,
} from "./schema";

export type ResultStatus = "correct" | "incorrect" | "pending";

export type AnswerValue = string | string[] | null;

export interface BaseQuestionResult {
  question: Question;
  max: number;
  userAnswer: string;
  correctAnswer: string;
  feedback?: string;
  status: ResultStatus;
  selectedOptions?: string[];
}

export interface DeterministicQuestionResult extends BaseQuestionResult {
  requiresManualGrading: false;
  earned: number;
  isCorrect: boolean;
  status: Exclude<ResultStatus, "pending">;
}

export interface SubjectiveQuestionResult extends BaseQuestionResult {
  question: SubjectiveQuestion;
  requiresManualGrading: true;
  earned: number | null;
  isCorrect: boolean | null;
  status: ResultStatus;
  rubrics: SubjectiveQuestion["rubrics"];
}

export type QuestionResult =
  | DeterministicQuestionResult
  | SubjectiveQuestionResult;

export interface SubmissionSummary {
  id: string;
  assessment: Assessment;
  results: QuestionResult[];
  deterministicEarned: number;
  deterministicMax: number;
  deterministicPercentage: number;
  subjectiveMax: number;
  pendingSubjectiveCount: number;
  startedAt: Date;
  completedAt: Date;
  elapsedSec: number;
  autoSubmitted: boolean;
}

export interface SerializableQuestionResult {
  position: number;
  questionId: string;
  questionText: string;
  type: Question["type"];
  weight: number;
  tags: string[];
  status: ResultStatus;
  earned: number | null;
  max: number;
  userAnswer: string;
  correctAnswer: string;
  feedback: string | null;
  requiresManualGrading: boolean;
  rubrics?: SubjectiveQuestion["rubrics"];
}

export function evaluateQuestion(
  question: Question,
  value: AnswerValue,
): QuestionResult {
  const max = questionWeight(question);

  if (question.type === "subjective") {
    const subjective = question as SubjectiveQuestion;
    return {
      question: subjective,
      requiresManualGrading: true,
      earned: null,
      isCorrect: null,
      status: "pending",
      max,
      userAnswer: typeof value === "string" ? value : "",
      correctAnswer: "",
      feedback: subjective.feedback?.incorrect ?? subjective.feedback?.correct,
      rubrics: subjective.rubrics,
    };
  }

  const evaluation = evaluateDeterministicQuestion(question, value);
  const feedback = evaluation.isCorrect
    ? question.feedback?.correct
    : question.feedback?.incorrect;

  return {
    question,
    requiresManualGrading: false,
    earned: evaluation.isCorrect ? max : 0,
    max,
    isCorrect: evaluation.isCorrect,
    status: evaluation.isCorrect ? "correct" : "incorrect",
    userAnswer: evaluation.userAnswer,
    correctAnswer: evaluation.correctAnswer,
    feedback,
    selectedOptions: evaluation.selectedOptions,
  };
}

type DeterministicQuestion =
  | SingleQuestion
  | MultiQuestion
  | FitbQuestion
  | NumericQuestion
  | OrderingQuestion;

interface DeterministicEvaluation {
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  selectedOptions?: string[];
}

function evaluateDeterministicQuestion(
  question: DeterministicQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  switch (question.type) {
    case "single":
      return evaluateSingleChoice(question, value);
    case "multi":
      return evaluateMultiChoice(question, value);
    case "fitb":
      return evaluateFitbQuestion(question, value);
    case "numeric":
      return evaluateNumericQuestion(question, value);
    case "ordering":
      return evaluateOrderingQuestion(question, value);
    default: {
      return assertUnreachable(question);
    }
  }
}

function assertUnreachable(value: never): never {
  const fallback =
    typeof value === "object" && value && "type" in value
      ? ((value as { type?: string }).type ?? "unknown")
      : "unknown";
  throw new Error(`Unhandled deterministic question type: ${fallback}`);
}

function evaluateSingleChoice(
  question: SingleQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  const selected = typeof value === "string" ? value : "";
  const selectedOptions = selected ? [selected] : [];
  return {
    userAnswer: renderOptionLabels(question, selectedOptions),
    correctAnswer: renderOptionLabels(question, [question.correct]),
    isCorrect: selected === question.correct,
    selectedOptions,
  };
}

function evaluateMultiChoice(
  question: MultiQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const normalizedSelected = [...selected].sort();
  const normalizedCorrect = [...question.correct].sort();
  return {
    userAnswer: renderOptionLabels(question, selected),
    correctAnswer: renderOptionLabels(question, question.correct),
    isCorrect: arraysEqual(normalizedSelected, normalizedCorrect),
    selectedOptions: [...selected],
  };
}

function evaluateFitbQuestion(
  question: FitbQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  const text = typeof value === "string" ? value : "";
  const normalized = normalizeFitbAnswer(question, text);
  const isCorrect = question.accept.some((entry) => {
    if (typeof entry === "string") {
      return normalizeFitbAnswer(question, entry) === normalized;
    }
    try {
      const regex = new RegExp(entry.pattern, entry.flags);
      return regex.test(normalized);
    } catch (error) {
      console.warn("Invalid FITB regex", error);
      return false;
    }
  });

  const correctAnswer = question.accept
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : `/${entry.pattern}/${entry.flags ?? ""}`,
    )
    .join(", ");

  return { userAnswer: normalized, correctAnswer, isCorrect };
}

function evaluateNumericQuestion(
  question: NumericQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  const text = typeof value === "string" ? value.trim() : "";
  const parsed = Number.parseFloat(text);
  const tolerance = question.tolerance ?? 0;
  const withinTolerance = !Number.isNaN(parsed)
    ? Math.abs(parsed - question.correct) <= tolerance
    : false;

  return {
    userAnswer: text,
    correctAnswer: tolerance
      ? `${question.correct} ± ${tolerance}`
      : question.correct.toString(),
    isCorrect: withinTolerance,
  };
}

function evaluateOrderingQuestion(
  question: OrderingQuestion,
  value: AnswerValue,
): DeterministicEvaluation {
  const sequence =
    Array.isArray(value) && value.length > 0
      ? (value as string[])
      : question.items;
  const providedSequence = Array.isArray(value) ? (value as string[]) : [];

  return {
    userAnswer: sequence.join(" → "),
    correctAnswer: question.correctOrder.join(" → "),
    isCorrect:
      Array.isArray(value) &&
      value.length > 0 &&
      arraysEqual(providedSequence, question.correctOrder),
  };
}

export function evaluateSubmission({
  assessment,
  questions,
  answers,
  startedAt,
  completedAt,
  elapsedSec,
  autoSubmitted,
}: {
  assessment: Assessment;
  questions: Question[];
  answers: Record<string, AnswerValue>;
  startedAt: Date | null;
  completedAt: Date;
  elapsedSec: number;
  autoSubmitted: boolean;
}): SubmissionSummary {
  const results = questions.map((question) =>
    evaluateQuestion(question, answers[question.id]),
  );

  const deterministicResults = results.filter(
    (result): result is DeterministicQuestionResult =>
      !result.requiresManualGrading,
  );

  const subjectiveResults = results.filter(
    (result): result is SubjectiveQuestionResult =>
      result.requiresManualGrading,
  );

  const deterministicEarned = deterministicResults.reduce(
    (sum, result) => sum + result.earned,
    0,
  );

  const deterministicMax = deterministicResults.reduce(
    (sum, result) => sum + result.max,
    0,
  );

  const deterministicPercentage =
    deterministicMax === 0 ? 0 : (deterministicEarned / deterministicMax) * 100;

  const subjectiveMax = subjectiveResults.reduce(
    (sum, result) => sum + result.max,
    0,
  );

  const derivedElapsed = startedAt
    ? Math.max(
        0,
        Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
      )
    : elapsedSec;

  return {
    id: createAttemptId(),
    assessment,
    results,
    deterministicEarned,
    deterministicMax,
    deterministicPercentage,
    subjectiveMax,
    pendingSubjectiveCount: subjectiveResults.length,
    startedAt: startedAt ?? completedAt,
    completedAt,
    elapsedSec: derivedElapsed,
    autoSubmitted,
  };
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `attempt-${Date.now()}-${random}`;
}

export function createSerializableQuestionResult(
  result: QuestionResult,
  index: number,
): SerializableQuestionResult {
  return {
    position: index + 1,
    questionId: result.question.id,
    questionText: result.question.text,
    type: result.question.type,
    weight: questionWeight(result.question),
    tags: result.question.tags ?? [],
    status: result.status,
    earned: result.earned,
    max: result.max,
    userAnswer: result.userAnswer,
    correctAnswer: result.correctAnswer,
    feedback: result.feedback ?? null,
    requiresManualGrading: result.requiresManualGrading,
    rubrics: result.requiresManualGrading ? result.rubrics : undefined,
  };
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

function renderOptionLabels(
  question: SingleQuestion | MultiQuestion,
  ids: string[],
): string {
  const map = new Map(
    question.options.map((option) => [option.id, option.label] as const),
  );
  return ids.map((id) => map.get(id) ?? id).join(", ");
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, index) => val === b[index]);
}
