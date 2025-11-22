# Solo Quiz Player

A local-first quiz runner built with Svelte, TailwindCSS, and shadcn-svelte components. Import JSON assessments, take them entirely offline, review answers with detailed scoring, and export attempt data as CSV.

## Features

- ✅ Works under `file://` with an all-in-one `standalone.html`
- ✅ Lightweight `cdn.html` build that pulls KaTeX from jsDelivr when online
- ✅ Drag-and-drop or file picker JSON import with zod validation and friendly error reporting
- ✅ Supports single, multi, fill-in-the-blank, numeric, and ordering questions with per-question weighting and feedback
- ✅ Optional shared contexts so multiple questions can reference the same passage or scenario
- ✅ Review dialog with scoring summary, KaTeX rendering, and CSV export
- ✅ IndexedDB powered recent file list with in-memory fallback
- ✅ Dark/light theme toggle and fully keyboard accessible controls

Download the bundled HTML from `dist/standalone.html` to run completely offline. When hosted (for example via GitHub Pages), both `cdn.html` and `standalone.html` are published so you can choose between fast-first-load or offline usage.

## Getting started

```bash
pnpm install
pnpm dev      # local development server
pnpm build    # produce dist/standalone.html and dist/cdn.html
pnpm check    # biome lint + tsc --noEmit + svelte-check
```

The sample assessment at [`examples/sample-assessment.json`](examples/sample-assessment.json) exercises every question type and can be used while developing.

## Manual QA checklist

1. `pnpm build` – ensure both HTML outputs are created.
2. Open `dist/standalone.html` directly from disk with Wi-Fi disabled. Load `examples/sample-assessment.json`, complete the quiz, verify scoring, review dialog, and CSV export.
3. Retake and confirm answer reset works as expected.
4. Re-open `dist/cdn.html` with the network on. Confirm KaTeX assets load from jsDelivr and questions render properly.
5. Trigger timer expiry by lowering `timeLimitSec` in a test assessment and observing auto-submit.
6. Verify drag-and-drop plus file picker both import assessments.
7. Inspect IndexedDB (or memory fallback) for recent file metadata persistence.

## Deployment

GitHub Actions (`.github/workflows/gh-pages.yml`) builds both targets and publishes `dist/` to GitHub Pages. The published site exposes `cdn.html` (fast online) and `standalone.html` (download for offline use).

## License

[MIT](LICENSE)
