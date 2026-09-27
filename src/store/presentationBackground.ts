import { create } from "zustand";
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_PRESET_ID,
} from "../presentation/backgroundPresets";

/**
 * Selected slide background preset id. Persisted to localStorage the same
 * way settings are (see store/settings.ts) so the choice survives app
 * restarts. Defaults to Classic Black on first run or when the stored
 * value is missing/corrupt/unknown.
 */

const STORAGE_KEY = "bible.presentationBackground";

interface PresentationBackgroundState {
  presetId: string;
  setPresetId: (id: string) => void;
}

function isPresetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    BACKGROUND_PRESETS.some((preset) => preset.id === value)
  );
}

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (isPresetId(obj.presetId)) return obj.presetId;
      } else if (isPresetId(parsed)) {
        // Tolerate a bare string from an older write.
        return parsed;
      }
    }
  } catch {
    // Corrupted or unavailable storage: fall through to default.
  }
  return DEFAULT_BACKGROUND_PRESET_ID;
}

export const usePresentationBackground =
  create<PresentationBackgroundState>()((set) => ({
    presetId: load(),

    setPresetId: (id) => {
      if (!isPresetId(id)) return;
      set({ presetId: id });
      persist();
    },
  }));

function persist(): void {
  const { presetId } = usePresentationBackground.getState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ presetId }));
  } catch {
    // Storage full or unavailable: background just won't persist.
  }
}
