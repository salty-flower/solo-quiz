# Solo Quiz architecture

Solo Quiz is a single-page Svelte application that runs fully in the browser. The key layers are:

- **Stores** (`src/lib/stores/*`): centralize quiz state (current assessment, answers, timers) and persistence (recent files, attempts, preferences, LLM workspaces). Derived stores keep UI sections in sync without prop drilling.
- **Components** (`src/lib/components/app/*`): render the quiz player UI (sidebar, question cards, navigation, header). Components receive simple props and rely on stores for derived values.
- **Utilities** (`src/lib/utils/*`): handle persistence safeguards, downloads, timers, and formatting helpers so components stay lean.
- **Review experience** (`src/lib/review/*`): implements the post-submission review flow, including comparison, diffing, and breakdown charts.
- **Schemas & validation** (`src/lib/schema.ts`): Zod schemas define the JSON assessment contract and are reused for runtime validation.

## Offline-first data flow

1. When an assessment is loaded, `quiz.loadAssessment` initializes answer state and starts the timer. State lives in Svelte stores.
2. Recent files and attempts are persisted to IndexedDB or localStorage (with safe fallbacks) via `storage.ts` and `stores/attempts.ts` so users can reload content offline.
3. Preferences such as theme and panel visibility are stored with stable keys from `constants.ts` and are reapplied on load.
4. Review data uses memoized diffing and cached attempts to avoid recomputing expensive operations while navigating between questions.

## Accessibility considerations

- Keyboard navigation and focus management are built into navigation handlers.
- Live regions announce question changes, and navigation buttons include textual status hints beyond color alone.
- Form controls and icon buttons include ARIA labels or `sr-only` text to keep the experience screen-reader friendly.
