<script lang="ts">
import { slide } from "svelte/transition";
import { Download, Eye, EyeOff, Trash2, Upload } from "lucide-svelte";
import Button from "../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import Separator from "../ui/Separator.svelte";
import Switch from "../ui/Switch.svelte";
import type { Assessment, Question } from "../../schema";
import type { PanelVisibility, PanelKey } from "../../stores/preferences";
import type { RecentFileEntry } from "../../storage";
import type { ExampleAssessment } from "../../example-assessments";

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

export let assessment: Assessment | null = null;
export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let requireAllAnsweredChecked = false;
export let setRequireAllAnswered: (value: boolean) => void;
export let exampleAssessments: ExampleAssessment[] = [];
export let recentFiles: RecentFileEntry[] = [];
export let loadRecentAssessment: (
  file: RecentFileEntry,
) => Promise<void> | void;
export let clearHistory: () => void;
export let questions: Question[] = [];
export let questionNavStyles: (question: Question, index: number) => string;
export let navigateTo: (index: number) => void | Promise<void>;
export let downloadExampleAssessment: (id: string) => void;
export let handleFile: (file: File) => Promise<void> | void;

let fileInput: HTMLInputElement | null = null;
let dropActive = false;

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  void handleFile(files[0]);
  target.value = "";
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  dropActive = false;
  if (!event.dataTransfer) return;
  const file = event.dataTransfer.files?.[0];
  if (file) {
    void handleFile(file);
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  dropActive = true;
}

function onDragLeave(event: DragEvent) {
  event.preventDefault();
  dropActive = false;
}

function handleDropzoneKey(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput?.click();
  }
}
</script>

<aside class="w-full space-y-4 lg:w-64" transition:slide={{ duration: 200 }}>
  <Card>
    <CardHeader className="flex items-start justify-between space-y-0">
      <div>
        <CardTitle>Assessment</CardTitle>
        <CardDescription>Import JSON or drag & drop to get started.</CardDescription>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        aria-pressed={!panelVisibility.assessment}
        title={
          panelVisibility.assessment
            ? "Show assessment panel"
            : "Hide assessment panel"
        }
        on:click={() => togglePanel("assessment")}
      >
        {#if panelVisibility.assessment}
          <Eye class="h-4 w-4" aria-hidden="true" />
        {:else}
          <EyeOff class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">
          {panelVisibility.assessment ? "Show" : "Hide"} assessment panel
        </span>
      </Button>
    </CardHeader>
    {#if !panelVisibility.assessment}
      <CardContent className="space-y-4">
        <div
          class={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition ${
            dropActive ? "border-primary bg-primary/10" : "border-muted"
          }`}
          on:dragover|preventDefault={onDragOver}
          on:dragleave={onDragLeave}
          on:drop={onDrop}
          role="button"
          tabindex="0"
          aria-label="Load assessment JSON file"
          on:keydown={handleDropzoneKey}
        >
          <p class="font-medium">Drop JSON here</p>
          <p class="text-muted-foreground">or</p>
          <Button
            size="icon"
            variant="secondary"
            title="Choose file"
            on:click={() => fileInput?.click()}
          >
            <Upload class="h-4 w-4" aria-hidden="true" />
            <span class="sr-only">Choose file</span>
          </Button>
          <input
            class="hidden"
            type="file"
            accept="application/json"
            bind:this={fileInput}
            on:change={onFileInputChange}
          />
        </div>
        <Separator />
        <label class="flex items-center justify-between text-sm">
          <span>Require all answers before submit</span>
          <Switch
            checked={requireAllAnsweredChecked}
            label="Require all answers"
            on:change={(event) => setRequireAllAnswered(event.detail)}
          />
        </label>
        <Separator />
        <div class="space-y-2">
          <p class="text-sm font-medium">Example assessments</p>
          {#each exampleAssessments as example}
            <div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <p class="font-medium">{example.data.meta.title}</p>
              <Button
                size="icon"
                variant="outline"
                class="ml-auto"
                title={`Download ${example.data.meta.title}`}
                on:click={() => downloadExampleAssessment(example.id)}
              >
                <Download class="h-4 w-4" aria-hidden="true" />
                <span class="sr-only">Download {example.data.meta.title}</span>
              </Button>
            </div>
          {/each}
        </div>
      </CardContent>
    {/if}
  </Card>

  <Card>
    <CardHeader className="flex items-start justify-between space-y-0">
      <div>
        <CardTitle>Recent files</CardTitle>
        <CardDescription>Stored in IndexedDB or localStorage when available.</CardDescription>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        aria-pressed={!panelVisibility.recents}
        title={
          panelVisibility.recents ? "Show recent files" : "Hide recent files"
        }
        on:click={() => togglePanel("recents")}
      >
        {#if panelVisibility.recents}
          <Eye class="h-4 w-4" aria-hidden="true" />
        {:else}
          <EyeOff class="h-4 w-4" aria-hidden="true" />
        {/if}
        <span class="sr-only">
          {panelVisibility.recents ? "Show" : "Hide"} recent files
        </span>
      </Button>
    </CardHeader>
    {#if !panelVisibility.recents}
      <CardContent className="space-y-3">
        {#if recentFiles.length === 0}
          <p class="text-sm text-muted-foreground">No recent files yet.</p>
        {:else}
          <ul class="space-y-2 text-sm">
            {#each recentFiles as file}
              <li>
                <button
                  type="button"
                  class="flex w-full flex-col rounded-md border border-border px-3 py-2 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  on:click={() => loadRecentAssessment(file)}
                  title={`Load ${file.name}`}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="line-clamp-1 font-medium">
                      {file.meta?.title ?? file.name}
                    </span>
                    {#if file.meta?.questionCount != null}
                      <span class="text-xs text-muted-foreground">
                        {file.meta.questionCount}
                        {file.meta.questionCount === 1 ? " question" : " questions"}
                      </span>
                    {/if}
                  </div>
                  <span class="line-clamp-1 text-xs text-muted-foreground">{file.name}</span>
                  <span class="text-xs text-muted-foreground">{formatter.format(new Date(file.lastOpened))}</span>
                </button>
              </li>
            {/each}
          </ul>
          <Button
            variant="ghost"
            size="icon"
            title="Clear history"
            on:click={() => clearHistory()}
          >
            <Trash2 class="h-4 w-4" aria-hidden="true" />
            <span class="sr-only">Clear history</span>
          </Button>
        {/if}
      </CardContent>
    {/if}
  </Card>

  {#if assessment}
    <Card>
      <CardHeader className="flex items-start justify-between space-y-0">
        <div>
          <CardTitle>Questions</CardTitle>
          <CardDescription>Jump to any question.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
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
      </CardHeader>
      {#if !panelVisibility.questions}
        <CardContent>
          <nav class="grid grid-cols-5 gap-2 text-sm md:grid-cols-4 lg:grid-cols-3">
            {#each questions as question, index}
              <button
                type="button"
                class={`flex h-10 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${questionNavStyles(
                  question,
                  index,
                )}`}
                on:click={() => navigateTo(index)}
              >
                {index + 1}
              </button>
            {/each}
          </nav>
        </CardContent>
      {/if}
    </Card>
  {/if}
</aside>
