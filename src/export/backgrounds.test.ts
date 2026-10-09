import { describe, expect, test } from "vitest";
import { BACKGROUND_PRESETS } from "../presentation/backgroundPresets";
import { isRenderedBackground, renderPresetBackground } from "./backgrounds";

describe("export background registry", () => {
  test("layered presets render to images, solids stay exact", () => {
    const rendered = BACKGROUND_PRESETS.filter((p) =>
      isRenderedBackground(p.id),
    ).map((p) => p.id);
    expect(rendered).toEqual([
      "royal-amethyst",
      "stained-glass",
      "wood-pulpit",
      "aged-parchment",
      "night-sky",
      "sunset-veil",
      "forest-glade",
      "galilee-waters",
    ]);
    expect(isRenderedBackground("classic-black")).toBe(false);
    expect(isRenderedBackground("deep-navy")).toBe(false);
    expect(isRenderedBackground("nope")).toBe(false);
  });

  test("solids and unknowns never touch the canvas", () => {
    expect(renderPresetBackground("classic-black")).toBeNull();
    expect(renderPresetBackground("deep-navy")).toBeNull();
    expect(renderPresetBackground("nope")).toBeNull();
  });
});
