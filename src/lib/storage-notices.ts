import { writable } from "svelte/store";

const message = writable<string | null>(null);

export const storageNotice = {
  subscribe: message.subscribe,
};

export function reportStorageIssue(text: string): void {
  message.set(text);
}

export function clearStorageNotice(): void {
  message.set(null);
}
