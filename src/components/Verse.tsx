import { useCallback } from "react";
import { useSelection } from "../store/selection";
import { copyText, formatVerses } from "../services/clipboard";
import { useToast } from "../store/toast";
import type { ChapterVerse } from "../domain/types";

/**
 * One verse inside the reading pane. Click behavior per
 * DESIGN-SYSTEM.md: plain click toggles, Ctrl/Cmd+click adds/removes one,
 * Shift+click selects a range, double-click copies the verse immediately.
 * Right-click reports (verseId, x, y) upward; App resolves the full
 * ChapterVerse from the loaded chapter and opens the context menu.
 * Hover is pure CSS (verse.css).
 */
export function Verse({
  id,
  verse,
  text,
  onContextMenu,
}: {
  id: number;
  verse: number;
  text: string;
  onContextMenu?: (verseId: number, x: number, y: number) => void;
}) {
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

  // Double-click copies just this verse, in the exact AGENTS.md format.
  const onDoubleClick = useCallback(async () => {
    const single: ChapterVerse = { id, bookName: "", chapter: 0, verse, text };
    try {
      await copyText(formatVerses([single]));
      showToast("Copied");
    } catch (e) {
      showToast(`Copy failed: ${String(e)}`);
    }
  }, [id, verse, text, showToast]);

  // Right-click: suppress the native menu on verses only and report the
  // verse + cursor position. Text selection elsewhere keeps its default
  // context menu.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextMenu) return;
      e.preventDefault();
      onContextMenu(id, e.clientX, e.clientY);
    },
    [id, onContextMenu],
  );

  return (
    <div
      className={`verse${selected ? " verse-selected" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      data-verse-id={id}
    >
      <sup className="verse-number">{verse}</sup> {text}
    </div>
  );
}
