import { describe, expect, it, vi } from "vitest";
import { evaluateQuestion } from "../results";
import type {
  FitbQuestion,
  MatchingQuestion,
  MultiQuestion,
  NumericQuestion,
  OrderingQuestion,
  SingleQuestion,
  SubjectiveQuestion,
} from "../schema";

const baseMeta = {
  tags: [],
  weight: 2,
  feedback: { correct: "nice", incorrect: "nope" },
};

const singleQuestion: SingleQuestion = {
  ...baseMeta,
  id: "single-1",
  type: "single",
  text: "Pick one",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: "a",
};

const multiQuestion: MultiQuestion = {
  ...baseMeta,
  id: "multi-1",
  type: "multi",
  text: "Pick two",
  options: [
    { id: "red", label: "Red" },
    { id: "blue", label: "Blue" },
    { id: "green", label: "Green" },
  ],
  correct: ["blue", "red"],
};

const fitbQuestion: FitbQuestion = {
  ...baseMeta,
  id: "fitb-1",
  type: "fitb",
  text: "Spell",
  accept: ["Answer", { pattern: "ans.*", flags: "i" }],
  normalize: "lower",
};

const numericQuestion: NumericQuestion = {
  ...baseMeta,
  id: "num-1",
  type: "numeric",
  text: "Number",
  correct: 3.14,
  tolerance: 0.01,
};

const numericRangeQuestion: NumericQuestion = {
  ...baseMeta,
  id: "num-range-1",
  type: "numeric",
  text: "Volatility band",
  correct: 20,
  range: [15, 25],
};

const orderingQuestion: OrderingQuestion = {
  ...baseMeta,
  id: "ord-1",
  type: "ordering",
  text: "Order",
  items: ["a", "b", "c"],
  correctOrder: ["b", "a", "c"],
  shuffleItems: true,
};

const matchingQuestion: MatchingQuestion = {
  ...baseMeta,
  id: "match-1",
  type: "matching",
  text: "Match each Greek to its meaning.",
  prompts: [
    { id: "delta", prompt: "Δ" },
    { id: "gamma", prompt: "Γ" },
  ],
  options: [
    { id: "price", label: "Rate of change of option price" },
    { id: "curvature", label: "Curvature of price with respect to spot" },
  ],
  correct: {
    delta: "price",
    gamma: "curvature",
  },
};

const subjectiveQuestion: SubjectiveQuestion = {
  ...baseMeta,
  id: "subj-1",
  type: "subjective",
  text: "Explain",
  rubrics: [{ title: "quality", description: "Quality", weight: 2 }],
};

describe("evaluateQuestion", () => {
  it("awards full credit for single choice matches", () => {
    const result = evaluateQuestion(singleQuestion, "a");
    expect(result.isCorrect).toBe(true);
    expect(result.earned).toBe(2);
    expect(result.userAnswer).toContain("A");
  });

  it("handles unordered multi select answers", () => {
    const result = evaluateQuestion(multiQuestion, ["red", "blue"]);
    expect(result.isCorrect).toBe(true);
    expect(result.earned).toBe(2);
    expect(result.selectedOptions).toEqual(["red", "blue"]);
  });

  it("normalizes fitb answers and tolerates regex entries", () => {
    const warnSpy = vi.spyOn(console, "warn");
    const result = evaluateQuestion(fitbQuestion, "answer  ");
    expect(result.status).toBe("correct");
    expect(result.userAnswer).toBe("answer");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("respects numeric tolerance", () => {
    const result = evaluateQuestion(numericQuestion, "3.145");
    expect(result.status).toBe("correct");
    expect(result.correctAnswer).toContain("± 0.01");
  });

  it("accepts numeric answers inside an asymmetric range", () => {
    const inside = evaluateQuestion(numericRangeQuestion, "24.5");
    const outside = evaluateQuestion(numericRangeQuestion, "26");
    expect(inside.status).toBe("correct");
    expect(inside.correctAnswer).toContain("[15, 25]");
    expect(outside.status).toBe("incorrect");
  });

  it("compares ordering questions strictly", () => {
    const incorrect = evaluateQuestion(orderingQuestion, ["a", "b", "c"]);
    const correct = evaluateQuestion(
      orderingQuestion,
      orderingQuestion.correctOrder,
    );
    expect(incorrect.status).toBe("incorrect");
    expect(correct.status).toBe("correct");
  });

  it("compares matching questions by prompt-to-option pairs", () => {
    const incorrect = evaluateQuestion(matchingQuestion, {
      delta: "curvature",
      gamma: "price",
    });
    const correct = evaluateQuestion(matchingQuestion, {
      delta: "price",
      gamma: "curvature",
    });
    expect(incorrect.status).toBe("incorrect");
    expect(correct.status).toBe("correct");
    expect(correct.userAnswer).toContain("Δ");
    expect(correct.correctAnswer).toContain("Rate of change");
  });

  it("marks subjective questions as pending", () => {
    const result = evaluateQuestion(subjectiveQuestion, "thoughts");
    expect(result.status).toBe("pending");
    expect(result.requiresManualGrading).toBe(true);
    expect(result.earned).toBeNull();
    if (!result.requiresManualGrading) {
      throw new Error("Expected a manually graded result");
    }
    expect(result.rubrics[0]?.weight).toBe(2);
  });
});
