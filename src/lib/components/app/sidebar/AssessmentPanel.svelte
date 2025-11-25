<script lang="ts">
import { ClipboardPaste, Download, Eye, EyeOff, Upload } from "lucide-svelte";
import Button from "../../ui/Button.svelte";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";
import Separator from "../../ui/Separator.svelte";
import Switch from "../../ui/Switch.svelte";
import type { ExampleAssessment } from "../../../example-assessments";
import type { PanelKey, PanelVisibility } from "../../../stores/preferences";

export let panelVisibility: PanelVisibility;
export let togglePanel: (key: PanelKey) => void;
export let requireAllAnsweredChecked = false;
export let setRequireAllAnswered: (value: boolean) => void;
export let exampleAssessments: ExampleAssessment[] = [];
export let downloadExampleAssessment: (id: string) => void;
export let handleFile: (file: File) => Promise<void> | void;
export let clipboardSupported = false;
export let importFromClipboard: () => Promise<void> | void;

let fileInput: HTMLInputElement | null = null;

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = target.files;
  if (!files || files.length === 0) return;
  void handleFile(files[0]);
  target.value = "";
}
</script>

<Card>
  <CardHeader className="space-y-2">
    <div class="flex items-start gap-2">
      <CardTitle className="flex-1">Assessment</CardTitle>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto h-8 w-8"
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
    </div>
    <CardDescription>
      Load a JSON assessment from a file or your clipboard.
    </CardDescription>
  </CardHeader>
  {#if !panelVisibility.assessment}
    <CardContent className="space-y-4">
      <div class="flex items-start gap-3">
        <div class="flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            class="shrink-0"
            title="Import assessment from file"
            on:click={() => fileInput?.click()}
          >
            <Upload class="h-4 w-4" aria-hidden="true" />
            <span class="sr-only">Import assessment from file</span>
          </Button>
          {#if clipboardSupported}
            <Button
              size="icon"
              variant="secondary"
              class="shrink-0"
              title="Import assessment from clipboard"
              on:click={() => void importFromClipboard?.()}
            >
              <ClipboardPaste class="h-4 w-4" aria-hidden="true" />
              <span class="sr-only">Import assessment from clipboard</span>
            </Button>
          {/if}
        </div>
        <p class="text-xs text-muted-foreground">
          Drag and drop a JSON file anywhere on this sidebar.
        </p>
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
