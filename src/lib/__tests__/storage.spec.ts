import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("storage fallbacks", () => {
  it("surfaces a notice when IndexedDB is unavailable", async () => {
    const persistence = await import("../utils/persistence");
    const notices = await import("../storage-notices");
    const reportSpy = vi.spyOn(notices, "reportStorageIssue");
    vi.spyOn(persistence, "isIndexedDbAvailable").mockReturnValue(false);

    const { getRecentFiles } = await import("../storage");
    await getRecentFiles();

    expect(reportSpy).toHaveBeenCalledWith(
      "Persistent storage is unavailable; recent files will only be cached for this session.",
    );
  });
});
