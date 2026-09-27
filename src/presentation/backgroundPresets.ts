/**
 * Slide background presets (AGENTS.md, "Slide background rules").
 *
 * Exactly 10 built-in presets. Each preset owns its full slide look: a CSS
 * `background` (solid color, gradient, or layered CSS-only pattern — no
 * external images, the app stays fully offline) plus matching
 * text/reference colors so every preset stays readable.
 *
 * Preset #1 is always "Classic Black" (solid black, light text) and is the
 * default on first run. The selected preset id lives on the currently
 * open sermon (`sermon.backgroundPresetId` in store/activeSermon.ts,
 * persisted like settings); the picker and
 * the presentation window consume this list. Apply a preset by setting the
 * stage element's inline style from `background`/`textColor`/
 * `referenceColor`.
 */

export interface SlideBackgroundPreset {
  /** Stable id, persisted as the selected preset. Never rename. */
  id: string;
  /** Display name shown in the background picker. */
  name: string;
  /**
   * CSS `background` shorthand value (solid, gradient, or layered
   * gradients). Assign to `style.background`. Layered values put any
   * darkening overlay FIRST so the color layers underneath show through.
   */
  background: string;
  /** Verse text color — picked for contrast against `background`. */
  textColor: string;
  /** Reference/counter color — dimmer than text but still legible. */
  referenceColor: string;
}

/** Default preset on first run — never change this to anything else. */
export const DEFAULT_BACKGROUND_PRESET_ID = "classic-black";

export const BACKGROUND_PRESETS: readonly SlideBackgroundPreset[] = [
  {
    id: "classic-black",
    name: "Classic Black",
    background: "#000000",
    textColor: "#F5F2EC",
    referenceColor: "#9A927F",
  },
  {
    id: "deep-navy",
    name: "Deep Navy",
    background: "#14264A",
    textColor: "#EDF1FA",
    referenceColor: "#9FB0CC",
  },
  {
    id: "royal-amethyst",
    name: "Royal Amethyst",
    background: "linear-gradient(135deg, #1E1033 0%, #3B1D6E 55%, #5B2A86 100%)",
    textColor: "#F3EDFF",
    referenceColor: "#C4B3E8",
  },
  {
    id: "stained-glass",
    name: "Stained Glass",
    background:
      "linear-gradient(rgb(8 6 18 / 0.78), rgb(8 6 18 / 0.78)), " +
      "conic-gradient(from 45deg at 30% 25%, #7B2D5B, #2D4C9B, #1F7A6D, #8A5A2B, #6B1F3A, #7B2D5B)",
    textColor: "#FFF8EC",
    referenceColor: "#D8C9A8",
  },
  {
    id: "wood-pulpit",
    name: "Wood Pulpit",
    background:
      "repeating-linear-gradient(93deg, rgb(255 255 255 / 0.03) 0 2px, transparent 2px 9px), " +
      "linear-gradient(160deg, #2A1A0E 0%, #4A2E17 45%, #6B4423 100%)",
    textColor: "#F7EBD3",
    referenceColor: "#D3B98E",
  },
  {
    id: "aged-parchment",
    name: "Aged Parchment",
    background:
      "radial-gradient(ellipse at 50% 30%, #FBF6E9 0%, #F3E9D2 55%, #E2D2AE 100%)",
    textColor: "#2A2118",
    referenceColor: "#6B5D43",
  },
  {
    id: "night-sky",
    name: "Night Sky",
    background:
      "radial-gradient(circle at 18% 22%, #FFFFFF 0 1px, transparent 2px), " +
      "radial-gradient(circle at 72% 14%, #FFFFFF 0 1px, transparent 2px), " +
      "radial-gradient(circle at 55% 32%, #FFFFFF 0 1px, transparent 2px), " +
      "radial-gradient(circle at 85% 55%, #FFFFFF 0 1px, transparent 2px), " +
      "radial-gradient(circle at 35% 60%, #FFFFFF 0 1px, transparent 2px), " +
      "linear-gradient(180deg, #050914 0%, #0B1A3A 100%)",
    textColor: "#F0F4FF",
    referenceColor: "#9AA9CC",
  },
  {
    id: "sunset-veil",
    name: "Sunset Veil",
    background:
      "linear-gradient(rgb(10 5 20 / 0.35), rgb(10 5 20 / 0.45)), " +
      "linear-gradient(180deg, #1A1033 0%, #5B2350 45%, #C65B3A 75%, #E89B4B 100%)",
    textColor: "#FFF6EC",
    referenceColor: "#F0C9A8",
  },
  {
    id: "forest-glade",
    name: "Forest Glade",
    background:
      "radial-gradient(ellipse at 50% 120%, #2D5A3D 0%, transparent 60%), " +
      "linear-gradient(170deg, #0A1F14 0%, #123524 60%, #1B4A30 100%)",
    textColor: "#EEF5EA",
    referenceColor: "#A9C7B2",
  },
  {
    id: "galilee-waters",
    name: "Galilee Waters",
    background: "linear-gradient(135deg, #062A33 0%, #0B4F5C 50%, #12707A 100%)",
    textColor: "#EFFAFB",
    referenceColor: "#A9D3D8",
  },
];

/** Look up a preset by id, falling back to Classic Black for unknown ids. */
export function getBackgroundPreset(id: string): SlideBackgroundPreset {
  return (
    BACKGROUND_PRESETS.find((preset) => preset.id === id) ??
    BACKGROUND_PRESETS[0]
  );
}
