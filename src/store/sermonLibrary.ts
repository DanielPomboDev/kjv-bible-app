import { create } from "zustand";
import type { Sermon } from "../domain/types";
import {
  DEFAULT_BACKGROUND_PRESET_ID,
} from "../presentation/backgroundPresets";
import {
  freshSermon,
  loadLibraryState,
  newSermonId,
  nextUntitledTitle,
  persistLibrary,
  UNTITLED_SERMON_TITLE,
} from "./sermonStorage";
import { useActiveSermon } from "./activeSermon";

/**
 * The sermon library (AGENTS.md, Sermon library rules #2–3): every saved
 * sermon plus which one is open. Only one sermon is open/active at a
 * time — opening another swaps out the active deck and background, it
 * never merges them. The collection persists as one localStorage record,
 * the same mechanism settings use (see `store/sermonStorage.ts`).
 *
 * The open sermon's deck/background edits live in `store/activeSermon.ts`
 * and echo back here through `syncActive`, so the library always holds
 * the latest copy of every sermon. Library actions (create/open/rename/
 * delete) push the affected sermon into the active store, which is what
 * the deck panel, context menu, and background picker render.
 */

interface SermonLibraryState {
  /** Every saved sermon, oldest first. Never empty. */
  readonly sermons: readonly Sermon[];
  /** Id of the open sermon — always one of `sermons`. */
  readonly activeId: string;
  /**
   * Create a fresh sermon and open it. Returns the new sermon so the
   * caller can report its (possibly numbered) title.
   */
  createSermon: () => Sermon;
  /**
   * Make a saved sermon the active one: its deck and background become
   * what the rest of the app works with. False when the id is unknown.
   */
  openSermon: (id: string) => boolean;
  /**
   * Rename a sermon. False when the id is unknown or the title is blank
   * (nothing changes either way).
   */
  renameSermon: (id: string, title: string) => boolean;
  /**
   * Delete a sermon. Returns false (changing nothing) when the id is
   * unknown. Deleting the open sermon opens a remaining one; deleting
   * the last sermon opens a fresh empty one, so the app is never left
   * with no sermon open. The UI confirms before calling — this is
   * destructive.
   */
  deleteSermon: (id: string) => boolean;
  /**
   * Import a sermon from a backup file (already validated with
   * `isSermon` by the caller). A colliding id gets a fresh one so the
   * import never overwrites an existing sermon. The import opens, and
   * is returned so the caller can report its title.
   */
  importSermon: (sermon: Sermon) => Sermon;
  /**
   * Record the active store's latest edits against the matching library
   * entry (or append it, defensively, if its id is somehow unknown —
   * the active store's sermon is open by definition). Never touches the
   * active store itself, so the echo terminates here.
   */
  syncActive: (sermon: Sermon) => void;
}

const initial = loadLibraryState();

export const useSermonLibrary = create<SermonLibraryState>()((set, get) => ({
  sermons: initial.sermons,
  activeId: initial.activeId,

  createSermon: () => {
    const sermon: Sermon = {
      id: newSermonId(),
      title: nextUntitledTitle(get().sermons),
      date: new Date().toISOString(),
      outline: [],
      deck: [],
      backgroundPresetId: DEFAULT_BACKGROUND_PRESET_ID,
    };
    const sermons = [...get().sermons, sermon];
    persistLibrary(sermons, sermon.id);
    set({ sermons, activeId: sermon.id });
    useActiveSermon.getState().replaceSermon(sermon);
    return sermon;
  },

  openSermon: (id) => {
    const { sermons, activeId } = get();
    const entry = sermons.find((s) => s.id === id);
    if (!entry) return false;
    if (id !== activeId) {
      persistLibrary(sermons, id);
      set({ activeId: id });
    }
    useActiveSermon.getState().replaceSermon(entry);
    return true;
  },

  renameSermon: (id, title) => {
    const clean = title.trim();
    if (clean.length === 0) return false;
    const { sermons, activeId } = get();
    const entry = sermons.find((s) => s.id === id);
    if (!entry) return false;
    if (entry.title === clean) return true;
    const updated: Sermon = { ...entry, title: clean };
    const next = sermons.map((s) => (s.id === id ? updated : s));
    persistLibrary(next, activeId);
    set({ sermons: next });
    if (id === activeId) useActiveSermon.getState().replaceSermon(updated);
    return true;
  },

  deleteSermon: (id) => {
    const { sermons, activeId } = get();
    const index = sermons.findIndex((s) => s.id === id);
    if (index === -1) return false;
    const remaining = sermons.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      // Never strand the app with no sermon: a fresh empty one opens.
      const fresh = freshSermon(UNTITLED_SERMON_TITLE);
      persistLibrary([fresh], fresh.id);
      set({ sermons: [fresh], activeId: fresh.id });
      useActiveSermon.getState().replaceSermon(fresh);
      return true;
    }
    // The sermon after the deleted one slides up; the open sermon keeps
    // its place when some other sermon is deleted.
    const nextActive =
      id === activeId
        ? remaining[Math.min(index, remaining.length - 1)].id
        : activeId;
    persistLibrary(remaining, nextActive);
    set({ sermons: remaining, activeId: nextActive });
    if (id === activeId) {
      const entry = remaining.find((s) => s.id === nextActive) ?? remaining[0];
      useActiveSermon.getState().replaceSermon(entry);
    }
    return true;
  },

  importSermon: (sermon) => {
    const { sermons } = get();
    const taken = new Set(sermons.map((s) => s.id));
    const entry: Sermon = taken.has(sermon.id)
      ? { ...sermon, id: newSermonId() }
      : { ...sermon };
    const next = [...sermons, entry];
    persistLibrary(next, entry.id);
    set({ sermons: next, activeId: entry.id });
    useActiveSermon.getState().replaceSermon(entry);
    return entry;
  },

  syncActive: (sermon) => {
    const { sermons, activeId } = get();
    const known = sermons.some((s) => s.id === sermon.id);
    const next = known
      ? sermons.map((s) => (s.id === sermon.id ? sermon : s))
      : [...sermons, sermon];
    const nextActive = known ? activeId : sermon.id;
    persistLibrary(next, nextActive);
    set(
      known
        ? { sermons: next }
        : { sermons: next, activeId: nextActive },
    );
  },
}));
