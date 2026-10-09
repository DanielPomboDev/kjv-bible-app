/**
 * Preview type scaling for the Deck Studio canvas.
 *
 * The stage's type tokens (`--stage-text-size`, `--stage-ref-size`,
 * `--stage-text-min-size`, `--stage-padding`) are viewport units — correct
 * on the fullscreen stage, but wildly oversized inside a small preview
 * frame. The canvas overrides them per-subtree with 1080p-stage
 * equivalents scaled by the frame width, so fixed type (reference,
 * custom title, fit floor) shrinks with the frame instead of staying
 * viewport-sized. The auto-fit body then converges proportionally too,
 * since its ceiling comes from the same overridden size.
 */

/** Reference stage: 1080p 16:9, so vmin = 10.8px and rem = 16px. */
export const STAGE_REF_WIDTH = 1920;

/**
 * Token values on that reference stage: 11vmin / 3.25vmin / 1.5rem /
 * (32px + 3vmin). Kept beside the formulas in tokens.css — update both
 * together if the tokens ever change.
 */
export const STAGE_1080P_PX = {
  text: 118.8,
  ref: 35.1,
  floor: 24,
  padding: 64.4,
} as const;

/** Proportional scale of a preview frame against the reference stage. */
export function previewScaleForWidth(boxWidth: number): number {
  return Math.max(0, boxWidth) / STAGE_REF_WIDTH;
}
