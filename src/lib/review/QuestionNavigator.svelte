<script lang="ts">
import { createEventDispatcher } from "svelte";
import { renderWithKatex } from "../katex";
import type { QuestionResult, ResultStatus } from "../results";
import { statusMeta } from "./status";

export let visibleEntries: { result: QuestionResult; index: number }[] = [];
export let statusFilter: ResultStatus | "all";
export let sortMode: "original" | "status" | "question";
export let searchTerm: string;
export let searchInputId: string;
export let activeIndex: number;

const dispatch = createEventDispatcher<{
  select: number;
  filter: ResultStatus | "all";
  sort: "original" | "status" | "question";
  search: string;
}>();

function updateFilter(value: ResultStatus | "all") {
  dispatch("filter", value);
}

function updateSort(event: Event) {
  dispatch(
    "sort",
    (event.target as HTMLSelectElement).value as typeof sortMode,
  );
}

function updateSearch(event: Event) {
  dispatch("search", (event.target as HTMLInputElement).value);
}
</script>

<aside class="lg:w-72">
  <div class="rounded-lg border bg-card">
    <div class="space-y-3 border-b px-4 py-3">
      <div class="flex items-center justify-between text-sm font-semibold">
        <span>Question navigator</span>
        <span class="text-xs font-normal text-muted-foreground">Arrow keys supported</span>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each [
          { value: "all", label: "All" },
          { value: "incorrect", label: "Incorrect" },
          { value: "pending", label: "Pending" },
          { value: "correct", label: "Correct" },
        ] as filter}
          <button
            class={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              statusFilter === filter.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-input"
            }`}
            on:click={() => updateFilter(filter.value as ResultStatus | "all")}
          >
            {filter.label}
          </button>
        {/each}
      </div>
      <div class="space-y-2 text-xs">
        <label
          class="font-semibold uppercase tracking-wide text-muted-foreground"
          for={searchInputId}
        >
          Search & sort
        </label>
        <input
          class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Search text, tags, or answers"
          id={searchInputId}
          value={searchTerm}
          on:input={updateSearch}
          aria-label="Search results"
        />
        <select
          class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={sortMode}
          on:change={updateSort}
          aria-label="Sort results"
        >
          <option value="original">Original order</option>
          <option value="status">Status</option>
          <option value="question">Question text A–Z</option>
        </select>
      </div>
    </div>
    <div class="max-h-[70vh] space-y-2 overflow-y-auto p-3">
      {#if visibleEntries.length === 0}
        <p class="text-sm text-muted-foreground">No questions match the current filters.</p>
      {:else}
        {#each visibleEntries as entry (entry.result.question.id)}
          {@const meta = statusMeta(entry.result)}
          <button
            class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
              activeIndex === entry.index
                ? "border-primary bg-primary/10"
                : "border-transparent hover:border-input"
            }`}
            aria-current={activeIndex === entry.index ? "true" : undefined}
            on:click={() => dispatch("select", entry.index)}
          >
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="font-semibold text-foreground">Question {entry.index + 1}</span>
              <span class={`font-semibold ${meta.textClass}`}>{meta.label}</span>
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              {@html renderWithKatex(entry.result.question.text)}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</aside>
