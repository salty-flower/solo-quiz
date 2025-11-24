import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { derived, get, writable } from "svelte/store";
import { MAX_STORED_ATTEMPTS, STORAGE_KEYS } from "../constants";
import { reportStorageIssue } from "../storage-notices";
import {
  isIndexedDbAvailable,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "../utils/persistence";
import type { SubmissionSummary } from "../results";

const { attemptsDbName, attemptsStore, attemptsLocal } = STORAGE_KEYS;

type StoredSubmissionSummary = Omit<
  SubmissionSummary,
  "startedAt" | "completedAt"
> & { startedAt: number; completedAt: number };

interface AttemptsDB extends DBSchema {
  [attemptsStore]: {
    key: string;
    value: StoredSubmissionSummary;
  };
}

let dbPromise: Promise<IDBPDatabase<AttemptsDB> | null> | null = null;
const memoryAttempts: StoredSubmissionSummary[] = [];
let attemptStorageFallbackNotified = false;

function notifyAttemptStorageFallback(): void {
  if (attemptStorageFallbackNotified) return;
  reportStorageIssue(
    "Persistent storage is unavailable; attempts will only be kept for this session.",
  );
  attemptStorageFallbackNotified = true;
}

async function getDb(): Promise<IDBPDatabase<AttemptsDB> | null> {
  if (!isIndexedDbAvailable()) {
    notifyAttemptStorageFallback();
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB<AttemptsDB>(attemptsDbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(attemptsStore)) {
          db.createObjectStore(attemptsStore, { keyPath: "id" });
        }
      },
    }).catch((error) => {
      console.warn(
        "IndexedDB unavailable, falling back to memory store",
        error,
      );
      notifyAttemptStorageFallback();
      return null;
    });
  }

  return dbPromise;
}

function serializeAttempt(summary: SubmissionSummary): StoredSubmissionSummary {
  return {
    ...summary,
    startedAt: summary.startedAt.getTime(),
    completedAt: summary.completedAt.getTime(),
  };
}

function deserializeAttempt(value: StoredSubmissionSummary): SubmissionSummary {
  return {
    ...value,
    startedAt: new Date(value.startedAt),
    completedAt: new Date(value.completedAt),
  };
}

function isStoredAttempt(value: unknown): value is StoredSubmissionSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredSubmissionSummary).id === "string" &&
    typeof (value as StoredSubmissionSummary).assessment === "object" &&
    typeof (value as StoredSubmissionSummary).startedAt === "number" &&
    typeof (value as StoredSubmissionSummary).completedAt === "number" &&
    Array.isArray((value as StoredSubmissionSummary).results)
  );
}

function readLocalAttempts(): StoredSubmissionSummary[] {
  if (typeof localStorage === "undefined") return [...memoryAttempts];
  const stored = safeLocalStorageGet(attemptsLocal);
  if (!stored) return [...memoryAttempts];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      safeLocalStorageRemove(attemptsLocal);
      return [...memoryAttempts];
    }
    const filtered = parsed.filter(isStoredAttempt);
    if (filtered.length !== parsed.length) {
      reportStorageIssue(
        "Some saved attempts could not be read and were removed.",
      );
      persistSnapshot(filtered);
    }
    return filtered;
  } catch (error) {
    console.warn("Unable to parse local attempts cache; clearing", error);
    reportStorageIssue(
      "We could not load your previous attempts from storage.",
    );
    safeLocalStorageRemove(attemptsLocal);
    return [...memoryAttempts];
  }
}

function persistSnapshot(entries: StoredSubmissionSummary[]): void {
  memoryAttempts.length = 0;
  memoryAttempts.push(...entries);

  if (typeof localStorage === "undefined") return;
  try {
    if (entries.length === 0) {
      safeLocalStorageRemove(attemptsLocal);
      return;
    }
    safeLocalStorageSet(attemptsLocal, JSON.stringify(entries));
  } catch (error) {
    console.warn("Unable to persist attempts to localStorage", error);
    reportStorageIssue("We could not save your attempts locally.");
  }
}

async function getAttemptsFromDb(
  db: IDBPDatabase<AttemptsDB>,
): Promise<StoredSubmissionSummary[]> {
  const tx = db.transaction(attemptsStore, "readonly");
  const all = await tx.store.getAll();
  return all;
}

async function hydrateAttempts() {
  const db = await getDb();
  if (!db) {
    const local = readLocalAttempts();
    attemptMap.set(toLimitedMap(local.map(deserializeAttempt)));
    return;
  }

  const entries = await getAttemptsFromDb(db);
  persistSnapshot(entries);
  attemptMap.set(toLimitedMap(entries.map(deserializeAttempt)));
}

function toLimitedMap(
  list: SubmissionSummary[],
): Map<string, SubmissionSummary> {
  const sorted = [...list].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
  const trimmed = sorted.slice(0, MAX_STORED_ATTEMPTS);
  return new Map(trimmed.map((attempt) => [attempt.id, attempt]));
}

async function persistAttempt(summary: SubmissionSummary) {
  const db = await getDb();
  const stored = serializeAttempt(summary);

  if (!db) {
    const snapshot = toLimitedSnapshot([...readLocalAttempts(), stored]);
    persistSnapshot(snapshot);
    return;
  }

  const tx = db.transaction(attemptsStore, "readwrite");
  await tx.store.put(stored);
  await tx.done;
  const snapshot = toLimitedSnapshot(await getAttemptsFromDb(db));
  persistSnapshot(snapshot);
}

function toLimitedSnapshot(
  list: StoredSubmissionSummary[],
): StoredSubmissionSummary[] {
  return [...list]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_STORED_ATTEMPTS);
}

async function persistAttemptMap(
  entries: Map<string, SubmissionSummary>,
): Promise<void> {
  const snapshot = toLimitedSnapshot(
    [...entries.values()].map(serializeAttempt),
  );
  const db = await getDb();
  if (!db) {
    persistSnapshot(snapshot);
    return;
  }

  const tx = db.transaction(attemptsStore, "readwrite");
  await tx.store.clear();
  for (const entry of snapshot) {
    await tx.store.put(entry);
  }
  await tx.done;
  const persisted = await getAttemptsFromDb(db);
  persistSnapshot(persisted);
}

async function clearPersistedAttempts() {
  const db = await getDb();
  if (!db) {
    persistSnapshot([]);
    return;
  }

  const tx = db.transaction(attemptsStore, "readwrite");
  await tx.store.clear();
  await tx.done;
  persistSnapshot([]);
}

const attemptMap = writable<Map<string, SubmissionSummary>>(new Map());

void hydrateAttempts();

export const attempts = {
  subscribe: attemptMap.subscribe,
};

export const attemptList = derived(attemptMap, ($attemptMap) =>
  [...$attemptMap.values()].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  ),
);

export function registerAttempt(summary: SubmissionSummary): string {
  attemptMap.update((prev) => {
    const next = new Map(prev);
    const updated = toLimitedMap([summary, ...next.values()]);
    return updated;
  });
  void persistAttempt(summary);
  return summary.id;
}

export function getAttempt(attemptId: string): SubmissionSummary | null {
  return get(attemptMap).get(attemptId) ?? null;
}

export async function clearAttempts() {
  attemptMap.set(new Map());
  await clearPersistedAttempts();
}

export async function deleteAttempt(attemptId: string) {
  const updated = new Map(get(attemptMap));
  updated.delete(attemptId);
  const limited = toLimitedMap([...updated.values()]);
  attemptMap.set(limited);
  await persistAttemptMap(limited);
}

export async function deleteAttemptsByTitle(title: string) {
  const filtered = [...get(attemptMap).values()].filter(
    (entry) => entry.assessment.meta.title !== title,
  );
  const next = toLimitedMap(filtered);
  attemptMap.set(next);
  await persistAttemptMap(next);
}
