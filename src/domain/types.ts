/** One book of the Bible, as returned by the backend (`get_books`). */
export interface Book {
  id: number;
  name: string;
  /** "OT" or "NT". */
  testament: "OT" | "NT";
  /** Number of chapters, used to build the chapter grid. */
  chapterCount: number;
}

/** One verse of a chapter, as returned by the backend (`get_chapter`). */
export interface ChapterVerse {
  id: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

/** All verses of one chapter, in verse order. */
export interface Chapter {
  bookId: number;
  bookName: string;
  chapter: number;
  verses: ChapterVerse[];
}

/** One verse returned by search (`search_bible`). */
export interface SearchHit {
  id: number;
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * One verse slide in the sermon deck — an ordered list meant for
 * presenting. Persists the label/text itself (see store/activeSermon.ts)
 * so presentation needs no extra lookup, and the deck survives app
 * restarts the way settings do.
 */
export interface VerseSlideItem {
  type: "verse";
  /** Canonical verse id (verses.id), unique within the deck. */
  id: number;
  /** e.g. "John 3:16" — ready-made slide label. */
  label: string;
  /** Verse text as it appears in the reader. */
  text: string;
  /**
   * Per-entry identity, present only on duplicates: two deck entries
   * may share the same verse `id` (the same verse twice), so rows and
   * edits key off `deckKey`, not `id`. Absent on entries created before
   * duplication existed — they fall back to `type:id`.
   */
  uid?: string;
  /**
   * Optional private presenter notes (Presenter notes rule
   * #1): editable from the deck panel, never rendered on the audience
   * presentation window.
   */
  notes?: string;
}

/**
 * One custom slide in the sermon deck (Custom slide rules
 * #1–2): a sermon point/heading with an optional title and required
 * body text — no formatting, images, or layouts in v1. Its `id` is a
 * string so it can never collide with numeric verse ids; it is unique
 * within the deck.
 */
export interface CustomSlideItem {
  type: "custom";
  id: string;
  /** Optional heading; absent (or empty) means no title line. */
  title?: string;
  /** Required body text. */
  body: string;
  /**
   * Per-entry identity, present only on duplicates (see VerseSlideItem).
   * Fresh custom slides use their unique `id` and carry no `uid`.
   */
  uid?: string;
  /**
   * Optional private presenter notes (Presenter notes rule
   * #1): editable from the deck panel, never rendered on the audience
   * presentation window.
   */
  notes?: string;
}

/**
 * One item in the sermon deck: either a verse slide or a custom slide.
 * The deck is a single ordered list of these (never two separate
 * lists), so both types mix freely in any order.
 */
export type SermonDeckItem = VerseSlideItem | CustomSlideItem;

/** Legacy alias for the verse slide shape. */
export type SermonDeckEntry = VerseSlideItem;

/** Alias for contexts where "slide item" reads better than "deck item". */
export type SlideItem = SermonDeckItem;

/**
 * Stable per-entry deck identity for rows and edits: the duplicate
 * `uid` when present, else `type:id`. Entries created before
 * duplication existed have no `uid`, and fresh (non-duplicate) entries
 * never get one — both fall back to `type:id`, which is unique for
 * those. Never use bare `id` to find or key a deck row: duplicated
 * verses share it.
 */
export function deckKey(item: SermonDeckItem): string {
  return item.uid ?? `${item.type}:${item.id}`;
}

/**
 * One outline section for sermon planning (Outline rules
 * #1–2): a heading plus plain body text — no formatting or images, same
 * philosophy as custom slides. The outline is reference only: it is
 * never presented and lives apart from the deck of slides.
 */
export interface OutlineSection {
  /** Stable id (`outline-…`), unique within the sermon. Never reused. */
  id: string;
  /** Section heading, e.g. "Point 1" — required, never blank. */
  heading: string;
  /** Plain body text — may be empty. */
  body: string;
}

/**
 * A sermon: the top-level saved unit (Sermon library rule #1).
 * It bundles a title, a date, its outline (planning/reference only, never
 * presented), its deck (the ordered list of slide items — verses and
 * custom slides), and its chosen background preset id. Everything that
 * used to be one global sermon deck/background becomes a property of
 * "the currently open sermon" instead — see store/activeSermon.ts.
 */
export interface Sermon {
  /** Stable id, unique across sermons (`sermon-…`). Never reused. */
  id: string;
  /** Display title, e.g. "Untitled Sermon". */
  title: string;
  /** Creation date as an ISO 8601 string (e.g. `new Date().toISOString()`). */
  date: string;
  /** Ordered outline sections for planning — never presented. */
  outline: OutlineSection[];
  /** Ordered slides for presenting — verse and custom slides mixed freely. */
  deck: SermonDeckItem[];
  /**
   * Selected slide background preset id (see
   * presentation/backgroundPresets.ts). Resolved with
   * `getBackgroundPreset`, which falls back to Classic Black for unknown
   * or missing ids.
   */
  backgroundPresetId: string;
}

/**
 * One slide on the presentation stage — what the Rust backend holds as
 * the current slide state (see src-tauri/src/presentation.rs). The same
 * discriminated union as the sermon deck: verse slides carry the
 * ready-made reference as `label`, custom slides their `title`/`body`.
 * The deck travels to the backend untouched, so both step through
 * identically by index.
 */
export type StageSlide = SermonDeckItem;

/**
 * Stage snapshot pushed from Rust (`presentation://slide` event and the
 * initial pull): the slides in order, which one is current, which
 * background preset to render, and the open sermon's outline at present
 * time. A single "Present Now" verse is a one-slide deck, so navigation
 * is inert there. The outline (like each slide's `notes`) rides along
 * for the presenter window only — the audience stage never renders it.
 */
export interface StageState {
  deck: StageSlide[];
  index: number;
  /**
   * Selected background preset id (see
   * presentation/backgroundPresets.ts) — set at present time from the
   * open sermon's `backgroundPresetId`. The stage resolves it with
   * `getBackgroundPreset`, which falls back to Classic Black for unknown
   * or missing ids.
   */
  background: string;
  /**
   * The app's light/dark theme at present time (`store/settings.ts`) —
   * the presenter window applies it so its chrome matches the main app.
   * The audience stage ignores it (stage tokens only).
   */
  theme: "light" | "dark";
  /** The open sermon's outline sections — presenter reference only. */
  outline: OutlineSection[];
}

/**
 * The backend's verdict on a query, plus its results:
 * - `verse`:   "John 3:16" — that single verse
 * - `chapter`: "John 3" — every verse of the chapter, in order
 * - `text`:    anything else — FTS5 word/phrase hits, best match first
 */
export type SearchResult =
  | { kind: "verse"; hit: SearchHit }
  | { kind: "chapter"; bookId: number; bookName: string; chapter: number; hits: SearchHit[] }
  | { kind: "text"; query: string; hits: SearchHit[] };
