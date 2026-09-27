import { useEffect, useRef, useState } from "react";
import {
  READING_SIZES,
  useSettings,
  type ReadingSize,
  type Theme,
} from "../store/settings";
import { MinusIcon, PlusIcon, SettingsIcon } from "./icons";

const SIZE_LABELS: Record<ReadingSize, string> = {
  small: "Small",
  standard: "Standard",
  large: "Large",
  xlarge: "Extra large",
};

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/**
 * The settings control: a gear button in the TopBar opening a small
 * popover with the light/dark theme toggle and the reading font size
 * stepper. Changes apply immediately and persist across restarts
 * (see store/settings.ts). Escape or an outside click closes it;
 * everything is keyboard-reachable.
 */
export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const theme = useSettings((s) => s.theme);
  const readingSize = useSettings((s) => s.readingSize);
  const setTheme = useSettings((s) => s.setTheme);
  const setReadingSize = useSettings((s) => s.setReadingSize);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape while open (focus may sit anywhere in the popover).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close when clicking outside the popover or the gear button.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        panelRef.current &&
        target &&
        !panelRef.current.contains(target) &&
        !target.closest("[data-settings-gear]")
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const stepSize = (delta: 1 | -1) => {
    const index = READING_SIZES.indexOf(readingSize);
    const next = Math.min(
      READING_SIZES.length - 1,
      Math.max(0, index + delta),
    );
    setReadingSize(READING_SIZES[next]);
  };

  return (
    <div className="settings" ref={panelRef}>
      <button
        type="button"
        className="settings-gear"
        data-settings-gear
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="settings-gear-icon" aria-hidden="true">
          <SettingsIcon />
        </span>
      </button>
      {open && (
        <div className="settings-popover" role="dialog" aria-label="Settings">
          <div className="settings-row">
            <span className="settings-label" id="settings-theme-label">
              Theme
            </span>
            <div
              className="settings-segmented"
              role="group"
              aria-labelledby="settings-theme-label"
            >
              {THEMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="settings-option"
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-label" id="settings-size-label">
              Reading size
            </span>
            <div
              className="settings-stepper"
              role="group"
              aria-labelledby="settings-size-label"
            >
              <button
                type="button"
                className="settings-step"
                aria-label="Smaller reading text"
                disabled={readingSize === READING_SIZES[0]}
                onClick={() => stepSize(-1)}
              >
                <MinusIcon />
              </button>
              <span className="settings-value" aria-live="polite">
                {SIZE_LABELS[readingSize]}
              </span>
              <button
                type="button"
                className="settings-step"
                aria-label="Larger reading text"
                disabled={readingSize === READING_SIZES[READING_SIZES.length - 1]}
                onClick={() => stepSize(1)}
              >
                <PlusIcon />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
