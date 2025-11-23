import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";
import App from "./App.svelte";
import { quiz } from "./lib/stores/quiz";

describe("App", () => {
  it("cleans up quiz timers when destroyed", async () => {
    const teardownSpy = vi.spyOn(quiz, "teardown");

    const app = new App({ target: document.body });
    await tick();
    app.$destroy();

    expect(teardownSpy).toHaveBeenCalled();
  });
});
