import { useCallback, useState } from "react";
import { getVersesByIds } from "../services/bible";
import { copyText, formatVerses } from "../services/clipboard";
import { useSelection } from "../store/selection";
import { useDeck } from "../store/deck";
import { useToast } from "../store/toast";
import { exportDeckPptx, tryAppendVersesLive } from "../export/pptx";
import type { ChapterVerse, SermonDeckItem } from "../domain/types";

/** One selected verse → one deck slide appended at the end. */
function toSlide(v: ChapterVerse): SermonDeckItem {
  return {
    type: "verse",
    id: v.id,
    label: `${v.bookName} ${v.chapter}:${v.verse}`,
    text: v.text,
  };
}

/**
 * Floating pill that appears above the bottom center of the window only
 * while one or more verses are selected. "Copy Selected" copies every selected verse in book/chapter/verse order,
 * blank line between verses; "Add to Deck" queues the same verses as
 * slides in the open sermon's deck in one go (skipping ones already
 * there); "Clear" is the quiet secondary action and empties the
 * selection.
 */
export function CopyToolbar() {
  const count = useSelection((s) => s.selectedIds.size);
  const clear = useSelection((s) => s.clear);
  const showToast = useToast((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const addSelectedToDeck = useCallback(async () => {
    const ids = [...useSelection.getState().selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const verses = await getVersesByIds(ids);
      const { added, skipped } =
        useDeck.getState().addManyToDeck(verses.map(toSlide));
      if (added === 0) {
        showToast(
          skipped === 1
            ? "Already in the sermon deck"
            : `All ${skipped} already in the sermon deck`,
        );
      } else if (skipped === 0) {
        showToast(
          added === 1 ? "Added 1 verse to sermon deck" : `Added ${added} verses to sermon deck`,
        );
      } else {
        showToast(
          `Added ${added} verse${added === 1 ? "" : "s"} to sermon deck (${skipped} already there)`,
        );
      }
    } catch (e) {
      showToast(`Add to deck failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

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

  // Append-at-end update: queue the selection last in the deck, then add
  // the fresh ones to the running show if ours is presenting, else
  // re-render the whole deck over the same temp file.
  const addSelectedAndUpdate = useCallback(async () => {
    const ids = [...useSelection.getState().selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const verses = await getVersesByIds(ids);
      const before = new Set(useDeck.getState().deck.map((e) => e.id));
      const { added } = useDeck.getState().addManyToDeck(verses.map(toSlide));
      const { deck, backgroundPresetId } = useDeck.getState();
      const fresh = verses.filter((v) => !before.has(v.id));
      const live =
        fresh.length > 0
          ? await tryAppendVersesLive(
              fresh.map((v) => ({
                label: `${v.bookName} ${v.chapter}:${v.verse}`,
                text: v.text,
              })),
              backgroundPresetId,
            )
          : null;
      if (live) {
        showToast(
          `Added ${live.added} verse${live.added === 1 ? "" : "s"} — show continues at slide ${live.resumedAt} (${live.total} total)`,
        );
      } else {
        await exportDeckPptx({
          title: "Sermon Deck",
          deck: [...deck],
          backgroundPresetId,
        });
        showToast(
          added > 0
            ? `Added ${added} verse${added === 1 ? "" : "s"} — updated in PowerPoint (${deck.length} slides)`
            : `Already in the deck — reopened in PowerPoint (${deck.length} slides)`,
        );
      }
    } catch (e) {
      showToast(`PowerPoint update failed: ${String(e)}`);
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
          onClick={addSelectedToDeck}
          disabled={busy}
        >
          Add to Deck
        </button>
        <button
          type="button"
          className="copy-toolbar-button copy-toolbar-button-ghost"
          onClick={addSelectedAndUpdate}
          disabled={busy}
          title="Add the selection to the deck and reopen it in PowerPoint"
        >
          Add + Update PPT
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
