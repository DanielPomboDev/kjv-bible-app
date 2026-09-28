import { useEffect, useRef, useState } from "react";

/**
 * Custom slide editor: deliberately plain — a title field (optional) and a body field (required), plus
 * Save/Cancel. No formatting toolbar, no images, no layouts in v1.
 *
 * Doubles as the edit form: `initialTitle`/`initialBody` pre-fill the
 * fields and `saveLabel` becomes "Save Changes", while the
 * default empty values and "Add Slide" label serve new slides. The panel
 * remounts the editor (via `key`) each time it opens, so the initial
 * values are always fresh. Save is disabled until the body has
 * non-blank text; a blank title is reported as `undefined` so the deck
 * stores no empty title. Escape cancels (the panel closes the editor
 * first — see SermonDeckPanel).
 */
export function CustomSlideEditor({
  initialTitle = "",
  initialBody = "",
  saveLabel = "Add Slide",
  formLabel = "New custom slide",
  onSave,
  onCancel,
}: {
  initialTitle?: string;
  initialBody?: string;
  saveLabel?: string;
  formLabel?: string;
  onSave: (title: string | undefined, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus the title field on open so keyboard users can type immediately.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Escape cancels without saving.
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

  const canSave = body.trim().length > 0;

  return (
    <form
      className="custom-slide-editor"
      aria-label={formLabel}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        const cleanTitle = title.trim();
        onSave(cleanTitle === "" ? undefined : cleanTitle, body.trim());
      }}
    >
      <label className="custom-slide-label" htmlFor="custom-slide-title">
        Title (optional)
      </label>
      <input
        id="custom-slide-title"
        ref={titleRef}
        type="text"
        className="custom-slide-input"
        value={title}
        placeholder="e.g. The Good Shepherd"
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="custom-slide-label" htmlFor="custom-slide-body">
        Body
      </label>
      <textarea
        id="custom-slide-body"
        className="custom-slide-input custom-slide-body"
        value={body}
        rows={4}
        placeholder="Sermon point or heading text"
        aria-required="true"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="custom-slide-actions">
        <button
          type="submit"
          className="sermon-deck-present"
          disabled={!canSave}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          className="sermon-deck-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      {!canSave && (
        <p className="custom-slide-hint">Body text is required to save.</p>
      )}
    </form>
  );
}
