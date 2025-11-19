import { writable } from "svelte/store";

const initialPath =
  typeof window !== "undefined" ? window.location.pathname : "/";

function isReviewPath(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\/review\//.test(value);
}

let homePath = initialPath && !isReviewPath(initialPath) ? initialPath : "/";

const path = writable(initialPath || "/");

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const nextPath = window.location.pathname || "/";
    path.set(nextPath);
    if (!isReviewPath(nextPath)) {
      homePath = nextPath;
    }
  });
}

export const routePath = {
  subscribe: path.subscribe,
};

export function navigate(to: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === to) return;
  window.history.pushState({}, "", to);
  path.set(to);
  if (!isReviewPath(to)) {
    homePath = to || "/";
  }
}

export function getReviewPath(attemptId: string): string {
  const encoded = encodeURIComponent(attemptId);
  return `/review/${encoded}`;
}

export function getHomePath(): string {
  return homePath || "/";
}
