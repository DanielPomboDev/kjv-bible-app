import { beforeEach, describe, expect, test, vi } from "vitest";
import { useNavigation } from "./navigation";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as unknown as Storage);
}

describe("navigation view", () => {
  beforeEach(() => {
    stubStorage();
    useNavigation.setState({ activeView: "read" });
  });

  test("defaults to the reading pane", () => {
    expect(useNavigation.getState().activeView).toBe("read");
  });

  test("switches between read and deck studio", () => {
    useNavigation.getState().setView("deck");
    expect(useNavigation.getState().activeView).toBe("deck");
    useNavigation.getState().setView("read");
    expect(useNavigation.getState().activeView).toBe("read");
  });
});
