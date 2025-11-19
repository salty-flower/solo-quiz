<script lang="ts">
import { Moon, PanelLeft, PanelRight, Sun } from "lucide-svelte";
import type { Assessment } from "../../schema";
import type { Theme } from "../../stores/preferences";
import Button from "../ui/Button.svelte";
import Progress from "../ui/Progress.svelte";

export let assessment: Assessment | null = null;
export let timeLimitSec: number | null = null;
export let timeDisplay: string;
export let answeredCount = 0;
export let totalQuestions = 0;
export let progressValue = 0;
export let sidebarVisible = true;
export let toggleSidebar: () => void;
export let theme: Theme = "light";
export let cycleTheme: () => void;
</script>

<header class="border-b bg-card/30 backdrop-blur">
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Solo Quiz Player</h1>
      {#if assessment}
        <p class="text-sm text-muted-foreground">{assessment.meta.title}</p>
      {:else}
        <p class="text-sm text-muted-foreground">Load an assessment JSON to begin.</p>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-3 sm:justify-end">
      <Button
        variant="outline"
        size="icon"
        class="h-9"
        aria-pressed={sidebarVisible}
        title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
        on:click={toggleSidebar}
      >
        {#if sidebarVisible}
          <PanelLeft class="h-4 w-4" aria-hidden="true" />
        {:else}
          <PanelRight class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">{sidebarVisible ? "Hide sidebar" : "Show sidebar"}</span>
      </Button>
      {#if assessment}
        <div class="rounded-md border px-3 py-1 text-sm">
          <span class="font-medium">{timeLimitSec ? "Time Remaining" : "Elapsed"}:</span>
          <span class="ml-2 font-mono">{timeDisplay}</span>
        </div>
        <div class="w-40">
          <Progress value={progressValue} />
          <p class="mt-1 text-xs text-muted-foreground">
            {answeredCount} / {totalQuestions} answered
          </p>
        </div>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        class="h-9"
        aria-pressed={theme === "dark"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        on:click={cycleTheme}
      >
        {#if theme === "dark"}
          <Moon class="h-4 w-4" aria-hidden="true" />
        {:else}
          <Sun class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </span>
      </Button>
    </div>
  </div>
</header>
