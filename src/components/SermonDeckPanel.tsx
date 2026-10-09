import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useDeck } from "../store/deck";
import { deckKey } from "../domain/types";
import { BackgroundPicker } from "../presentation/BackgroundPicker";
import { OutlineTab } from "../sermon/OutlineTab";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, CopyIcon, DeckIcon } from "./icons";
import { useFocusReturn } from "./focus";

/**
 * The deck panel: a stack button in the TopBar opening a popover with
 * two tabs — Deck and Outline — for the sermon deck.
 *
 * The Deck tab lists the queued slides in presentation order — reference
 * plus a short text preview per row, with up/down reorder buttons,
 * duplicate, and remove (everything is real buttons, so keyboard
 * works). Slides are assembled here and designed in PowerPoint after
 * export: nothing here edits slide content. The Outline tab holds
 * planning sections (outline rules): ordered, editable, and never
 * exported as slides — separate from the deck on purpose.
 *
 * Mirrors SettingsPanel's popover behaviour: Escape or an outside click
 * closes it; styled with popover tokens (surface, radius-lg, shadow-2).
 * Drag-to-reorder is deliberately not built — up/down buttons are
 * simpler to make solid.
 */
export function SermonDeckPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"deck" | "outline">("deck");
  const [pickerOpen, setPickerOpen] = useState(false);
  const deck = useDeck((s) => s.deck);
  const outlineCount = useDeck((s) => s.outline.length);
  const removeFromDeck = useDeck((s) => s.removeFromDeck);
  const duplicateDeckItem = useDeck((s) => s.duplicateDeckItem);
  const moveInDeck = useDeck((s) => s.moveInDeck);
  const clearDeck = useDeck((s) => s.clearDeck);
  const panelRef = useRef<HTMLDivElement>(null);
  const deckTabRef = useRef<HTMLButtonElement>(null);
  const outlineTabRef = useRef<HTMLButtonElement>(null);

  // Return focus to the TopBar button when the popover closes.
  useFocusReturn(open);

  // Arrow keys move between the Deck/Outline tabs (tablist pattern).
  const onTabsKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tab === "deck" ? "outline" : "deck";
      setTab(next);
      (next === "deck" ? deckTabRef : outlineTabRef).current?.focus();
    },
    [tab],
  );

  // Close on Escape while open (focus may sit anywhere in the popover).
  // When the background picker is open, Escape closes just that section
  // first; a further Escape closes the whole panel.
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
            : `Sermon deck, ${count} slide${count === 1 ? "" : "s"} queued`
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
        <div
          className="sermon-deck-panel"
          role="dialog"
          aria-label={tab === "deck" ? "Sermon deck" : "Sermon outline"}
        >
          <div className="sermon-deck-header">
            <div className="sermon-deck-header-top">
              <span className="sermon-deck-title">Sermon Deck</span>
              <span className="sermon-deck-count" aria-live="polite">
                {tab === "deck"
                  ? count === 0
                    ? "Empty"
                    : `${count} slide${count === 1 ? "" : "s"}`
                  : outlineCount === 0
                    ? "Empty"
                    : `${outlineCount} section${outlineCount === 1 ? "" : "s"}`}
              </span>
              {tab === "deck" && count > 0 && (
                <button
                  type="button"
                  className="sermon-deck-clear"
                  onClick={clearDeck}
                >
                  Clear
                </button>
              )}
            </div>
            <div
              className="sermon-deck-tabs"
              role="tablist"
              aria-label="Sermon panel"
              onKeyDown={onTabsKeyDown}
            >
              <button
                type="button"
                role="tab"
                ref={deckTabRef}
                className="sermon-deck-tab"
                aria-selected={tab === "deck"}
                tabIndex={tab === "deck" ? 0 : -1}
                onClick={() => setTab("deck")}
              >
                Deck
              </button>
              <button
                type="button"
                role="tab"
                ref={outlineTabRef}
                className="sermon-deck-tab"
                aria-selected={tab === "outline"}
                tabIndex={tab === "outline" ? 0 : -1}
                onClick={() => setTab("outline")}
              >
                Outline
              </button>
            </div>
            {tab === "deck" && (
            <div className="sermon-deck-header-actions">
              <button
                type="button"
                className="sermon-deck-secondary"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((o) => !o)}
              >
                Background
              </button>
            </div>
            )}
          </div>
          {tab === "deck" ? (
          <>
          {pickerOpen && (
            <BackgroundPicker onClose={() => setPickerOpen(false)} />
          )}
          {count === 0 ? (
            <p className="sermon-deck-empty">
              No slides yet. Right-click a verse and choose “Add to Sermon
              Deck”.
            </p>
          ) : (
            <ol className="sermon-deck-list">
              {deck.map((item, index) => {
                const ref =
                  item.type === "verse"
                    ? item.label
                    : item.title || "Custom slide";
                const preview = item.type === "verse" ? item.text : item.body;
                // Per-entry identity (see deckKey): duplicated verses
                // share an id, so rows key off this.
                const key = deckKey(item);
                return (
                  <li
                    key={key}
                    className="sermon-deck-row"
                  >
                    <span className="sermon-deck-position" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="sermon-deck-main">
                      <span className="sermon-deck-entry">
                        <span className="sermon-deck-ref">
                          {ref}
                          {item.type === "custom" && (
                            <span
                              className="sermon-deck-kind"
                              aria-hidden="true"
                            >
                              Custom
                            </span>
                          )}
                        </span>
                        <span className="sermon-deck-preview">{preview}</span>
                      </span>
                    </div>
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
                        className="sermon-deck-btn"
                        aria-label={`Duplicate ${ref}`}
                        onClick={() => duplicateDeckItem(index)}
                      >
                        <CopyIcon />
                      </button>
                      <button
                        type="button"
                        className="sermon-deck-btn sermon-deck-btn-remove"
                        aria-label={`Remove ${ref} from the deck`}
                        onClick={() => removeFromDeck(key)}
                      >
                        <CloseIcon />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          </>
          ) : (
            <OutlineTab />
          )}
        </div>
      )}
    </div>
  );
}
