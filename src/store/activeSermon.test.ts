import { beforeEach, describe, expect, test, vi } from "vitest";
import { useActiveSermon } from "./activeSermon";
import { freshSermon } from "./sermonStorage";
import { deckKey } from "../domain/types";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
}

// Deck Studio relies on these behaviours: add/edit custom cards,
// reorder, duplicate (fresh identity), and private notes.
describe("active sermon deck (Deck Studio contract)", () => {
  beforeEach(() => {
    stubStorage();
    useActiveSermon.getState().replaceSermon(freshSermon("Test"));
  });

  test("rejects a blank custom slide body", () => {
    expect(useActiveSermon.getState().addCustomSlide("T", "   ")).toBeNull();
    expect(useActiveSermon.getState().sermon.deck).toHaveLength(0);
  });

  test("adds then edits a custom slide in place", () => {
    const item = useActiveSermon.getState().addCustomSlide("T", "body");
    expect(item).not.toBeNull();
    const key = deckKey(item!);
    expect(useActiveSermon.getState().sermon.deck).toHaveLength(1);

    expect(
      useActiveSermon.getState().updateCustomSlide(key, "T2", "body2"),
    ).toBe(true);
    const updated = useActiveSermon.getState().sermon.deck[0];
    expect(updated.type).toBe("custom");
    if (updated.type === "custom") {
      expect(updated.title).toBe("T2");
      expect(updated.body).toBe("body2");
    }
    // Blank body refuses, keeping the old content.
    expect(
      useActiveSermon.getState().updateCustomSlide(key, "T3", "  "),
    ).toBe(false);
  });

  test("moves slides to reorder the filmstrip", () => {
    useActiveSermon.getState().addCustomSlide("A", "a");
    useActiveSermon.getState().addCustomSlide("B", "b");
    useActiveSermon.getState().moveInDeck(0, 1);
    const deck = useActiveSermon.getState().sermon.deck;
    expect(deck[0].type === "custom" && deck[0].title).toBe("B");
    expect(deck[1].type === "custom" && deck[1].title).toBe("A");
  });

  test("duplicates a slide with a fresh identity right after the source", () => {
    useActiveSermon.getState().addCustomSlide("A", "a");
    expect(useActiveSermon.getState().duplicateDeckItem(0)).toBe(true);
    const deck = useActiveSermon.getState().sermon.deck;
    expect(deck).toHaveLength(2);
    expect(deckKey(deck[0])).not.toBe(deckKey(deck[1]));
  });

  test("sets then clears private presenter notes", () => {
    const item = useActiveSermon.getState().addCustomSlide("A", "a")!;
    const key = deckKey(item);
    useActiveSermon.getState().setSlideNotes(key, "remember this");
    expect(useActiveSermon.getState().sermon.deck[0].notes).toBe(
      "remember this",
    );
    useActiveSermon.getState().setSlideNotes(key, "   ");
    expect(
      useActiveSermon.getState().sermon.deck[0].notes,
    ).toBeUndefined();
  });

  test("removes one slide by deck key", () => {
    const item = useActiveSermon.getState().addCustomSlide("A", "a")!;
    useActiveSermon.getState().removeFromDeck(deckKey(item));
    expect(useActiveSermon.getState().sermon.deck).toHaveLength(0);
  });
});

describe("freeform blocks (PowerPoint editing contract)", () => {
  beforeEach(() => {
    stubStorage();
    useActiveSermon.getState().replaceSermon(freshSermon("Test"));
  });

  function addLegacy(): string {
    const item = useActiveSermon.getState().addCustomSlide("T", "body")!;
    return deckKey(item);
  }

  test("converts legacy title/body to blocks, keeping the fallback", () => {
    const key = addLegacy();
    expect(useActiveSermon.getState().convertToFreeform(key)).toBe(true);
    const slide = useActiveSermon.getState().sermon.deck[0];
    expect(slide.type).toBe("custom");
    if (slide.type !== "custom") return;
    expect(slide.blocks).toHaveLength(2);
    // Legacy fields stay for older readers.
    expect(slide.title).toBe("T");
    expect(slide.body).toBe("body");
    // Converting twice is a no-op.
    expect(useActiveSermon.getState().convertToFreeform(key)).toBe(false);
  });

  test("adds, patches, layers, and removes blocks", () => {
    const key = addLegacy();
    const s = useActiveSermon.getState();
    expect(s.convertToFreeform(key)).toBe(true);

    expect(
      s.addBlock(key, {
        type: "text",
        id: "block extra",
        x: 0,
        y: 60,
        w: 200,
        align: "left",
        font: "sans",
        sizePct: 2,
        text: "Extra",
      }),
    ).toBe(true);
    let slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom" || !slide.blocks) throw new Error("setup");
    expect(slide.blocks).toHaveLength(3);
    // Geometry clamped on write.
    expect(slide.blocks[2].x).toBe(0);
    expect(slide.blocks[2].w).toBe(100);

    const extraId = slide.blocks[2].id;
    expect(s.updateBlock(key, extraId, { x: 20, sizePct: 99 })).toBe(true);
    slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom" || !slide.blocks) throw new Error("setup");
    expect(slide.blocks[2].x).toBe(20);
    expect(
      slide.blocks[2].type === "text" && slide.blocks[2].sizePct,
    ).toBe(12);

    // Blank text refuses, changing nothing.
    expect(s.updateBlock(key, extraId, { text: "   " })).toBe(false);

    // Layer order: last paints on top.
    expect(s.moveBlockInSlide(key, 2, 0)).toBe(true);
    slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom" || !slide.blocks) throw new Error("setup");
    expect(slide.blocks[0].id).toBe(extraId);

    expect(s.removeBlock(key, extraId)).toBe(true);
    slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom") throw new Error("setup");
    expect(slide.blocks).toHaveLength(2);
    expect(s.removeBlock(key, "missing")).toBe(false);
  });

  test("verse slides reject every block op", () => {
    const s = useActiveSermon.getState();
    s.addToDeck({ type: "verse", id: 7, label: "John 3:16", text: "x" });
    const key = deckKey(useActiveSermon.getState().sermon.deck[0]);
    const block = {
      type: "text" as const,
      id: "b",
      x: 0,
      y: 0,
      w: 10,
      align: "left" as const,
      font: "serif",
      sizePct: 3,
      text: "x",
    };
    expect(s.addBlock(key, block)).toBe(false);
    expect(s.updateBlock(key, "b", { x: 1 })).toBe(false);
    expect(s.removeBlock(key, "b")).toBe(false);
    expect(s.moveBlockInSlide(key, 0, 1)).toBe(false);
    expect(s.setBlocks(key, [block])).toBe(false);
    expect(s.convertToFreeform(key)).toBe(false);
    expect(s.setSlideBackground(key, "deep-navy")).toBe(false);
  });

  test("per-slide background sets, clears, and rejects unknown presets", () => {
    const key = addLegacy();
    const s = useActiveSermon.getState();
    expect(s.setSlideBackground(key, "deep-navy")).toBe(true);
    let slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom") throw new Error("setup");
    expect(slide.backgroundPresetId).toBe("deep-navy");
    expect(s.setSlideBackground(key, "deep-navy")).toBe(false);
    expect(s.setSlideBackground(key, "nope")).toBe(false);
    expect(s.setSlideBackground(key, undefined)).toBe(true);
    slide = useActiveSermon.getState().sermon.deck[0];
    if (slide.type !== "custom") throw new Error("setup");
    expect(slide.backgroundPresetId).toBeUndefined();
  });
});
