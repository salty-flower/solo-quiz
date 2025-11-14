import {
  isSubjectiveQuestion,
  questionWeight,
  type Assessment,
  type LlmFeedback,
  type Question,
  type SubjectiveQuestion,
} from "./schema";

export type GradingMode = "auto" | "subjective";

export type ResultStatus = "correct" | "incorrect" | "pending" | "partial";

export interface SubjectiveEvaluation {
  status: "pending" | "scored" | "error";
  rubric: string;
  maxScore: number;
  awardedScore?: number;
  reasoning?: string;
  referenceAnswer?: string;
  evaluatorModel?: string;
  feedback?: string;
  improvements?: string[];
  rubricBreakdown?: LlmFeedback["rubricBreakdown"];
  verdict?: LlmFeedback["verdict"];
  llmFeedback?: LlmFeedback;
}

export interface BaseQuestionResult {
  questionNumber: number;
  question: Question;
  max: number;
  userAnswer: string;
  correctAnswer: string;
  feedback?: string;
  gradingMode: GradingMode;
  status: ResultStatus;
}

export interface DeterministicQuestionResult extends BaseQuestionResult {
  requiresManualGrading: false;
  earned: number;
  isCorrect: boolean;
}

export interface SubjectiveQuestionResult extends BaseQuestionResult {
  question: SubjectiveQuestion;
  requiresManualGrading: true;
  earned: number | null;
  isCorrect: boolean | null;
  evaluation: SubjectiveEvaluation;
}

export type QuestionResult =
  | DeterministicQuestionResult
  | SubjectiveQuestionResult;

export type QuestionResultDraft =
  | Omit<DeterministicQuestionResult, "questionNumber">
  | Omit<SubjectiveQuestionResult, "questionNumber">;

export interface SubmissionSummary {
  results: QuestionResult[];
  deterministicEarned: number;
  deterministicMax: number;
  deterministicPercentage: number;
  subjectiveMax: number;
  pendingSubjectiveMax: number;
  pendingSubjectiveCount: number;
  startedAt: Date;
  completedAt: Date;
  elapsedSec: number;
  autoSubmitted: boolean;
}

export interface CsvSummary {
  assessmentTitle: string;
  deterministicScore: number;
  deterministicMax: number;
  deterministicPercentage: number;
  pendingSubjectiveMax: number;
  pendingSubjectiveCount: number;
  startedAt: Date;
  completedAt: Date;
  timeElapsedSec: number;
}

export interface CsvQuestionResult {
  questionNumber: number;
  questionId: string;
  questionText: string;
  type: string;
  weight: number;
  tags: string[];
  userAnswer: string;
  correctAnswer: string;
  gradingMode: GradingMode;
  earned: number | null;
  max: number;
  status: ResultStatus;
  evaluationStatus?: string;
  evaluationNotes?: string;
}

export interface JsonSummaryQuestion {
  questionNumber: number;
  questionId: string;
  questionText: string;
  type: Question["type"];
  gradingMode: GradingMode;
  weight: number;
  tags: string[];
  userAnswer: string;
  correctAnswer: string;
  earned: number | null;
  max: number;
  status: ResultStatus;
  isCorrect?: boolean | null;
  feedback?: string;
  evaluation?: SubjectiveEvaluation;
  llmGrading?: SubjectiveQuestion["llmGrading"];
}

export interface JsonSummary {
  assessment: {
    title: string;
    description?: string;
    shuffleQuestions: boolean;
    timeLimitSec: number | null;
    totalQuestions: number;
  };
  startedAt: string;
  completedAt: string;
  elapsedSec: number;
  deterministicEarned: number;
  deterministicMax: number;
  deterministicPercentage: number;
  subjectiveMax: number;
  pendingSubjectiveMax: number;
  pendingSubjectiveCount: number;
  autoSubmitted: boolean;
  results: JsonSummaryQuestion[];
}

export function computeSubmissionSummary(options: {
  results: QuestionResult[];
  startedAt?: Date | null;
  completedAt: Date;
  elapsedFallbackSec: number;
  autoSubmitted: boolean;
}): SubmissionSummary {
  const { results, startedAt, completedAt, elapsedFallbackSec, autoSubmitted } =
    options;

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
  const subjectiveMax = subjectiveResults.reduce(
    (sum, result) => sum + result.max,
    0,
  );
  const pendingSubjectiveMax = subjectiveResults.reduce(
    (sum, result) => sum + (result.status === "pending" ? result.max : 0),
    0,
  );
  const deterministicPercentage =
    deterministicMax === 0
      ? 0
      : (deterministicEarned / deterministicMax) * 100;
  const pendingSubjectiveCount = subjectiveResults.filter(
    (result) => result.status === "pending",
  ).length;

  const elapsedSec =
    startedAt != null
      ? Math.max(
          0,
          Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
        )
      : elapsedFallbackSec;

  return {
    results,
    deterministicEarned,
    deterministicMax,
    deterministicPercentage,
    subjectiveMax,
    pendingSubjectiveMax,
    pendingSubjectiveCount,
    startedAt: startedAt ?? completedAt,
    completedAt,
    elapsedSec,
    autoSubmitted,
  };
}

export function buildCsvSummary(
  assessmentTitle: string,
  submission: SubmissionSummary,
): CsvSummary {
  return {
    assessmentTitle,
    deterministicScore: submission.deterministicEarned,
    deterministicMax: submission.deterministicMax,
    deterministicPercentage: submission.deterministicPercentage,
    pendingSubjectiveMax: submission.pendingSubjectiveMax,
    pendingSubjectiveCount: submission.pendingSubjectiveCount,
    startedAt: submission.startedAt,
    completedAt: submission.completedAt,
    timeElapsedSec: submission.elapsedSec,
  };
}

export function createCsvRows(results: QuestionResult[]): CsvQuestionResult[] {
  return results.map((result) => ({
    questionNumber: result.questionNumber,
    questionId: result.question.id,
    questionText: result.question.text,
    type: result.question.type,
    weight: questionWeight(result.question),
    tags: result.question.tags ?? [],
    userAnswer: result.userAnswer,
    correctAnswer: result.correctAnswer,
    gradingMode: result.gradingMode,
    earned: result.earned,
    max: result.max,
    status: result.status,
    evaluationStatus:
      result.requiresManualGrading ? result.evaluation.status : undefined,
    evaluationNotes:
      result.requiresManualGrading
        ? result.evaluation.reasoning ?? result.evaluation.feedback
        : undefined,
  }));
}

export function createJsonSummary(
  assessment: Assessment,
  submission: SubmissionSummary,
): JsonSummary {
  return {
    assessment: {
      title: assessment.meta.title,
      description: assessment.meta.description,
      shuffleQuestions: Boolean(assessment.meta.shuffleQuestions),
      timeLimitSec: assessment.meta.timeLimitSec ?? null,
      totalQuestions: assessment.questions.length,
    },
    startedAt: submission.startedAt.toISOString(),
    completedAt: submission.completedAt.toISOString(),
    elapsedSec: submission.elapsedSec,
    deterministicEarned: submission.deterministicEarned,
    deterministicMax: submission.deterministicMax,
    deterministicPercentage: submission.deterministicPercentage,
    subjectiveMax: submission.subjectiveMax,
    pendingSubjectiveMax: submission.pendingSubjectiveMax,
    pendingSubjectiveCount: submission.pendingSubjectiveCount,
    autoSubmitted: submission.autoSubmitted,
    results: submission.results.map((result) => {
      const base: JsonSummaryQuestion = {
        questionNumber: result.questionNumber,
        questionId: result.question.id,
        questionText: result.question.text,
        type: result.question.type,
        gradingMode: result.gradingMode,
        weight: questionWeight(result.question),
        tags: result.question.tags ?? [],
        userAnswer: result.userAnswer,
        correctAnswer: result.correctAnswer,
        earned: result.earned,
        max: result.max,
        status: result.status,
        isCorrect: result.isCorrect,
        feedback: result.feedback,
      };

      if (result.requiresManualGrading && isSubjectiveQuestion(result.question)) {
        return {
          ...base,
          evaluation: result.evaluation,
          llmGrading: result.question.llmGrading,
        } satisfies JsonSummaryQuestion;
      }

      return base;
    }),
  };
}

export function applyLlmFeedbackToResult(
  result: SubjectiveQuestionResult,
  feedback: LlmFeedback,
): SubjectiveQuestionResult {
  const clampedScore = Math.max(0, Math.min(feedback.score, result.max));
  const status: ResultStatus =
    feedback.verdict === "correct"
      ? "correct"
      : feedback.verdict === "incorrect"
        ? "incorrect"
        : "partial";
  const isCorrect =
    status === "correct" ? true : status === "incorrect" ? false : null;

  return {
    ...result,
    earned: clampedScore,
    isCorrect,
    status,
    evaluation: {
      ...result.evaluation,
      status: "scored",
      awardedScore: clampedScore,
      reasoning: feedback.feedback,
      feedback: feedback.feedback,
      improvements: feedback.improvements,
      rubricBreakdown: feedback.rubricBreakdown,
      verdict: feedback.verdict,
      llmFeedback: feedback,
    },
  };
}

export function resetSubjectiveResult(
  result: SubjectiveQuestionResult,
): SubjectiveQuestionResult {
  return {
    ...result,
    earned: null,
    isCorrect: null,
    status: "pending",
    evaluation: {
      ...result.evaluation,
      status: "pending",
      awardedScore: undefined,
      reasoning: undefined,
      feedback: undefined,
      improvements: undefined,
      rubricBreakdown: undefined,
      verdict: undefined,
      llmFeedback: undefined,
    },
  };
}
