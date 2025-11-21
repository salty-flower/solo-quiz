// Vitest runs without Vite's SSR helpers; provide minimal shims used by rolldown.
globalThis.__vite_ssr_exportName__ = (_name, value) => value;
