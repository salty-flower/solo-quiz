import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { STORAGE_KEYS, STORAGE_VERSIONS } from "./constants";
import { reportStorageIssue } from "./storage-notices";
import {
  isIndexedDbAvailable,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "./utils/persistence";

const { recentsDbName, recentsStore, recentsLocal } = STORAGE_KEYS;

export interface RecentFileEntry {
  name: string;
  lastOpened: number;
  /**
   * Cached JSON assessment content for offline reloads. Older entries may not
   * include this field, so callers should handle `undefined` gracefully.
   */
  data?: string;
  meta?: RecentFileMeta;
}

export interface RecentFileMeta {
  title?: string;
  questionCount?: number;
}

interface SoloQuizDB extends DBSchema {
  [recentsStore]: {
    key: string;
    value: RecentFileEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<SoloQuizDB> | null> | null = null;
const memoryRecents: RecentFileEntry[] = [];

async function getDb(): Promise<IDBPDatabase<SoloQuizDB> | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB<SoloQuizDB>(recentsDbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(recentsStore)) {
          db.createObjectStore(recentsStore, { keyPath: "name" });
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

function sortRecents(list: RecentFileEntry[]): RecentFileEntry[] {
  return [...list].sort((a, b) => b.lastOpened - a.lastOpened);
}

function isRecentEntry(value: unknown): value is RecentFileEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RecentFileEntry).name === "string" &&
    typeof (value as RecentFileEntry).lastOpened === "number" &&
    ((value as RecentFileEntry).data === undefined ||
      typeof (value as RecentFileEntry).data === "string") &&
    ((value as RecentFileEntry).meta === undefined ||
      (typeof (value as RecentFileEntry).meta === "object" &&
        ((value as RecentFileEntry).meta?.title === undefined ||
          typeof (value as RecentFileEntry).meta?.title === "string") &&
        ((value as RecentFileEntry).meta?.questionCount === undefined ||
          typeof (value as RecentFileEntry).meta?.questionCount === "number")))
  );
}

interface LocalRecentPayload {
  version: number;
  items: RecentFileEntry[];
}

function clearLocalRecents() {
  if (typeof localStorage === "undefined") return;
  try {
    safeLocalStorageRemove(recentsLocal);
  } catch (error) {
    console.warn("Unable to clear local recent files", error);
  }
}

function readLocalRecents(): RecentFileEntry[] {
  if (typeof localStorage === "undefined") return [...memoryRecents];
  const stored = safeLocalStorageGet(recentsLocal);
  if (!stored) return [...memoryRecents];

  try {
    const parsed = JSON.parse(stored) as LocalRecentPayload | RecentFileEntry[];
    const items = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          (parsed as LocalRecentPayload).version === STORAGE_VERSIONS.recents &&
          Array.isArray((parsed as LocalRecentPayload).items)
        ? (parsed as LocalRecentPayload).items
        : null;

    if (!items) {
      clearLocalRecents();
      return [...memoryRecents];
    }

    const cleaned = items.filter(isRecentEntry);
    if (cleaned.length !== items.length) {
      clearLocalRecents();
      safeLocalStorageSet(
        recentsLocal,
        JSON.stringify({ version: STORAGE_VERSIONS.recents, items: cleaned }),
      );
    }
    return cleaned;
  } catch (error) {
    console.warn("Unable to parse local recent files; clearing cache", error);
    reportStorageIssue("We could not read your recent files from storage.");
    clearLocalRecents();
    return [...memoryRecents];
  }
}

function writeLocalRecents(entries: RecentFileEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (entries.length === 0) {
      clearLocalRecents();
      return;
    }
    safeLocalStorageSet(
      recentsLocal,
      JSON.stringify({ version: STORAGE_VERSIONS.recents, items: entries }),
    );
  } catch (error) {
    console.warn("Unable to persist recents to localStorage", error);
    reportStorageIssue(
      "We could not save your recent files; caching is disabled.",
    );
  }
}

function snapshotToMemory(entries: RecentFileEntry[]): void {
  memoryRecents.length = 0;
  memoryRecents.push(...entries);
}

function persistSnapshot(entries: RecentFileEntry[]): void {
  snapshotToMemory(entries);
  writeLocalRecents(entries);
}

function mergeEntry(
  list: RecentFileEntry[],
  entry: RecentFileEntry,
): RecentFileEntry[] {
  const existing = list.find((item) => item.name === entry.name);
  const merged: RecentFileEntry = {
    ...entry,
    data: entry.data ?? existing?.data,
    meta: entry.meta ?? existing?.meta,
  };
  const filtered = list.filter((item) => item.name !== entry.name);
  return sortRecents([merged, ...filtered]);
}

async function getRecentFilesFromDb(
  db: IDBPDatabase<SoloQuizDB>,
): Promise<RecentFileEntry[]> {
  const tx = db.transaction(recentsStore, "readonly");
  const all = await tx.store.getAll();
  return sortRecents(all);
}

export async function getRecentFiles(limit = 10): Promise<RecentFileEntry[]> {
  const db = await getDb();
  if (!db) {
    const local = readLocalRecents();
    persistSnapshot(sortRecents(local));
    return sortRecents(local).slice(0, limit);
  }

  const all = await getRecentFilesFromDb(db);
  persistSnapshot(all);
  return all.slice(0, limit);
}

export async function touchRecentFile(
  name: string,
  data?: string,
  meta?: RecentFileMeta,
): Promise<void> {
  const entry: RecentFileEntry = { name, lastOpened: Date.now(), data, meta };
  const db = await getDb();
  if (!db) {
    const updated = mergeEntry(readLocalRecents(), entry);
    persistSnapshot(updated);
    return;
  }

  const tx = db.transaction(recentsStore, "readwrite");
  await tx.store.put(entry);
  await tx.done;
  const snapshot = await getRecentFilesFromDb(db);
  persistSnapshot(snapshot);
}

export async function clearRecentFiles(): Promise<void> {
  const db = await getDb();
  if (!db) {
    persistSnapshot([]);
    clearLocalRecents();
    return;
  }

  const tx = db.transaction(recentsStore, "readwrite");
  await tx.store.clear();
  await tx.done;
  persistSnapshot([]);
  clearLocalRecents();
}
