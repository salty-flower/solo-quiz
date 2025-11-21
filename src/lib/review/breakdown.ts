import { buildStatusSegments } from "./status";
import type { QuestionResult, ResultStatus } from "../results";

type BreakdownRow = {
  label: string;
  segments: { label: string; value: number; colorClass: string }[];
  total: number;
};

export function createBreakdownRows(
  results: QuestionResult[],
  labelForResult: (result: QuestionResult) => string,
): BreakdownRow[] {
  const tally = new Map<string, Record<ResultStatus, number>>();

  for (const result of results) {
    const label = labelForResult(result) || "Unlabeled";
    const counts = tally.get(label) ?? { correct: 0, incorrect: 0, pending: 0 };
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    tally.set(label, counts);
  }

  return Array.from(tally.entries())
    .map(([label, counts]) => ({
      label,
      segments: buildStatusSegments(counts),
      total:
        (counts.correct ?? 0) + (counts.incorrect ?? 0) + (counts.pending ?? 0),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export type { BreakdownRow };
