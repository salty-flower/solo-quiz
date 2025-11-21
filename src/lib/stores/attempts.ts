import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { derived, get, writable } from "svelte/store";
import type { SubmissionSummary } from "../results";

const MAX_ATTEMPTS = 10;
const DB_NAME = "solo-quiz-attempts";
const STORE_ATTEMPTS = "attempts";
const LOCAL_STORAGE_KEY = "solo-quiz-attempts-v1";

type StoredSubmissionSummary = Omit<
  SubmissionSummary,
  "startedAt" | "completedAt"
> & { startedAt: number; completedAt: number };

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

interface AttemptsDB extends DBSchema {
  [STORE_ATTEMPTS]: {
    key: string;
    value: StoredSubmissionSummary;
  };
}

let dbPromise: Promise<IDBPDatabase<AttemptsDB> | null> | null = null;
const memoryAttempts: StoredSubmissionSummary[] = [];

async function getDb(): Promise<IDBPDatabase<AttemptsDB> | null> {
  if (!isIndexedDbAvailable()) return null;

  if (!dbPromise) {
    dbPromise = openDB<AttemptsDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
          db.createObjectStore(STORE_ATTEMPTS, { keyPath: "id" });
        }
      },
    }).catch((error) => {
      console.warn(
        "IndexedDB unavailable, falling back to memory store",
        error,
      );
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
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return [...memoryAttempts];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return [...memoryAttempts];
    }
    const filtered = parsed.filter(isStoredAttempt);
    return filtered;
  } catch (error) {
    console.warn("Unable to parse local attempts cache; clearing", error);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    return [...memoryAttempts];
  }
}

function persistSnapshot(entries: StoredSubmissionSummary[]): void {
  memoryAttempts.length = 0;
  memoryAttempts.push(...entries);

  if (typeof localStorage === "undefined") return;
  try {
    if (entries.length === 0) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Unable to persist attempts to localStorage", error);
  }
}

async function getAttemptsFromDb(
  db: IDBPDatabase<AttemptsDB>,
): Promise<StoredSubmissionSummary[]> {
  const tx = db.transaction(STORE_ATTEMPTS, "readonly");
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
  const trimmed = sorted.slice(0, MAX_ATTEMPTS);
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

  const tx = db.transaction(STORE_ATTEMPTS, "readwrite");
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
    .slice(0, MAX_ATTEMPTS);
}

async function clearPersistedAttempts() {
  const db = await getDb();
  if (!db) {
    persistSnapshot([]);
    return;
  }

  const tx = db.transaction(STORE_ATTEMPTS, "readwrite");
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
