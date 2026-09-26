import { useCallback } from "react";
import { useSelection } from "../store/selection";

/**
 * One verse inside the reading pane. Click behavior per
 * the style guide: plain click toggles, Ctrl/Cmd+click adds/removes one,
 * Shift+click selects a range from the last non-shift-clicked verse.
 * Hover is pure CSS (verse.css).
 */
export function Verse({ id, verse, text }: { id: number; verse: number; text: string }) {
  const selected = useSelection((s) => s.selectedIds.has(id));
  const verseClick = useSelection((s) => s.verseClick);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      verseClick(id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    },
    [id, verseClick],
  );

  return (
    <span
      className={`verse${selected ? " verse-selected" : ""}`}
      onClick={onClick}
      data-verse-id={id}
    >
      <sup className="verse-number">{verse}</sup> {text}
    </span>
  );
}
