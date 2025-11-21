import { get, writable } from "svelte/store";
import {
  llmFeedbackSchema,
  type LlmFeedback,
  type SubjectiveQuestion,
} from "../schema";

type FeedbackInputs = Record<string, string>;
type FeedbackErrors = Record<string, string | null>;
type FeedbackResults = Record<string, LlmFeedback | undefined>;
type WorkspaceMap = Record<string, GradingWorkspace | undefined>;
type WorkspaceErrors = Record<string, string | null>;
type WorkspaceVisibilityMap = Record<string, boolean | undefined>;

type RubricWorkspaceEntry = {
  rubric: string;
  description?: string;
  achievedFraction: number;
  comments: string;
};

type GradingWorkspace = {
  verdict: LlmFeedback["verdict"];
  score: number;
  maxScore: number;
  feedback: string;
  improvements: string[];
  rubricBreakdown: RubricWorkspaceEntry[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const WORKSPACE_VISIBILITY_STORAGE_KEY =
  "solo-quiz-llm-workspace-visibility-v1";

function loadWorkspaceVisibility(): WorkspaceVisibilityMap {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const stored = localStorage.getItem(WORKSPACE_VISIBILITY_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as WorkspaceVisibilityMap;
    if (parsed && typeof parsed === "object") {
      return { ...parsed };
    }
    return {};
  } catch (error) {
    console.warn(
      "Unable to parse workspace visibility settings; resetting",
      error,
    );
    localStorage.removeItem(WORKSPACE_VISIBILITY_STORAGE_KEY);
    return {};
  }
}

function saveWorkspaceVisibility(value: WorkspaceVisibilityMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WORKSPACE_VISIBILITY_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch (error) {
    console.warn("Unable to persist workspace visibility", error);
  }
}

function buildWorkspace(
  rubrics: SubjectiveQuestion["rubrics"],
  maxScore: number,
  existing?: GradingWorkspace,
): GradingWorkspace {
  const rubricBreakdown = rubrics.map((rubric, index) => {
    const previous = existing?.rubricBreakdown.find(
      (entry) => entry.rubric === rubric.title,
    );
    return {
      rubric: rubric.title,
      description: rubric.description,
      achievedFraction: previous?.achievedFraction ?? 0,
      comments: previous?.comments ?? "",
    } satisfies RubricWorkspaceEntry;
  });

  return {
    verdict: existing?.verdict ?? "partial",
    score: clamp(existing?.score ?? 0, 0, maxScore),
    maxScore,
    feedback: existing?.feedback ?? "",
    improvements: existing?.improvements ?? [],
    rubricBreakdown,
  } satisfies GradingWorkspace;
}

function normalizeWorkspacePayload(workspace: GradingWorkspace): LlmFeedback {
  const payload: LlmFeedback = {
    verdict: workspace.verdict,
    score: clamp(workspace.score, 0, workspace.maxScore),
    maxScore: workspace.maxScore,
    feedback: workspace.feedback.trim(),
    improvements: workspace.improvements
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    rubricBreakdown: workspace.rubricBreakdown.map((entry) => ({
      rubric: entry.rubric,
      comments: entry.comments.trim(),
      achievedFraction: clamp(entry.achievedFraction, 0, 1),
    })),
  };

  return llmFeedbackSchema.parse(payload) as LlmFeedback;
}

function createLlmStore() {
  const inputs = writable<FeedbackInputs>({});
  const errors = writable<FeedbackErrors>({});
  const results = writable<FeedbackResults>({});
  const copiedPromptQuestionId = writable<string | null>(null);
  const promptCopyError = writable<string | null>(null);
  const workspaces = writable<WorkspaceMap>({});
  const workspaceErrors = writable<WorkspaceErrors>({});
  const workspaceVisibility = writable<WorkspaceVisibilityMap>(
    loadWorkspaceVisibility(),
  );

  workspaceVisibility.subscribe((value) => {
    saveWorkspaceVisibility(value);
  });

  function reset() {
    inputs.set({});
    errors.set({});
    results.set({});
    copiedPromptQuestionId.set(null);
    promptCopyError.set(null);
    workspaces.set({});
    workspaceErrors.set({});
  }

  function setInput(questionId: string, value: string) {
    inputs.update((prev) => ({ ...prev, [questionId]: value }));
  }

  function initializeWorkspace(
    questionId: string,
    params: { rubrics: SubjectiveQuestion["rubrics"]; maxScore: number },
  ) {
    workspaces.update((prev) => {
      const existing = prev[questionId];
      if (existing) {
        const needsUpdate =
          existing.maxScore !== params.maxScore ||
          existing.rubricBreakdown.length !== params.rubrics.length ||
          params.rubrics.some(
            (rubric, index) =>
              existing.rubricBreakdown[index]?.rubric !== rubric.title,
          );
        if (!needsUpdate) {
          return prev;
        }
      }

      return {
        ...prev,
        [questionId]: buildWorkspace(
          params.rubrics,
          params.maxScore,
          existing ?? undefined,
        ),
      } as WorkspaceMap;
    });
  }

  function updateWorkspace(
    questionId: string,
    updater: (workspace: GradingWorkspace) => GradingWorkspace,
  ) {
    workspaces.update((prev) => {
      const existing = prev[questionId];
      if (!existing) return prev;
      return { ...prev, [questionId]: updater(existing) } as WorkspaceMap;
    });
  }

  function setWorkspaceVerdict(
    questionId: string,
    verdict: GradingWorkspace["verdict"],
  ) {
    updateWorkspace(questionId, (workspace) => ({ ...workspace, verdict }));
  }

  function setWorkspaceScore(questionId: string, score: number) {
    updateWorkspace(questionId, (workspace) => ({
      ...workspace,
      score: clamp(score, 0, workspace.maxScore),
    }));
  }

  function setWorkspaceFeedback(questionId: string, feedback: string) {
    updateWorkspace(questionId, (workspace) => ({ ...workspace, feedback }));
  }

  function setWorkspaceRubricFraction(
    questionId: string,
    index: number,
    fraction: number,
  ) {
    updateWorkspace(questionId, (workspace) => {
      const rubricBreakdown = workspace.rubricBreakdown.map(
        (entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, achievedFraction: clamp(fraction, 0, 1) }
            : entry,
      );
      return { ...workspace, rubricBreakdown };
    });
  }

  function setWorkspaceRubricComments(
    questionId: string,
    index: number,
    comments: string,
  ) {
    updateWorkspace(questionId, (workspace) => {
      const rubricBreakdown = workspace.rubricBreakdown.map(
        (entry, entryIndex) =>
          entryIndex === index ? { ...entry, comments } : entry,
      );
      return { ...workspace, rubricBreakdown };
    });
  }

  function addWorkspaceImprovement(questionId: string) {
    updateWorkspace(questionId, (workspace) => ({
      ...workspace,
      improvements: [...workspace.improvements, ""],
    }));
  }

  function updateWorkspaceImprovement(
    questionId: string,
    index: number,
    value: string,
  ) {
    updateWorkspace(questionId, (workspace) => ({
      ...workspace,
      improvements: workspace.improvements.map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ),
    }));
  }

  function removeWorkspaceImprovement(questionId: string, index: number) {
    updateWorkspace(questionId, (workspace) => ({
      ...workspace,
      improvements: workspace.improvements.filter(
        (_, entryIndex) => entryIndex !== index,
      ),
    }));
  }

  function hydrateWorkspaceFromFeedback(
    questionId: string,
    feedback: LlmFeedback,
    maxScore: number,
  ) {
    workspaces.update((prev) => {
      const existing = prev[questionId];
      const rubricBreakdown = feedback.rubricBreakdown.map((entry, index) => {
        const template = existing?.rubricBreakdown.find(
          (rubric) => rubric.rubric === entry.rubric,
        );
        return {
          rubric: entry.rubric,
          description: template?.description,
          achievedFraction: entry.achievedFraction,
          comments: entry.comments,
        } satisfies RubricWorkspaceEntry;
      });

      return {
        ...prev,
        [questionId]: {
          verdict: feedback.verdict,
          score: clamp(feedback.score, 0, maxScore),
          maxScore,
          feedback: feedback.feedback,
          improvements: feedback.improvements ?? [],
          rubricBreakdown,
        },
      } as WorkspaceMap;
    });
  }

  function writeWorkspaceToInput(questionId: string): string | null {
    const workspace = get(workspaces)[questionId];
    if (!workspace) {
      workspaceErrors.update((prev) => ({
        ...prev,
        [questionId]: "Initialize the workspace before generating JSON.",
      }));
      return null;
    }

    try {
      const payload = normalizeWorkspacePayload(workspace);
      const json = JSON.stringify(payload, null, 2);
      setInput(questionId, json);
      workspaceErrors.update((prev) => ({ ...prev, [questionId]: null }));
      return json;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Workspace values are invalid. Review the fields above.";
      workspaceErrors.update((prev) => ({ ...prev, [questionId]: message }));
      return null;
    }
  }

  function applyFeedback(questionId: string, maxScore: number) {
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
      const sanitized: LlmFeedback = {
        ...feedback,
        maxScore,
        score: clamp(feedback.score, 0, maxScore),
      };
      results.update((prev) => ({ ...prev, [questionId]: sanitized }));
      errors.update((prev) => ({ ...prev, [questionId]: null }));
      hydrateWorkspaceFromFeedback(questionId, sanitized, maxScore);
      workspaceErrors.update((prev) => ({ ...prev, [questionId]: null }));
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
    workspaceErrors.update((prev) => ({ ...prev, [questionId]: null }));
  }

  function setCopiedPromptQuestionId(value: string | null) {
    copiedPromptQuestionId.set(value);
  }

  function setPromptCopyError(message: string | null) {
    promptCopyError.set(message);
  }

  function toggleWorkspaceVisibility(questionId: string) {
    workspaceVisibility.update((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  return {
    inputs,
    errors,
    results,
    workspaces,
    workspaceErrors,
    workspaceVisibility,
    copiedPromptQuestionId,
    promptCopyError,
    reset,
    setInput,
    initializeWorkspace,
    setWorkspaceVerdict,
    setWorkspaceScore,
    setWorkspaceFeedback,
    setWorkspaceRubricFraction,
    setWorkspaceRubricComments,
    addWorkspaceImprovement,
    updateWorkspaceImprovement,
    removeWorkspaceImprovement,
    writeWorkspaceToInput,
    hydrateWorkspaceFromFeedback,
    applyFeedback,
    clearFeedback,
    setCopiedPromptQuestionId,
    setPromptCopyError,
    toggleWorkspaceVisibility,
  };
}

export const llm = createLlmStore();
