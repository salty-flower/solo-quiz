<script lang="ts">
import { Eye, EyeOff } from "lucide-svelte";
import { slide } from "svelte/transition";
import Button from "../../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import type { Question } from "../../../schema";
import type { PanelKey, PanelVisibility } from "../../../stores/preferences";

export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let questions: Question[] = [];
export let questionNavStatus: (
  question: Question,
  index: number,
) => { label: string; indicator: string };
export let questionNavStyles: (question: Question, index: number) => string;
export let navigateTo: (index: number) => void | Promise<void>;
</script>

<Card>
  <CardHeader className="space-y-2">
    <div class="flex items-start gap-2">
      <CardTitle className="flex-1">Questions</CardTitle>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto h-8 w-8"
        aria-pressed={!panelVisibility.questions}
        title={
          panelVisibility.questions
            ? "Show question navigator"
            : "Hide question navigator"
        }
        on:click={() => togglePanel("questions")}
      >
        {#if panelVisibility.questions}
          <Eye class="h-4 w-4" aria-hidden="true" />
        {:else}
          <EyeOff class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">
          {panelVisibility.questions ? "Show" : "Hide"} question list
        </span>
      </Button>
    </div>
    <CardDescription>Jump to any question.</CardDescription>
  </CardHeader>
  {#if !panelVisibility.questions}
    <div transition:slide={{ duration: 200 }}>
      <CardContent>
        <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
          {#each questions as question, index}
            {@const status = questionNavStatus(question, index)}
            <button
              type="button"
              class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${questionNavStyles(
                question,
                index,
              )}`}
              on:click={() => navigateTo(index)}
              aria-label={status.label}
              title={status.label}
            >
              <span aria-hidden="true" class="mr-1 text-xs">{status.indicator}</span>
              <span aria-hidden="true">{index + 1}</span>
              <span class="sr-only">{status.label}</span>
            </button>
          {/each}
        </nav>
      </CardContent>
    </div>
  {/if}
</Card>
