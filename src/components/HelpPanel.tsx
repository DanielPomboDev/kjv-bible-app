import { useEffect, useRef, useState } from "react";
import { HelpIcon } from "./icons";
import { useFocusReturn } from "./focus";

interface Shortcut {
  keys: string[];
  action: string;
}

const SECTIONS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: "Reading",
    shortcuts: [
      { keys: ["←", "→"], action: "Previous / next chapter" },
      { keys: ["Ctrl", "K"], action: "Search (words, phrases, John 3:16)" },
      { keys: ["F11"], action: "Toggle fullscreen" },
      { keys: ["Esc"], action: "Exit fullscreen" },
    ],
  },
  {
    title: "Selecting verses",
    shortcuts: [
      { keys: ["Click"], action: "Select one verse" },
      { keys: ["Ctrl", "Click"], action: "Add / remove one verse" },
      { keys: ["Shift", "Click"], action: "Select a range of verses" },
    ],
  },
  {
    title: "Sermon deck",
    shortcuts: [
      { keys: ["Right-click"], action: "Add one verse to the deck" },
      {
        keys: ["Add to Deck"],
        action: "Queue every selected verse at once",
      },
      {
        keys: ["Export .pptx"],
        action: "Download the deck for PowerPoint (one-way)",
      },
    ],
  },
  {
    title: "Deck studio tab",
    shortcuts: [
      { keys: ["Drag"], action: "Reorder slides" },
      { keys: ["↑", "↓"], action: "Select previous / next slide" },
      { keys: ["Ctrl", "↑", "↓"], action: "Move selected slide" },
      { keys: ["Ctrl", "Z"], action: "Undo remove / clear / move" },
    ],
  },
];

/**
 * Help button in the TopBar: a popover listing the app's mouse and
 * keyboard shortcuts, grouped by task. Mirrors the settings popover
 * behaviour — Escape or an outside click closes it, everything is a
 * real button so keyboard works throughout.
 */
export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Return focus to the help button when the popover closes.
  useFocusReturn(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        panelRef.current &&
        target &&
        !panelRef.current.contains(target) &&
        !target.closest("[data-help-toggle]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="help" ref={panelRef}>
      <button
        type="button"
        className="help-toggle"
        data-help-toggle
        aria-label="Keyboard shortcuts and help"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="help-toggle-icon" aria-hidden="true">
          <HelpIcon />
        </span>
      </button>
      {open && (
        <div className="help-popover" role="dialog" aria-label="Help">
          <span className="help-title">Shortcuts</span>
          {SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <span className="help-section-title">{section.title}</span>
              <dl className="help-list">
                {section.shortcuts.map((s) => (
                  <div key={s.action} className="help-row">
                    <dt className="help-keys">
                      {s.keys.map((k) => (
                        <kbd key={k} className="help-kbd">
                          {k}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="help-action">{s.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
