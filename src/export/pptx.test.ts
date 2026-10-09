import { describe, expect, test } from "vitest";
import {
  BACKGROUND_PRESETS,
} from "../presentation/backgroundPresets";
import {
  generateDeckPptx,
  pctToInX,
  planDeck,
  planSlide,
  pptxBackgroundFor,
  pptxFileName,
  pptxFontFace,
  sizePctToPt,
} from "./pptx";
import type { Sermon } from "../domain/types";
import { freshSermon } from "../store/sermonStorage";

function sermonWith(title: string): Sermon {
  return { ...freshSermon(title), backgroundPresetId: "deep-navy" };
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
    expect(plan.texts[0].runs[0]).toMatchObject({
      text: "John 3:16",
      bold: true,
    });
    expect(plan.texts[1].runs[0].text).toBe("For God…");
    expect(plan.texts[1].shrink).toBe(true);
    expect(plan.notes).toBe("Emphasize");
  });

  test("legacy custom maps title/body with shrink", () => {
    const plan = planSlide(
      { type: "custom", id: "c", title: "Grace", body: "Amazing" },
      "classic-black",
    );
    expect(plan.background).toBe("000000");
    expect(plan.texts).toHaveLength(2);
    expect(plan.texts[0].runs[0].fontSize).toBe(40);
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
    expect(plan.texts).toHaveLength(1);
    const box = plan.texts[0];
    expect(box.x).toBeCloseTo(1.333, 3);
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
    const plans = planDeck(sermon);
    expect(plans).toHaveLength(2);
    expect(plans[0].texts[0].runs[0].text).toBe("Genesis 1:1");
    expect(plans[1].texts[0].runs[0].text).toBe("Grace");
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
