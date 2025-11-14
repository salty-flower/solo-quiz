import {
  isSubjectiveQuestion,
  questionWeight,
  type Assessment,
  type Question,
} from "./schema";

export type GradingMode = "auto" | "subjective";

export interface SubjectiveEvaluation {
  status: "pending" | "scored" | "error";
  rubric: string;
  maxScore: number;
  awardedScore?: number;
  reasoning?: string;
  referenceAnswer?: string;
  evaluatorModel?: string;
}

export interface QuestionResult {
  questionNumber: number;
  question: Question;
  earned: number;
  max: number;
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  feedback?: string;
  gradingMode: GradingMode;
  evaluation?: SubjectiveEvaluation;
}

export interface SubmissionSummary {
  results: QuestionResult[];
  autoScore: number;
  autoMaxScore: number;
  autoPercentage: number;
  subjectiveMaxScore: number;
  totalMaxScore: number;
  subjectivePending: number;
  startedAt: Date;
  completedAt: Date;
  elapsedSec: number;
  autoSubmitted: boolean;
}

export interface CsvSummary {
  assessmentTitle: string;
  autoScore: number;
  autoMaxScore: number;
  autoPercentage: number;
  subjectiveMaxScore: number;
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
  isCorrect: boolean | null;
  earned: number;
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
  earned: number;
  isCorrect?: boolean;
  feedback?: string;
  evaluation?: SubjectiveEvaluation;
  rubric?: string;
  referenceAnswer?: string;
  additionalContext?: string;
  evaluatorModel?: string;
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
  autoScore: number;
  autoMaxScore: number;
  autoPercentage: number;
  subjectiveMaxScore: number;
  totalMaxScore: number;
  subjectivePending: number;
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
  const autoResults = results.filter((result) => result.gradingMode === "auto");
  const subjectiveResults = results.filter(
    (result) => result.gradingMode === "subjective",
  );

  const autoScore = autoResults.reduce((sum, result) => sum + result.earned, 0);
  const autoMaxScore = autoResults.reduce((sum, result) => sum + result.max, 0);
  const subjectiveMaxScore = subjectiveResults.reduce(
    (sum, result) => sum + result.max,
    0,
  );
  const totalMaxScore = autoMaxScore + subjectiveMaxScore;
  const autoPercentage =
    autoMaxScore === 0 ? 0 : (autoScore / autoMaxScore) * 100;
  const subjectivePending = subjectiveResults.length;

  const elapsedSec =
    startedAt != null
      ? Math.max(
          0,
          Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
        )
      : elapsedFallbackSec;

  return {
    results,
    autoScore,
    autoMaxScore,
    autoPercentage,
    subjectiveMaxScore,
    totalMaxScore,
    subjectivePending,
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
    autoScore: submission.autoScore,
    autoMaxScore: submission.autoMaxScore,
    autoPercentage: submission.autoPercentage,
    subjectiveMaxScore: submission.subjectiveMaxScore,
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
    isCorrect: result.gradingMode === "auto" ? result.isCorrect : null,
    earned: result.earned,
    evaluationStatus: result.evaluation?.status,
    evaluationNotes: result.evaluation?.reasoning,
  }));
}

export function createJsonSummary(
  assessment: Assessment,
  submission: SubmissionSummary,
): JsonSummary {
  const questions = submission.results.map<JsonSummaryQuestion>((result) => {
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
      isCorrect:
        result.gradingMode === "auto" ? result.isCorrect : undefined,
      feedback: result.feedback,
      evaluation: result.evaluation,
    };

    if (isSubjectiveQuestion(result.question)) {
      const subjective = result.question;
      return {
        ...base,
        rubric: subjective.llmGrading.rubric,
        referenceAnswer: subjective.llmGrading.referenceAnswer,
        additionalContext: subjective.llmGrading.additionalContext,
        evaluatorModel: subjective.llmGrading.evaluatorModel,
      };
    }

    return base;
  });

  return {
    assessment: {
      title: assessment.meta.title,
      description: assessment.meta.description,
      shuffleQuestions: assessment.meta.shuffleQuestions ?? false,
      timeLimitSec: assessment.meta.timeLimitSec ?? null,
      totalQuestions: assessment.questions.length,
    },
    startedAt: submission.startedAt.toISOString(),
    completedAt: submission.completedAt.toISOString(),
    elapsedSec: submission.elapsedSec,
    autoScore: submission.autoScore,
    autoMaxScore: submission.autoMaxScore,
    autoPercentage: submission.autoPercentage,
    subjectiveMaxScore: submission.subjectiveMaxScore,
    totalMaxScore: submission.totalMaxScore,
    subjectivePending: submission.subjectivePending,
    autoSubmitted: submission.autoSubmitted,
    results: questions,
  };
}
