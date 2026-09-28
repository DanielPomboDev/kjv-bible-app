import { useEffect, useRef, useState } from "react";

/**
 * Outline section editor: deliberately plain — a heading field (required) and a body field (plain text,
 * optional), plus Save/Cancel. No formatting toolbar, no images, same
 * philosophy as custom slides. The outline is planning/reference only
 * and is never presented.
 *
 * Doubles as the edit form: `initialHeading`/`initialBody` pre-fill the
 * fields and `saveLabel` becomes "Save Changes", while the default empty
 * values and "Add Section" label serve new sections. The caller remounts
 * the editor (via `key`) each time it opens, so the initial values are
 * always fresh. Save is disabled until the heading has non-blank text.
 * Escape cancels (handled here with capture, so an outer panel's
 * bubble-phase Escape handler doesn't also fire).
 */
export function OutlineEditor({
  initialHeading = "",
  initialBody = "",
  saveLabel = "Add Section",
  formLabel = "New outline section",
  onSave,
  onCancel,
}: {
  initialHeading?: string;
  initialBody?: string;
  saveLabel?: string;
  formLabel?: string;
  onSave: (heading: string, body: string) => void;
  onCancel: () => void;
}) {
  const [heading, setHeading] = useState(initialHeading);
  const [body, setBody] = useState(initialBody);
  const headingRef = useRef<HTMLInputElement>(null);

  // Focus the heading field on open so keyboard users can type immediately.
  useEffect(() => {
    headingRef.current?.focus();
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

  const canSave = heading.trim().length > 0;

  return (
    <form
      className="custom-slide-editor"
      aria-label={formLabel}
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onSave(heading.trim(), body.trim());
      }}
    >
      <label className="custom-slide-label" htmlFor="outline-section-heading">
        Heading
      </label>
      <input
        id="outline-section-heading"
        ref={headingRef}
        type="text"
        className="custom-slide-input"
        value={heading}
        placeholder="e.g. Point 1 — Grace"
        aria-required="true"
        onChange={(e) => setHeading(e.target.value)}
      />
      <label className="custom-slide-label" htmlFor="outline-section-body">
        Notes (optional)
      </label>
      <textarea
        id="outline-section-body"
        className="custom-slide-input custom-slide-body"
        value={body}
        rows={4}
        placeholder="Planning notes for this section"
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
        <p className="custom-slide-hint">A heading is required to save.</p>
      )}
    </form>
  );
}
