import { useCallback } from "react";
import { useSelection } from "../store/selection";
import { copyText, formatVerses } from "../services/clipboard";
import { useToast } from "../store/toast";
import type { ChapterVerse } from "../domain/types";

/**
 * One verse inside the reading pane. Click behavior: plain click toggles, Ctrl/Cmd+click adds/removes one,
 * Shift+click selects a range, double-click copies the verse immediately.
 * Keyboard: the verse is a checkbox — Enter/Space toggles it, Shift+F10 (or
 * the context-menu key) opens the verse menu at the verse itself.
 * Right-click reports (verseId, x, y) upward; App resolves the full
 * ChapterVerse from the loaded chapter and opens the context menu.
 * Hover is pure CSS (verse.css).
 */
export function Verse({
  id,
  verse,
  text,
  bookName,
  chapter,
  onContextMenu,
}: {
  id: number;
  verse: number;
  text: string;
  bookName: string;
  chapter: number;
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

  // Double-click copies just this verse, one verse per line format.
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
  // context menu. Keyboard-triggered contextmenu events (Shift+F10,
  // context-menu key) arrive with a (0,0) position — anchor those at the
  // verse itself so keyboard users get the menu too.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      if (!onContextMenu) return;
      e.preventDefault();
      let { clientX, clientY } = e as React.MouseEvent;
      if (clientX === 0 && clientY === 0) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        clientX = Math.round(rect.left + 40);
        clientY = Math.round(rect.top + 20);
      }
      onContextMenu(id, clientX, clientY);
    },
    [id, onContextMenu],
  );

  // Enter/Space toggles exactly like a plain click; the context-menu key
  // falls through to handleContextMenu above.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        verseClick(id, { ctrl: false, shift: false });
      } else if (e.key === "ContextMenu") {
        handleContextMenu(e);
      }
    },
    [id, verseClick, handleContextMenu],
  );

  return (
    <div
      className={`verse${selected ? " verse-selected" : ""}`}
      role="checkbox"
      aria-checked={selected}
      aria-label={`${bookName} ${chapter}:${verse}`}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
      data-verse-id={id}
    >
      <sup className="verse-number">{verse}</sup> {text}
    </div>
  );
}
