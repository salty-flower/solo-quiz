import { describe, expect, it, vi } from "vitest";
import { evaluateQuestion } from "../results";
import type {
  FitbQuestion,
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

const orderingQuestion: OrderingQuestion = {
  ...baseMeta,
  id: "ord-1",
  type: "ordering",
  text: "Order",
  items: ["a", "b", "c"],
  correctOrder: ["b", "a", "c"],
  shuffleItems: true,
};

const subjectiveQuestion: SubjectiveQuestion = {
  ...baseMeta,
  id: "subj-1",
  type: "subjective",
  text: "Explain",
  rubrics: [{ title: "quality", description: "Quality" }],
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

  it("compares ordering questions strictly", () => {
    const incorrect = evaluateQuestion(orderingQuestion, ["a", "b", "c"]);
    const correct = evaluateQuestion(
      orderingQuestion,
      orderingQuestion.correctOrder,
    );
    expect(incorrect.status).toBe("incorrect");
    expect(correct.status).toBe("correct");
  });

  it("marks subjective questions as pending", () => {
    const result = evaluateQuestion(subjectiveQuestion, "thoughts");
    expect(result.status).toBe("pending");
    expect(result.requiresManualGrading).toBe(true);
    expect(result.earned).toBeNull();
  });
});
