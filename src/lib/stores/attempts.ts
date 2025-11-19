import { get, writable } from "svelte/store";
import type { SubmissionSummary } from "../results";

const MAX_ATTEMPTS = 10;

const attemptMap = writable<Map<string, SubmissionSummary>>(new Map());

export const attempts = {
  subscribe: attemptMap.subscribe,
};

export function registerAttempt(summary: SubmissionSummary): string {
  attemptMap.update((prev) => {
    const next = new Map(prev);
    next.set(summary.id, summary);
    while (next.size > MAX_ATTEMPTS) {
      const oldestKey = next.keys().next().value;
      if (oldestKey) {
        next.delete(oldestKey);
      } else {
        break;
      }
    }
    return next;
  });
  return summary.id;
}

export function getAttempt(attemptId: string): SubmissionSummary | null {
  return get(attemptMap).get(attemptId) ?? null;
}
