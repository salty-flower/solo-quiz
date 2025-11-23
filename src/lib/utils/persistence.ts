import { reportStorageIssue } from "../storage-notices";

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch (error) {
    console.error("IndexedDB availability check failed:", error);
    reportStorageIssue("Browser storage is unavailable in this environment.");
    return false;
  }
}

export function safeLocalStorageGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error("localStorage get failed:", error);
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
  } catch (error) {
    console.error("localStorage set failed:", error);
    reportStorageIssue("Unable to persist data to localStorage.");
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("localStorage remove failed:", error);
    reportStorageIssue("Unable to clear cached data from localStorage.");
  }
}
