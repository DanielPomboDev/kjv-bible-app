import { useLayoutEffect, useRef } from "react";
import type { CustomSlideItem } from "../domain/types";
import { fitText } from "./slideFit";

/**
 * One projected custom slide: the optional title near the top, larger and bold, with the body text
 * below it — rendered in the same stage tokens and background preset as
 * verse slides, never the app's light/dark theme.
 *
 * The prop carries content + identity only — `notes` is deliberately
 * absent from the type (the stage must NEVER render notes, under any
 * circumstance), so referencing it
 * here is a compile error, not a code-review catch. Same for the
 * outline, which never reaches this component at all.
 *
 * The body auto-fits its box exactly like a verse (see slideFit); the
 * title keeps a fixed size outside the fitted box so it sits in the
 * same place every slide. A title-less slide shows just the centered
 * body. Keyboard navigation is owned by PresentationWindow and is
 * identical for both slide types.
 */
export function CustomSlideView({
  slide,
}: {
  slide: Pick<CustomSlideItem, "id" | "title" | "body"> | null;
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
    <figure className="stage-slide stage-slide-custom">
      {slide ? (
        <>
          {slide.title && (
            <div className="stage-slide-custom-title">{slide.title}</div>
          )}
          <blockquote ref={boxRef} className="stage-slide-custom-body">
            <span ref={textRef}>{slide.body}</span>
          </blockquote>
        </>
      ) : (
        <p className="stage-slide-waiting" aria-hidden="true">
          …
        </p>
      )}
    </figure>
  );
}
