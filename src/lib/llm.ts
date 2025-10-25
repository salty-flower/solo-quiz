import { zodToJsonSchema } from "zod-to-json-schema";
import type { SubjectiveQuestion } from "./schema";
import { llmFeedbackSchema } from "./schema";

export const llmFeedbackJsonSchema = JSON.stringify(
  zodToJsonSchema(llmFeedbackSchema, {
    name: "SoloQuizSubjectiveFeedback",
    target: "jsonSchema7",
  }),
  null,
  2,
);

export const llmFeedbackExample = JSON.stringify(
  {
    verdict: "partial",
    score: 2,
    maxScore: 3,
    feedback:
      "Your explanation identifies the key idea but needs a clearer connection to problem solving.",
    rubricBreakdown: [
      {
        rubric: "States the principle",
        comments: "Explicitly mentioned conservation of energy.",
        achievedFraction: 1,
      },
      {
        rubric: "Connects to problem solving",
        comments:
          "Notes that energy relationships reduce algebra, but the description is brief.",
        achievedFraction: 0.5,
      },
      {
        rubric: "Clarity",
        comments: "Overall understandable, though one sentence is vague.",
        achievedFraction: 0.75,
      },
    ],
    improvements: [
      "Add a concrete example describing how energy conservation removes the need to track forces.",
    ],
  },
  null,
  2,
);

interface PromptContext {
  question: SubjectiveQuestion;
  userAnswer: string;
  maxScore: number;
}

export function buildSubjectivePrompt({
  question,
  userAnswer,
  maxScore,
}: PromptContext): string {
  const rubricLines = question.rubrics
    .map(
      (rubric, index) => `${index + 1}. ${rubric.title}: ${rubric.description}`,
    )
    .join("\n");
  const answerText =
    userAnswer.trim().length > 0 ? userAnswer.trim() : "(no response provided)";
  return [
    "You are grading a student's response for the Solo Quiz application.",
    `Question ID: ${question.id}`,
    "Question text:",
    question.text,
    "Rubrics:",
    rubricLines,
    `Maximum score available: ${maxScore}`,
    "Student response:",
    answerText,
    "Return a JSON object that strictly matches this Zod schema:",
    llmFeedbackJsonSchema,
    "Example of a valid response:",
    llmFeedbackExample,
  ].join("\n\n");
}
