import type { ChapterVerse } from "../domain/types";

/**
 * The clipboard format, exactly as specified in project notes:
 * - one verse:   `16 For God so loved the world...` (verse number first)
 * - many verses: same per-verse format, one per line, separated by a
 *   blank line — never one big paragraph — always in book/chapter/verse
 *   order.
 *
 * `verses` must already be in canonical order (getVersesByIds returns
 * it that way); this function does not reorder, only formats.
 */
export function formatVerses(verses: ChapterVerse[]): string {
  return verses.map((v) => `${v.verse} ${v.text}`).join("\n\n");
}

/** Write plain text to the clipboard (never HTML, per project notes). */
export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("clipboard is not available");
  }
  await navigator.clipboard.writeText(text);
}
