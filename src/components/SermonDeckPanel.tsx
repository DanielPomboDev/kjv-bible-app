import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePresentFlow } from "../store/presentFlow";
import { useActiveSermon } from "../store/activeSermon";
import type { CustomSlideItem, SermonDeckItem } from "../domain/types";
import { useToast } from "../store/toast";
import { BackgroundPicker } from "../presentation/BackgroundPicker";
import { CustomSlideEditor } from "../presentation/CustomSlideEditor";
import { OutlineTab } from "../sermon/OutlineTab";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, DeckIcon } from "./icons";

/**
 * Private presenter notes for one slide (Presenter notes rule
 * #1): a small toggle under the slide entry expanding a plain textarea.
 * Notes save on blur (or when collapsing the field) and clear when left
 * blank — they are stored on the slide but never rendered on the
 * audience presentation window.
 */
function SlideNotesField({
  item,
  label,
}: {
  item: SermonDeckItem;
  label: string;
}) {
  const setSlideNotes = useActiveSermon((s) => s.setSlideNotes);
  const notes = item.notes ?? "";
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(notes);

  // Follow external changes (sermon switch, or another edit of the
  // same slide) so the field never shows a stale value.
  useEffect(() => {
    setDraft(notes);
  }, [notes, item.id]);

  const save = useCallback(
    (value: string) => setSlideNotes(item.id, value),
    [setSlideNotes, item.id],
  );

  const fieldId = `slide-notes-${item.type}-${item.id}`;
  const hasNotes = notes.length > 0;

  return (
    <div className="sermon-deck-notes">
      <button
        type="button"
        className="sermon-deck-notes-toggle"
        aria-expanded={expanded}
        aria-controls={fieldId}
        onClick={() => {
          // Collapsing with unsaved edits saves first so nothing typed
          // is lost by toggling the field shut.
          if (expanded && draft !== notes) save(draft);
          setExpanded((e) => !e);
        }}
      >
        {expanded ? "Hide notes" : hasNotes ? "Edit notes" : "Add notes"}
        {hasNotes && !expanded && (
          <span className="sermon-deck-notes-dot" aria-hidden="true" />
        )}
      </button>
      {expanded && (
        <textarea
          id={fieldId}
          className="sermon-deck-notes-input"
          value={draft}
          rows={2}
          placeholder="Private presenter notes — never shown on stage"
          aria-label={`Presenter notes for ${label}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== notes) save(draft);
          }}
          onKeyDown={(e) => {
            // Escape ends notes editing without closing the whole
            // panel (the panel also listens for Escape on window).
            if (e.key === "Escape") {
              e.stopPropagation();
              if (draft !== notes) save(draft);
              setExpanded(false);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * The sermon panel: a stack button in the TopBar opening a popover with
 * two tabs — Deck and Outline — for the currently open sermon.
 *
 * The Deck tab lists the queued slides in presentation order — reference
 * plus a short text preview per row, with up/down reorder buttons and a
 * remove button (project notes: keyboard must work, so everything is real
 * buttons). The Outline tab holds the sermon's planning sections
 * (Outline rules): ordered, editable, and never presented —
 * separate from the deck on purpose.
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
  const [editorOpen, setEditorOpen] = useState(false);
  // Non-null while the editor is editing an existing custom slide (its
  // id); null when adding a fresh one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const deck = useActiveSermon((s) => s.sermon.deck);
  const outlineCount = useActiveSermon((s) => s.sermon.outline.length);
  const sermonTitle = useActiveSermon((s) => s.sermon.title);
  const addCustomSlide = useActiveSermon((s) => s.addCustomSlide);
  const updateCustomSlide = useActiveSermon((s) => s.updateCustomSlide);
  const removeFromDeck = useActiveSermon((s) => s.removeFromDeck);
  const moveInDeck = useActiveSermon((s) => s.moveInDeck);
  const clearDeck = useActiveSermon((s) => s.clearDeck);
  const showToast = useToast((s) => s.showToast);
  const panelRef = useRef<HTMLDivElement>(null);
  const deckTabRef = useRef<HTMLButtonElement>(null);
  const outlineTabRef = useRef<HTMLButtonElement>(null);

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
      // Snapshot the open sermon's background + outline so the stage
      // renders the new look picked just before presenting and the
      // presenter window has its reference material. The monitor gate
      // (picker, or the single-display notes warning) runs before the
      // stage opens — see store/presentFlow.ts.
      const sermon = useActiveSermon.getState().sermon;
      usePresentFlow.getState().requestPresent({
        kind: "deck",
        deck: [...deck],
        background: sermon.backgroundPresetId,
        outline: [...sermon.outline],
      });
    }
  }, [deck]);

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
      // Editing updates the slide in place (Custom slide
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
        <div
          className="sermon-deck-panel"
          role="dialog"
          aria-label={tab === "deck" ? "Sermon deck" : "Sermon outline"}
        >
          <div className="sermon-deck-header">
            <div className="sermon-deck-header-top">
              <span className="sermon-deck-title" title={sermonTitle}>
                {sermonTitle}
              </span>
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
            )}
          </div>
          {tab === "deck" ? (
          <>
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
                    <div className="sermon-deck-main">
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
                    <SlideNotesField item={item} label={ref} />
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
          </>
          ) : (
            <OutlineTab />
          )}
        </div>
      )}
    </div>
  );
}
