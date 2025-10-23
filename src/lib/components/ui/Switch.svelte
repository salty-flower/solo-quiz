<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let checked = false;
  export let disabled = false;
  export let label: string | undefined;

  const dispatch = createEventDispatcher<{ change: boolean }>();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    dispatch("change", checked);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      event.preventDefault();
      toggle();
    }
  }
</script>

<button
  type="button"
  class={`inline-flex h-6 w-11 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
    checked ? "bg-primary" : "bg-muted"
  }`}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  on:click={toggle}
  on:keydown={handleKeydown}
  {disabled}
>
  <span
    class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
      checked ? "translate-x-5" : "translate-x-1"
    }`}
  ></span>
</button>
