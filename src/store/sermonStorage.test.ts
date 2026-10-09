import { describe, expect, test } from "vitest";
import { normalizeDeckItem } from "./sermonStorage";

describe("deck persistence with freeform blocks", () => {
  test("custom slide keeps valid blocks and background override", () => {
    const item = normalizeDeckItem({
      type: "custom",
      id: "custom-1",
      title: "Grace",
      body: "Amazing grace",
      blocks: [
        {
          type: "text",
          id: "block-1",
          x: 10,
          y: 20,
          w: 80,
          align: "center",
          font: "serif",
          sizePct: 3,
          text: "Grace",
        },
      ],
      backgroundPresetId: "deep-navy",
    });
    expect(item).toMatchObject({
      type: "custom",
      backgroundPresetId: "deep-navy",
    });
    expect(item?.type === "custom" && item.blocks).toHaveLength(1);
  });

  test("malformed blocks and unknown backgrounds are dropped, slide kept", () => {
    const item = normalizeDeckItem({
      type: "custom",
      id: "custom-1",
      body: "Point",
      blocks: [{ type: "video", id: "x" }, null, "nope"],
      backgroundPresetId: "no-such-preset",
    });
    expect(item?.type === "custom" && item.blocks).toBeUndefined();
    expect(
      item?.type === "custom" && item.backgroundPresetId,
    ).toBeUndefined();
  });

  test("legacy custom slides without blocks load unchanged", () => {
    expect(
      normalizeDeckItem({ type: "custom", id: "c", body: "Point" }),
    ).toEqual({ type: "custom", id: "c", body: "Point" });
  });

  test("explicit empty blocks survive as a blank freeform frame", () => {
    const item = normalizeDeckItem({
      type: "custom",
      id: "c",
      body: "Point",
      blocks: [],
    });
    expect(item?.type === "custom" && item.blocks).toEqual([]);
  });
});
