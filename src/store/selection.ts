import { create } from "zustand";

/**
 * Verse selection state, kept apart from navigation so changing chapters
 * or searching never disturbs the selection, and the copy toolbar (a
 * later feature) can read it directly.
 *
 * Click semantics (the style guide):
 * - plain click       → select just that verse (or deselect if it was
 *                        the only selection)
 * - Ctrl/Cmd+click    → add/remove one verse, keeping the rest
 * - Shift+click       → select the id range anchor..clicked, ordered
 *
 * `anchorId` is where a shift-range starts; it is set by plain and
 * Ctrl/Cmd clicks and cleared when the selection becomes empty.
 *
 * Verse ids are 1..N in canonical order (data/import_kjv.py), so a
 * numeric id slice is exactly the range between two verses, even
 * across chapter or book boundaries.
 */
interface SelectionState {
  /** Selected verse ids, in ascending id order. */
  readonly selectedIds: ReadonlySet<number>;
  /** Where the next Shift+click range starts. */
  readonly anchorId: number | null;
  /** Handle a click on a verse (plain / ctrl / shift variants). */
  verseClick: (verseId: number, mods: { ctrl: boolean; shift: boolean }) => void;
  /** Deselect everything. */
  clear: () => void;
}

export const useSelection = create<SelectionState>()((set, get) => ({
  selectedIds: new Set(),
  anchorId: null,

  verseClick: (verseId, { ctrl, shift }) => {
    // Capture the anchor once: TS narrowing does not survive a second
    // get() call, and the whole shift branch needs a non-null anchor.
    const anchor = get().anchorId;
    if (shift && anchor !== null) {
      const [lo, hi] = anchor <= verseId ? [anchor, verseId] : [verseId, anchor];
      const range = new Set<number>();
      for (let id = lo; id <= hi; id++) range.add(id);
      set({ selectedIds: range, anchorId: anchor });
      return;
    }
    set((s) => {
      if (ctrl) {
        const next = new Set(s.selectedIds);
        if (next.has(verseId)) next.delete(verseId);
        else next.add(verseId);
        if (next.size === 0) return { selectedIds: next, anchorId: null };
        return { selectedIds: next, anchorId: verseId };
      }
      // Plain click: toggle. Clicking the only selected verse clears;
      // otherwise it selects just that verse.
      if (s.selectedIds.size === 1 && s.selectedIds.has(verseId)) {
        return { selectedIds: new Set<number>(), anchorId: null };
      }
      return { selectedIds: new Set([verseId]), anchorId: verseId };
    });
  },

  clear: () => set({ selectedIds: new Set(), anchorId: null }),
}));
