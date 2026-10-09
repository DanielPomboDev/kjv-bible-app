import { describe, expect, test } from "vitest";
import {
  BACKGROUND_PRESETS,
} from "../presentation/backgroundPresets";
import {
  exportToast,
  generateDeckPptx,
  pctToInX,
  planDeck,
  planItems,
  planSlide,
  pptxBackgroundFor,
  pptxFileName,
  pptxFontFace,
  resolveSlideBackground,
  sizePctToPt,
} from "./pptx";
import type { DeckExport } from "./pptx";

function sermonWith(title: string): DeckExport {
  return { title, deck: [], backgroundPresetId: "deep-navy" };
}

describe("pptx export mapping", () => {
  test("geometry helpers convert percent to wide-layout inches/points", () => {
    expect(pctToInX(10)).toBeCloseTo(1.333, 3);
    expect(sizePctToPt(3)).toBeCloseTo(28.8, 1);
    expect(pptxFontFace("sans")).toBe("Calibri");
    expect(pptxFontFace("mystery")).toBe("Georgia");
    expect(pptxFileName("My Sermon Title")).toBe("my-sermon-title.pptx");
    expect(pptxFileName("  ")).toBe("sermon.pptx");
  });

  test("background table covers every built-in preset", () => {
    for (const preset of BACKGROUND_PRESETS) {
      expect(pptxBackgroundFor(preset.id)).toMatch(/^[0-9A-F]{6}$/);
    }
    expect(pptxBackgroundFor("nope")).toBe("000000");
  });

  test("verse slide maps label, text, colors, and notes", () => {
    const plan = planSlide(
      { type: "verse", id: 7, label: "John 3:16", text: "For God…", notes: "Emphasize" },
      "deep-navy",
    );
    expect(plan.background).toBe("14264A");
    expect(plan.texts).toHaveLength(2);
    // Hero body first: large, centered, middle-anchored.
    const [body, ref] = plan.texts;
    expect(body).toMatchObject({
      x: 0.8,
      y: 0.7,
      w: 11.73,
      h: 5.5,
      align: "center",
      valign: "middle",
      shrink: true,
    });
    expect(body.runs[0]).toMatchObject({
      text: "For God…",
      fontSize: 89,
      fontFace: "Georgia",
    });
    // Reference pinned near the bottom, small dim sans.
    expect(ref).toMatchObject({ x: 0.8, y: 6.45, align: "center" });
    expect(ref.runs[0]).toMatchObject({
      text: "John 3:16",
      fontSize: 26,
      fontFace: "Calibri",
    });
    expect("bold" in ref.runs[0]).toBe(false);
    expect(plan.notes).toBe("Emphasize");
  });

  test("legacy custom maps title/body with shrink", () => {
    const plan = planSlide(
      { type: "custom", id: "c", title: "Grace", body: "Amazing" },
      "classic-black",
    );
    expect(plan.background).toBe("000000");
    expect(plan.texts).toHaveLength(2);
    expect(plan.texts[0].runs[0]).toMatchObject({
      fontSize: 46,
      fontFace: "Calibri",
      bold: true,
    });
    expect(plan.texts[1]).toMatchObject({ valign: "middle", shrink: true });
    expect(plan.texts[1].runs[0].fontSize).toBe(89);
  });

  test("freeform blocks map positions, type scale, images, override bg", () => {
    const plan = planSlide(
      {
        type: "custom",
        id: "c",
        body: "fallback",
        backgroundPresetId: "deep-navy",
        blocks: [
          {
            type: "text",
            id: "b1",
            x: 10,
            y: 20,
            w: 80,
            align: "left",
            font: "sans",
            sizePct: 3,
            bold: true,
            text: "Point",
          },
          {
            type: "image",
            id: "b2",
            x: 20,
            y: 40,
            w: 60,
            src: "data:image/png;base64,AAA",
            alt: "Logo",
          },
        ],
      },
      "classic-black",
    );
    // Per-slide override wins over the sermon background.
    expect(plan.background).toBe("14264A");
    expect(plan.bgPresetId).toBe("deep-navy");
    expect(plan.texts).toHaveLength(1);
    const box = plan.texts[0];
    expect(box.x).toBeCloseTo(1.333, 3);
    expect(box.valign).toBe("top");
    expect(box.runs[0]).toMatchObject({
      fontSize: expect.closeTo(28.8, 1),
      fontFace: "Calibri",
      bold: true,
    });
    expect(plan.images).toEqual([
      { x: expect.closeTo(2.666, 2), y: expect.closeTo(3, 2), w: expect.closeTo(8, 1), src: "data:image/png;base64,AAA", alt: "Logo" },
    ]);
  });

  test("planDeck preserves deck order across mixed slides", () => {
    const sermon = sermonWith("Mix");
    sermon.deck = [
      { type: "verse", id: 1, label: "Genesis 1:1", text: "In the…" },
      { type: "custom", id: "c", title: "Grace", body: "Amazing…" },
    ];
    const plans = planDeck(sermon.deck, sermon.backgroundPresetId);
    expect(plans).toHaveLength(2);
    expect(plans[0].texts[1].runs[0].text).toBe("Genesis 1:1");
    expect(plans[1].texts[0].runs[0].text).toBe("Grace");
  });

  test("background resolution prefers art, falls back to solid", () => {
    expect(resolveSlideBackground("deep-navy", "14264A")).toEqual({
      color: "14264A",
    });
    // No document in node: rendered presets fall back to their solid.
    expect(resolveSlideBackground("stained-glass", "2A1545")).toEqual({
      color: "2A1545",
    });
  });

  test("toast lines cover opened and saved outcomes", () => {
    const full = { fileName: "s.pptx", path: "s.pptx", opened: true };
    expect(exportToast(full, 8)).toBe("Opened s.pptx in PowerPoint (8 slides)");
    expect(exportToast({ ...full, opened: false }, 1)).toBe(
      "Saved s.pptx — open it in PowerPoint (1 slide)",
    );
  });

  test("planItems maps an explicit subset", () => {
    const sermon = sermonWith("Mix");
    sermon.deck = [
      { type: "verse", id: 1, label: "Genesis 1:1", text: "In the…" },
      { type: "verse", id: 2, label: "Genesis 1:2", text: "And the…" },
      { type: "custom", id: "c", title: "Grace", body: "Amazing…" },
    ];
    const plans = planItems(sermon.deck.slice(2), sermon.backgroundPresetId);
    expect(plans).toHaveLength(1);
    expect(plans[0].texts[0].runs[0].text).toBe("Grace");
  });

  test("empty deck refuses to generate", async () => {
    await expect(generateDeckPptx(sermonWith("Empty"))).rejects.toThrow(
      "empty deck",
    );
  });

  test("generation produces a real OOXML package", async () => {
    const sermon = sermonWith("Grace");
    sermon.deck = [
      { type: "verse", id: 1, label: "Genesis 1:1", text: "In the beginning…" },
      { type: "custom", id: "c", title: "Grace", body: "Amazing…" },
    ];
    const blob = await generateDeckPptx(sermon);
    expect(blob.size).toBeGreaterThan(10000);
    const bytes = new Uint8Array(await blob.arrayBuffer()).subarray(0, 4);
    expect(Array.from(bytes)).toEqual([0x50, 0x4b, 0x03, 0x04]);
  }, 60000);
});
