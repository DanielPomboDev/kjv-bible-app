import { create } from "zustand";
import type {
  CustomSlideItem,
  OutlineSection,
  Sermon,
  SermonDeckItem,
  SlideBlock,
} from "../domain/types";
import { deckKey } from "../domain/types";
import {
  customSlideToBlocks,
  moveBlock as moveBlockOrder,
  normalizeSlideBlock,
  normalizeSlideBlocks,
} from "../domain/blocks";
import { loadLibraryState, isPresetId } from "./sermonStorage";
import { useSermonLibrary } from "./sermonLibrary";

/**
 * The currently open sermon — only one is open at a time.
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
   * Queue many slides at once (the selection toolbar's "Add to Deck"):
   * one commit, insertion order kept, entries whose id is already in
   * the deck (or repeated in the batch) skipped. Reports both counts
   * so the caller can toast what happened.
   */
  addManyToDeck: (entries: SermonDeckItem[]) => {
    added: number;
    skipped: number;
  };
  /**
   * Build a custom slide (optional title, required body) and append it.
   * Returns the new item, or null when the body is blank.
   */
  addCustomSlide: (
    title: string | undefined,
    body: string,
  ) => CustomSlideItem | null;
  /**
   * Update a custom slide in place: title/body change, position and
   * identity stay. False when the key isn't a custom slide, or the body
   * is blank.
   */
  updateCustomSlide: (
    key: string,
    title: string | undefined,
    body: string,
  ) => boolean;
  /**
   * Append a freeform block to a custom slide. False when the key isn't
   * a custom slide. The block is normalized on write (geometry clamped,
   * malformed rejected).
   */
  addBlock: (slideKey: string, block: SlideBlock) => boolean;
  /**
   * Patch one block in place (id/type immutable): the merged block is
   * re-normalized, so garbage clamps and blank text/alt/src refuse
   * (false, changing nothing).
   */
  updateBlock: (
    slideKey: string,
    blockId: string,
    patch: Record<string, unknown>,
  ) => boolean;
  /** Remove one block (no-op false when missing). */
  removeBlock: (slideKey: string, blockId: string) => boolean;
  /**
   * Move the block at one 0-based index to another (later paints on
   * top). No-op when invalid.
   */
  moveBlockInSlide: (
    slideKey: string,
    fromIndex: number,
    toIndex: number,
  ) => boolean;
  /**
   * Replace a custom slide's blocks wholesale (templates, blank).
   * Entries are normalized (malformed dropped); an empty result still
   * applies as an empty freeform frame. False when not a custom slide.
   */
  setBlocks: (slideKey: string, blocks: SlideBlock[]) => boolean;
  /**
   * Convert a legacy title/body slide to freeform blocks (legacy fields
   * stay as a fallback for older readers). False when already freeform,
   * not custom, or nothing to convert.
   */
  convertToFreeform: (slideKey: string) => boolean;
  /**
   * Per-slide background override (`undefined` clears back to the
   * sermon's background). Unknown preset ids are ignored.
   */
  setSlideBackground: (
    slideKey: string,
    presetId: string | undefined,
  ) => boolean;
  /** Remove one slide from the open sermon's deck (no-op if missing). */
  removeFromDeck: (key: string) => void;
  /**
   * Duplicate the slide at one 0-based index (verse or custom — the copy
   * keeps content and notes, gets a fresh `uid`) and insert the copy
   * right after the source. False when the index is invalid.
   */
  duplicateDeckItem: (index: number) => boolean;
  /**
   * Set (or clear) the private presenter notes on one slide, verse or custom, found by deck key. Blank
   * text clears the notes; anything else is stored trimmed. No-op if
   * missing.
   */
  setSlideNotes: (key: string, notes: string) => void;
  /** Move the slide at one 0-based index to another; no-op if invalid. */
  moveInDeck: (fromIndex: number, toIndex: number) => void;
  /** Empty the open sermon's deck entirely. */
  clearDeck: () => void;
  /** Select a background preset for the open sermon (unknown ids ignored). */
  setBackgroundPresetId: (id: string) => void;
  /**
   * Append an outline section. The heading is required — returns the new section, or null when the heading is
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

/**
 * Fresh per-entry identity for a duplicated slide. Same timestamp +
 * random scheme as custom/outline ids, in its own `dup-…` namespace so
 * it can never equal a `type:id` fallback key (no colon).
 */
function newDuplicateUid(): string {
  return `dup-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/**
 * Index of the custom slide with this deck key (-1 when missing or a
 * verse slide — block ops only ever touch custom slides).
 */
function findCustomIndex(
  deck: readonly SermonDeckItem[],
  slideKey: string,
): number {
  return deck.findIndex((e) => e.type === "custom" && deckKey(e) === slideKey);
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

    addManyToDeck: (entries) => {
      const { sermon } = get();
      const seen = new Set(sermon.deck.map((e) => e.id));
      const fresh = entries.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      if (fresh.length > 0) {
        commit({ ...sermon, deck: [...sermon.deck, ...fresh] });
      }
      return { added: fresh.length, skipped: entries.length - fresh.length };
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

    removeFromDeck: (key) => {
      const { sermon } = get();
      const deck = sermon.deck.filter((e) => deckKey(e) !== key);
      if (deck.length === sermon.deck.length) return;
      commit({ ...sermon, deck });
    },

    duplicateDeckItem: (index) => {
      const { sermon } = get();
      if (index < 0 || index >= sermon.deck.length) return false;
      // Exact copy — content and notes — with a fresh identity, so the
      // two entries edit and remove independently even when they share
      // the same verse `id`. (Narrowed per type so `id` keeps its
      // number/string type instead of widening on a union spread.)
      const source = sermon.deck[index];
      const uid = newDuplicateUid();
      const copy: SermonDeckItem =
        source.type === "verse"
          ? { ...source, uid }
          : { ...source, uid };
      const deck = [...sermon.deck];
      deck.splice(index + 1, 0, copy);
      commit({ ...sermon, deck });
      return true;
    },

    setSlideNotes: (key, notes) => {
      const clean = notes.trim();
      const { sermon } = get();
      const index = sermon.deck.findIndex((e) => deckKey(e) === key);
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

    updateCustomSlide: (key, title, body) => {
      const cleanBody = body.trim();
      if (cleanBody.length === 0) return false;
      const { sermon } = get();
      const index = sermon.deck.findIndex(
        (e) => e.type === "custom" && deckKey(e) === key,
      );
      if (index === -1) return false;
      const deck = [...sermon.deck];
      const previous = deck[index];
      // Narrow for the compiler (the findIndex above already ensures a
      // custom slide — deck identity is era-agnostic here).
      if (previous.type !== "custom") return false;
      deck[index] = {
        type: "custom",
        id: previous.id,
        ...(title !== undefined ? { title } : {}),
        body: cleanBody,
        // Notes and duplicate identity belong to the entry, not the
        // title/body edit — keep them.
        ...(previous.notes !== undefined ? { notes: previous.notes } : {}),
        ...(previous.uid !== undefined ? { uid: previous.uid } : {}),
        // Freeform content survives legacy edits (the popover editor can
        // touch any custom slide — it must never wipe blocks).
        ...(previous.blocks !== undefined ? { blocks: previous.blocks } : {}),
        ...(previous.backgroundPresetId !== undefined
          ? { backgroundPresetId: previous.backgroundPresetId }
          : {}),
      };
      commit({ ...sermon, deck });
      return true;
    },

    addBlock: (slideKey, block) => {
      const normalized = normalizeSlideBlock(block);
      if (normalized === null) return false;
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const deck = [...sermon.deck];
      const previous = deck[index];
      if (previous.type !== "custom") return false;
      const blocks = [...(previous.blocks ?? []), normalized];
      deck[index] = { ...previous, blocks };
      commit({ ...sermon, deck });
      return true;
    },

    updateBlock: (slideKey, blockId, patch) => {
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      const blocks = current.blocks ?? [];
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return false;
      // Merge then re-normalize: garbage clamps, blank text/alt refuses.
      // id/type are immutable — a patch claiming otherwise is dropped.
      const { id: _id, type: _type, ...rest } = patch;
      void _id;
      void _type;
      const merged = normalizeSlideBlock({ ...blocks[blockIndex], ...rest });
      if (merged === null) return false;
      const nextBlocks = [...blocks];
      nextBlocks[blockIndex] = merged;
      const deck = [...sermon.deck];
      deck[index] = { ...current, blocks: nextBlocks };
      commit({ ...sermon, deck });
      return true;
    },

    removeBlock: (slideKey, blockId) => {
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      const blocks = (current.blocks ?? []).filter((b) => b.id !== blockId);
      if (blocks.length === (current.blocks ?? []).length) return false;
      const deck = [...sermon.deck];
      deck[index] = { ...current, blocks };
      commit({ ...sermon, deck });
      return true;
    },

    moveBlockInSlide: (slideKey, fromIndex, toIndex) => {
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      const blocks = current.blocks ?? [];
      const moved = moveBlockOrder(blocks, fromIndex, toIndex);
      if (moved.every((b, i) => b === blocks[i])) return false;
      const deck = [...sermon.deck];
      deck[index] = { ...current, blocks: moved };
      commit({ ...sermon, deck });
      return true;
    },

    setBlocks: (slideKey, blocks) => {
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      const normalized = normalizeSlideBlocks(blocks);
      const deck = [...sermon.deck];
      deck[index] = { ...current, blocks: normalized };
      commit({ ...sermon, deck });
      return true;
    },

    convertToFreeform: (slideKey) => {
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      if ((current.blocks ?? []).length > 0) return false;
      const blocks = customSlideToBlocks(current.title, current.body);
      if (blocks.length === 0) return false;
      const deck = [...sermon.deck];
      // Legacy title/body stay as a fallback for older readers.
      deck[index] = { ...current, blocks };
      commit({ ...sermon, deck });
      return true;
    },

    setSlideBackground: (slideKey, presetId) => {
      if (presetId !== undefined && !isPresetId(presetId)) return false;
      const { sermon } = get();
      const index = findCustomIndex(sermon.deck, slideKey);
      if (index === -1) return false;
      const current = sermon.deck[index];
      if (current.type !== "custom") return false;
      if (current.backgroundPresetId === presetId) return false;
      const deck = [...sermon.deck];
      deck[index] =
        presetId === undefined
          ? ((): SermonDeckItem => {
              const { backgroundPresetId: _dropped, ...rest } = current;
              return rest as SermonDeckItem;
            })()
          : { ...current, backgroundPresetId: presetId };
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
      // The heading is required; the body is plain text and may be empty.
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
