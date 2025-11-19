import { get, writable } from "svelte/store";
import { llmFeedbackSchema, type LlmFeedback } from "../schema";

type FeedbackInputs = Record<string, string>;
type FeedbackErrors = Record<string, string | null>;
type FeedbackResults = Record<string, LlmFeedback | undefined>;

function createLlmStore() {
  const inputs = writable<FeedbackInputs>({});
  const errors = writable<FeedbackErrors>({});
  const results = writable<FeedbackResults>({});
  const copiedPromptQuestionId = writable<string | null>(null);
  const promptCopyError = writable<string | null>(null);

  function reset() {
    inputs.set({});
    errors.set({});
    results.set({});
    copiedPromptQuestionId.set(null);
    promptCopyError.set(null);
  }

  function setInput(questionId: string, value: string) {
    inputs.update((prev) => ({ ...prev, [questionId]: value }));
  }

  function applyFeedback(questionId: string) {
    const raw = get(inputs)[questionId]?.trim();
    if (!raw) {
      errors.update((prev) => ({
        ...prev,
        [questionId]: "Paste the JSON feedback before applying.",
      }));
      results.update((prev) => ({ ...prev, [questionId]: undefined }));
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const feedback = llmFeedbackSchema.parse(parsed) as LlmFeedback;
      results.update((prev) => ({ ...prev, [questionId]: feedback }));
      errors.update((prev) => ({ ...prev, [questionId]: null }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to parse feedback. Ensure valid JSON.";
      errors.update((prev) => ({ ...prev, [questionId]: message }));
      results.update((prev) => ({ ...prev, [questionId]: undefined }));
    }
  }

  function clearFeedback(questionId: string) {
    inputs.update((prev) => ({ ...prev, [questionId]: "" }));
    errors.update((prev) => ({ ...prev, [questionId]: null }));
    results.update((prev) => ({ ...prev, [questionId]: undefined }));
  }

  function setCopiedPromptQuestionId(value: string | null) {
    copiedPromptQuestionId.set(value);
  }

  function setPromptCopyError(message: string | null) {
    promptCopyError.set(message);
  }

  return {
    inputs,
    errors,
    results,
    copiedPromptQuestionId,
    promptCopyError,
    reset,
    setInput,
    applyFeedback,
    clearFeedback,
    setCopiedPromptQuestionId,
    setPromptCopyError,
  };
}

export const llm = createLlmStore();
