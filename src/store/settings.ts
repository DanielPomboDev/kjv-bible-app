import { create } from "zustand";

/**
 * User settings: theme and reading font size. Persisted to localStorage
 * so they survive app restarts (the Tauri WebView keeps localStorage per
 * app; the running backend has no say in it).
 *
 * Kept separate from navigation/search/selection so opening the panel or
 * changing a setting never disturbs anything else.
 */

export type Theme = "light" | "dark";

/**
 * Reading font size steps. The reading pane uses `--text-reading-size`;
 * UI chrome (lists, toolbar, headings) always stays at the standard body
 * size, so only Bible text scales. Indexed steps, not raw pixels, so the
 * control is a simple stepper and the tokens file stays the single source
 * of truth for actual sizes.
 */
export const READING_SIZES = ["small", "standard", "large", "xlarge"] as const;
export type ReadingSize = (typeof READING_SIZES)[number];

const STORAGE_KEY = "bible.settings";

interface SettingsState {
  theme: Theme;
  readingSize: ReadingSize;
  setTheme: (theme: Theme) => void;
  setReadingSize: (size: ReadingSize) => void;
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function isReadingSize(value: unknown): value is ReadingSize {
  return READING_SIZES.includes(value as ReadingSize);
}

function load(): { theme: Theme; readingSize: ReadingSize } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        return {
          theme: isTheme(obj.theme) ? obj.theme : "light",
          readingSize: isReadingSize(obj.readingSize) ? obj.readingSize : "standard",
        };
      }
    }
  } catch {
    // Corrupted or unavailable storage: fall through to defaults.
  }
  return { theme: "light", readingSize: "standard" };
}

/**
 * Apply theme + reading size to the document. Called on every change and
 * once at startup, so the DOM never disagrees with the store.
 */
function apply(state: { theme: Theme; readingSize: ReadingSize }): void {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty(
    "--text-reading-size",
    READING_SIZE_CSS[state.readingSize],
  );
}

/** CSS values per named size — see tokens.css. */
const READING_SIZE_CSS: Record<ReadingSize, string> = {
  small: "0.9375rem",
  standard: "1.0625rem",
  large: "1.25rem",
  xlarge: "1.5rem",
};

export const useSettings = create<SettingsState>()((set) => ({
  ...load(),
  setTheme: (theme) => {
    set({ theme });
    apply(useSettings.getState());
    persist();
  },
  setReadingSize: (readingSize) => {
    set({ readingSize });
    apply(useSettings.getState());
    persist();
  },
}));

function persist(): void {
  const { theme, readingSize } = useSettings.getState();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme, readingSize }),
    );
  } catch {
    // Storage full or unavailable: settings just won't persist.
  }
}

/**
 * Load persisted settings and apply them to the document. Call once at
 * startup (main.tsx), before the first render.
 */
export function initSettings(): void {
  apply(useSettings.getState());
}
