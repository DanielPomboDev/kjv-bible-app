import { invoke } from "@tauri-apps/api/core";
import type { Chapter } from "../domain/types";

/**
 * Fetch all verses for one book+chapter, in verse order.
 * `bookId` is the canonical book number (1–66, e.g. 43 = John).
 */
export function getChapter(bookId: number, chapter: number): Promise<Chapter> {
  return invoke<Chapter>("get_chapter", { bookId, chapter });
}
