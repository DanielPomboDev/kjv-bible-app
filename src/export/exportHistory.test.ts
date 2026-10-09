import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  loadExportRecord,
  newSlidesSince,
  saveExportRecord,
} from "./exportHistory";
import type { SermonDeckItem } from "../domain/types";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
}

const verse = (id: number): SermonDeckItem => ({
  type: "verse",
  id,
  label: `Gen 1:${id}`,
  text: "x",
});

describe("export history (append flow)", () => {
  beforeEach(() => {
    stubStorage();
  });

  test("round-trips a record per sermon", () => {
    expect(loadExportRecord("s1")).toBeNull();
    saveExportRecord({
      sermonId: "s1",
      fileName: "sunday.pptx",
      keys: ["verse:1", "verse:2"],
      exportedAt: "2026-01-01",
    });
    expect(loadExportRecord("s1")).toMatchObject({
      fileName: "sunday.pptx",
      keys: ["verse:1", "verse:2"],
    });
    expect(loadExportRecord("s2")).toBeNull();
  });

  test("detects appended slides by deck-key prefix", () => {
    const deck = [verse(1), verse(2), verse(3)];
    const tail = newSlidesSince(deck, {
      sermonId: "s",
      fileName: "s.pptx",
      keys: ["verse:1", "verse:2"],
      exportedAt: "x",
    });
    expect(tail?.map((d) => (d.type === "verse" ? d.id : -1))).toEqual([3]);
  });

  test("returns null without record, on reorder, or on shrink", () => {
    const deck = [verse(1), verse(2), verse(3)];
    expect(newSlidesSince(deck, null)).toBeNull();
    // Reordered: prefix broken.
    expect(
      newSlidesSince([verse(2), verse(1), verse(3)], {
        sermonId: "s",
        fileName: "s.pptx",
        keys: ["verse:1", "verse:2"],
        exportedAt: "x",
      }),
    ).toBeNull();
    // Same length or shorter: nothing new (or removed).
    expect(
      newSlidesSince([verse(1), verse(2)], {
        sermonId: "s",
        fileName: "s.pptx",
        keys: ["verse:1", "verse:2"],
        exportedAt: "x",
      }),
    ).toBeNull();
  });

  test("corrupt storage loads as no record", () => {
    localStorage.setItem("bible.exportHistory", "{oops");
    expect(loadExportRecord("s1")).toBeNull();
  });
});
