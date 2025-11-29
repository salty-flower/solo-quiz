import { describe, expect, it } from "vitest";
import { buildCsv } from "../csv";

const summary = {
  assessmentTitle: "Sample Quiz",
  deterministicScore: 8,
  deterministicMax: 10,
  deterministicPercentage: 80,
  pendingSubjectiveMax: 2,
  startedAt: new Date("2024-01-01T00:00:00Z"),
  completedAt: new Date("2024-01-01T00:10:00Z"),
  timeElapsedSec: 600,
};

const rows = [
  {
    questionNumber: 1,
    questionId: "q1",
    questionText: "What?",
    type: "single",
    weight: 1,
    tags: ["tag"],
    userAnswer: "A",
    userNote: "Remember to verify steps",
    correctAnswer: "A",
    earned: 1,
    max: 1,
    result: "correct" as const,
  },
];

describe("buildCsv", () => {
  it("produces header, rows, and summary entries", () => {
    const csv = buildCsv(summary, rows);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("Question #");
    expect(lines[1]).toContain("q1");
    expect(lines[lines.length - 1]).toContain("Summary");
    expect(csv).toContain("80.00%");
  });
});
