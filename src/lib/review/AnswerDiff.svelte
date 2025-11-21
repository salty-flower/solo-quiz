<script lang="ts">
import { renderWithKatex } from "../katex";
import type { DiffToken } from "./diff";
import { diffClass } from "./diff";

export let userAnswer: string;
export let referenceAnswer: string;
export let tokens: DiffToken[];
export let diffSummary: Record<DiffToken["type"], number>;
export let showDiffHighlight: boolean;
export let showFeedbackDetails: boolean;
export let feedback: string | null | undefined;
</script>

<div class="space-y-3 rounded-md border bg-muted/10 p-4 text-sm">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <p class="text-xs uppercase text-muted-foreground">Answer comparison</p>
      <p class="text-muted-foreground">
        Contrast your wording with the expected answer and call out gaps.
      </p>
    </div>
    <label class="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">
      <input
        type="checkbox"
        class="h-3 w-3 rounded border border-input accent-primary"
        bind:checked={showDiffHighlight}
      />
      Highlight differences
    </label>
  </div>
  <div class="grid gap-3 md:grid-cols-2">
    <div class="space-y-2 rounded-md border bg-background/80 p-3 leading-relaxed">
      <p class="text-xs uppercase text-muted-foreground">Your wording</p>
      {#if showDiffHighlight}
        {#if tokens.length === 0}
          <p class="text-muted-foreground">No answer provided.</p>
        {:else}
          <div class="flex flex-wrap gap-1 text-sm">
            {#each tokens as token, tokenIndex}
              <span class={`rounded px-1 ${diffClass(token, "user")}`}>
                {token.text}
              </span>
              {#if tokenIndex < tokens.length - 1}
                {" "}
              {/if}
            {/each}
          </div>
        {/if}
      {:else}
        <div class="text-sm text-foreground">
          {@html renderWithKatex(userAnswer || "—")}
        </div>
      {/if}
    </div>
    <div class="space-y-2 rounded-md border bg-background/80 p-3 leading-relaxed">
      <p class="text-xs uppercase text-muted-foreground">Reference wording</p>
      {#if showDiffHighlight}
        {#if tokens.length === 0}
          <p class="text-muted-foreground">No comparison available.</p>
        {:else}
          <div class="flex flex-wrap gap-1 text-sm">
            {#each tokens as token, tokenIndex}
              <span class={`rounded px-1 ${diffClass(token, "reference")}`}>
                {token.text}
              </span>
              {#if tokenIndex < tokens.length - 1}
                {" "}
              {/if}
            {/each}
          </div>
        {/if}
      {:else}
        <div class="text-sm text-foreground">
          {@html renderWithKatex(referenceAnswer || "—")}
        </div>
      {/if}
    </div>
  </div>
  <div class="flex flex-wrap gap-3 text-[0.75rem] text-muted-foreground">
    <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
      Matches: {diffSummary.match}
    </span>
    <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
      Missing: {diffSummary.add}
    </span>
    <span class="rounded-full bg-muted/70 px-2 py-1 font-medium text-foreground">
      Extra: {diffSummary.remove}
    </span>
  </div>
  <details class="rounded-md border bg-card/60 p-3" bind:open={showFeedbackDetails}>
    <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wide text-foreground">
      Reference explanation
    </summary>
    <div class="mt-2 text-muted-foreground">
      {@html renderWithKatex(feedback ?? "No explanation was provided for this question.")}
    </div>
  </details>
</div>
