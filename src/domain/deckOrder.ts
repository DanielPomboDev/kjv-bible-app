/**
 * Final resting index of a dragged slide after a filmstrip drop.
 *
 * `moveInDeck(from, to)` splices out then inserts at `to`, so `to` is the
 * final index. Dragging A(0) before C(2) in [A,B,C,D] wants [B,A,C,D], i.e.
 * `to = 1`: the target index shifted by the removal when the source sat
 * before it, plus one when dropping after.
 *
 * Lives in its own module (not beside the component) so Fast Refresh can
 * hot-reload the studio without a full page reset on every edit.
 */
export function insertionIndex(
  from: number,
  target: number,
  position: "before" | "after",
): number {
  if (from === target) return from;
  return target + (position === "after" ? 1 : 0) + (from < target ? -1 : 0);
}
