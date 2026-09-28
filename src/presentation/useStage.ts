import { useCallback, useEffect, useState } from "react";
import {
  fetchStageState,
  onSlide,
  presentationExit,
  presentationMove,
} from "../services/presentation";
import type { StageState } from "../domain/types";

/**
 * Shared stage state for the two presentation windows (the audience
 * stage never renders presenter notes, and keyboard navigation drives
 * both windows in sync): the audience stage and the presenter
 * window run the same bootstrap (push listener first, then a direct
 * pull — no event-timing dependency) and the same navigation (the
 * backend owns the index and pushes to both windows, so →/Space/← in
 * either window drives both, and vice versa).
 */
export function useStage() {
  const [stage, setStage] = useState<StageState | null>(null);

  // Bootstrap order matters: register the push listener FIRST, then pull
  // the current state with a direct query. The query returns the value
  // (no event-timing dependency), and any push that arrives mid-bootstrap
  // is already observed. A window that reloads (dev refresh, WebView
  // crash) re-runs this and converges on the backend's state. The two
  // halves degrade independently: a failed listen still pulls (polls
  // nothing further, but shows the current slide), and a failed pull
  // still receives pushes — either half alone keeps the window in sync.
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;
    const bootstrap = async () => {
      try {
        const off = await onSlide((state) => {
          if (active) setStage(state);
        });
        if (!active) {
          off();
          return;
        }
        unsub = off;
      } catch {
        // No event backend (plain browser): pushes just won't arrive —
        // the pull below still tries.
      }
      try {
        const pulled = await fetchStageState();
        if (active) setStage(pulled);
      } catch {
        // Opened outside Tauri (plain browser): no backend at all — the
        // window just shows its waiting state.
      }
    };
    void bootstrap();
    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  // Advance: →/Space go to the next slide, closing past the last one
  // (that is what makes → on a one-slide "Present Now" verse exit). The
  // "last?" check uses backend-driven state (move responses + slide
  // pushes).
  const advance = useCallback(() => {
    if (stage && stage.index >= stage.deck.length - 1) {
      void presentationExit().catch(() => {});
    } else {
      void presentationMove(1).then(setStage).catch(() => {});
    }
  }, [stage]);

  const back = useCallback(() => {
    void presentationMove(-1).then(setStage).catch(() => {});
  }, []);

  const exit = useCallback(() => {
    void presentationExit().catch(() => {});
  }, []);

  return { stage, advance, back, exit };
}

/**
 * Keyboard navigation shared by both windows: →/Space next, ← previous,
 * Esc exits — with no mouse involved.
 *
 * Space is skipped when focus sits on an interactive element (button,
 * input, …) so it keeps its native meaning there (e.g. activating the
 * Extend-reminder dismiss button) instead of also advancing. The stage
 * has no interactive elements, so this changes nothing for it.
 */
export function useStageKeys({
  advance,
  back,
  exit,
}: {
  advance: () => void;
  back: () => void;
  exit: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        const target = e.target as Element | null;
        if (e.key === " " && target?.closest?.("button,input,textarea,select,a,[contenteditable]")) {
          return;
        }
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, exit]);
}
