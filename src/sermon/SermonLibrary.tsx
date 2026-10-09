import { useEffect, useRef, useState } from "react";
import { useSermonLibrary } from "../store/sermonLibrary";
import { useToast } from "../store/toast";
import { isSermon } from "../store/sermonStorage";
import { downloadDeckPptx } from "../export/pptx";
import type { Sermon } from "../domain/types";
import { CloseIcon, LibraryIcon } from "../components/icons";
import { useFocusReturn } from "../components/focus";

/** Backup file envelope, so imports can reject foreign JSON early. */
interface SermonBackup {
  app: "kjv-bible";
  kind: "sermon";
  version: 1;
  sermon: Sermon;
}

function isBackup(value: unknown): value is SermonBackup {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.app === "kjv-bible" &&
    obj.kind === "sermon" &&
    obj.version === 1 &&
    isSermon(obj.sermon)
  );
}

/** `My Sermon Title` → `my-sermon-title.kjv-sermon.json`. */
function backupFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sermon";
  return `${slug}.kjv-sermon.json`;
}

/** Save a sermon backup through a Blob download (no backend needed). */
function downloadBackup(sermon: Sermon): void {
  const backup: SermonBackup = {
    app: "kjv-bible",
    kind: "sermon",
    version: 1,
    sermon,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFilename(sermon.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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
 * The sermon library: a TopBar button opening an overlay that lists saved sermons (title + date), with a New
 * Sermon action and per-sermon Open, Rename, and Delete actions.
 * Deleting asks for inline confirmation first — it is destructive.
 * Opening a sermon makes it the active one: its deck and background
 * become what the rest of the app works with.
 *
 * Mirrors the popover behaviour of the settings/deck panels: Escape or
 * an outside click closes it; everything is a real button, so keyboard
 * works throughout. While renaming, Escape cancels the rename first; a
 * further Escape closes the overlay.
 */
export function SermonLibrary() {
  const [open, setOpen] = useState(false);
  // Return focus to the library button when the overlay closes.
  useFocusReturn(open);
  const sermons = useSermonLibrary((s) => s.sermons);  const activeId = useSermonLibrary((s) => s.activeId);
  const createSermon = useSermonLibrary((s) => s.createSermon);
  const openSermon = useSermonLibrary((s) => s.openSermon);
  const renameSermon = useSermonLibrary((s) => s.renameSermon);
  const deleteSermon = useSermonLibrary((s) => s.deleteSermon);
  const importSermon = useSermonLibrary((s) => s.importSermon);
  const showToast = useToast((s) => s.showToast);
  // Non-null while renaming that sermon (inline editor); non-null while
  // that sermon's delete is awaiting confirmation. Never both at once.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!isBackup(parsed)) {
          showToast("Not a sermon backup file");
          return;
        }
        const entry = importSermon(parsed.sermon);
        showToast(`Imported "${entry.title}"`);
      } catch {
        showToast("Could not read that file");
      }
    };
    reader.onerror = () => showToast("Could not read that file");
    reader.readAsText(file);
  };

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

  // One-way export to PowerPoint (anchor download, no plugins).
  const onExportPptx = async (sermon: Sermon) => {
    if (sermon.deck.length === 0) {
      showToast("Nothing to export — that sermon has no slides");
      return;
    }
    try {
      await downloadDeckPptx(sermon);
      showToast(`Exported "${sermon.title}" to PowerPoint`);
    } catch (e) {
      showToast(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
                <button
                  type="button"
                  className="sermon-library-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  Import…
                </button>
                <input
                  type="file"
                  ref={fileRef}
                  hidden
                  accept=".json,application/json"
                  aria-label="Import sermon backup file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset so picking the same file again still fires.
                    e.target.value = "";
                    if (file) onImportFile(file);
                  }}
                />
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
                          aria-label={`Export ${sermon.title} to PowerPoint`}
                          title="Download as .pptx — continue editing in PowerPoint (one-way)"
                          onClick={() => void onExportPptx(sermon)}
                        >
                          PowerPoint
                        </button>
                        <button
                          type="button"
                          className="sermon-library-btn"
                          aria-label={`Back up ${sermon.title} to a file`}
                          onClick={() => {
                            downloadBackup(sermon);
                            showToast(`Backed up "${sermon.title}"`);
                          }}
                        >
                          Backup
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
