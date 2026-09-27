import type { StageSlide } from "../domain/types";

/**
 * One projected slide: the verse text large and centered in the stage's
 * high-contrast tokens (never the app's light/dark theme — the style guide,
 * "Presentation window"), the reference smaller and dimmer near the bottom.
 */
export function SlideView({ slide }: { slide: StageSlide | null }) {
  return (
    <figure className="stage-slide">
      {slide ? (
        <>
          <blockquote className="stage-slide-text">{slide.text}</blockquote>
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
