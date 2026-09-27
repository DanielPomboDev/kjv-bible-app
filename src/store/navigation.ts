import { create } from "zustand";

/**
 * Navigation state for the two-pane layout:
 * - `openBookId`: which book's chapter grid is expanded in the BookList
 *   (accordion — one at a time; clicking it again collapses it).
 * - `bookId` + `chapter` + `bookName`: what the reading pane shows.
 * - `sidebarOpen`: whether the book list pane is visible (collapsed for
 *   full-width reading via the TopBar toggle).
 * - `restored`: true when the position below came from a previous session
 *   (lets BookList expand that book's testament section on launch).
 *
 * Fresh installs start at Genesis 1 with nothing expanded. Every chapter
 * or book change is persisted to localStorage, so reopening the app
 * restores the last-read position.
 */
interface NavigationState {
  openBookId: number | null;
  bookId: number;
  chapter: number;
  bookName: string;
  sidebarOpen: boolean;
  restored: boolean;
  /** Expand a book's chapter grid (or collapse it if already open). */
  openBook: (bookId: number) => void;
  /** Load a chapter into the reading pane (and expand it in the list). */
  selectChapter: (bookId: number, chapter: number, bookName: string) => void;
  /** Collapse/expand the book list pane. */
  toggleSidebar: () => void;
}

const STORAGE_KEY = "bible.navigation";

interface PersistedPosition {
  bookId: number;
  chapter: number;
  bookName: string;
  openBookId: number | null;
}

const FRESH: PersistedPosition = {
  bookId: 1,
  chapter: 1,
  bookName: "Genesis",
  openBookId: null,
};

function isPosition(value: unknown): value is PersistedPosition {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Number.isInteger(obj.bookId) &&
    (obj.bookId as number) >= 1 &&
    Number.isInteger(obj.chapter) &&
    (obj.chapter as number) >= 1 &&
    typeof obj.bookName === "string" &&
    (obj.bookName as string).length > 0 &&
    (obj.openBookId === null ||
      (Number.isInteger(obj.openBookId) && (obj.openBookId as number) >= 1))
  );
}

function load(): PersistedPosition & { restored: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPosition(parsed)) return { ...parsed, restored: true };
    }
  } catch {
    // Corrupted or unavailable storage: fall through to fresh defaults.
  }
  return { ...FRESH, restored: false };
}

function persist(state: PersistedPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: position just won't persist.
  }
}

export const useNavigation = create<NavigationState>()((set) => ({
  ...load(),
  sidebarOpen: true,
  openBook: (bookId) =>
    set((s) => {
      const next = { openBookId: s.openBookId === bookId ? null : bookId };
      persist({
        bookId: s.bookId,
        chapter: s.chapter,
        bookName: s.bookName,
        openBookId: next.openBookId,
      });
      return next;
    }),
  selectChapter: (bookId, chapter, bookName) => {
    const next = { openBookId: bookId, bookId, chapter, bookName };
    set(next);
    persist(next);
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
