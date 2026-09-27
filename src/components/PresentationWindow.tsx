import { useEffect, useState } from "react";
import {
  fetchStageState,
  onSlide,
  presentationExit,
  presentationMove,
} from "../services/presentation";
import type { StageSlide, StageState } from "../domain/types";
import { SlideView } from "./SlideView";

/**
 * The presentation stage (AGENTS.md, Sermon rules #2–4): a borderless
 * fullscreen window, separate from the main app, showing one verse per
 * slide with stage tokens (never the app's light/dark theme).
 *
 * Two windows share one frontend build; main.tsx routes to this
 * component when the window label is "presentation". The stage is fully
 * keyboard-driven — →/Space next, ← previous, Esc exits — and shows a
 * single verse verbatim when opened via "Present Now" (that verse is a
 * one-slide deck on the backend, so navigation is inert by bounds).
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

  // Keyboard: →/Space next, ← previous, Esc exits. Must work with no
  // mouse (AGENTS.md sermon rule #4). Space only advances, never scrolls
  // — there is nothing to scroll on a slide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        void presentationMove(1).then(setStage).catch(() => {});
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
  }, []);

  const current: StageSlide | null = stage?.deck[stage.index] ?? null;

  return (
    <div className="stage">
      <SlideView slide={current} />
    </div>
  );
}
