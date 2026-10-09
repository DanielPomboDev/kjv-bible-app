import { describe, expect, test } from "vitest";
import { fitTextToBox, type MeasureFn } from "./textFit";

/** Deterministic fake metrics: average glyph half an em wide. */
const fakeMeasure: MeasureFn = (line, _family, sizePx) =>
  line.length * sizePx * 0.55;

const BOX = {
  boxWPx: 1126,
  boxHPx: 528,
  fontFamily: "Georgia, serif",
};

describe("fitTextToBox", () => {
  test("short text keeps the starting size", () => {
    expect(
      fitTextToBox({ text: "Jesus wept.", startPt: 89, ...BOX, measure: fakeMeasure }),
    ).toBe(89);
  });

  test("long text shrinks until wrapped lines fit the box", () => {
    const text =
      "In the beginning God created the heaven and the earth. ".repeat(8).trim();
    const size = fitTextToBox({
      text,
      startPt: 89,
      ...BOX,
      measure: fakeMeasure,
    });
    expect(size).toBeLessThan(89);
    expect(size).toBeGreaterThanOrEqual(18);
    // The returned size really fits under the fake metrics.
    const sizePx = (size * 96) / 72;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const trial = line.length === 0 ? word : `${line} ${word}`;
      if (fakeMeasure(trial, BOX.fontFamily, sizePx) <= BOX.boxWPx) {
        line = trial;
      } else {
        if (line.length > 0) lines.push(line);
        line = word;
      }
    }
    if (line.length > 0) lines.push(line);
    expect(lines.length * sizePx * 1.35).toBeLessThanOrEqual(BOX.boxHPx);
  });

  test("enormous text clamps to the floor instead of overflowing", () => {
    const size = fitTextToBox({
      text: "word ".repeat(2000).trim(),
      startPt: 89,
      minPt: 18,
      ...BOX,
      measure: fakeMeasure,
    });
    expect(size).toBe(18);
  });

  test("unbreakable long words split to fit the width", () => {
    const size = fitTextToBox({
      text: "a".repeat(500),
      startPt: 89,
      ...BOX,
      measure: fakeMeasure,
    });
    // Must shrink hard (one 500-char word needs tiny type to wrap).
    expect(size).toBeLessThan(30);
  });

  test("blank text keeps the starting size", () => {
    expect(
      fitTextToBox({ text: "   ", startPt: 46, ...BOX, measure: fakeMeasure }),
    ).toBe(46);
  });
});
