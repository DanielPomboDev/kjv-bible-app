import { useCallback, useEffect, useRef, useState } from "react";
import { presentDeck } from "../services/presentation";
import { useSermonDeck } from "../store/sermonDeck";
import { usePresentationBackground } from "../store/presentationBackground";
import { useToast } from "../store/toast";
import { BackgroundPicker } from "../presentation/BackgroundPicker";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, DeckIcon } from "./icons";

/**
 * The sermon deck panel: a stack button in the TopBar opening a popover
 * that lists the queued verses in presentation order — reference plus a
 * short text preview per row, with up/down reorder buttons and a remove
 * button (project notes: keyboard must work, so everything is real buttons).
 *
 * Mirrors SettingsPanel's popover behaviour: Escape or an outside click
 * closes it; styled with popover tokens (surface, radius-lg, shadow-2).
 * Drag-to-reorder is deliberately not built — up/down buttons are
 * simpler to make solid.
 */
export function SermonDeckPanel() {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const deck = useSermonDeck((s) => s.deck);
  const removeFromDeck = useSermonDeck((s) => s.removeFromDeck);
  const moveInDeck = useSermonDeck((s) => s.moveInDeck);
  const clearDeck = useSermonDeck((s) => s.clearDeck);
  const showToast = useToast((s) => s.showToast);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape while open (focus may sit anywhere in the popover).
  // When the background picker is open, Escape closes just the picker
  // first; a second Escape closes the whole panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pickerOpen) setPickerOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pickerOpen]);

  // Close when clicking outside the popover or the stack button.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        panelRef.current &&
        target &&
        !panelRef.current.contains(target) &&
        !target.closest("[data-sermon-deck-toggle]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const moveUp = useCallback(
    (index: number) => moveInDeck(index, index - 1),
    [moveInDeck],
  );
  const moveDown = useCallback(
    (index: number) => moveInDeck(index, index + 1),
    [moveInDeck],
  );

  const onPresent = useCallback(() => {
    if (deck.length > 0) {
      setOpen(false);
      // Snapshot the selected background so the stage renders the new
      // look picked just before presenting.
      const background = usePresentationBackground.getState().presetId;
      void presentDeck(deck, background).catch((e) =>
        showToast(`Presentation failed: ${e}`),
      );
    }
  }, [deck, showToast]);

  const count = deck.length;

  return (
    <div className="sermon-deck" ref={panelRef}>
      <button
        type="button"
        className="sermon-deck-toggle"
        data-sermon-deck-toggle
        aria-label={
          count === 0
            ? "Sermon deck, empty"
            : `Sermon deck, ${count} verse${count === 1 ? "" : "s"} queued`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sermon-deck-toggle-icon" aria-hidden="true">
          <DeckIcon />
        </span>
        {count > 0 && (
          <span className="sermon-deck-badge" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="sermon-deck-panel" role="dialog" aria-label="Sermon deck">
          <div className="sermon-deck-header">
            <div className="sermon-deck-header-top">
              <span className="sermon-deck-title">Sermon Deck</span>
              <span className="sermon-deck-count" aria-live="polite">
                {count === 0
                  ? "Empty"
                  : `${count} verse${count === 1 ? "" : "s"}`}
              </span>
              {count > 0 && (
                <button
                  type="button"
                  className="sermon-deck-clear"
                  onClick={clearDeck}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="sermon-deck-header-actions">
              {count > 0 && (
                <button
                  type="button"
                  className="sermon-deck-present"
                  onClick={onPresent}
                >
                  Present
                </button>
              )}
              <button
                type="button"
                className="sermon-deck-secondary"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((o) => !o)}
              >
                Background
              </button>
            </div>
          </div>
          {pickerOpen && (
            <BackgroundPicker onClose={() => setPickerOpen(false)} />
          )}
          {count === 0 ? (
            <p className="sermon-deck-empty">
              No verses yet. Right-click a verse and choose “Add to Sermon
              Deck”.
            </p>
          ) : (
            <ol className="sermon-deck-list">
              {deck.map((item, index) => {
                // Verse slides render exactly as before; custom slides
                // (no editor yet, so none exist at runtime) show their
                // title/body through the same row layout.
                const ref =
                  item.type === "verse"
                    ? item.label
                    : item.title || "Custom slide";
                const preview = item.type === "verse" ? item.text : item.body;
                return (
                  <li
                    key={`${item.type}:${item.id}`}
                    className="sermon-deck-row"
                  >
                    <span className="sermon-deck-position" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="sermon-deck-entry">
                      <span className="sermon-deck-ref">{ref}</span>
                      <span className="sermon-deck-preview">{preview}</span>
                    </span>
                    <span className="sermon-deck-actions">
                      <button
                        type="button"
                        className="sermon-deck-btn"
                        aria-label={`Move ${ref} up`}
                        disabled={index === 0}
                        onClick={() => moveUp(index)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className="sermon-deck-btn"
                        aria-label={`Move ${ref} down`}
                        disabled={index === count - 1}
                        onClick={() => moveDown(index)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        type="button"
                        className="sermon-deck-btn sermon-deck-btn-remove"
                        aria-label={`Remove ${ref} from the deck`}
                        onClick={() => removeFromDeck(item.id)}
                      >
                        <CloseIcon />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
