import { describe, expect, test } from "vitest";
import {
  customSlideToBlocks,
  isSlideBlock,
  moveBlock,
  newBlockId,
  normalizeSlideBlock,
  renderMode,
} from "./blocks";

describe("slide blocks", () => {
  test("new ids are unique and namespaced", () => {
    const a = newBlockId();
    const b = newBlockId();
    expect(a).not.toBe(b);
    expect(a.startsWith("block-")).toBe(true);
  });

  test("normalize keeps a valid text block, clamping geometry", () => {
    const block = normalizeSlideBlock({
      type: "text",
      id: "block-1",
      x: -5,
      y: 10,
      w: 400,
      align: "middle",
      font: "serif",
      sizePct: 99,
      color: "not-a-color",
      bold: true,
      text: "  Grace  ",
    });
    expect(block).toEqual({
      type: "text",
      id: "block-1",
      x: 0,
      y: 10,
      w: 100,
      align: "center",
      font: "serif",
      sizePct: 12,
      bold: true,
      text: "Grace",
    });
  });

  test("normalize keeps a valid image block and requires alt text", () => {
    expect(
      normalizeSlideBlock({
        type: "image",
        id: "block-2",
        x: 10,
        y: 10,
        w: 80,
        src: "data:image/png;base64,AAA",
        alt: "  Church logo  ",
        fit: "stretch",
      }),
    ).toEqual({
      type: "image",
      id: "block-2",
      x: 10,
      y: 10,
      w: 80,
      src: "data:image/png;base64,AAA",
      alt: "Church logo",
      fit: "contain",
    });
    // Blank alt is rejected: decorative images must be a deliberate
    // empty string is not accepted here — every image needs a label.
    expect(
      normalizeSlideBlock({
        type: "image",
        id: "block-3",
        x: 0,
        y: 0,
        w: 50,
        src: "data:image/png;base64,AAA",
        alt: "   ",
      }),
    ).toBeNull();
  });

  test("malformed blocks are dropped, never throw", () => {
    expect(normalizeSlideBlock(null)).toBeNull();
    expect(normalizeSlideBlock({ type: "video", id: "x" })).toBeNull();
    expect(normalizeSlideBlock({ type: "text", id: "x" })).toBeNull();
    expect(isSlideBlock({ type: "text" })).toBe(false);
  });

  test("renderMode prefers blocks, falls back to legacy", () => {
    expect(renderMode({ blocks: [] })).toBe("blocks");
    expect(renderMode({})).toBe("legacy");
    expect(
      renderMode({
        blocks: [
          {
            type: "text",
            id: "b",
            x: 0,
            y: 0,
            w: 10,
            align: "left",
            font: "serif",
            sizePct: 3,
            text: "x",
          },
        ],
      }),
    ).toBe("blocks");
  });

  test("legacy title/body convert to centered freeform boxes", () => {
    const blocks = customSlideToBlocks("Grace", "Amazing grace");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "text", align: "center" });
    expect(blocks[1]).toMatchObject({ type: "text", text: "Amazing grace" });
    // Title-less slides convert body only.
    expect(customSlideToBlocks(undefined, "Point")).toHaveLength(1);
    expect(customSlideToBlocks(undefined, "   ")).toHaveLength(0);
  });

  test("moveBlock reorders paint order (later paints on top)", () => {
    const blocks = [
      { id: "a" } as never,
      { id: "b" } as never,
      { id: "c" } as never,
    ];
    expect(moveBlock(blocks, 0, 2).map((b) => (b as { id: string }).id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    // Out-of-range moves are no-ops returning the same contents.
    expect(moveBlock(blocks, 0, 0)).toEqual(blocks);
    expect(moveBlock(blocks, -1, 2)).toEqual(blocks);
  });
});
