import type { InstallPromptEvent } from "./install";

/**
 * The browser fires `beforeinstallprompt` once, early — possibly before the
 * install page has mounted. The root layout starts listening on every page and
 * keeps the event here, so the install page can use it whenever it opens.
 */
let current: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const promptStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getPrompt: () => current,
  getInstalled: () => installed,
  setPrompt(e: InstallPromptEvent | null) {
    current = e;
    emit();
  },
  markInstalled() {
    installed = true;
    current = null;
    emit();
  },
};
