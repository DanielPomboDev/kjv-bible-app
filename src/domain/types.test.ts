import { describe, expect, test } from "vitest";
import { deckKey } from "./types";

describe("deckKey", () => {
  test("verse without uid falls back to type:id", () => {
    expect(
      deckKey({ type: "verse", id: 123, label: "John 3:16", text: "x" }),
    ).toBe("verse:123");
  });

  test("custom without uid falls back to type:id", () => {
    expect(
      deckKey({ type: "custom", id: "custom-abc", body: "hello" }),
    ).toBe("custom:custom-abc");
  });

  test("duplicate uid wins over type:id", () => {
    expect(
      deckKey({
        type: "verse",
        id: 123,
        label: "John 3:16",
        text: "x",
        uid: "dup-xyz",
      }),
    ).toBe("dup-xyz");
  });
});
