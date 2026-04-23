import { describe, expect, it } from "vitest";
import { buildSubjectivePrompt } from "../llm";
import type { SubjectiveQuestion } from "../schema";
import { calculateWeightedRubricFraction } from "../utils/rubric-weights";

const question: SubjectiveQuestion = {
  id: "subj-weighted",
  type: "subjective",
  text: "Explain delta-gamma hedging.",
  rubrics: [
    {
      title: "States the principle",
      description: "Identifies what the hedge is doing",
      weight: 3,
    },
    {
      title: "Clarity",
      description: "Keeps the explanation readable",
      weight: 1,
    },
  ],
};

describe("buildSubjectivePrompt", () => {
  it("includes rubric weights for manual grading guidance", () => {
    const prompt = buildSubjectivePrompt({
      question,
      userAnswer: "Use delta and gamma to reduce directional risk.",
      maxScore: 4,
    });

    expect(prompt).toContain("States the principle");
    expect(prompt).toContain("Weight: 3");
    expect(prompt).toContain("Clarity");
    expect(prompt).toContain("Weight: 1");
  });
});

describe("calculateWeightedRubricFraction", () => {
  it("weights rubric fractions instead of averaging them equally", () => {
    const fraction = calculateWeightedRubricFraction(question.rubrics, [
      { achievedFraction: 1 },
      { achievedFraction: 0 },
    ]);

    expect(fraction).toBeCloseTo(0.75);
  });
});
