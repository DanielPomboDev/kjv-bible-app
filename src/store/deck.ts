import { create } from "zustand";
import type {
  OutlineSection,
  SermonDeckItem,
} from "../domain/types";
import { deckKey } from "../domain/types";
import {
  isPresetId,
  loadLibraryState,
  LIBRARY_STORAGE_KEY,
  normalizeDeckItem,
} from "./sermonStorage";
import { DEFAULT_BACKGROUND_PRESET_ID } from "../presentation/backgroundPresets";

/**
 * The single sermon deck — no library, no sermons, no titles. One
 * ordered queue of verse/custom slides plus the export background and
 * the planning outline. Everything PowerPoint-bound lives here; verse
 * text, custom content, and notes are assembled here and designed in
 * PowerPoint after export.
 *
 * Persistence is one localStorage record (`bible.deck`). First launch
 * adopts the retired sermon library's open sermon once (deck,
 * background, outline) and drops the legacy record, so existing work
 * survives the simplification.
 */

const DECK_STORAGE_KEY = "bible.deck";

interface DeckFile {
  deck: SermonDeckItem[];
  backgroundPresetId: string;
  outline: OutlineSection[];
}

function isOutlineSection(value: unknown): value is OutlineSection {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.heading === "string" &&
    typeof obj.body === "string"
  );
}

function parseDeckFile(raw: string): DeckFile | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.deck)) return null;
    const deck: SermonDeckItem[] = [];
    for (const item of obj.deck) {
      const normalized = normalizeDeckItem(item);
      if (normalized !== null) deck.push(normalized);
    }
    const outline: OutlineSection[] = Array.isArray(obj.outline)
      ? obj.outline.filter(isOutlineSection)
      : [];
    const backgroundPresetId = isPresetId(obj.backgroundPresetId)
      ? (obj.backgroundPresetId as string)
      : DEFAULT_BACKGROUND_PRESET_ID;
    return { deck, backgroundPresetId, outline };
  } catch {
    return null;
  }
}

function persistDeckFile(file: DeckFile): void {
  try {
    localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(file));
  } catch {
    // Storage full or unavailable: the deck just won't persist.
  }
}

function loadDeckState(): DeckFile {
  // 1. The deck record wins.
  try {
    const raw = localStorage.getItem(DECK_STORAGE_KEY);
    if (raw) {
      const parsed = parseDeckFile(raw);
      if (parsed) return parsed;
    }
  } catch {
    // Corrupted or unavailable storage: fall through to adoption.
  }

  // 2. One-time adoption from the retired sermon library, then drop it.
  try {
    const { sermons, activeId } = loadLibraryState();
    const active = sermons.find((s) => s.id === activeId) ?? sermons[0];
    const adopted: DeckFile = {
      deck: active.deck,
      backgroundPresetId: active.backgroundPresetId,
      outline: active.outline,
    };
    persistDeckFile(adopted);
    try {
      localStorage.removeItem(LIBRARY_STORAGE_KEY);
    } catch {
      // Harmless: adoption just re-runs (idempotently) next load.
    }
    return adopted;
  } catch {
    // Storage entirely unavailable.
  }

  // 3. Fresh.
  return {
    deck: [],
    backgroundPresetId: DEFAULT_BACKGROUND_PRESET_ID,
    outline: [],
  };
}

/** Fresh per-entry identity for a duplicated slide (`dup-…`). */
function newDuplicateUid(): string {
  return `dup-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function newOutlineId(): string {
  return `outline-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

interface DeckState {
  readonly deck: readonly SermonDeckItem[];
  readonly backgroundPresetId: string;
  readonly outline: readonly OutlineSection[];
  /** Queue a slide, keeping insertion order. False when the id exists. */
  addToDeck: (entry: SermonDeckItem) => boolean;
  /**
   * Queue many slides at once (the selection toolbar's "Add to Deck"):
   * one commit, insertion order kept, duplicates skipped. Reports both
   * counts so the caller can toast what happened.
   */
  addManyToDeck: (entries: SermonDeckItem[]) => {
    added: number;
    skipped: number;
  };
  /** Remove one slide (no-op if missing). */
  removeFromDeck: (key: string) => void;
  /**
   * Duplicate the slide at one 0-based index (gets a fresh `uid`) and
   * insert the copy right after the source. False when invalid.
   */
  duplicateDeckItem: (index: number) => boolean;
  /** Move the slide at one 0-based index to another; no-op if invalid. */
  moveInDeck: (fromIndex: number, toIndex: number) => void;
  /**
   * Replace the whole deck (undo restoration). Always commits — the
   * caller snapshots first.
   */
  restoreDeck: (deck: SermonDeckItem[]) => void;
  /** Empty the deck entirely. */
  clearDeck: () => void;
  /** Select a background preset for export (unknown ids ignored). */
  setBackgroundPresetId: (id: string) => void;
  /** Append an outline section. Null when the heading is blank. */
  addOutlineSection: (heading: string, body: string) => OutlineSection | null;
  /** Edit an outline section in place. False when missing/blank. */
  updateOutlineSection: (
    id: string,
    heading: string,
    body: string,
  ) => boolean;
  /** Remove one outline section (no-op if missing). */
  removeOutlineSection: (id: string) => void;
  /** Move an outline section; no-op when out of range or equal. */
  moveOutlineSection: (fromIndex: number, toIndex: number) => void;
}

export const useDeck = create<DeckState>()((set, get) => {
  const commit = (next: Partial<DeckFile>) => {
    const state = get();
    const file: DeckFile = {
      deck: next.deck ?? [...state.deck],
      backgroundPresetId:
        next.backgroundPresetId ?? state.backgroundPresetId,
      outline: next.outline ?? [...state.outline],
    };
    set(file);
    persistDeckFile(file);
  };

  return {
    ...loadDeckState(),

    addToDeck: (entry) => {
      const { deck } = get();
      if (deck.some((e) => e.id === entry.id)) return false;
      commit({ deck: [...deck, entry] });
      return true;
    },

    addManyToDeck: (entries) => {
      const { deck } = get();
      const seen = new Set(deck.map((e) => e.id));
      const fresh = entries.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      if (fresh.length > 0) {
        commit({ deck: [...deck, ...fresh] });
      }
      return { added: fresh.length, skipped: entries.length - fresh.length };
    },

    removeFromDeck: (key) => {
      const { deck } = get();
      const next = deck.filter((e) => deckKey(e) !== key);
      if (next.length === deck.length) return;
      commit({ deck: next });
    },

    duplicateDeckItem: (index) => {
      const { deck } = get();
      if (index < 0 || index >= deck.length) return false;
      const source = deck[index];
      const uid = newDuplicateUid();
      const copy: SermonDeckItem =
        source.type === "verse"
          ? { ...source, uid }
          : { ...source, uid };
      const next = [...deck];
      next.splice(index + 1, 0, copy);
      commit({ deck: next });
      return true;
    },

    moveInDeck: (fromIndex, toIndex) => {
      const { deck } = get();
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
      commit({ deck: next });
    },

    clearDeck: () => {
      if (get().deck.length === 0) return;
      commit({ deck: [] });
    },

    restoreDeck: (deck) => {
      commit({ deck: [...deck] });
    },

    setBackgroundPresetId: (id) => {
      if (!isPresetId(id)) return;
      const { backgroundPresetId } = get();
      if (backgroundPresetId === id) return;
      commit({ backgroundPresetId: id });
    },

    addOutlineSection: (heading, body) => {
      const cleanHeading = heading.trim();
      if (cleanHeading.length === 0) return null;
      const section: OutlineSection = {
        id: newOutlineId(),
        heading: cleanHeading,
        body: body.trim(),
      };
      commit({ outline: [...get().outline, section] });
      return section;
    },

    updateOutlineSection: (id, heading, body) => {
      const cleanHeading = heading.trim();
      if (cleanHeading.length === 0) return false;
      const { outline } = get();
      const index = outline.findIndex((s) => s.id === id);
      if (index === -1) return false;
      const next = [...outline];
      next[index] = { id, heading: cleanHeading, body: body.trim() };
      commit({ outline: next });
      return true;
    },

    removeOutlineSection: (id) => {
      const { outline } = get();
      const next = outline.filter((s) => s.id !== id);
      if (next.length === outline.length) return;
      commit({ outline: next });
    },

    moveOutlineSection: (fromIndex, toIndex) => {
      const { outline } = get();
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= outline.length ||
        toIndex < 0 ||
        toIndex >= outline.length
      ) {
        return;
      }
      const next = [...outline];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commit({ outline: next });
    },
  };
});
