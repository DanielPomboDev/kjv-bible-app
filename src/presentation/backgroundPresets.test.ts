import { describe, expect, test } from "vitest";
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_PRESET_ID,
  getBackgroundPreset,
} from "./backgroundPresets";

describe("background presets", () => {
  test("exactly 10 presets with Classic Black first and default", () => {
    expect(BACKGROUND_PRESETS).toHaveLength(10);
    expect(BACKGROUND_PRESETS[0].id).toBe("classic-black");
    expect(DEFAULT_BACKGROUND_PRESET_ID).toBe("classic-black");
  });

  test("unknown id falls back to Classic Black", () => {
    expect(getBackgroundPreset("nope").id).toBe("classic-black");
    expect(getBackgroundPreset("deep-navy").id).toBe("deep-navy");
  });
});
