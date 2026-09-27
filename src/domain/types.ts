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
 * presenting. Persists the label/text itself (see store/sermonDeck.ts)
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
 * initial pull): the slides in order, which one is current, and which
 * background preset to render. A single "Present Now" verse is a
 * one-slide deck, so navigation is inert there.
 */
export interface StageState {
  deck: StageSlide[];
  index: number;
  /**
   * Selected background preset id (see
   * presentation/backgroundPresets.ts) — set at present time from the
   * presentationBackgroundStore. The stage resolves it with
   * `getBackgroundPreset`, which falls back to Classic Black for unknown
   * or missing ids.
   */
  background: string;
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
