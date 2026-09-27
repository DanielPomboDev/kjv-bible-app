import { useCallback, useEffect, useState } from "react";
import { presentNow } from "../services/presentation";
import { useActiveSermon } from "../store/activeSermon";
import { useToast } from "../store/toast";
import type { ChapterVerse, SermonDeckEntry } from "../domain/types";

/**
 * Right-click menu on a verse: "Present Now" (fullscreen presentation
 * comes in a later step — for now the verse is logged to the console)
 * and "Add to Sermon Deck" (queues it in the open sermon's deck). Plain
 * DOM, styled with popover tokens (surface, radius-lg, shadow-2), like
 * the settings popover.
 *
 * `verse` is null when the menu is closed; positioning is fixed at the
 * cursor, with a viewport flip when the menu would overflow an edge.
 * Closes on outside mousedown, Escape (also the global keyboard path),
 * scroll/resize (the anchor moves), or choosing an action.
 */
export function VerseContextMenu({
  verse,
  x,
  y,
  onClose,
}: {
  verse: ChapterVerse | null;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const addToDeck = useActiveSermon((s) => s.addToDeck);
  const showToast = useToast((s) => s.showToast);
  const [pos, setPos] = useState({ x, y });

  // Keep the menu on-screen: flip up/left when it would overflow an edge.
  useEffect(() => {
    if (!verse) return;
    const MENU_W = 200;
    const MENU_H = 96;
    const next = { x, y };
    if (x + MENU_W > window.innerWidth) next.x = window.innerWidth - MENU_W - 4;
    if (y + MENU_H > window.innerHeight) next.y = window.innerHeight - MENU_H - 4;
    setPos({ x: Math.max(4, next.x), y: Math.max(4, next.y) });
  }, [verse, x, y]);

  // Close on outside mousedown. mousedown, not click: contextmenu fires
  // after mousedown, so a fresh right-click elsewhere would otherwise be
  // swallowed by the document click handler that closes the old menu.
  useEffect(() => {
    if (!verse) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest(".verse-context-menu")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => document.removeEventListener("mousedown", onDocMouseDown, true);
  }, [verse, onClose]);

  // Esc closes (per project notes, keyboard must work too); scroll/resize
  // close because the menu is fixed-position and the anchor moves.
  useEffect(() => {
    if (!verse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const close = () => onClose();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [verse, onClose]);

  const toEntry = useCallback(
    (v: ChapterVerse): SermonDeckEntry => ({
      type: "verse",
      id: v.id,
      label: `${v.bookName} ${v.chapter}:${v.verse}`,
      text: v.text,
    }),
    [],
  );

  const onPresentNow = useCallback(() => {
    // Open the fullscreen stage on this one verse only — the sermon deck
    // is untouched (Sermon rule #2). The stage renders with
    // the open sermon's background preset.
    if (verse) {
      const background =
        useActiveSermon.getState().sermon.backgroundPresetId;
      void presentNow(
        {
          type: "verse",
          id: verse.id,
          label: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
          text: verse.text,
        },
        background,
      ).catch((e) => showToast(`Presentation failed: ${e}`));
    }
    onClose();
  }, [verse, showToast, onClose]);

  const onAddToDeck = useCallback(() => {
    if (verse) {
      const ref = `${verse.bookName} ${verse.chapter}:${verse.verse}`;
      const added = addToDeck(toEntry(verse));
      showToast(added ? `Added ${ref} to sermon deck` : `${ref} is already in the sermon deck`);
    }
    onClose();
  }, [verse, addToDeck, toEntry, showToast, onClose]);

  if (!verse) return null;

  return (
    <div
      className="verse-context-menu"
      role="menu"
      aria-label={`Verse actions for ${verse.bookName} ${verse.chapter}:${verse.verse}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <button
        type="button"
        className="verse-context-menu-item"
        role="menuitem"
        onClick={onPresentNow}
      >
        Present Now
      </button>
      <button
        type="button"
        className="verse-context-menu-item"
        role="menuitem"
        onClick={onAddToDeck}
      >
        Add to Sermon Deck
      </button>
    </div>
  );
}
