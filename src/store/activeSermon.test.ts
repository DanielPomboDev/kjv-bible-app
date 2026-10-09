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
