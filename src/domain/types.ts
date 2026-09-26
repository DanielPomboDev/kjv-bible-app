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
