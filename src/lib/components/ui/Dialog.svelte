<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";

export let open = false;
export let title = "Dialog";

const dispatch = createEventDispatcher<{ close: undefined }>();
let previousFocus: HTMLElement | null = null;
let dialogEl: HTMLDivElement | null = null;

function close() {
  dispatch("close");
}

function handleKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    close();
  }
}

onMount(() => {
  if (open && typeof document !== "undefined") {
    previousFocus = document.activeElement as HTMLElement | null;
    dialogEl?.focus();
  }
});

$: if (open && typeof document !== "undefined") {
  previousFocus = document.activeElement as HTMLElement | null;
  setTimeout(() => dialogEl?.focus(), 0);
} else if (!open && previousFocus) {
  previousFocus.focus();
  previousFocus = null;
}
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    aria-hidden="true"
    on:click={() => close()}
  >
    <div
      class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      bind:this={dialogEl}
      on:keydown={handleKey}
      on:click|stopPropagation
    >
      <header class="mb-4 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">{title}</h2>
        <button
          type="button"
          class="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
          on:click={close}
          aria-label="Close dialog"
        >
          ✕
        </button>
      </header>
      <div class="space-y-4">
        <slot />
      </div>
    </div>
  </div>
{/if}
