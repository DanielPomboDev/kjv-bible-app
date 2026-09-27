import { useLayoutEffect, useRef } from "react";
import type { StageSlide } from "../domain/types";

/**
 * One projected slide: the verse text large and centered in the stage's
 * high-contrast tokens (never the app's light/dark theme — DESIGN-SYSTEM.md,
 * "Presentation window"), the reference smaller and dimmer near the bottom.
 *
 * The verse auto-fits its box: it starts at --stage-text-size and shrinks
 * toward --stage-text-min-size until it fits, so a two-word verse stays
 * huge while a 90-word verse (Esther 8:9) shrinks instead of overflowing.
 * Refit on slide change, box resize, and webfont arrival. The reference
 * is outside the fitted box, so it sits in the same place every slide.
 */
export function SlideView({ slide }: { slide: StageSlide | null }) {
  const boxRef = useRef<HTMLQuoteElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text || !slide) return;
    const fit = () => fitText(box, text);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [slide?.id]);

  return (
    <figure className="stage-slide">
      {slide ? (
        <>
          <blockquote ref={boxRef} className="stage-slide-text">
            <span ref={textRef}>{slide.text}</span>
          </blockquote>
          <figcaption className="stage-slide-ref">{slide.label}</figcaption>
        </>
      ) : (
        <p className="stage-slide-waiting" aria-hidden="true">
          …
        </p>
      )}
    </figure>
  );
}

/**
 * Shrink the verse (set on `box`, inherited by `text`) from its token max
 * to the largest size whose laid-out height fits the box — binary search,
 * ~12 steps. The span's offsetHeight is its full laid-out height even when
 * overflowing, which makes the comparison exact; the box's own
 * scrollHeight is unreliable here because its content is flex-centered.
 */
function fitText(box: HTMLElement, text: HTMLElement): void {
  if (box.clientHeight === 0) return;
  const rootStyle = getComputedStyle(document.documentElement);
  const rootPx = parseFloat(rootStyle.fontSize) || 16;
  const minToken = rootStyle.getPropertyValue("--stage-text-min-size").trim();
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
