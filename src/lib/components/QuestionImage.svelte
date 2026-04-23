<script lang="ts">
import type { QuestionImage } from "../schema";

export let image: QuestionImage;
</script>

<figure class="space-y-2 overflow-hidden rounded-lg border bg-muted/20 p-3">
  <img
    src={image.url}
    alt={image.alt}
    class="max-h-96 w-full rounded-md object-contain"
    loading="lazy"
  />
  {#if image.caption}
    <figcaption class="text-xs leading-relaxed text-muted-foreground">
      {image.caption}
    </figcaption>
  {/if}
</figure>
