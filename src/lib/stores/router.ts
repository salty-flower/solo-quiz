import { writable } from "svelte/store";

const initialPath =
  typeof window !== "undefined" ? window.location.pathname : "/";

const path = writable(initialPath || "/");

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    path.set(window.location.pathname || "/");
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
}

export function getReviewPath(attemptId: string): string {
  const encoded = encodeURIComponent(attemptId);
  return `/review/${encoded}`;
}

export const HOME_PATH = initialPath || "/";
