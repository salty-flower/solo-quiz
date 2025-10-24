import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "solo-quiz";
const STORE_RECENTS = "recent-files";

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

export async function getRecentFiles(limit = 10): Promise<RecentFileEntry[]> {
  const db = await getDb();
  if (!db) {
    return sortRecents(memoryRecents).slice(0, limit);
  }

  const tx = db.transaction(STORE_RECENTS, "readonly");
  const all = await tx.store.getAll();
  return sortRecents(all).slice(0, limit);
}

export async function touchRecentFile(name: string): Promise<void> {
  const entry: RecentFileEntry = { name, lastOpened: Date.now() };
  const db = await getDb();
  if (!db) {
    const existingIndex = memoryRecents.findIndex((item) => item.name === name);
    if (existingIndex >= 0) {
      memoryRecents.splice(existingIndex, 1, entry);
    } else {
      memoryRecents.push(entry);
    }
    return;
  }

  const tx = db.transaction(STORE_RECENTS, "readwrite");
  await tx.store.put(entry);
  await tx.done;
}

export async function clearRecentFiles(): Promise<void> {
  const db = await getDb();
  if (!db) {
    memoryRecents.length = 0;
    return;
  }

  const tx = db.transaction(STORE_RECENTS, "readwrite");
  await tx.store.clear();
  await tx.done;
}
