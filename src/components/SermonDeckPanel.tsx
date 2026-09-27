import { useCallback, useEffect, useRef, useState } from "react";
import { presentDeck } from "../services/presentation";
import { useSermonDeck } from "../store/sermonDeck";
import { useToast } from "../store/toast";

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
  const deck = useSermonDeck((s) => s.deck);
  const removeFromDeck = useSermonDeck((s) => s.removeFromDeck);
  const moveInDeck = useSermonDeck((s) => s.moveInDeck);
  const clearDeck = useSermonDeck((s) => s.clearDeck);
  const showToast = useToast((s) => s.showToast);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape while open (focus may sit anywhere in the popover).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      void presentDeck(deck).catch((e) => showToast(`Presentation failed: ${e}`));
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
          ☰
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
            <span className="sermon-deck-title">Sermon Deck</span>
            {count > 0 && (
              <>
                <span className="sermon-deck-count" aria-live="polite">
                  {count} verse{count === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className="sermon-deck-present"
                  onClick={onPresent}
                >
                  Present
                </button>
                <button
                  type="button"
                  className="sermon-deck-clear"
                  onClick={clearDeck}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          {count === 0 ? (
            <p className="sermon-deck-empty">
              No verses yet. Right-click a verse and choose “Add to Sermon
              Deck”.
            </p>
          ) : (
            <ol className="sermon-deck-list">
              {deck.map((entry, index) => (
                <li key={entry.id} className="sermon-deck-row">
                  <span className="sermon-deck-position" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="sermon-deck-entry">
                    <span className="sermon-deck-ref">{entry.label}</span>
                    <span className="sermon-deck-preview">{entry.text}</span>
                  </span>
                  <span className="sermon-deck-actions">
                    <button
                      type="button"
                      className="sermon-deck-btn"
                      aria-label={`Move ${entry.label} up`}
                      disabled={index === 0}
                      onClick={() => moveUp(index)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sermon-deck-btn"
                      aria-label={`Move ${entry.label} down`}
                      disabled={index === count - 1}
                      onClick={() => moveDown(index)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="sermon-deck-btn sermon-deck-btn-remove"
                      aria-label={`Remove ${entry.label} from the deck`}
                      onClick={() => removeFromDeck(entry.id)}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
