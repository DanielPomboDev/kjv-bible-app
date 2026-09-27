import { create } from "zustand";
import type { SermonDeckEntry } from "../domain/types";

/**
 * The sermon deck: an ordered list of queued verses for presenting
 * (fullscreen sermon mode comes in a later step). Deliberately separate
 * from store/selection.ts — selection serves clipboard copy and is
 * transient, while the deck is a curated, ordered, persisted list; the
 * two can hold different verses at once (AGENTS.md, Sermon rules #1 & #5).
 *
 * Persists to localStorage the same way settings do (see
 * store/settings.ts): validated on load, silently degrades when storage
 * is unavailable, and no dependency on the backend — the queue lives in
 * the WebView so it survives app restarts.
 */

const STORAGE_KEY = "bible.sermonDeck";

interface SermonDeckState {
  /** Queued verses in presentation order — the deck IS this order. */
  readonly deck: readonly SermonDeckEntry[];
  /**
   * Queue a verse, keeping insertion order. Returns false (and changes
   * nothing) if the verse is already in the deck.
   */
  addToDeck: (entry: SermonDeckEntry) => boolean;
  /** Remove one verse from the deck (no-op if the id isn't queued). */
  removeFromDeck: (verseId: number) => void;
  /**
   * Move the verse at one 0-based index to another 0-based index;
   * everything in between shifts by one. No-op when either index is out
   * of range or both are equal.
   */
  moveInDeck: (fromIndex: number, toIndex: number) => void;
  /** Empty the deck entirely. */
  clearDeck: () => void;
}

function isEntry(value: unknown): value is SermonDeckEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "number" &&
    typeof entry.label === "string" &&
    typeof entry.text === "string"
  );
}

function load(): SermonDeckEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed so a bad write can't break the app.
    return parsed.filter(isEntry);
  } catch {
    // Corrupted or unavailable storage: fall through to an empty deck.
    return [];
  }
}

export const useSermonDeck = create<SermonDeckState>()((set, get) => ({
  deck: load(),

  addToDeck: (entry) => {
    const deck = get().deck;
    if (deck.some((e) => e.id === entry.id)) return false;
    const next = [...deck, entry];
    persist(next);
    set({ deck: next });
    return true;
  },

  removeFromDeck: (verseId) => {
    const next = get().deck.filter((e) => e.id !== verseId);
    if (next.length === get().deck.length) return;
    persist(next);
    set({ deck: next });
  },

  moveInDeck: (fromIndex, toIndex) => {
    const deck = get().deck;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= deck.length ||
      toIndex < 0 ||
      toIndex >= deck.length
    ) {
      return;
    }
    const next = [...deck];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persist(next);
    set({ deck: next });
  },

  clearDeck: () => {
    if (get().deck.length === 0) return;
    persist([]);
    set({ deck: [] });
  },
}));

function persist(deck: readonly SermonDeckEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // Storage full or unavailable: the deck just won't persist.
  }
}
