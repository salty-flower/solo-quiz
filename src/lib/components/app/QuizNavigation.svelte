<script lang="ts">
import Button from "../ui/Button.svelte";

export let currentIndex = 0;
export let questionCount = 0;
export let navigateTo: (index: number) => void | Promise<void>;
export let resetAssessment: () => void;
export let submitDisabled = false;
export let submitQuiz: (autoSubmit: boolean) => void | Promise<void>;
export let noBackModeEnabled = false;
</script>

<div class="flex flex-wrap items-center justify-between gap-3">
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      on:click={() => navigateTo(currentIndex - 1)}
      disabled={currentIndex === 0 || noBackModeEnabled}
    >
      Previous
    </Button>
    <Button
      variant="outline"
      on:click={() => navigateTo(currentIndex + 1)}
      disabled={currentIndex === questionCount - 1}
    >
      Next
    </Button>
  </div>
  <div class="flex items-center gap-2">
    <Button variant="ghost" on:click={resetAssessment}>Reset answers</Button>
    <Button
      variant="destructive"
      disabled={submitDisabled}
      on:click={() => submitQuiz(false)}
    >
      Submit
    </Button>
  </div>
</div>
