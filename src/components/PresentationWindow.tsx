import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  fetchStageState,
  onSlide,
  presentationExit,
  presentationMove,
} from "../services/presentation";
import type { StageSlide, StageState } from "../domain/types";
import {
  DEFAULT_BACKGROUND_PRESET_ID,
  getBackgroundPreset,
} from "../presentation/backgroundPresets";
import { SlideView } from "./SlideView";

/**
 * The presentation stage (Sermon rules #2–4): a borderless
 * fullscreen window, separate from the main app, showing one verse per
 * slide with stage tokens (never the app's light/dark theme).
 *
 * The slide look comes from whichever background preset was selected when
 * presenting (Slide background rule #3): the preset id travels
 * with the stage state from the Rust backend, and is resolved here with
 * `getBackgroundPreset` — background, verse text color, and reference
 * color all come from the preset via inline style overrides of the stage
 * tokens, never a fixed style. Unknown or missing ids fall back to
 * Classic Black, which is also what a first-time user sees.
 *
 * Two windows share one frontend build; main.tsx routes to this
 * component when the window label is "presentation". The stage is
 * keyboard-driven — →/Space next, ← previous, Esc exits — with
 * click-anywhere as a synonym for next and no visible controls; it shows
 * a single verse verbatim when opened via "Present Now" (that verse is a
 * one-slide deck on the backend, so → past it closes the stage while ←
 * stays inert by bounds). The verse auto-fits its box (see SlideView).
 */
export function PresentationWindow() {
  const [stage, setStage] = useState<StageState | null>(null);

  // Bootstrap order matters: register the push listener FIRST, then pull
  // the current state with a direct query. The query returns the value
  // (no event-timing dependency), and any push that arrives mid-bootstrap
  // is already observed. A stage that reloads (dev refresh, WebView
  // crash) re-runs this and converges on the backend's state.
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;
    const bootstrap = async () => {
      try {
        const off = await onSlide((state) => setStage(state));
        if (!active) {
          off();
          return;
        }
        unsub = off;
        setStage(await fetchStageState());
      } catch {
        // Opened outside Tauri (plain browser): no backend, no events —
        // the stage just shows its waiting state.
      }
    };
    void bootstrap();
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  // Advance: →/Space/click go to the next slide, closing the stage past
  // the last one (that is what makes → on a one-slide "Present Now" verse
  // exit). The "last?" check uses backend-driven state (move responses +
  // slide pushes). One shared path so keys and click can never disagree.
  const advance = useCallback(() => {
    if (stage && stage.index >= stage.deck.length - 1) {
      void presentationExit().catch(() => {});
    } else {
      void presentationMove(1).then(setStage).catch(() => {});
    }
  }, [stage]);

  // Keyboard: →/Space next, ← previous, Esc exits. Must work with no
  // mouse (project notes sermon rule #4). Space only advances, never scrolls
  // — there is nothing to scroll on a slide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        void presentationMove(-1).then(setStage).catch(() => {});
      } else if (e.key === "Escape") {
        e.preventDefault();
        void presentationExit().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  const current: StageSlide | null = stage?.deck[stage.index] ?? null;

  // The preset owns the whole slide look: its background replaces the
  // fixed stage background, its text/reference colors override the stage
  // tokens (inherited by SlideView), so every preset stays readable —
  // including the light parchment one with its dark text. Before the
  // first stage state arrives, Classic Black shows (same fallback
  // `getBackgroundPreset` uses for unknown ids).
  const preset = getBackgroundPreset(
    stage?.background ?? DEFAULT_BACKGROUND_PRESET_ID,
  );
  const stageStyle = {
    background: preset.background,
    "--stage-text": preset.textColor,
    "--stage-dim": preset.referenceColor,
  } as CSSProperties;

  // No buttons or toolbar on the slide itself — click anywhere advances,
  // same as →/Space (and closes past the last slide).
  return (
    <div className="stage" onClick={advance} style={stageStyle}>
      <SlideView slide={current} />
    </div>
  );
}
