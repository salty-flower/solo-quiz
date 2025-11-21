import { describe, expect, it } from "vitest";
import { buildDiffTokens, summarizeDiff } from "../review/diff";

describe("buildDiffTokens", () => {
  it("highlights additions and removals", () => {
    const tokens = buildDiffTokens("the quick fox", "quick brown fox");
    const adds = tokens.filter((token) => token.type === "add");
    const removes = tokens.filter((token) => token.type === "remove");
    expect(adds[0]?.text).toBe("brown");
    expect(removes[0]?.text).toBe("the");
  });

  it("summarizes diff counts", () => {
    const summary = summarizeDiff(buildDiffTokens("alpha beta", "beta gamma"));
    expect(summary.add).toBeGreaterThan(0);
    expect(summary.remove).toBeGreaterThan(0);
    expect(summary.match).toBe(1);
  });
});
