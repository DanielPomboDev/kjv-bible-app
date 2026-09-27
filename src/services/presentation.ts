import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  OutlineSection,
  SermonDeckItem,
  StageSlide,
  StageState,
} from "../domain/types";
import type { MonitorTarget } from "../presentation/monitors";
import type { Theme } from "../store/settings";

/**
 * Bridge to the presentation stage, which lives in a separate window
 * owned by the Rust side (src-tauri/src/presentation.rs): the main
 * window pushes what to present, the stage pulls its current slide and
 * moves through the deck with →/Space/←. The presenter window shares
 * the same push/pull — the backend owns the index, so both windows stay
 * in sync (AGENTS.md, Presenter notes rule #6).
 */

/** Present the whole sermon deck, starting at the first slide. */
export function presentDeck(args: {
  deck: readonly SermonDeckItem[];
  background: string;
  monitor?: MonitorTarget;
  outline: readonly OutlineSection[];
  theme: Theme;
}): Promise<void> {
  // Verse and custom slides share the frontend's discriminated union
  // with the backend's tagged Slide enum, so the deck travels untouched
  // and both step through in order by index. `monitor` moves the stage
  // window onto the picked display before it goes fullscreen; `outline`
  // is reference material for the presenter window only, and `theme`
  // styles the presenter chrome to match the main app.
  const { deck, background, monitor, outline, theme } = args;
  return invoke("present_deck_command", {
    deck,
    index: 0,
    background,
    monitor,
    outline,
    theme,
  });
}

/**
 * Present one verse immediately ("Present Now") — exactly that verse,
 * regardless of what's queued in the deck.
 */
export function presentNow(args: {
  slide: StageSlide;
  background: string;
  monitor?: MonitorTarget;
  outline: readonly OutlineSection[];
  theme: Theme;
}): Promise<void> {
  const { slide, background, monitor, outline, theme } = args;
  return invoke("present_now_command", {
    slide,
    background,
    monitor,
    outline,
    theme,
  });
}

/**
 * Stage → backend: subscribe to slide pushes. Register BEFORE pulling
 * the initial state (below), so no push can slip through unobserved.
 * Returns the unsubscribe function for effect cleanup.
 */
export function onSlide(
  handler: (state: StageState) => void,
): Promise<() => void> {
  return listen<StageState>("presentation://slide", (event) =>
    handler(event.payload),
  );
}

/**
 * Stage → backend: fetch the current slides directly — a query that
 * returns its value, not a push, so the initial load has no dependency
 * on event timing at all.
 */
export function fetchStageState(): Promise<StageState> {
  return invoke<StageState>("presentation_state");
}

/** Stage → backend: advance one slide (+1 next, −1 previous). */
export function presentationMove(delta: 1 | -1): Promise<StageState> {
  return invoke<StageState>("presentation_move", { delta });
}

/**
 * Live deck sync: push open-sermon edits to a running presentation
 * without restarting it. Called after every deck/outline mutation; the
 * backend no-ops unless a presentation is active, and never touches any
 * window (no show/raise/focus — mid-sermon edits must not steal focus).
 * Failures are swallowed: presenting continues on the last good deck
 * and the next edit retries.
 */
export function syncPresentingDeck(
  deck: readonly SermonDeckItem[],
  outline: readonly OutlineSection[],
): Promise<void> {
  return invoke("sync_presenting_deck", { deck, outline });
}

/** Stage → backend: Esc — close the stage, back to the main window. */
export function presentationExit(): Promise<void> {
  return invoke("presentation_exit");
}
