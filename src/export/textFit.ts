/**
 * Exporter-side auto-fit: pick a font size so wrapped text fits its box,
 * using the stage's own numbers (96dpi, Georgia, 1.35 line height).
 * PowerPoint's shrink-on-overflow can't be trusted to engage on open,
 * so long verses arrive pre-fitted instead of spilling past their box.
 *
 * Pure except the injected measurer — unit tests use a fake, the app
 * passes a canvas 2D measurer (see `canvasMeasure`).
 */

export type MeasureFn = (
  line: string,
  fontFamily: string,
  sizePx: number,
) => number;

export interface FitInput {
  text: string;
  boxWPx: number;
  boxHPx: number;
  fontFamily: string;
  /** Size when everything fits (stage ceiling). */
  startPt: number;
  /** Floor for pathological text (stage floor). Never overflows by shrinking past this — instead it clips, same as the stage. */
  minPt?: number;
  lineHeight?: number;
  measure: MeasureFn;
}

const PT_TO_PX = 96 / 72;

/** Greedy word wrap under the measurer; overlong words split by char. */
function wrapLines(
  text: string,
  boxWPx: number,
  fontFamily: string,
  sizePx: number,
  measure: MeasureFn,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    const flush = () => {
      if (line.length > 0) {
        lines.push(line);
        line = "";
      }
    };
    for (const word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
      if (measure(word, fontFamily, sizePx) > boxWPx) {
        // Unbreakable word: emit it in fitting chunks.
        flush();
        let chunk = "";
        for (const ch of word) {
          const trial = chunk + ch;
          if (
            chunk.length > 0 &&
            measure(trial, fontFamily, sizePx) > boxWPx
          ) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = trial;
          }
        }
        if (chunk.length > 0) lines.push(chunk);
        continue;
      }
      const trial = line.length === 0 ? word : `${line} ${word}`;
      if (measure(trial, fontFamily, sizePx) <= boxWPx) {
        line = trial;
      } else {
        flush();
        line = word;
      }
    }
    flush();
    // Blank paragraphs still take a line.
    if (paragraph.trim().length === 0) lines.push("");
  }
  return lines.length === 0 ? [""] : lines;
}

/** Largest size in [minPt, startPt] whose wrapped lines fit the box. */
export function fitTextToBox(input: FitInput): number {
  const {
    text,
    boxWPx,
    boxHPx,
    fontFamily,
    startPt,
    minPt = 18,
    lineHeight = 1.35,
    measure,
  } = input;
  if (text.trim().length === 0) return startPt;
  const fits = (pt: number): boolean => {
    const sizePx = pt * PT_TO_PX;
    const lines = wrapLines(text, boxWPx, fontFamily, sizePx, measure);
    return lines.length * sizePx * lineHeight <= boxHPx;
  };
  if (fits(startPt)) return startPt;
  let lo = minPt;
  let hi = startPt;
  for (let i = 0; i < 12; i += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Canvas 2D measurer (DOM) — null where there is no document. */
export function canvasMeasure(): MeasureFn | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return (line, fontFamily, sizePx) => {
    ctx.font = `${sizePx}px ${fontFamily}`;
    return ctx.measureText(line).width;
  };
}
