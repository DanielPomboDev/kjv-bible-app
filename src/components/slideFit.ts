/**
 * Auto-fit for projected slide text (shared by SlideView and
 * CustomSlideView): shrink the body from its token max toward
 * --stage-text-min-size until it fits, so a two-word verse stays huge
 * while a 90-word verse (Esther 8:9) shrinks instead of overflowing.
 *
 * Shrink-toward-fit via binary search, ~12 steps. The span's
 * offsetHeight is its full laid-out height even when overflowing, which
 * makes the comparison exact; the box's own scrollHeight is unreliable
 * here because its content is flex-centered.
 */
export function fitText(box: HTMLElement, text: HTMLElement): void {
  if (box.clientHeight === 0) return;
  const rootStyle = getComputedStyle(document.documentElement);
  const rootPx = parseFloat(rootStyle.fontSize) || 16;
  // Read the floor from the box (not :root) so a preview frame can
  // override it per-subtree; plain inheritance yields the root value
  // everywhere else, keeping the stage pixel-identical.
  const minToken = getComputedStyle(box)
    .getPropertyValue("--stage-text-min-size")
    .trim();
  const minPx = minToken.endsWith("rem")
    ? parseFloat(minToken) * rootPx
    : parseFloat(minToken) || rootPx;
  box.style.fontSize = "";
  const maxPx = parseFloat(getComputedStyle(box).fontSize) || minPx;
  let lo = Math.min(minPx, maxPx);
  let hi = maxPx;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    box.style.fontSize = `${mid}px`;
    if (text.offsetHeight <= box.clientHeight) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  box.style.fontSize = `${lo}px`;
}
