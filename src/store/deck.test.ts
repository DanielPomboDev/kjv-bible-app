import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SermonDeckItem } from "../domain/types";
import { deckKey } from "../domain/types";

// The deck store is a module singleton, so each test boots it fresh:
// stub storage, reset modules, re-import. This also exercises the real
// boot path (new key → legacy adoption → fresh) every time.
async function freshStore() {
  vi.resetModules();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
  return (await import("./deck")).useDeck;
}

const verse = (id: number): SermonDeckItem => ({
  type: "verse",
  id,
  label: `Genesis 1:${id}`,
  text: `Verse ${id}`,
});

describe("deck store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("boots empty with the default background", async () => {
    const useDeck = await freshStore();
    expect(useDeck.getState().deck).toEqual([]);
    expect(useDeck.getState().backgroundPresetId).toBe("classic-black");
    expect(useDeck.getState().outline).toEqual([]);
  });

  test("queues verses with dedupe, moves, duplicates, removes", async () => {
    const useDeck = await freshStore();
    const s = () => useDeck.getState();
    expect(s().addToDeck(verse(1))).toBe(true);
    expect(s().addToDeck(verse(1))).toBe(false);
    expect(s().addManyToDeck([verse(1), verse(2), verse(2)])).toEqual({
      added: 1,
      skipped: 2,
    });
    s().moveInDeck(0, 1);
    expect(s().deck.map((d) => deckKey(d))).toEqual(["verse:2", "verse:1"]);
    expect(s().duplicateDeckItem(0)).toBe(true);
    expect(s().deck).toHaveLength(3);
    s().removeFromDeck(deckKey(s().deck[0]));
    expect(s().deck).toHaveLength(2);
    s().clearDeck();
    expect(s().deck).toHaveLength(0);
  });

  test("persists across a reboot", async () => {
    const first = await freshStore();
    first.getState().addToDeck(verse(7));
    first.getState().setBackgroundPresetId("deep-navy");
    // Same stubbed storage, fresh module = app restart.
    vi.resetModules();
    const { useDeck: second } = await import("./deck");
    expect(second.getState().deck).toHaveLength(1);
    expect(second.getState().backgroundPresetId).toBe("deep-navy");
  });

  test("adopts the retired library's open sermon once, then drops it", async () => {
    const useDeck = await freshStore();
    void useDeck;
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    } as unknown as Storage);
    store.set(
      "bible.sermonLibrary",
      JSON.stringify({
        sermons: [
          {
            id: "sermon-1",
            title: "Kept",
            date: new Date(2026, 0, 1).toISOString(),
            outline: [
              { id: "outline-1", heading: "Intro", body: "Open well" },
            ],
            deck: [verse(3)],
            backgroundPresetId: "deep-navy",
          },
        ],
        activeId: "sermon-1",
      }),
    );
    vi.resetModules();
    const { useDeck: adopted } = await import("./deck");
    expect(adopted.getState().deck).toHaveLength(1);
    expect(adopted.getState().backgroundPresetId).toBe("deep-navy");
    // Planning data carries over untouched (no UI writes it anymore).
    expect(adopted.getState().outline).toHaveLength(1);
    // Migration consumed the legacy record.
    expect(store.get("bible.sermonLibrary")).toBeUndefined();
    expect(store.get("bible.deck")).toContain("verse");
  });

  test("restoreDeck replaces the whole deck (undo path)", async () => {
    const useDeck = await freshStore();
    useDeck.getState().addToDeck(verse(1));
    useDeck.getState().restoreDeck([verse(9), verse(10)]);
    expect(useDeck.getState().deck.map((d) => d.id)).toEqual([9, 10]);
  });

  test("background ignores unknown presets", async () => {
    const useDeck = await freshStore();
    const s = () => useDeck.getState();
    s().setBackgroundPresetId("nope");
    expect(s().backgroundPresetId).toBe("classic-black");
    s().setBackgroundPresetId("deep-navy");
    expect(s().backgroundPresetId).toBe("deep-navy");
  });
});
