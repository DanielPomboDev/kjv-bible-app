import { create } from "zustand";
import type {
  CustomSlideItem,
  OutlineSection,
  Sermon,
  SermonDeckItem,
} from "../domain/types";
import { loadLibraryState, isPresetId } from "./sermonStorage";
import { useSermonLibrary } from "./sermonLibrary";

/**
 * The currently open sermon (Sermon library rules #1 & #3).
 *
 * The outline, the deck, and the selected background preset id are
 * properties of one open `Sermon` (`sermon.outline`, `sermon.deck`,
 * `sermon.backgroundPresetId`), not global values. Only one sermon is
 * open at a time; the library (`store/sermonLibrary.ts`) swaps this whole
 * object when another sermon opens — it never merges decks or outlines.
 *
 * Persistence lives with the library: the open sermon boots from the
 * library record, and every edit below echoes there through `syncActive`
 * (which persists but never calls back here, so the echo terminates).
 */

interface ActiveSermonState {
  /** The open sermon — deck and background live on this object. */
  readonly sermon: Sermon;
  /**
   * Swap the whole open sermon (called by the library on create/open/
   * rename/delete). Echoes to the library, idempotently.
   */
  replaceSermon: (sermon: Sermon) => void;
  /** Rename the open sermon (blank titles are ignored). */
  setTitle: (title: string) => void;
  /** Queue a slide, keeping insertion order. False when the id exists. */
  addToDeck: (entry: SermonDeckItem) => boolean;
  /**
   * Build a custom slide (optional title, required body) and append it.
   * Returns the new item, or null when the body is blank.
   */
  addCustomSlide: (
    title: string | undefined,
    body: string,
  ) => CustomSlideItem | null;
  /**
   * Update a custom slide in place: title/body change, position and id
   * stay. False when the id isn't a custom slide, or the body is blank.
   */
  updateCustomSlide: (
    id: string,
    title: string | undefined,
    body: string,
  ) => boolean;
  /** Remove one slide from the open sermon's deck (no-op if missing). */
  removeFromDeck: (id: number | string) => void;
  /**
   * Set (or clear) the private presenter notes on one slide (project notes,
   * Presenter notes rule #1): verse or custom, found by id. Blank text
   * clears the notes; anything else is stored trimmed. No-op if missing.
   */
  setSlideNotes: (id: number | string, notes: string) => void;
  /** Move the slide at one 0-based index to another; no-op if invalid. */
  moveInDeck: (fromIndex: number, toIndex: number) => void;
  /** Empty the open sermon's deck entirely. */
  clearDeck: () => void;
  /** Select a background preset for the open sermon (unknown ids ignored). */
  setBackgroundPresetId: (id: string) => void;
  /**
   * Append an outline section (Outline rule #3). The heading
   * is required — returns the new section, or null when the heading is
   * blank. The body is plain text and may be empty.
   */
  addOutlineSection: (heading: string, body: string) => OutlineSection | null;
  /**
   * Edit an outline section in place: heading/body change, position and
   * id stay. Returns false (changing nothing) when the id isn't a
   * section of the open sermon, or when the new heading is blank.
   */
  updateOutlineSection: (
    id: string,
    heading: string,
    body: string,
  ) => boolean;
  /** Remove one outline section (no-op if the id isn't in the outline). */
  removeOutlineSection: (id: string) => void;
  /**
   * Move the outline section at one 0-based index to another 0-based
   * index; everything in between shifts by one. No-op when either index
   * is out of range or both are equal.
   */
  moveOutlineSection: (fromIndex: number, toIndex: number) => void;
}

function loadActive(): Sermon {
  const { sermons, activeId } = loadLibraryState();
  return sermons.find((s) => s.id === activeId) ?? sermons[0];
}

export const useActiveSermon = create<ActiveSermonState>()((set, get) => {
  // Set state and echo the new open sermon to the library (which
  // persists). The library never calls back, so this always terminates.
  const commit = (sermon: Sermon) => {
    set({ sermon });
    useSermonLibrary.getState().syncActive(sermon);
  };

  return {
    sermon: loadActive(),

    replaceSermon: (sermon) => {
      commit({
        ...sermon,
        outline: [...sermon.outline],
        deck: [...sermon.deck],
      });
    },

    setTitle: (title) => {
      const clean = title.trim();
      if (clean.length === 0) return;
      commit({ ...get().sermon, title: clean });
    },

    addToDeck: (entry) => {
      const { sermon } = get();
      if (sermon.deck.some((e) => e.id === entry.id)) return false;
      commit({ ...sermon, deck: [...sermon.deck, entry] });
      return true;
    },

    addCustomSlide: (title, body) => {
      // Body is required: refuse a blank body so no caller can persist an
      // empty slide even past the editor's disabled Save button.
      const cleanBody = body.trim();
      if (cleanBody.length === 0) return null;
      // String id in its own namespace: can never collide with numeric
      // verse ids, and timestamp + random keeps it unique across restarts.
      const item: CustomSlideItem = {
        type: "custom",
        id: `custom-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        ...(title !== undefined ? { title } : {}),
        body: cleanBody,
      };
      const { sermon } = get();
      commit({ ...sermon, deck: [...sermon.deck, item] });
      return item;
    },

    removeFromDeck: (id) => {
      const { sermon } = get();
      const deck = sermon.deck.filter((e) => e.id !== id);
      if (deck.length === sermon.deck.length) return;
      commit({ ...sermon, deck });
    },

    setSlideNotes: (id, notes) => {
      const clean = notes.trim();
      const { sermon } = get();
      const index = sermon.deck.findIndex((e) => e.id === id);
      if (index === -1) return;
      const current = sermon.deck[index];
      const currentNotes = current.notes ?? "";
      if (currentNotes === clean) return;
      const deck = [...sermon.deck];
      deck[index] =
        clean.length === 0
          ? ((): SermonDeckItem => {
              const { notes: _dropped, ...rest } = current;
              return rest as SermonDeckItem;
            })()
          : { ...current, notes: clean };
      commit({ ...sermon, deck });
    },

    updateCustomSlide: (id, title, body) => {
      const cleanBody = body.trim();
      if (cleanBody.length === 0) return false;
      const { sermon } = get();
      const index = sermon.deck.findIndex(
        (e) => e.type === "custom" && e.id === id,
      );
      if (index === -1) return false;
      const deck = [...sermon.deck];
      const previous = deck[index];
      deck[index] = {
        type: "custom",
        id,
        ...(title !== undefined ? { title } : {}),
        body: cleanBody,
        // Notes belong to the slide, not the title/body edit — keep them.
        ...(previous.notes !== undefined ? { notes: previous.notes } : {}),
      };
      commit({ ...sermon, deck });
      return true;
    },

    moveInDeck: (fromIndex, toIndex) => {
      const { sermon } = get();
      const deck = sermon.deck;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= deck.length ||
        toIndex < 0 ||
        toIndex >= deck.length
      ) {
        return;
      }
      const nextDeck = [...deck];
      const [moved] = nextDeck.splice(fromIndex, 1);
      nextDeck.splice(toIndex, 0, moved);
      commit({ ...sermon, deck: nextDeck });
    },

    clearDeck: () => {
      const { sermon } = get();
      if (sermon.deck.length === 0) return;
      commit({ ...sermon, deck: [] });
    },

    setBackgroundPresetId: (id) => {
      // Unknown ids are ignored so the stored id always resolves to a
      // real preset (the stage falls back to Classic Black otherwise).
      if (!isPresetId(id)) return;
      const { sermon } = get();
      if (sermon.backgroundPresetId === id) return;
      commit({ ...sermon, backgroundPresetId: id });
    },

    addOutlineSection: (heading, body) => {
      // The heading is required (Outline rule #1: every
      // section has a heading); the body is plain text and may be empty.
      const cleanHeading = heading.trim();
      if (cleanHeading.length === 0) return null;
      // String id in its own namespace, timestamp + random to stay unique
      // across restarts (the outline persists, so a counter could repeat).
      const section: OutlineSection = {
        id: `outline-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        heading: cleanHeading,
        body: body.trim(),
      };
      const { sermon } = get();
      commit({ ...sermon, outline: [...sermon.outline, section] });
      return section;
    },

    updateOutlineSection: (id, heading, body) => {
      const cleanHeading = heading.trim();
      if (cleanHeading.length === 0) return false;
      const { sermon } = get();
      const index = sermon.outline.findIndex((s) => s.id === id);
      if (index === -1) return false;
      const outline = [...sermon.outline];
      outline[index] = { id, heading: cleanHeading, body: body.trim() };
      commit({ ...sermon, outline });
      return true;
    },

    removeOutlineSection: (id) => {
      const { sermon } = get();
      const outline = sermon.outline.filter((s) => s.id !== id);
      if (outline.length === sermon.outline.length) return;
      commit({ ...sermon, outline });
    },

    moveOutlineSection: (fromIndex, toIndex) => {
      const { sermon } = get();
      const outline = sermon.outline;
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
      commit({ ...sermon, outline: next });
    },
  };
});
