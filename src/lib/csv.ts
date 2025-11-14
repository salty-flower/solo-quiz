import type { CsvQuestionResult, CsvSummary } from "./summary";

export type { CsvQuestionResult, CsvSummary } from "./summary";

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
    "Grading Mode",
    "Correct?",
    "Awarded Score",
    "Evaluation Status",
    "Evaluation Notes",
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
        row.gradingMode,
        row.isCorrect === null ? "pending" : row.isCorrect ? "true" : "false",
        row.earned.toString(),
        row.evaluationStatus ?? "",
        row.evaluationNotes ?? "",
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
      "Auto Score",
      `${summary.autoScore} / ${summary.autoMaxScore}`,
      "Auto Percentage",
      `${summary.autoPercentage.toFixed(2)}%`,
      "Subjective Max Score",
      summary.subjectiveMaxScore.toString(),
      "Time Elapsed (s)",
      summary.timeElapsedSec.toString(),
      "Completed",
      summary.completedAt.toISOString(),
      "",
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
