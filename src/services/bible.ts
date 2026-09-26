import { invoke } from "@tauri-apps/api/core";
import type { Book, Chapter, SearchResult } from "../domain/types";

/**
 * All 66 books in canonical order, each with its chapter count.
 */
export function getBooks(): Promise<Book[]> {
  return invoke<Book[]>("get_books");
}

/**
 * Fetch all verses for one book+chapter, in verse order.
 * `bookId` is the canonical book number (1–66, e.g. 43 = John).
 */
export function getChapter(bookId: number, chapter: number): Promise<Chapter> {
  return invoke<Chapter>("get_chapter", { bookId, chapter });
}

/**
 * Search the Bible: a book+chapter+verse reference ("John 3:16"), a
 * book+chapter reference ("John 3"), or full-text word/phrase search
 * (quoted text = exact phrase).
 */
export function searchBible(query: string): Promise<SearchResult> {
  return invoke<SearchResult>("search_bible", { query });
}
