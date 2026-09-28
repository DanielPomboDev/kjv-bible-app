import { useLayoutEffect, useRef } from "react";
import type { VerseSlideItem } from "../domain/types";
import { fitText } from "./slideFit";

/**
 * One projected verse slide: the verse text large and centered in the
 * stage's high-contrast tokens (never the app's light/dark theme), the reference smaller and
 * dimmer near the bottom.
 *
 * The prop carries content + identity only — `notes` is deliberately
 * absent from the type (the stage must NEVER render notes, under any
 * circumstance), so referencing it
 * here is a compile error, not a code-review catch. Same for the
 * outline, which never reaches this component at all.
 *
 * The verse auto-fits its box (see slideFit): it starts at
 * --stage-text-size and shrinks toward --stage-text-min-size until it
 * fits. Refit on slide change, box resize, and webfont arrival. The
 * reference is outside the fitted box, so it sits in the same place
 * every slide.
 */
export function SlideView({
  slide,
}: {
  slide: Pick<VerseSlideItem, "id" | "text" | "label"> | null;
}) {
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
