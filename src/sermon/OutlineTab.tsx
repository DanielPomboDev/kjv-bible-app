import { useCallback, useState } from "react";
import { useActiveSermon } from "../store/activeSermon";
import { useToast } from "../store/toast";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
} from "../components/icons";
import { OutlineEditor } from "./OutlineEditor";

/**
 * The outline tab of the sermon panel (Outline rules): the
 * open sermon's ordered planning sections — heading plus a plain-text
 * body preview per row, with up/down reorder buttons, a remove button,
 * and click-to-edit (keyboard: Enter/Space on the row). An "Add Section"
 * button opens the editor for a fresh section.
 *
 * Separate from the deck of slides on purpose (rule #2): sections are
 * never presented, and nothing here touches `sermon.deck`. Editing a
 * section updates it in place, like custom slides (rule #3). Everything
 * is a real button, so keyboard works throughout.
 */
export function OutlineTab() {
  const outline = useActiveSermon((s) => s.sermon.outline);
  const addOutlineSection = useActiveSermon((s) => s.addOutlineSection);
  const updateOutlineSection = useActiveSermon((s) => s.updateOutlineSection);
  const removeOutlineSection = useActiveSermon((s) => s.removeOutlineSection);
  const moveOutlineSection = useActiveSermon((s) => s.moveOutlineSection);
  const showToast = useToast((s) => s.showToast);
  const [editorOpen, setEditorOpen] = useState(false);
  // Non-null while the editor is editing an existing section (its id);
  // null when adding a fresh one.
  const [editingId, setEditingId] = useState<string | null>(null);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
  }, []);

  const moveUp = useCallback(
    (index: number) => moveOutlineSection(index, index - 1),
    [moveOutlineSection],
  );
  const moveDown = useCallback(
    (index: number) => moveOutlineSection(index, index + 1),
    [moveOutlineSection],
  );

  // The section under edit, if it is still in the outline (it could have
  // been removed while the editor was open — saving then no-ops with a
  // toast instead of crashing).
  const editingSection =
    editingId !== null
      ? (outline.find((s) => s.id === editingId) ?? null)
      : null;

  const onSave = useCallback(
    (heading: string, body: string) => {
      if (editingId !== null) {
        if (editingSection === null) {
          showToast("Outline section is no longer in the outline");
          closeEditor();
        } else if (updateOutlineSection(editingId, heading, body)) {
          showToast("Outline section updated");
          closeEditor();
        } else {
          showToast("A heading is required");
        }
      } else if (addOutlineSection(heading, body) !== null) {
        showToast("Added outline section");
        closeEditor();
      } else {
        showToast("A heading is required");
      }
    },
    [
      editingId,
      editingSection,
      addOutlineSection,
      updateOutlineSection,
      showToast,
      closeEditor,
    ],
  );

  const count = outline.length;

  return (
    <>
      <div className="outline-top">
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
          Add Section
        </button>
      </div>
      {editorOpen && (
        <OutlineEditor
          // Remount per target so the fields always start pre-filled
          // with that section (or empty for a new one).
          key={editingSection?.id ?? "new"}
          initialHeading={editingSection?.heading ?? ""}
          initialBody={editingSection?.body ?? ""}
          saveLabel={editingSection ? "Save Changes" : "Add Section"}
          formLabel={
            editingSection ? "Edit outline section" : "New outline section"
          }
          onSave={onSave}
          onCancel={closeEditor}
        />
      )}
      {count === 0 ? (
        <p className="sermon-deck-empty">
          No outline sections yet. Add an Introduction, sermon points, and
          a Conclusion to plan this sermon — the outline is never
          presented.
        </p>
      ) : (
        <ol className="sermon-deck-list">
          {outline.map((section, index) => (
            <li key={section.id} className="sermon-deck-row">
              <span className="sermon-deck-position" aria-hidden="true">
                {index + 1}
              </span>
              <button
                type="button"
                className="sermon-deck-entry sermon-deck-edit"
                aria-label={`Edit outline section ${section.heading}`}
                onClick={() => {
                  setEditingId(section.id);
                  setEditorOpen(true);
                }}
              >
                <span className="sermon-deck-ref">{section.heading}</span>
                {section.body !== "" && (
                  <span className="sermon-deck-preview">{section.body}</span>
                )}
              </button>
              <span className="sermon-deck-actions">
                <button
                  type="button"
                  className="sermon-deck-btn"
                  aria-label={`Move ${section.heading} up`}
                  disabled={index === 0}
                  onClick={() => moveUp(index)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  className="sermon-deck-btn"
                  aria-label={`Move ${section.heading} down`}
                  disabled={index === count - 1}
                  onClick={() => moveDown(index)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  className="sermon-deck-btn sermon-deck-btn-remove"
                  aria-label={`Remove ${section.heading} from the outline`}
                  onClick={() => removeOutlineSection(section.id)}
                >
                  <CloseIcon />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
