/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cwd } from "node:process";

describe("App teardown", () => {
  it("registers a teardown handler for component destruction", () => {
    const appSource = readFileSync(`${cwd()}/src/App.svelte`, "utf8");
    expect(appSource).toMatch(
      /onDestroy\(\(\) =>\s*{\s*teardown\(\);?\s*}\s*\)/,
    );
  });
});
