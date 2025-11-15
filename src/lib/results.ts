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
  earned: null;
  isCorrect: null;
  status: "pending";
  rubrics: SubjectiveQuestion["rubrics"];
}

export type QuestionResult =
  | DeterministicQuestionResult
  | SubjectiveQuestionResult;

export interface SubmissionSummary {
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
  let userAnswer = "";
  let correctAnswer = "";

  if (question.type === "subjective") {
    const subjective = question as SubjectiveQuestion;
    userAnswer = typeof value === "string" ? value : "";
    return {
      question: subjective,
      requiresManualGrading: true,
      earned: null,
      isCorrect: null,
      status: "pending",
      max,
      userAnswer,
      correctAnswer: "",
      feedback:
        subjective.feedback?.incorrect ?? subjective.feedback?.correct,
      rubrics: subjective.rubrics,
    };
  }

  let isCorrect = false;
  let earned = 0;

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
        .map((entry) =>
          typeof entry === "string"
            ? entry
            : `/${entry.pattern}/${entry.flags ?? ""}`,
        )
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
      const sequence = Array.isArray(value)
        ? (value as string[])
        : ordering.items;
      userAnswer = sequence.join(" → ");
      correctAnswer = ordering.correctOrder.join(" → ");
      isCorrect = arraysEqual(sequence, ordering.correctOrder);
      break;
    }
    default: {
      isCorrect = false;
    }
  }

  if (isCorrect) {
    earned = max;
  }

  const feedback = isCorrect
    ? question.feedback?.correct
    : question.feedback?.incorrect;

  return {
    question,
    requiresManualGrading: false,
    earned,
    max,
    isCorrect,
    status: isCorrect ? "correct" : "incorrect",
    userAnswer,
    correctAnswer,
    feedback,
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
    (result): result is DeterministicQuestionResult => !result.requiresManualGrading,
  );

  const subjectiveResults = results.filter(
    (result): result is SubjectiveQuestionResult => result.requiresManualGrading,
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
    ? Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000))
    : elapsedSec;

  return {
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
    earned: result.requiresManualGrading ? null : result.earned,
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
