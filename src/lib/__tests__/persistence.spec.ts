import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as notices from "../storage-notices";
import {
  isIndexedDbAvailable,
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "../utils/persistence";

declare let indexedDB: unknown;

const originalLocalStorage = globalThis.localStorage;

function mockLocalStorageThrow(method: "getItem" | "setItem") {
  const store = {
    getItem: vi.fn(() => {
      if (method === "getItem") throw new Error("boom");
      return null;
    }),
    setItem: vi.fn(() => {
      if (method === "setItem") throw new Error("boom");
    }),
    removeItem: vi.fn(),
  } as unknown as Storage;
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
  });
});

describe("persistence helpers", () => {
  it("flags missing indexedDB support gracefully", () => {
    Object.defineProperty(globalThis, "indexedDB", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });
    expect(isIndexedDbAvailable()).toBe(false);
  });

  it("reports read errors", () => {
    const reporter = vi.spyOn(notices, "reportStorageIssue");
    mockLocalStorageThrow("getItem");
    const value = safeLocalStorageGet("key");
    expect(value).toBeNull();
    expect(reporter).toHaveBeenCalled();
  });

  it("reports write errors", () => {
    const reporter = vi.spyOn(notices, "reportStorageIssue");
    mockLocalStorageThrow("setItem");
    safeLocalStorageSet("key", "value");
    expect(reporter).toHaveBeenCalled();
  });
});
