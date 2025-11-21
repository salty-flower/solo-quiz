import type { ResultStatus } from "../results";

export const statusPalette: Record<
  ResultStatus,
  { label: string; colorClass: string }
> = {
  correct: { label: "Correct", colorClass: "bg-green-500" },
  incorrect: { label: "Incorrect", colorClass: "bg-destructive" },
  pending: { label: "Pending", colorClass: "bg-amber-400" },
};

export const statusSortOrder: Record<ResultStatus, number> = {
  incorrect: 0,
  pending: 1,
  correct: 2,
};

export function statusMeta(result: { status: ResultStatus }) {
  if (result.status === "correct") {
    return {
      label: "Correct",
      textClass: "text-green-600 dark:text-green-300",
    };
  }
  if (result.status === "incorrect") {
    return {
      label: "Incorrect",
      textClass: "text-destructive",
    };
  }
  return {
    label: "Pending review",
    textClass: "text-muted-foreground",
  };
}

export function buildStatusSegments(counts: Record<ResultStatus, number>) {
  return (Object.keys(statusPalette) as ResultStatus[]).map((status) => ({
    label: statusPalette[status].label,
    value: counts[status] ?? 0,
    colorClass: statusPalette[status].colorClass,
  }));
}
