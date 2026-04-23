import * as z from "zod";

const contextSchema = z.object({
  id: z.string().min(1, "Context id is required"),
  title: z.string().optional(),
  body: z.string().min(1, "Context body is required"),
});

const imageSchema = z.object({
  url: z.string().min(1, "Image url is required"),
  alt: z.string().min(1, "Image alt text is required"),
  caption: z.string().min(1, "Image caption cannot be empty").optional(),
});

const partSchema = z.object({
  groupId: z.string().min(1, "Part group id is required"),
  label: z.string().min(1, "Part label is required"),
  title: z.string().min(1, "Part title cannot be empty").optional(),
});

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
  weight: z
    .number()
    .positive("Rubric weight must be greater than 0")
    .optional(),
});

const matchingPromptSchema = z.object({
  id: z.string().min(1, "Prompt id is required"),
  prompt: z.string().min(1, "Prompt text is required"),
  explanation: z.string().optional(),
});

const baseQuestion = z.object({
  id: z.string().min(1, "Question id is required"),
  text: z.string().min(1, "Question text is required"),
  weight: z.number().min(0).optional(),
  tags: z.array(z.string().min(1)).optional(),
  feedback: feedbackSchema,
  contextId: z.string().min(1, "Context id is required").optional(),
  image: imageSchema.optional(),
  part: partSchema.optional(),
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

const numericQuestion = baseQuestion
  .extend({
    type: z.literal("numeric"),
    correct: z.number(),
    tolerance: z.number().min(0).optional(),
    range: z.tuple([z.number(), z.number()]).optional(),
  })
  .superRefine((question, ctx) => {
    if (question.tolerance != null && question.range) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "Use either tolerance or range, not both",
      });
    }

    if (question.range && question.range[0] > question.range[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "Numeric range must be ordered as [low, high]",
      });
    }
  });

const orderingQuestion = baseQuestion.extend({
  type: z.literal("ordering"),
  items: z.array(z.string().min(1, "Ordering item cannot be empty")).min(2),
  correctOrder: z.array(z.string().min(1)).min(2),
  shuffleItems: z.boolean().default(true),
});

const matchingQuestion = baseQuestion
  .extend({
    type: z.literal("matching"),
    prompts: z
      .array(matchingPromptSchema)
      .min(2, "Matching question requires at least two prompts"),
    options: z
      .array(optionSchema)
      .min(2, "Matching question requires at least two options"),
    correct: z.record(
      z.string(),
      z.string().min(1, "Matching option id is required"),
    ),
  })
  .superRefine((question, ctx) => {
    validateMatchingQuestion(question, ctx);
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
  matchingQuestion,
  subjectiveQuestion,
]);

type MatchingQuestionValue = z.infer<typeof matchingQuestion>;

function validateMatchingQuestion(
  question: MatchingQuestionValue,
  ctx: z.RefinementCtx,
) {
  const promptIds = new Set<string>();
  question.prompts.forEach((prompt, index) => {
    if (promptIds.has(prompt.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompts", index, "id"],
        message: "Matching prompt ids must be unique",
      });
    }
    promptIds.add(prompt.id);
  });

  const optionIds = new Set<string>();
  question.options.forEach((option, index) => {
    if (optionIds.has(option.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options", index, "id"],
        message: "Matching option ids must be unique",
      });
    }
    optionIds.add(option.id);
  });

  if (question.options.length < question.prompts.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["options"],
      message: "Matching questions need at least as many options as prompts",
    });
  }

  const assignedOptions = new Set<string>();
  for (const [promptId, optionId] of Object.entries(question.correct)) {
    if (!promptIds.has(promptId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct", promptId],
        message: "Matching answer must reference a defined prompt id",
      });
    }
    if (!optionIds.has(optionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct", promptId],
        message: "Matching answer must reference a defined option id",
      });
    }
    if (assignedOptions.has(optionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct", promptId],
        message: "Matching answers must map each option at most once",
      });
    }
    assignedOptions.add(optionId);
  }

  question.prompts.forEach((prompt) => {
    if (!(prompt.id in question.correct)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct", prompt.id],
        message: "Provide one correct option for every matching prompt",
      });
    }
  });
}

function validatePartGroups(questions: Question[], ctx: z.RefinementCtx) {
  const positionsByGroup = new Map<string, number[]>();
  const labelsByGroup = new Map<string, Set<string>>();

  questions.forEach((question, index) => {
    if (!question.part) return;

    const positions = positionsByGroup.get(question.part.groupId) ?? [];
    positions.push(index);
    positionsByGroup.set(question.part.groupId, positions);

    const labels =
      labelsByGroup.get(question.part.groupId) ?? new Set<string>();
    if (labels.has(question.part.label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", index, "part", "label"],
        message: "Part labels must be unique within the same part group",
      });
    }
    labels.add(question.part.label);
    labelsByGroup.set(question.part.groupId, labels);
  });

  for (const [groupId, positions] of positionsByGroup.entries()) {
    if (positions.length < 2) continue;
    const first = Math.min(...positions);
    const last = Math.max(...positions);
    if (last - first + 1 !== positions.length) {
      positions.forEach((position) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", position, "part", "groupId"],
          message: `Part group "${groupId}" must stay contiguous in the questions array`,
        });
      });
    }
  }
}

export type Question = z.infer<typeof questionSchema>;
export type AssessmentContext = z.infer<typeof contextSchema>;
export type QuestionImage = z.infer<typeof imageSchema>;
export type QuestionPart = z.infer<typeof partSchema>;

export type SingleQuestion = z.infer<typeof singleQuestion>;
export type MultiQuestion = z.infer<typeof multiQuestion>;
export type FitbQuestion = z.infer<typeof fitbQuestion>;
export type NumericQuestion = z.infer<typeof numericQuestion>;
export type OrderingQuestion = z.infer<typeof orderingQuestion>;
export type MatchingQuestion = z.infer<typeof matchingQuestion>;
export type SubjectiveQuestion = z.infer<typeof subjectiveQuestion>;
export type QuestionOption = Option;

const metaSchema = z.object({
  title: z.string().min(1, "Assessment title is required"),
  description: z.string().optional(),
  shuffleQuestions: z.boolean().optional(),
  timeLimitSec: z.number().int().positive().optional(),
  noBackNavigation: z.boolean().optional(),
});

export const assessmentSchema = z
  .object({
    schemaVersion: z.string().regex(/^1\./, "schemaVersion must start with 1."),
    meta: metaSchema,
    questions: z.array(questionSchema),
    contexts: z.array(contextSchema).nonempty().optional(),
  })
  .superRefine((assessment, ctx) => {
    if (assessment.contexts) {
      const ids = new Set<string>();
      assessment.contexts.forEach((context, index) => {
        if (ids.has(context.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["contexts", index, "id"],
            message: "Context ids must be unique",
          });
        }
        ids.add(context.id);
      });

      assessment.questions.forEach((question, index) => {
        if (question.contextId && !ids.has(question.contextId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", index, "contextId"],
            message: "contextId must reference a defined context",
          });
        }
      });
    } else {
      assessment.questions.forEach((question, index) => {
        if (question.contextId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", index, "contextId"],
            message: "Add a contexts array before referencing a contextId",
          });
        }
      });
    }

    validatePartGroups(assessment.questions, ctx);
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

export const llmFeedbackSchema = z
  .object({
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
  })
  .refine((data) => data.score <= data.maxScore, {
    message: "Score cannot exceed the max score",
    path: ["score"],
  });

export type LlmFeedback = z.infer<typeof llmFeedbackSchema>;
