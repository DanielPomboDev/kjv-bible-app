/**
 * Slide font registry for freeform text boxes. System stacks only — the
 * app is fully offline, so no webfonts. Unknown ids fall back to serif
 * at render, so old slides survive registry changes.
 */
export interface SlideFont {
  /** Stable id, persisted on text blocks. Never rename. */
  id: string;
  /** Display name shown in the block toolbar. */
  name: string;
  /** CSS font-family stack. */
  stack: string;
}

export const DEFAULT_SLIDE_FONT_ID = "serif";

export const SLIDE_FONTS: readonly SlideFont[] = [
  {
    id: "serif",
    name: "Serif",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "sans",
    name: "Sans",
    stack: '-apple-system, "Segoe UI", Arial, sans-serif',
  },
  {
    id: "mono",
    name: "Mono",
    stack: 'Consolas, "Courier New", monospace',
  },
];

/** Resolve a block font id to its stack, falling back to serif. */
export function slideFontStack(id: string): string {
  return (
    SLIDE_FONTS.find((font) => font.id === id)?.stack ?? SLIDE_FONTS[0].stack
  );
}
