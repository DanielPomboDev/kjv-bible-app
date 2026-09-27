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
 * One queued verse in the sermon deck — an ordered list meant for
 * presenting. Persists the label/text itself (see store/sermonDeck.ts)
 * so presentation needs no extra lookup, and the deck survives app
 * restarts the way settings do.
 */
export interface SermonDeckEntry {
  /** Canonical verse id (verses.id), unique within the deck. */
  id: number;
  /** e.g. "John 3:16" — ready-made slide label. */
  label: string;
  /** Verse text as it appears in the reader. */
  text: string;
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
