import { create } from "zustand";

/**
 * Navigation state for the two-pane layout:
 * - `openBookId`: which book's chapter grid is expanded in the BookList
 *   (accordion — one at a time; clicking it again collapses it).
 * - `bookId` + `chapter` + `bookName`: what the reading pane shows.
 *
 * Starts at John 3 — the demo default until a "remember last read"
 * setting exists.
 */
interface NavigationState {
  openBookId: number | null;
  bookId: number;
  chapter: number;
  bookName: string;
  /** Expand a book's chapter grid (or collapse it if already open). */
  openBook: (bookId: number) => void;
  /** Load a chapter into the reading pane (and expand it in the list). */
  selectChapter: (bookId: number, chapter: number, bookName: string) => void;
}

export const useNavigation = create<NavigationState>()((set) => ({
  openBookId: 43, // John
  bookId: 43,
  chapter: 3,
  bookName: "John",
  openBook: (bookId) =>
    set((s) => ({ openBookId: s.openBookId === bookId ? null : bookId })),
  selectChapter: (bookId, chapter, bookName) =>
    set({ openBookId: bookId, bookId, chapter, bookName }),
}));
