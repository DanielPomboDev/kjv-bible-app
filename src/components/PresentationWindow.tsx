import type { CSSProperties } from "react";
import type { StageSlide } from "../domain/types";
import { renderMode } from "../domain/blocks";
import {
  DEFAULT_BACKGROUND_PRESET_ID,
  getBackgroundPreset,
} from "../presentation/backgroundPresets";
import { useStage, useStageKeys } from "../presentation/useStage";
import { SlideView } from "./SlideView";
import { CustomSlideView } from "./CustomSlideView";
import { BlockSlideView } from "./BlockSlideView";

/**
 * The presentation stage: a borderless fullscreen window, separate from the main app, showing one slide at a
 * time — a verse slide or a custom slide — with stage tokens (never the
 * app's light/dark theme).
 *
 * The slide look comes from whichever background preset was selected when
 * presenting: the preset id travels with the stage state from the Rust backend, and is resolved here with
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
  // Stage state + navigation live in the shared hook (see
  // presentation/useStage.ts) so the presenter window steps through
  // identically: one backend-owned index drives both windows in sync.
  const { stage, advance, back, exit } = useStage();
  useStageKeys({ advance, back, exit });

  const current: StageSlide | null = stage?.deck[stage.index] ?? null;

  // Per-slide background override (freeform slides) falls back to the
  // sermon-level snapshot, like the Deck canvas resolves it.
  const preset = getBackgroundPreset(
    (current?.type === "custom"
      ? (current.backgroundPresetId ?? stage?.background)
      : stage?.background) ?? DEFAULT_BACKGROUND_PRESET_ID,
  );

  // The preset owns the whole slide look: its background replaces the
  // fixed stage background, its text/reference colors override the stage
  // tokens (inherited by the slide views), so every preset stays readable
  // — including the light parchment one with its dark text. Before the
  // first stage state arrives, Classic Black shows (same fallback
  // `getBackgroundPreset` uses for unknown ids).
  const stageStyle = {
    background: preset.background,
    "--stage-text": preset.textColor,
    "--stage-dim": preset.referenceColor,
  } as CSSProperties;

  // No buttons or toolbar on the slide itself — click anywhere advances,
  // same as →/Space (and closes past the last slide). Verse, legacy
  // custom, and freeform slides render through their own views but share
  // the stage, the preset, and every navigation path, so a mixed deck
  // steps through in order with identical keys.
  return (
    <div className="stage" onClick={advance} style={stageStyle}>
      {current?.type === "custom" ? (
        renderMode(current) === "blocks" ? (
          <BlockSlideView
            slide={{ id: current.id, blocks: current.blocks ?? [] }}
          />
        ) : (
          <CustomSlideView slide={current} />
        )
      ) : (
        <SlideView slide={current?.type === "verse" ? current : null} />
      )}
    </div>
  );
}
