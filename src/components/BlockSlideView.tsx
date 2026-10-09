import type { SlideBlock } from "../domain/types";
import { slideFontStack } from "../presentation/slideFonts";

/**
 * Freeform slide renderer — shared by the audience stage, the Deck
 * Studio preview, and thumbnails. One JSON shape in, same pixels out.
 *
 * Blocks are percent-of-frame and fonts are container-query units, so
 * the slide scales across stage sizes and the small preview without
 * any per-window math: the frame element (`.stage-slide-blocks`)
 * declares the container, stage.css owns every rule.
 *
 * The prop carries content + identity only — `notes` is deliberately
 * absent from the type (the stage must NEVER render notes), so
 * referencing it here is a compile error. Same for the outline, which
 * never reaches this component at all.
 */
export function BlockSlideView({
  slide,
}: {
  /** Content + identity only — no `notes`, ever (see above). */
  slide: { id: string; blocks: SlideBlock[] };
}) {
  return (
    <figure className="stage-slide stage-slide-blocks">
      {slide.blocks.map((block) =>
        block.type === "text" ? (
          <div
            key={block.id}
            data-blockid={block.id}
            className="stage-block-text"
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.w}%`,
              textAlign: block.align,
              fontFamily: slideFontStack(block.font),
              fontSize: `${block.sizePct}cqw`,
              color: block.color,
              fontWeight: block.bold ? 700 : 400,
              fontStyle: block.italic ? "italic" : "normal",
              textDecoration: block.underline ? "underline" : "none",
            }}
          >
            {block.text}
          </div>
        ) : (
          <img
            key={block.id}
            data-blockid={block.id}
            className="stage-block-image"
            src={block.src}
            alt={block.alt}
            draggable={false}
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              width: `${block.w}%`,
              objectFit: block.fit ?? "contain",
            }}
          />
        ),
      )}
    </figure>
  );
}
