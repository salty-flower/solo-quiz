import { questionWeight, type SubjectiveQuestion } from "./schema";

interface BuildSubjectivePromptOptions {
  assessmentTitle: string;
  questionNumber: number;
  totalQuestions: number;
  question: SubjectiveQuestion;
  userAnswer: string;
}

export function buildSubjectivePrompt({
  assessmentTitle,
  questionNumber,
  totalQuestions,
  question,
  userAnswer,
}: BuildSubjectivePromptOptions): string {
  const maxScore = questionWeight(question);
  const referenceAnswer = question.llmGrading.referenceAnswer
    ? `Reference answer:\n${question.llmGrading.referenceAnswer.trim()}`
    : "";
  const additionalContext = question.llmGrading.additionalContext
    ? `Additional context:\n${question.llmGrading.additionalContext.trim()}`
    : "";
  const evaluatorModel = question.llmGrading.evaluatorModel
    ? `Preferred model: ${question.llmGrading.evaluatorModel}`
    : "";

  const instructions = [
    `You are assisting an instructor by grading a student's response for the assessment "${assessmentTitle}".`,
    `Question ${questionNumber} of ${totalQuestions}:`,
    question.text.trim(),
    `Maximum score: ${maxScore}`,
    evaluatorModel,
    `Rubric:\n${question.llmGrading.rubric.trim()}`,
    referenceAnswer,
    additionalContext,
    `Student response:\n${userAnswer.trim() || "(no response provided)"}`,
    "Respond with JSON using this schema:",
    '{"verdict":"correct|incorrect|partial","score":number,"maxScore":number,"feedback":string,"rubricBreakdown":[{"rubric":string,"comments":string,"achievedFraction":number}],"improvements":string[]}',
    "Ensure the JSON is valid and does not include additional commentary.",
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");

  return instructions;
}
