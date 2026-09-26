import { useCallback, useState } from "react";
import { getVersesByIds } from "../services/bible";
import { copyText, formatVerses } from "../services/clipboard";
import { useSelection } from "../store/selection";
import { useToast } from "../store/toast";

/**
 * Toolbar that slides up from the bottom only while one or more verses
 * are selected (DESIGN-SYSTEM.md). "Copy Selected" copies every selected
 * verse in book/chapter/verse order, blank line between verses; "Clear
 * Selection" empties the selection.
 */
export function CopyToolbar() {
  const count = useSelection((s) => s.selectedIds.size);
  const clear = useSelection((s) => s.clear);
  const showToast = useToast((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const copySelected = useCallback(async () => {
    const ids = [...useSelection.getState().selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const verses = await getVersesByIds(ids);
      await copyText(formatVerses(verses));
      showToast(
        verses.length === 1 ? "Copied 1 verse" : `Copied ${verses.length} verses`,
      );
    } catch (e) {
      showToast(`Copy failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  if (count === 0) return null;

  return (
    <div className="copy-toolbar" role="toolbar" aria-label="Selection actions">
      <span className="copy-toolbar-count">
        {count} verse{count === 1 ? "" : "s"} selected
      </span>
      <button
        type="button"
        className="copy-toolbar-button"
        onClick={copySelected}
        disabled={busy}
      >
        Copy Selected
      </button>
      <button
        type="button"
        className="copy-toolbar-button"
        onClick={clear}
        disabled={busy}
      >
        Clear Selection
      </button>
    </div>
  );
}
