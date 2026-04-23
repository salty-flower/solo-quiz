import { describe, expect, it } from "vitest";
import { parseAssessment } from "../schema";

const baseAssessment = {
  schemaVersion: "1.0",
  meta: {
    title: "Expressive schema",
  },
  questions: [],
};

describe("parseAssessment", () => {
  it("accepts question images, matching questions, weighted rubrics, ranges, and parts", () => {
    const result = parseAssessment({
      ...baseAssessment,
      questions: [
        {
          id: "part-a",
          type: "numeric",
          text: "Estimate annualized volatility.",
          image: {
            url: "data:image/svg+xml;base64,abc123",
            alt: "Payoff diagram",
          },
          part: {
            groupId: "greeks-1",
            label: "a",
            title: "Greeks drill",
          },
          correct: 20,
          range: [15, 25],
        },
        {
          id: "part-b",
          type: "matching",
          text: "Match each Greek to the definition.",
          part: {
            groupId: "greeks-1",
            label: "b",
          },
          prompts: [
            { id: "delta", prompt: "Δ" },
            { id: "gamma", prompt: "Γ" },
          ],
          options: [
            { id: "price", label: "Rate of change of option price" },
            { id: "curvature", label: "Curvature of price" },
          ],
          correct: {
            delta: "price",
            gamma: "curvature",
          },
        },
        {
          id: "part-c",
          type: "subjective",
          text: "Explain why gamma matters near expiry.",
          part: {
            groupId: "greeks-1",
            label: "c",
          },
          rubrics: [
            {
              title: "Principle",
              description: "States the core idea",
              weight: 2,
            },
            {
              title: "Clarity",
              description: "Communicates clearly",
              weight: 1,
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects matching keys that do not cover every prompt", () => {
    const result = parseAssessment({
      ...baseAssessment,
      questions: [
        {
          id: "match-1",
          type: "matching",
          text: "Match items",
          prompts: [
            { id: "left-1", prompt: "A" },
            { id: "left-2", prompt: "B" },
          ],
          options: [
            { id: "right-1", label: "One" },
            { id: "right-2", label: "Two" },
          ],
          correct: {
            "left-1": "right-1",
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected schema validation to fail");
    }
    expect(result.issues.some((issue) => issue.path.includes("correct"))).toBe(
      true,
    );
  });

  it("rejects non-contiguous multi-part groups", () => {
    const result = parseAssessment({
      ...baseAssessment,
      questions: [
        {
          id: "part-a",
          type: "single",
          text: "Part a",
          part: { groupId: "series", label: "a", title: "Series expansion" },
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          correct: "yes",
        },
        {
          id: "solo",
          type: "single",
          text: "Standalone",
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          correct: "yes",
        },
        {
          id: "part-b",
          type: "single",
          text: "Part b",
          part: { groupId: "series", label: "b" },
          options: [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
          ],
          correct: "yes",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected schema validation to fail");
    }
    expect(
      result.issues.some((issue) => issue.message.includes("contiguous")),
    ).toBe(true);
  });

  it("rejects numeric questions that declare both tolerance and range", () => {
    const result = parseAssessment({
      ...baseAssessment,
      questions: [
        {
          id: "num-1",
          type: "numeric",
          text: "Range clash",
          correct: 10,
          tolerance: 1,
          range: [9, 11],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected schema validation to fail");
    }
    expect(result.issues.some((issue) => issue.message.includes("range"))).toBe(
      true,
    );
  });
});
