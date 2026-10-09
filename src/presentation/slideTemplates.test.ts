import { describe, expect, test } from "vitest";
import { normalizeSlideBlock } from "../domain/blocks";
import { SLIDE_TEMPLATES, getSlideTemplate } from "./slideTemplates";

describe("slide templates", () => {
  test("every template builds valid, on-slide blocks", () => {
    for (const template of SLIDE_TEMPLATES) {
      const first = template.make();
      const second = template.make();
      expect(first.length).toBeLessThanOrEqual(3);
      for (const block of first) {
        const normalized = normalizeSlideBlock(block);
        expect(normalized).toEqual(block);
      }
      // Fresh ids per build so applied templates never share identity
      // (blank builds nothing, so there is nothing to compare).
      if (first.length > 0) {
        const firstIds = first.map((b) => b.id).sort();
        const secondIds = second.map((b) => b.id).sort();
        expect(firstIds).not.toEqual(secondIds);
      }
    }
  });

  test("blank builds an empty freeform slide", () => {
    expect(getSlideTemplate("blank")?.make()).toEqual([]);
    expect(getSlideTemplate("nope")).toBeNull();
  });
});
