import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "solo-quiz";
const STORE_RECENTS = "recent-files";
const LOCAL_STORAGE_KEY = "solo-quiz-recent-files";
const LOCAL_STORAGE_VERSION = 1;

export interface RecentFileEntry {
  name: string;
  lastOpened: number;
}

interface SoloQuizDB extends DBSchema {
  [STORE_RECENTS]: {
    key: string;
    value: RecentFileEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<SoloQuizDB> | null> | null = null;
const memoryRecents: RecentFileEntry[] = [];

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

async function getDb(): Promise<IDBPDatabase<SoloQuizDB> | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = openDB<SoloQuizDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_RECENTS)) {
          db.createObjectStore(STORE_RECENTS, { keyPath: "name" });
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
    typeof (value as RecentFileEntry).lastOpened === "number"
  );
}

interface LocalRecentPayload {
  version: number;
  items: RecentFileEntry[];
}

function clearLocalRecents() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear local recent files", error);
  }
}

function readLocalRecents(): RecentFileEntry[] {
  if (typeof localStorage === "undefined") return [...memoryRecents];
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) return [...memoryRecents];

  try {
    const parsed = JSON.parse(stored) as LocalRecentPayload | RecentFileEntry[];
    const items = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          (parsed as LocalRecentPayload).version === LOCAL_STORAGE_VERSION &&
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
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ version: LOCAL_STORAGE_VERSION, items: cleaned }),
      );
    }
    return cleaned;
  } catch (error) {
    console.warn("Unable to parse local recent files; clearing cache", error);
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
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ version: LOCAL_STORAGE_VERSION, items: entries }),
    );
  } catch (error) {
    console.warn("Unable to persist recents to localStorage", error);
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
  const filtered = list.filter((item) => item.name !== entry.name);
  return sortRecents([entry, ...filtered]);
}

async function getRecentFilesFromDb(
  db: IDBPDatabase<SoloQuizDB>,
): Promise<RecentFileEntry[]> {
  const tx = db.transaction(STORE_RECENTS, "readonly");
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

export async function touchRecentFile(name: string): Promise<void> {
  const entry: RecentFileEntry = { name, lastOpened: Date.now() };
  const db = await getDb();
  if (!db) {
    const updated = mergeEntry(readLocalRecents(), entry);
    persistSnapshot(updated);
    return;
  }

  const tx = db.transaction(STORE_RECENTS, "readwrite");
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

  const tx = db.transaction(STORE_RECENTS, "readwrite");
  await tx.store.clear();
  await tx.done;
  persistSnapshot([]);
  clearLocalRecents();
}
