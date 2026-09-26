import { useCallback, useState } from "react";
import { getVersesByIds } from "../services/bible";
import { copyText, formatVerses } from "../services/clipboard";
import { useSelection } from "../store/selection";
import { useToast } from "../store/toast";

/**
 * Floating pill that appears above the bottom center of the window only
 * while one or more verses are selected (DESIGN-SYSTEM.md). "Copy
 * Selected" is the primary action and copies every selected verse in
 * book/chapter/verse order, blank line between verses; "Clear" is the
 * quiet secondary action and empties the selection.
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
      <span className="copy-toolbar-count" aria-live="polite">
        {count} verse{count === 1 ? "" : "s"} selected
      </span>
      <span className="copy-toolbar-divider" aria-hidden="true" />
      <div className="copy-toolbar-actions">
        <button
          type="button"
          className="copy-toolbar-button copy-toolbar-button-primary"
          onClick={copySelected}
          disabled={busy}
        >
          Copy Selected
        </button>
        <button
          type="button"
          className="copy-toolbar-button copy-toolbar-button-ghost"
          onClick={clear}
          disabled={busy}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
