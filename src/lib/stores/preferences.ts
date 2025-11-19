import { writable } from "svelte/store";

export type Theme = "light" | "dark";
export type PanelKey = "assessment" | "recents" | "questions";
export type PanelVisibility = Record<PanelKey, boolean>;

const PANEL_STORAGE_KEY = "solo-quiz-panel-visibility-v1";
const SIDEBAR_STORAGE_KEY = "solo-quiz-sidebar-visible-v1";
const THEME_STORAGE_KEY = "solo-quiz-theme";

const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  assessment: false,
  recents: false,
  questions: false,
};

const SYSTEM_PREFERS_DARK = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function loadTheme(): Theme {
  if (typeof localStorage === "undefined") {
    return SYSTEM_PREFERS_DARK() ? "dark" : "light";
  }

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return SYSTEM_PREFERS_DARK() ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
}

function loadPanelVisibility(): PanelVisibility {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_PANEL_VISIBILITY };
  }

  const stored = localStorage.getItem(PANEL_STORAGE_KEY);
  if (!stored) {
    return { ...DEFAULT_PANEL_VISIBILITY };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<PanelVisibility>;
    const result: PanelVisibility = { ...DEFAULT_PANEL_VISIBILITY };
    for (const key of Object.keys(result) as PanelKey[]) {
      if (typeof parsed[key] === "boolean") {
        result[key] = parsed[key] as boolean;
      }
    }
    return result;
  } catch (error) {
    console.warn("Unable to parse panel preferences; resetting", error);
    localStorage.removeItem(PANEL_STORAGE_KEY);
    return { ...DEFAULT_PANEL_VISIBILITY };
  }
}

function savePanelVisibility(value: PanelVisibility) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to store panel preferences", error);
  }
}

function loadSidebarVisibility() {
  if (typeof localStorage === "undefined") return true;
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === null) return true;
    return JSON.parse(stored) === true;
  } catch (error) {
    console.warn("Unable to parse sidebar preference; resetting", error);
    localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    return true;
  }
}

function saveSidebarVisibility(value: boolean) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    console.warn("Unable to store sidebar preference", error);
  }
}

function saveTheme(theme: Theme) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function createPreferencesStore() {
  const theme = writable<Theme>(loadTheme());
  const panelVisibility = writable<PanelVisibility>(loadPanelVisibility());
  const sidebarVisible = writable<boolean>(loadSidebarVisibility());

  theme.subscribe((value) => {
    applyTheme(value);
    saveTheme(value);
  });

  panelVisibility.subscribe((value) => {
    savePanelVisibility(value);
  });

  sidebarVisible.subscribe((value) => {
    saveSidebarVisibility(value);
  });

  function togglePanel(key: PanelKey) {
    panelVisibility.update((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleSidebar() {
    sidebarVisible.update((value) => !value);
  }

  function setTheme(value: Theme) {
    theme.set(value);
  }

  function cycleTheme() {
    theme.update((value) => (value === "dark" ? "light" : "dark"));
  }

  return {
    theme,
    panelVisibility,
    sidebarVisible,
    togglePanel,
    toggleSidebar,
    setTheme,
    cycleTheme,
  };
}

export const preferences = createPreferencesStore();
