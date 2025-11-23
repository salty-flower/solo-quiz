import { reportStorageIssue } from "../storage-notices";

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch (_error) {
    reportStorageIssue("Browser storage is unavailable in this environment.");
    return false;
  }
}

export function safeLocalStorageGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch (_error) {
    reportStorageIssue(
      "Unable to read from localStorage; caching is disabled.",
    );
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    reportStorageIssue("Unable to persist data to localStorage.");
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch (_error) {
    reportStorageIssue("Unable to clear cached data from localStorage.");
  }
}
