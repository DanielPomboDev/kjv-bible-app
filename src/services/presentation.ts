import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SermonDeckItem, StageSlide, StageState } from "../domain/types";

/**
 * Bridge to the presentation stage, which lives in a separate window
 * owned by the Rust side (src-tauri/src/presentation.rs): the main
 * window pushes what to present, the stage pulls its current slide and
 * moves through the deck with →/Space/←.
 */

/** Present the whole sermon deck, starting at the first slide. */
export function presentDeck(
  deck: readonly SermonDeckItem[],
  background: string,
): Promise<void> {
  // Verse and custom slides share the frontend's discriminated union
  // with the backend's tagged Slide enum, so the deck travels untouched
  // and both step through in order by index.
  return invoke("present_deck_command", { deck, index: 0, background });
}

/**
 * Present one verse immediately ("Present Now") — exactly that verse,
 * regardless of what's queued in the deck.
 */
export function presentNow(slide: StageSlide, background: string): Promise<void> {
  return invoke("present_now_command", { slide, background });
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

/** Stage → backend: Esc — close the stage, back to the main window. */
export function presentationExit(): Promise<void> {
  return invoke("presentation_exit");
}
