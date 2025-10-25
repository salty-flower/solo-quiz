import { z } from "zod";

const optionSchema = z.object({
  id: z.string().min(1, "Option id is required"),
  label: z.string().min(1, "Option label is required"),
  explanation: z.string().optional(),
});

const feedbackSchema = z
  .object({
    correct: z.string().optional(),
    incorrect: z.string().optional(),
  })
  .optional();

const rubricSchema = z.object({
  title: z.string().min(1, "Rubric title is required"),
  description: z.string().min(1, "Rubric description is required"),
});

const baseQuestion = z.object({
  id: z.string().min(1, "Question id is required"),
  text: z.string().min(1, "Question text is required"),
  weight: z.number().min(0).optional(),
  tags: z.array(z.string().min(1)).optional(),
  feedback: feedbackSchema,
});

type Option = z.infer<typeof optionSchema>;

const singleQuestion = baseQuestion.extend({
  type: z.literal("single"),
  options: z
    .array(optionSchema)
    .min(2, "Single choice question requires at least two options"),
  correct: z.string().min(1, "Correct option id is required"),
});

const multiQuestion = baseQuestion.extend({
  type: z.literal("multi"),
  options: z
    .array(optionSchema)
    .min(2, "Multi-select question requires at least two options"),
  correct: z
    .array(z.string().min(1))
    .min(1, "Provide at least one correct option id"),
});

const normalizeModes = z.enum(["lower", "trim", "none"]).default("trim");

const fitbQuestion = baseQuestion.extend({
  type: z.literal("fitb"),
  accept: z
    .array(
      z.union([
        z.string().min(1, "Accepted string must be non-empty"),
        z.object({ pattern: z.string(), flags: z.string().optional() }),
      ]),
    )
    .min(1, "Provide at least one acceptable answer"),
  normalize: normalizeModes.optional(),
});

const numericQuestion = baseQuestion.extend({
  type: z.literal("numeric"),
  correct: z.number(),
  tolerance: z.number().min(0).optional(),
});

const orderingQuestion = baseQuestion.extend({
  type: z.literal("ordering"),
  items: z.array(z.string().min(1, "Ordering item cannot be empty")).min(2),
  correctOrder: z.array(z.string().min(1)).min(2),
});

const subjectiveQuestion = baseQuestion.extend({
  type: z.literal("subjective"),
  rubrics: z.array(rubricSchema).min(1, "Provide at least one rubric"),
});

export const questionSchema = z.discriminatedUnion("type", [
  singleQuestion,
  multiQuestion,
  fitbQuestion,
  numericQuestion,
  orderingQuestion,
  subjectiveQuestion,
]);

export type Question = z.infer<typeof questionSchema>;

export type SingleQuestion = z.infer<typeof singleQuestion>;
export type MultiQuestion = z.infer<typeof multiQuestion>;
export type FitbQuestion = z.infer<typeof fitbQuestion>;
export type NumericQuestion = z.infer<typeof numericQuestion>;
export type OrderingQuestion = z.infer<typeof orderingQuestion>;
export type SubjectiveQuestion = z.infer<typeof subjectiveQuestion>;
export type QuestionOption = Option;

const metaSchema = z.object({
  title: z.string().min(1, "Assessment title is required"),
  description: z.string().optional(),
  shuffleQuestions: z.boolean().optional(),
  timeLimitSec: z.number().int().positive().optional(),
});

export const assessmentSchema = z.object({
  schemaVersion: z.string().regex(/^1\./, "schemaVersion must start with 1."),
  meta: metaSchema,
  questions: z.array(questionSchema),
});

export type Assessment = z.infer<typeof assessmentSchema>;
export type AssessmentMeta = z.infer<typeof metaSchema>;

export interface AssessmentParseError {
  path: string;
  message: string;
}

export function parseAssessment(raw: unknown):
  | {
      ok: true;
      data: Assessment;
    }
  | {
      ok: false;
      issues: AssessmentParseError[];
    } {
  const result = assessmentSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export function questionWeight(question: Question): number {
  return question.weight ?? 1;
}

export const llmFeedbackSchema = z.object({
  verdict: z.enum(["correct", "incorrect", "partial"]),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  feedback: z.string().min(1, "Feedback text is required"),
  rubricBreakdown: z
    .array(
      z.object({
        rubric: z.string().min(1, "Rubric reference is required"),
        comments: z.string().min(1, "Provide comments for this rubric"),
        achievedFraction: z
          .number()
          .min(0, "Fraction cannot be negative")
          .max(1, "Fraction cannot exceed 1"),
      }),
    )
    .min(1, "Provide at least one rubric breakdown entry"),
  improvements: z.array(z.string().min(1)).default([]),
});

export type LlmFeedback = z.infer<typeof llmFeedbackSchema>;
