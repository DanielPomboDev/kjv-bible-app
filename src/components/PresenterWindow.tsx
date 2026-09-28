import { useEffect, useState, type CSSProperties } from "react";
import type { StageSlide } from "../domain/types";
import {
  DEFAULT_BACKGROUND_PRESET_ID,
  getBackgroundPreset,
  type SlideBackgroundPreset,
} from "../presentation/backgroundPresets";
import { useStage, useStageKeys } from "../presentation/useStage";

/**
 * The presenter window: a normal windowed panel that opens on the screen the app is running on
 * while the audience stage goes fullscreen on the picked display. It
 * shows the current slide (small preview), the next slide, the current
 * slide's private notes, and the sermon's outline for a glance — and
 * drives the stage: →/Space/←/Esc here do exactly what they do there,
 * through the same backend-owned index, so both windows stay in sync.
 *
 * The audience stage (PresentationWindow + SlideView/CustomSlideView)
 * renders slide content only — notes and outline never appear there.
 */

const EXTEND_REMINDER_KEY = "bible.extendReminderSeen";

function loadExtendReminderSeen(): boolean {
  try {
    return localStorage.getItem(EXTEND_REMINDER_KEY) === "seen";
  } catch {
    return false;
  }
}

/** Compact slide preview in the stage's own preset colors, so what the
 * presenter sees matches the audience screen. Fixed small type (no
 * auto-fit — see SlideView): this is a glanceable thumbnail, and long
 * verses clamp instead of shrinking. */
function SlidePreview({
  slide,
  preset,
  size,
}: {
  slide: StageSlide;
  preset: SlideBackgroundPreset;
  size: "now" | "next";
}) {
  const style = {
    background: preset.background,
    color: preset.textColor,
  } as CSSProperties;
  const refStyle = { color: preset.referenceColor } as CSSProperties;
  return (
    <div className={`presenter-slide presenter-slide-${size}`} style={style}>
      {slide.type === "custom" ? (
        <>
          {slide.title && (
            <div className="presenter-slide-title">{slide.title}</div>
          )}
          <div className="presenter-slide-body">{slide.body}</div>
        </>
      ) : (
        <>
          <div className="presenter-slide-body">{slide.text}</div>
          <div className="presenter-slide-ref" style={refStyle}>
            {slide.label}
          </div>
        </>
      )}
    </div>
  );
}

export function PresenterWindow() {
  const { stage, advance, back, exit } = useStage();
  useStageKeys({ advance, back, exit });

  // One-time Extend reminder: mirrored displays defeat the whole two-window separation, and no
  // application can override that — so say it once, then remember.
  const [extendSeen, setExtendSeen] = useState(loadExtendReminderSeen);
  useEffect(() => {
    if (extendSeen) {
      try {
        localStorage.setItem(EXTEND_REMINDER_KEY, "seen");
      } catch {
        // Storage unavailable: the reminder just shows again next time.
      }
    }
  }, [extendSeen]);

  const current: StageSlide | null = stage?.deck[stage.index] ?? null;
  const next: StageSlide | null =
    stage && stage.index + 1 < stage.deck.length
      ? stage.deck[stage.index + 1]
      : null;
  const total = stage?.deck.length ?? 0;
  const position = stage ? stage.index + 1 : 0;
  const preset = getBackgroundPreset(
    stage?.background ?? DEFAULT_BACKGROUND_PRESET_ID,
  );

  // Match the main app's light/dark theme: the presenter window loaded
  // once (pre-warmed hidden at startup), so startup `initSettings` alone
  // would freeze whatever theme was persisted then. The stage state
  // carries the theme snapshotted at present time, like the background.
  // Before the first present, the startup value stands (waiting state).
  useEffect(() => {
    if (stage) {
      document.documentElement.dataset.theme =
        stage.theme === "dark" ? "dark" : "light";
    }
  }, [stage]);

  return (
    <div className="presenter">
      <header className="presenter-header">
        <span className="presenter-title">Presenter</span>
        <span className="presenter-position" aria-live="polite">
          {total === 0 ? "Nothing presenting" : `Slide ${position} of ${total}`}
        </span>
        <span className="presenter-keys" aria-hidden="true">
          → next · ← back · Esc exit
        </span>
      </header>

      {!extendSeen && (
        <div className="presenter-extend" role="note">
          <p>
            Set your displays to <strong>Extend</strong> (not
            Duplicate/Mirror) — mirrored screens show the same image
            everywhere, so notes can&apos;t stay private.
          </p>
          <button
            type="button"
            className="presenter-extend-dismiss"
            onClick={() => setExtendSeen(true)}
          >
            Got it
          </button>
        </div>
      )}

      {current === null ? (
        <p className="presenter-waiting">Waiting for presentation…</p>
      ) : (
        <div className="presenter-grid">
          <section className="presenter-panel" aria-label="Current slide">
            <h2 className="presenter-heading">Now</h2>
            <SlidePreview slide={current} preset={preset} size="now" />
            <h3 className="presenter-subheading">Notes</h3>
            {current.notes ? (
              <p className="presenter-notes">{current.notes}</p>
            ) : (
              <p className="presenter-muted">No notes for this slide.</p>
            )}
          </section>

          <div className="presenter-side">
            <section className="presenter-panel" aria-label="Next slide">
              <h2 className="presenter-heading">Next</h2>
              {next ? (
                <SlidePreview slide={next} preset={preset} size="next" />
              ) : (
                <p className="presenter-muted">End of deck.</p>
              )}
            </section>

            <section
              className="presenter-panel presenter-outline"
              aria-label="Sermon outline"
            >
              <h2 className="presenter-heading">Outline</h2>
              {(!stage || stage.outline.length === 0) ? (
                <p className="presenter-muted">No outline sections.</p>
              ) : (
                <ol className="presenter-outline-list">
                  {stage.outline.map((section) => (
                    <li key={section.id} className="presenter-outline-item">
                      <div className="presenter-outline-heading">
                        {section.heading}
                      </div>
                      {section.body && (
                        <div className="presenter-outline-body">
                          {section.body}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
