import { writable } from "svelte/store";

const REVIEW_SEGMENT = "/review/";

const initialPath =
  typeof window !== "undefined" ? window.location.pathname : "/";

function isReviewPath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.includes(REVIEW_SEGMENT);
}

function deriveBasePath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  if (pathname === "/") return pathname;
  const reviewIndex = pathname.indexOf(REVIEW_SEGMENT);
  if (reviewIndex >= 0) {
    const prefix = pathname.slice(0, reviewIndex);
    return prefix || "/";
  }
  return pathname;
}

function trimTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

let basePath = deriveBasePath(initialPath);

let homePath =
  initialPath && !isReviewPath(initialPath) ? initialPath : basePath;

const path = writable(initialPath || "/");

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const nextPath = window.location.pathname || "/";
    path.set(nextPath);
    if (!isReviewPath(nextPath)) {
      homePath = nextPath;
      basePath = deriveBasePath(nextPath);
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
    basePath = deriveBasePath(homePath);
  }
}

export function getReviewPath(attemptId: string): string {
  const encoded = encodeURIComponent(attemptId);
  const normalizedBase = trimTrailingSlash(basePath);
  const prefix = normalizedBase === "/" ? "" : normalizedBase;
  return `${prefix}/review/${encoded}`;
}

export function getHomePath(): string {
  return homePath || "/";
}
