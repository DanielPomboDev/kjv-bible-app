import { newBlockId } from "../domain/blocks";
import type { SlideBlock, TextSlideBlock } from "../domain/types";

/**
 * Slide layout templates: named starting points that fill a freeform
 * slide with blocks in one action (PowerPoint's layout gallery, minus
 * the gallery). Pure data — applying a template replaces the slide's
 * blocks, which the existing single-level undo covers.
 */

export interface SlideTemplate {
  /** Stable id. Never rename. */
  id: string;
  /** Display name shown in the slide panel. */
  name: string;
  /** Build fresh blocks (new ids on every call). */
  make: () => SlideBlock[];
}

function textbox(
  partial: Omit<Partial<TextSlideBlock>, "type" | "id"> & {
    text: string;
  },
): TextSlideBlock {
  return {
    type: "text",
    id: newBlockId(),
    x: 10,
    y: 20,
    w: 80,
    align: "center",
    font: "serif",
    sizePct: 2.8,
    ...partial,
  };
}

export const SLIDE_TEMPLATES: readonly SlideTemplate[] = [
  {
    id: "title",
    name: "Title slide",
    make: () => [
      textbox({
        text: "Double-click to edit title",
        y: 10,
        sizePct: 4.5,
        bold: true,
      }),
      textbox({ text: "Double-click to edit subtitle", y: 38, sizePct: 2.4 }),
    ],
  },
  {
    id: "heading",
    name: "Heading + point",
    make: () => [
      textbox({
        text: "Double-click to edit heading",
        y: 8,
        sizePct: 3.6,
        bold: true,
      }),
      textbox({ text: "Double-click to edit point", y: 34, sizePct: 2.6 }),
    ],
  },
  {
    id: "quote",
    name: "Big quote",
    make: () => [
      textbox({
        text: "Double-click to edit quote",
        y: 26,
        sizePct: 3.2,
        italic: true,
      }),
    ],
  },
  {
    id: "two-points",
    name: "Two points",
    make: () => [
      textbox({
        text: "First point — double-click to edit",
        y: 18,
        align: "left",
        sizePct: 2.6,
      }),
      textbox({
        text: "Second point — double-click to edit",
        y: 52,
        align: "left",
        sizePct: 2.6,
      }),
    ],
  },
  {
    id: "blank",
    name: "Blank",
    make: () => [],
  },
];

/** Look up a template by id for the slide panel. */
export function getSlideTemplate(id: string): SlideTemplate | null {
  return SLIDE_TEMPLATES.find((template) => template.id === id) ?? null;
}
