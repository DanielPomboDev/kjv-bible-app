import { describe, expect, test } from "vitest";
import {
  STAGE_1080P_PX,
  STAGE_REF_WIDTH,
  previewScaleForWidth,
} from "./stageScale";

describe("previewScaleForWidth", () => {
  test("full reference width scales to exactly one", () => {
    expect(previewScaleForWidth(STAGE_REF_WIDTH)).toBe(1);
  });

  test("a quarter-width preview scales type to a quarter", () => {
    // 466px canvas ≈ the studio filmstrip layout: 35.1px reference
    // becomes ~8.5px instead of staying viewport-sized at ~35px.
    const scale = previewScaleForWidth(466);
    expect(scale).toBeCloseTo(0.2427, 4);
    expect(STAGE_1080P_PX.ref * scale).toBeCloseTo(8.52, 1);
  });

  test("zero and negative widths clamp to zero, never negative", () => {
    expect(previewScaleForWidth(0)).toBe(0);
    expect(previewScaleForWidth(-100)).toBe(0);
  });
});
