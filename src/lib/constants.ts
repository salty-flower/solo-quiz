export const STORAGE_KEYS = {
  attemptsDbName: "solo-quiz-attempts",
  attemptsStore: "attempts",
  attemptsLocal: "solo-quiz-attempts-v1",
  recentsDbName: "solo-quiz",
  recentsStore: "recent-files",
  recentsLocal: "solo-quiz-recent-files",
  panelVisibility: "solo-quiz-panel-visibility-v1",
  sidebarVisible: "solo-quiz-sidebar-visible-v1",
  theme: "solo-quiz-theme",
  workspaceVisibility: "solo-quiz-llm-workspace-visibility-v1",
} as const;

export const STORAGE_VERSIONS = {
  recents: 1,
} as const;

export const TIMER_INTERVAL_MS = 1000;
export const MAX_STORED_ATTEMPTS = 10;
