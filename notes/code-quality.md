# Code quality audit

## Ordering questions start pre-answered
- `initializeAnswers` seeds ordering questions with the full `question.items` array, so submissions default to the authored order even if the learner never interacts with the prompt. Combined with `isAnswered` treating any non-empty ordering array as answered, ordering items can score correctly without user intent once a different question has been answered. Consider seeding ordering questions with an empty array and marking them answered only after a move to avoid auto-solving. 【F:src/lib/stores/quiz.ts†L28-L43】【F:src/lib/stores/quiz.ts†L124-L136】

## Router listeners never cleaned up
- The router store attaches `popstate` and `hashchange` listeners at module load and never unregisters them. In hot-module-reload or embedded contexts, repeated imports can accumulate listeners and fire duplicate updates. Providing a teardown API or scoped subscription would prevent leaks. 【F:src/lib/stores/router.ts†L36-L49】

## Dead code import in root view
- `App.svelte` imports `tick` but never uses it, signaling leftover code and adding noise to the bundle. Cleaning the import clarifies intent and avoids unnecessary Svelte runtime helpers. 【F:src/App.svelte†L1-L56】
