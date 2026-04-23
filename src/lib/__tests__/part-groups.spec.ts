import { describe, expect, it } from "vitest";
import { buildPartGroups } from "../utils/part-groups";
import type { Question } from "../schema";

const questions = [
  {
    id: "p1",
    type: "single",
    text: "Part a",
    part: { groupId: "group-1", label: "a", title: "Options Greek set" },
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
  },
  {
    id: "p2",
    type: "single",
    text: "Part b",
    part: { groupId: "group-1", label: "b" },
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
  },
  {
    id: "solo",
    type: "single",
    text: "Standalone",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
  },
] satisfies Question[];

describe("buildPartGroups", () => {
  it("groups contiguous parts under a shared heading", () => {
    const groups = buildPartGroups(questions);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.isMultipart).toBe(true);
    expect(groups[0]?.title).toBe("Options Greek set");
    expect(groups[0]?.entries.map((entry) => entry.partLabel)).toEqual([
      "a",
      "b",
    ]);
    expect(groups[1]?.isMultipart).toBe(false);
  });
});
