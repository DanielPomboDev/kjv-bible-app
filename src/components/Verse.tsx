import { useCallback } from "react";
import { useSelection } from "../store/selection";
import { copyText, formatVerses } from "../services/clipboard";
import { useToast } from "../store/toast";
import type { ChapterVerse } from "../domain/types";

/**
 * One verse inside the reading pane. Click behavior per
 * the style guide: plain click toggles, Ctrl/Cmd+click adds/removes one,
 * Shift+click selects a range, double-click copies the verse immediately.
 * Hover is pure CSS (verse.css).
 */
export function Verse({ id, verse, text }: { id: number; verse: number; text: string }) {
  const selected = useSelection((s) => s.selectedIds.has(id));
  const verseClick = useSelection((s) => s.verseClick);
  const showToast = useToast((s) => s.showToast);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      verseClick(id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    },
    [id, verseClick],
  );

  // Double-click copies just this verse, in the exact project notes format.
  const onDoubleClick = useCallback(async () => {
    const single: ChapterVerse = { id, bookName: "", chapter: 0, verse, text };
    try {
      await copyText(formatVerses([single]));
      showToast("Copied");
    } catch (e) {
      showToast(`Copy failed: ${String(e)}`);
    }
  }, [id, verse, text, showToast]);

  return (
    <span
      className={`verse${selected ? " verse-selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-verse-id={id}
    >
      <sup className="verse-number">{verse}</sup> {text}
    </span>
  );
}
