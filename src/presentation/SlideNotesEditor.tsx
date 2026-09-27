import { useEffect, useRef, useState } from "react";

/**
 * Dedicated presenter-notes editor (AGENTS.md, Presenter notes rule
 * #1): a modal dialog with a large textarea, opened from a slide row's
 * "Notes" button. Private text for the presenter only — stored on the
 * slide, never rendered on the audience presentation window.
 *
 * Save is always enabled: saving blank text clears the notes (see
 * `setSlideNotes`). Ctrl+Enter saves from the keyboard; Escape (or the
 * scrim) cancels without saving. The panel remounts the editor (via
 * `key`) each time it opens, so the draft always starts from the
 * slide's current notes.
 */
export function SlideNotesEditor({
  slideLabel,
  initialNotes = "",
  onSave,
  onCancel,
}: {
  /** e.g. "John 3:16" — shown in the title so the target is obvious. */
  slideLabel: string;
  initialNotes?: string;
  onSave: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on open so keyboard users can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape cancels without saving. Capture + stopPropagation: the deck
  // panel also listens for Escape on window (to close itself), and the
  // dialog must win while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const save = () => onSave(notes.trim());

  return (
    <div className="slide-notes-overlay">
      <div className="slide-notes-scrim" onClick={onCancel} aria-hidden="true" />
      <form
        className="slide-notes-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Presenter notes for ${slideLabel}`}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 className="slide-notes-title">Notes — {slideLabel}</h2>
        <p className="slide-notes-sub">
          Private presenter notes — never shown on stage.
        </p>
        <textarea
          id="slide-notes-body"
          ref={inputRef}
          className="slide-notes-input"
          value={notes}
          rows={10}
          placeholder="What do you want to remember when this slide is up?"
          aria-label={`Presenter notes for ${slideLabel}`}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl+Enter saves without reaching for the mouse.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="slide-notes-actions">
          <button type="submit" className="sermon-deck-present">
            Save Notes
          </button>
          <button
            type="button"
            className="sermon-deck-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        <p className="slide-notes-hint">Ctrl+Enter saves. Saving empty text clears the notes.</p>
      </form>
    </div>
  );
}
