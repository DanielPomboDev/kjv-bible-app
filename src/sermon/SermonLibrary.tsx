import { useEffect, useRef, useState } from "react";
import { useSermonLibrary } from "../store/sermonLibrary";
import { useToast } from "../store/toast";
import { CloseIcon, LibraryIcon } from "../components/icons";

/** "Sep 27, 2026" — falls back to the raw date part when unparseable. */
function formatSermonDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso.slice(0, 10);
  return new Date(time).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The sermon library (AGENTS.md, Sermon library rule #2): a TopBar button
 * opening an overlay that lists saved sermons (title + date), with a New
 * Sermon action and per-sermon Open, Rename, and Delete actions.
 * Deleting asks for inline confirmation first — it is destructive.
 * Opening a sermon makes it the active one: its deck and background
 * become what the rest of the app works with (rule #3).
 *
 * Mirrors the popover behaviour of the settings/deck panels: Escape or
 * an outside click closes it; everything is a real button, so keyboard
 * works throughout. While renaming, Escape cancels the rename first; a
 * further Escape closes the overlay.
 */
export function SermonLibrary() {
  const [open, setOpen] = useState(false);
  const sermons = useSermonLibrary((s) => s.sermons);
  const activeId = useSermonLibrary((s) => s.activeId);
  const createSermon = useSermonLibrary((s) => s.createSermon);
  const openSermon = useSermonLibrary((s) => s.openSermon);
  const renameSermon = useSermonLibrary((s) => s.renameSermon);
  const deleteSermon = useSermonLibrary((s) => s.deleteSermon);
  const showToast = useToast((s) => s.showToast);
  // Non-null while renaming that sermon (inline editor); non-null while
  // that sermon's delete is awaiting confirmation. Never both at once.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus New Sermon on open so keyboard users land somewhere useful.
  useEffect(() => {
    if (open) newButtonRef.current?.focus();
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (renamingId !== null) setRenamingId(null);
      else if (confirmingId !== null) setConfirmingId(null);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, renamingId, confirmingId]);

  // Close when clicking outside the panel or the library button.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        panelRef.current &&
        target &&
        !panelRef.current.contains(target) &&
        !target.closest("[data-sermon-library-toggle]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open ]);

  const startRename = (id: string, title: string) => {
    setConfirmingId(null);
    setDraft(title);
    setRenamingId(id);
  };

  const count = sermons.length;

  return (
    <div className="sermon-library">
      <button
        type="button"
        className="sermon-library-toggle"
        data-sermon-library-toggle
        aria-label="Sermon library"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sermon-library-toggle-icon" aria-hidden="true">
          <LibraryIcon />
        </span>
      </button>
      {open && (
        <div className="sermon-library-scrim">
          <div
            className="sermon-library-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Sermon library"
            ref={panelRef}
          >
            <div className="sermon-library-header">
              <div className="sermon-library-header-top">
                <span className="sermon-library-title">Sermon Library</span>
                <span className="sermon-library-count" aria-live="polite">
                  {count === 1 ? "1 sermon" : `${count} sermons`}
                </span>
                <button
                  type="button"
                  className="sermon-library-close"
                  aria-label="Close sermon library"
                  onClick={() => setOpen(false)}
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="sermon-library-header-actions">
                <button
                  type="button"
                  className="sermon-library-new"
                  ref={newButtonRef}
                  onClick={() => {
                    const sermon = createSermon();
                    showToast(`Created "${sermon.title}"`);
                  }}
                >
                  New Sermon
                </button>
              </div>
            </div>
            <ol className="sermon-library-list">
              {sermons.map((sermon) => {
                const isActive = sermon.id === activeId;
                const slideCount = sermon.deck.length;
                return (
                  <li
                    key={sermon.id}
                    className={
                      isActive
                        ? "sermon-library-row sermon-library-row-active"
                        : "sermon-library-row"
                    }
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="sermon-library-entry">
                      <span className="sermon-library-name">
                        {sermon.title}
                        {isActive && (
                          <span
                            className="sermon-library-kind"
                            aria-label="(open)"
                          >
                            Current
                          </span>
                        )}
                      </span>
                      <span className="sermon-library-meta">
                        {formatSermonDate(sermon.date)} ·{" "}
                        {slideCount === 1
                          ? "1 slide"
                          : `${slideCount} slides`}
                      </span>
                    </span>
                    {renamingId === sermon.id ? (
                      <form
                        className="sermon-library-rename"
                        aria-label={`Rename ${sermon.title}`}
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (renameSermon(sermon.id, draft)) {
                            showToast(`Renamed to "${draft.trim()}"`);
                            setRenamingId(null);
                          } else {
                            showToast("Enter a title to rename");
                          }
                        }}
                      >
                        <input
                          type="text"
                          className="sermon-library-input"
                          aria-label="Sermon title"
                          value={draft}
                          autoFocus
                          onChange={(e) => setDraft(e.target.value)}
                        />
                        <span className="sermon-library-row-actions">
                          <button
                            type="submit"
                            className="sermon-library-btn sermon-library-btn-primary"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="sermon-library-btn"
                            onClick={() => setRenamingId(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      </form>
                    ) : confirmingId === sermon.id ? (
                      <div className="sermon-library-confirm">
                        <span className="sermon-library-confirm-text">
                          Delete “{sermon.title}”? This can’t be undone.
                        </span>
                        <span className="sermon-library-row-actions">
                          <button
                            type="button"
                            className="sermon-library-btn"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="sermon-library-btn sermon-library-btn-danger"
                            onClick={() => {
                              const title = sermon.title;
                              setConfirmingId(null);
                              if (deleteSermon(sermon.id)) {
                                showToast(`Deleted "${title}"`);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    ) : (
                      <span className="sermon-library-row-actions">
                        {!isActive && (
                          <button
                            type="button"
                            className="sermon-library-btn sermon-library-btn-primary"
                            aria-label={`Open ${sermon.title}`}
                            onClick={() => {
                              if (openSermon(sermon.id)) {
                                showToast(`Opened "${sermon.title}"`);
                                setOpen(false);
                              }
                            }}
                          >
                            Open
                          </button>
                        )}
                        <button
                          type="button"
                          className="sermon-library-btn"
                          aria-label={`Rename ${sermon.title}`}
                          onClick={() => startRename(sermon.id, sermon.title)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="sermon-library-btn"
                          aria-label={`Delete ${sermon.title}`}
                          onClick={() => {
                            setRenamingId(null);
                            setConfirmingId(sermon.id);
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
