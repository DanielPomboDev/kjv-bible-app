import { useCallback, useEffect, useRef, useState } from "react";
import { presentDeck } from "../services/presentation";
import { useSermonDeck } from "../store/sermonDeck";
import { usePresentationBackground } from "../store/presentationBackground";
import type { CustomSlideItem } from "../domain/types";
import { useToast } from "../store/toast";
import { BackgroundPicker } from "../presentation/BackgroundPicker";
import { CustomSlideEditor } from "../presentation/CustomSlideEditor";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, DeckIcon } from "./icons";

/**
 * The sermon deck panel: a stack button in the TopBar opening a popover
 * that lists the queued verses in presentation order — reference plus a
 * short text preview per row, with up/down reorder buttons and a remove
 * button (AGENTS.md: keyboard must work, so everything is real buttons).
 *
 * Mirrors SettingsPanel's popover behaviour: Escape or an outside click
 * closes it; styled with popover tokens (surface, radius-lg, shadow-2).
 * Drag-to-reorder is deliberately not built — up/down buttons are
 * simpler to make solid.
 */
export function SermonDeckPanel() {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // Non-null while the editor is editing an existing custom slide (its
  // id); null when adding a fresh one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const deck = useSermonDeck((s) => s.deck);
  const addCustomSlide = useSermonDeck((s) => s.addCustomSlide);
  const updateCustomSlide = useSermonDeck((s) => s.updateCustomSlide);
  const removeFromDeck = useSermonDeck((s) => s.removeFromDeck);
  const moveInDeck = useSermonDeck((s) => s.moveInDeck);
  const clearDeck = useSermonDeck((s) => s.clearDeck);
  const showToast = useToast((s) => s.showToast);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the editor (whether adding or editing) and forget which
  // slide was being edited.
  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
  }, []);

  // Close on Escape while open (focus may sit anywhere in the popover).
  // When the background picker or the custom slide editor is open,
  // Escape closes just that section first; a further Escape closes the
  // whole panel. (The editor also closes itself on Escape — either path
  // lands here with the editor already closed, which is harmless.)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editorOpen) closeEditor();
        else if (pickerOpen) setPickerOpen(false);
        else setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pickerOpen, editorOpen, closeEditor]);

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

  // The custom slide under edit, if it is still in the deck (it could
  // have been removed while the editor was open — saving then no-ops
  // with a toast instead of crashing).
  const editingItem =
    editingId !== null
      ? (deck.find(
          (e): e is CustomSlideItem => e.type === "custom" && e.id === editingId,
        ) ?? null)
      : null;

  const onSaveCustomSlide = useCallback(
    (title: string | undefined, body: string) => {
      // Editing updates the slide in place (AGENTS.md, Custom slide
      // rule #5) — never a duplicate entry. A refused save (blank body,
      // or a slide removed mid-edit) toasts and leaves the editor open
      // so nothing is lost.
      if (editingId !== null) {
        if (editingItem === null) {
          showToast("Custom slide is no longer in the deck");
          closeEditor();
        } else if (updateCustomSlide(editingId, title, body)) {
          showToast("Custom slide updated");
          closeEditor();
        } else {
          showToast("Body text is required");
        }
      } else if (addCustomSlide(title, body) !== null) {
        showToast("Added custom slide to sermon deck");
        closeEditor();
      } else {
        showToast("Body text is required");
      }
    },
    [
      editingId,
      editingItem,
      addCustomSlide,
      updateCustomSlide,
      showToast,
      closeEditor,
    ],
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
        <div className="sermon-deck-panel" role="dialog" aria-label="Sermon deck">
          <div className="sermon-deck-header">
            <div className="sermon-deck-header-top">
              <span className="sermon-deck-title">Sermon Deck</span>
              <span className="sermon-deck-count" aria-live="polite">
                {count === 0
                  ? "Empty"
                  : `${count} slide${count === 1 ? "" : "s"}`}
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
              <button
                type="button"
                className="sermon-deck-secondary"
                aria-expanded={editorOpen && editingId === null}
                onClick={() => {
                  // Toggle a fresh add-form; switching away from an edit.
                  if (editorOpen && editingId === null) closeEditor();
                  else {
                    setEditingId(null);
                    setEditorOpen(true);
                  }
                }}
              >
                Add Custom Slide
              </button>
            </div>
          </div>
          {pickerOpen && (
            <BackgroundPicker onClose={() => setPickerOpen(false)} />
          )}
          {editorOpen && (
            <CustomSlideEditor
              // Remount per target so the fields always start pre-filled
              // with that slide (or empty for a new one).
              key={editingItem?.id ?? "new"}
              initialTitle={editingItem?.title ?? ""}
              initialBody={editingItem?.body ?? ""}
              saveLabel={editingItem ? "Save Changes" : "Add Slide"}
              formLabel={editingItem ? "Edit custom slide" : "New custom slide"}
              onSave={onSaveCustomSlide}
              onCancel={closeEditor}
            />
          )}
          {count === 0 ? (
            <p className="sermon-deck-empty">
              No slides yet. Right-click a verse and choose “Add to Sermon
              Deck”, or choose “Add Custom Slide”.
            </p>
          ) : (
            <ol className="sermon-deck-list">
              {deck.map((item, index) => {
                // Verse slides render exactly as before; custom slides
                // show their title/body through the same row layout.
                const ref =
                  item.type === "verse"
                    ? item.label
                    : item.title || "Custom slide";
                const preview = item.type === "verse" ? item.text : item.body;
                const entryInner = (
                  <>
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
                  </>
                );
                return (
                  <li
                    key={`${item.type}:${item.id}`}
                    className="sermon-deck-row"
                  >
                    <span className="sermon-deck-position" aria-hidden="true">
                      {index + 1}
                    </span>
                    {item.type === "custom" ? (
                      // Custom rows are clickable (keyboard: Enter/Space):
                      // they reopen the editor pre-filled for in-place
                      // editing. Verse rows stay plain text.
                      <button
                        type="button"
                        className="sermon-deck-entry sermon-deck-edit"
                        aria-label={`Edit custom slide ${ref}`}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditorOpen(true);
                        }}
                      >
                        {entryInner}
                      </button>
                    ) : (
                      <span className="sermon-deck-entry">{entryInner}</span>
                    )}
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
