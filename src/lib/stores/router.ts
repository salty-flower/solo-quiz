import { writable } from "svelte/store";

const REVIEW_HASH = "#review/";

function getCurrentPathname(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function getCurrentRoute(): string {
  if (typeof window === "undefined") return "/";
  const pathname = getCurrentPathname();
  const hash = window.location.hash || "";
  return `${pathname}${hash}`;
}

const initialPath = getCurrentPathname();
const initialRoute = getCurrentRoute();

function isReviewPath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.includes(REVIEW_HASH);
}

function deriveBasePath(pathname: string | null | undefined): string {
  if (!pathname) return "/";
  return pathname === "" ? "/" : pathname;
}

let homePath =
  initialPath && !isReviewPath(initialRoute)
    ? initialPath
    : deriveBasePath(initialPath);

const path = writable(initialRoute || "/");

function updateFromLocation() {
  if (typeof window === "undefined") return;
  const nextRoute = getCurrentRoute();
  path.set(nextRoute);
  if (!isReviewPath(nextRoute)) {
    const nextPath = getCurrentPathname();
    homePath = nextPath;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", updateFromLocation);
  window.addEventListener("hashchange", updateFromLocation);
}

export const routePath = {
  subscribe: path.subscribe,
};

function stripHash(value: string): string {
  if (!value) return "/";
  const hashIndex = value.indexOf("#");
  if (hashIndex < 0) return value;
  return hashIndex === 0 ? "/" : value.slice(0, hashIndex);
}

export function navigate(to: string) {
  if (typeof window === "undefined" || !to) return;
  const destination = to.startsWith("#") ? `${getCurrentPathname()}${to}` : to;
  if (getCurrentRoute() === destination) return;
  window.history.pushState({}, "", destination);
  const current = getCurrentRoute();
  path.set(current);
  if (!isReviewPath(current)) {
    const nextPath = stripHash(destination);
    homePath = nextPath || "/";
  }
}

export function getReviewPath(attemptId: string): string {
  const encoded = encodeURIComponent(attemptId);
  return `${REVIEW_HASH}${encoded}`;
}

export function getHomePath(): string {
  return homePath || "/";
}
