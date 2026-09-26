import { create } from "zustand";

/**
 * Search overlay state, separate from navigation so opening/closing the
 * overlay never disturbs what the reading pane is showing.
 *
 * The overlay opens via the TopBar search field or Ctrl/Cmd+K, closes on
 * Escape or when a result is clicked.
 */
interface SearchState {
  /** Whether the search overlay is showing. */
  open: boolean;
  /** Open the overlay (focus moves to the search input). */
  openSearch: () => void;
  /** Close the overlay. */
  closeSearch: () => void;
}

export const useSearch = create<SearchState>()((set) => ({
  open: false,
  openSearch: () => set({ open: true }),
  closeSearch: () => set({ open: false }),
}));
