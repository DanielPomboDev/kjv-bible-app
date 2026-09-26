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
