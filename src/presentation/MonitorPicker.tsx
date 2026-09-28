import { useEffect, useRef } from "react";
import { usePresentFlow } from "../store/presentFlow";
import { monitorKey } from "../presentation/monitors";

/**
 * The monitor gate before presenting: an App-level modal dialog, so both entry points — the deck
 * panel's Present button and the verse menu's Present Now — share one
 * picker instead of each growing their own.
 *
 * - 2+ displays: a radio list ("Display 1 · 1920 × 1080 …"), preselected
 *   with the remembered choice. Real radios, so ↑/↓ move and keyboard
 *   works with no extra code; Enter submits via the form.
 * - 1 display: no picker — a clear warning that presenter notes will be
 *   visible to the audience, with an explicit Present Anyway / Cancel.
 *
 * Either way Escape (or the scrim) cancels without presenting. Rendered
 * from App, so it only ever exists in the main window — never the stage.
 */
export function MonitorPicker() {
  const phase = usePresentFlow((s) => s.phase);
  if (phase === "closed") return null;
  return (
    <div className="monitor-overlay">
      {phase === "warn" ? <WarnDialog /> : <PickDialog />}
    </div>
  );
}

function useEscapeToCancel() {
  const cancelPresent = usePresentFlow((s) => s.cancelPresent);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPresent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelPresent]);
}

function PickDialog() {
  const monitors = usePresentFlow((s) => s.monitors);
  const selectedKey = usePresentFlow((s) => s.selectedKey);
  const setSelectedKey = usePresentFlow((s) => s.setSelectedKey);
  const confirmPresent = usePresentFlow((s) => s.confirmPresent);
  const cancelPresent = usePresentFlow((s) => s.cancelPresent);
  const checkedRef = useRef<HTMLInputElement>(null);
  useEscapeToCancel();

  // Keyboard-first: focus the preselected display on open.
  useEffect(() => {
    checkedRef.current?.focus();
  }, []);

  return (
    <>
      <div className="monitor-scrim" onClick={cancelPresent} aria-hidden="true" />
      <form
        className="monitor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Choose display for presentation"
        onSubmit={(e) => {
          e.preventDefault();
          confirmPresent();
        }}
      >
        <h2 className="monitor-title">Choose display</h2>
        <p className="monitor-sub">
          The presentation opens fullscreen on the selected display. The app
          stays where it is.
        </p>
        <div className="monitor-options" role="radiogroup" aria-label="Displays">
          {monitors.map((m, i) => {
            const key = monitorKey(m);
            const checked = key === selectedKey;
            return (
              <label key={key} className="monitor-option" data-checked={checked || undefined}>
                <input
                  ref={checked ? checkedRef : undefined}
                  type="radio"
                  name="monitor"
                  className="monitor-radio"
                  checked={checked}
                  onChange={() => setSelectedKey(key)}
                />
                <span className="monitor-option-main">
                  <span className="monitor-option-name">Display {i + 1}</span>
                  <span className="monitor-option-size">
                    {m.width} × {m.height}
                  </span>
                </span>
                {m.isPrimary && (
                  <span className="monitor-badge">Primary</span>
                )}
              </label>
            );
          })}
        </div>
        <div className="monitor-actions">
          <button type="submit" className="sermon-deck-present" disabled={selectedKey === null}>
            Present
          </button>
          <button type="button" className="sermon-deck-secondary" onClick={cancelPresent}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}

function WarnDialog() {
  const presentAnyway = usePresentFlow((s) => s.presentAnyway);
  const cancelPresent = usePresentFlow((s) => s.cancelPresent);
  const presentRef = useRef<HTMLButtonElement>(null);
  useEscapeToCancel();

  useEffect(() => {
    presentRef.current?.focus();
  }, []);

  return (
    <>
      <div className="monitor-scrim" onClick={cancelPresent} aria-hidden="true" />
      <div
        className="monitor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-warn-title"
        aria-describedby="monitor-warn-text"
      >
        <h2 className="monitor-title" id="monitor-warn-title">
          Only one display detected
        </h2>
        <p className="monitor-warning" id="monitor-warn-text">
          Presenter notes will be visible to the audience, since there is no
          second screen to separate them. Connect another display to keep
          notes private.
        </p>
        <div className="monitor-actions">
          <button
            ref={presentRef}
            type="button"
            className="sermon-deck-present"
            onClick={presentAnyway}
          >
            Present Anyway
          </button>
          <button type="button" className="sermon-deck-secondary" onClick={cancelPresent}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
