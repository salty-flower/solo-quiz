# Contributor guidance

This repository uses Svelte, TailwindCSS, and shadcn-svelte to deliver offline-capable quiz builds. Follow these rules for any change inside this repo:

## Workflow
- Use `pnpm` for all package management and scripts.
- Keep both `cdn.html` and `standalone.html` flows working; avoid relying on network-only assets for offline paths.
- Prefer small, focused commits with descriptive messages.

## Code style
- Match existing Svelte/Tailwind patterns; keep components accessible (labels, focus states, ARIA as needed).
- Favor Zod validation and utility helpers already present rather than introducing new parsing approaches.

## Testing expectations
- Run `pnpm check` for routine edits. For changes affecting bundling or assets, also run `pnpm build` to verify both HTML outputs are produced.

## PR / summary notes
- Summaries should highlight user-visible behavior changes and any implications for offline usage.
- List every command you ran in the testing section of your PR or final summary.
