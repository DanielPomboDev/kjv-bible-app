import { create } from "zustand";
import type {
  CustomSlideItem,
  SermonDeckItem,
  VerseSlideItem,
} from "../domain/types";

/**
 * The sermon deck: a single ordered list of slide items queued for
 * presenting (fullscreen sermon mode comes in a later step). Each item
 * is either a verse slide or a custom slide (AGENTS.md, Custom slide
 * rule #1) — one list, never two. Deliberately separate from
 * store/selection.ts — selection serves clipboard copy and is
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
  /** Queued slides in presentation order — the deck IS this order. */
  readonly deck: readonly SermonDeckItem[];
  /**
   * Queue a slide, keeping insertion order. Returns false (and changes
   * nothing) if an item with the same id is already in the deck.
   */
  addToDeck: (entry: SermonDeckItem) => boolean;
  /** Remove one slide from the deck (no-op if the id isn't queued). */
  removeFromDeck: (id: number | string) => void;
  /**
   * Move the slide at one 0-based index to another 0-based index;
   * everything in between shifts by one. No-op when either index is out
   * of range or both are equal.
   */
  moveInDeck: (fromIndex: number, toIndex: number) => void;
  /** Empty the deck entirely. */
  clearDeck: () => void;
}

function isVerseItem(value: unknown): value is VerseSlideItem {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  // `type` is optional here so decks persisted before the verse/custom
  // union still load — a typeless entry is a verse by definition.
  if (entry.type !== undefined && entry.type !== "verse") return false;
  return (
    typeof entry.id === "number" &&
    typeof entry.label === "string" &&
    typeof entry.text === "string"
  );
}

function isCustomItem(value: unknown): value is CustomSlideItem {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (entry.type !== "custom") return false;
  return (
    typeof entry.id === "string" &&
    (entry.title === undefined || typeof entry.title === "string") &&
    typeof entry.body === "string"
  );
}

/**
 * Normalize one persisted value to a deck item, or null when malformed.
 * Legacy verse entries (no `type` field) become `{ type: "verse", … }`
 * so old decks survive the union migration unchanged.
 */
function normalize(value: unknown): SermonDeckItem | null {
  if (isCustomItem(value)) {
    const { id, title, body } = value;
    return title === undefined
      ? { type: "custom", id, body }
      : { type: "custom", id, title, body };
  }
  if (isVerseItem(value)) {
    const { id, label, text } = value;
    return { type: "verse", id, label, text };
  }
  return null;
}

function load(): SermonDeckItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything malformed so a bad write can't break the app.
    const deck: SermonDeckItem[] = [];
    for (const value of parsed) {
      const item = normalize(value);
      if (item !== null) deck.push(item);
    }
    return deck;
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

  removeFromDeck: (id) => {
    const next = get().deck.filter((e) => e.id !== id);
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

function persist(deck: readonly SermonDeckItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // Storage full or unavailable: the deck just won't persist.
  }
}
