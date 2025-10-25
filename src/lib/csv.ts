export interface CsvSummary {
  assessmentTitle: string;
  deterministicScore: number;
  deterministicMax: number;
  deterministicPercentage: number;
  pendingSubjectiveMax: number;
  startedAt: Date;
  completedAt: Date;
  timeElapsedSec: number;
}

export interface CsvQuestionResult {
  questionNumber: number;
  questionId: string;
  questionText: string;
  type: string;
  weight: number;
  tags: string[];
  userAnswer: string;
  correctAnswer: string;
  earned: number | null;
  max: number;
  result: "correct" | "incorrect" | "pending";
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(
  summary: CsvSummary,
  rows: CsvQuestionResult[],
): string {
  const header = [
    "Question #",
    "Question ID",
    "Type",
    "Weight",
    "Tags",
    "Question",
    "Your Answer",
    "Correct Answer",
    "Earned",
    "Max",
    "Result",
  ];

  const lines = [header.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.questionNumber.toString(),
        row.questionId,
        row.type,
        row.weight.toString(),
        row.tags.join("; "),
        row.questionText,
        row.userAnswer,
        row.correctAnswer,
        row.earned == null ? "" : row.earned.toString(),
        row.max.toString(),
        row.result,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  lines.push("");
  lines.push(
    [
      "Summary",
      summary.assessmentTitle,
      "Score",
      `${summary.deterministicScore} / ${summary.deterministicMax}`,
      "Deterministic %",
      `${summary.deterministicPercentage.toFixed(2)}%`,
      "Pending Subjective Max",
      summary.pendingSubjectiveMax.toString(),
      "Time Elapsed (s)",
      summary.timeElapsedSec.toString(),
      "Completed",
      summary.completedAt.toISOString(),
    ]
      .map(escapeCsv)
      .join(","),
  );

  return lines.join("\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
