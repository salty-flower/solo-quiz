import type { Assessment } from "../schema";

export interface AssessmentFingerprint {
  title: string;
  questionCount: number;
  sampleQuestionIds: string[];
}

const SAMPLE_QUESTION_COUNT = 3;

export function createAssessmentFingerprint(
  assessment: Assessment,
): AssessmentFingerprint {
  return {
    title: assessment.meta.title,
    questionCount: assessment.questions.length,
    sampleQuestionIds: assessment.questions
      .slice(0, SAMPLE_QUESTION_COUNT)
      .map((question) => question.id),
  };
}

export function normalizeFingerprint(meta?: {
  title?: string;
  questionCount?: number;
  fingerprint?: AssessmentFingerprint | null;
}): AssessmentFingerprint | null {
  if (!meta) return null;
  if (meta.fingerprint) return meta.fingerprint;
  if (!meta.title || meta.questionCount == null) return null;
  return {
    title: meta.title,
    questionCount: meta.questionCount,
    sampleQuestionIds: [],
  };
}

export function fingerprintsMatch(
  left: AssessmentFingerprint | null | undefined,
  right: AssessmentFingerprint | null | undefined,
): boolean {
  if (!left || !right) return false;
  if (left.title !== right.title) return false;
  if (left.questionCount !== right.questionCount) return false;
  const hasSamples =
    left.sampleQuestionIds.length > 0 && right.sampleQuestionIds.length > 0;
  if (!hasSamples) return true;
  if (left.sampleQuestionIds.length !== right.sampleQuestionIds.length)
    return false;
  return left.sampleQuestionIds.every(
    (questionId, index) => questionId === right.sampleQuestionIds[index],
  );
}

export function fingerprintKey(fingerprint: AssessmentFingerprint): string {
  const sample = fingerprint.sampleQuestionIds.join("|") || "none";
  return `${fingerprint.title}::${fingerprint.questionCount}::${sample}`;
}

export function isAssessmentFingerprint(
  value: unknown,
): value is AssessmentFingerprint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AssessmentFingerprint).title === "string" &&
    typeof (value as AssessmentFingerprint).questionCount === "number" &&
    Array.isArray((value as AssessmentFingerprint).sampleQuestionIds) &&
    (value as AssessmentFingerprint).sampleQuestionIds.every(
      (entry) => typeof entry === "string",
    )
  );
}
