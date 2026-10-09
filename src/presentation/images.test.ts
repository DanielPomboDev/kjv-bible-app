import { describe, expect, test } from "vitest";
import { IMAGE_BUDGET_BYTES, estimateDeckBytes, fitsImageBudget } from "./images";

describe("image storage budget", () => {
  test("estimates JSON size and enforces the quota guard", () => {
    expect(estimateDeckBytes([])).toBe(2);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(estimateDeckBytes(circular)).toBe(0);
    expect(fitsImageBudget([], 100)).toBe(true);
    expect(fitsImageBudget([], IMAGE_BUDGET_BYTES)).toBe(false);
    // A 4.5MB deck refuses even a tiny image.
    const bigDeck = "x".repeat(4_500_000);
    expect(fitsImageBudget([bigDeck], 10)).toBe(false);
  });
});
