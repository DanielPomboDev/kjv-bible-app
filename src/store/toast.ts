import { create } from "zustand";

/**
 * Transient user feedback ("Copied 3 verses"), one message at a time —
 * a newer message replaces whatever is showing.
 */
interface ToastState {
  toast: string | null;
  /** Show a message briefly (default 1.8s). */
  showToast: (message: string, ms?: number) => void;
  /** Hide the current message immediately. */
  hideToast: () => void;
}

let timer: number | undefined;

export const useToast = create<ToastState>()((set) => ({
  toast: null,
  showToast: (message, ms = 1800) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => set({ toast: null }), ms);
    set({ toast: message });
  },
  hideToast: () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    set({ toast: null });
  },
}));
