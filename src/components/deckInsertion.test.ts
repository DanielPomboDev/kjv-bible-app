import { describe, expect, test } from "vitest";
import { insertionIndex } from "../domain/deckOrder";

// Desired FINAL index of the dragged slide after a filmstrip drop.
// moveInDeck(from, to) inserts at `to` post-removal, so `to` IS the final
// index — this helper just works out which one the pointer meant.
describe("insertionIndex", () => {
  test("dropping before a later slide lands just before it", () => {
    // [A,B,C,D], drag A(0) before C(2) -> [B,A,C,D]
    expect(insertionIndex(0, 2, "before")).toBe(1);
  });

  test("dropping after a later slide lands on its spot", () => {
    // [A,B,C,D], drag A(0) after C(2) -> [B,C,A,D]
    expect(insertionIndex(0, 2, "after")).toBe(2);
  });

  test("dropping before an earlier slide lands on its spot", () => {
    // [A,B,C,D], drag D(3) before A(0) -> [D,A,B,C]
    expect(insertionIndex(3, 0, "before")).toBe(0);
  });

  test("dropping after an earlier slide lands just after it", () => {
    // [A,B,C,D], drag D(3) after A(0) -> [A,D,B,C]
    expect(insertionIndex(3, 0, "after")).toBe(1);
  });

  test("adjacent drops that change nothing resolve to the same index", () => {
    // Drag B(1) before C(2) -> unchanged, so moveInDeck no-ops.
    expect(insertionIndex(1, 2, "before")).toBe(1);
    // Drag B(1) after A(0) -> unchanged.
    expect(insertionIndex(1, 0, "after")).toBe(1);
  });
});
