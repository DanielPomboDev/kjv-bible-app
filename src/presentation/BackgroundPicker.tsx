import { BACKGROUND_PRESETS } from "./backgroundPresets";
import { usePresentationBackground } from "../store/presentationBackground";

/**
 * Background picker (AGENTS.md, Slide background rule #5): a grid of 10
 * small preview swatches, one per preset, each showing its actual
 * background so it's recognizable at a glance. Clicking (or Enter/Space
 * on) a swatch selects that preset in the presentationBackgroundStore
 * and closes the picker via `onClose`. The current preset is highlighted
 * and marked with `aria-pressed`.
 */
export function BackgroundPicker({ onClose }: { onClose: () => void }) {
  const presetId = usePresentationBackground((s) => s.presetId);
  const setPresetId = usePresentationBackground((s) => s.setPresetId);

  return (
    <div className="background-picker" role="dialog" aria-label="Slide background">
      <span className="background-picker-title" id="background-picker-label">
        Background
      </span>
      <div
        className="background-picker-grid"
        role="group"
        aria-labelledby="background-picker-label"
      >
        {BACKGROUND_PRESETS.map((preset) => {
          const selected = preset.id === presetId;
          return (
            <button
              key={preset.id}
              type="button"
              className={
                selected
                  ? "background-picker-swatch background-picker-swatch-selected"
                  : "background-picker-swatch"
              }
              aria-pressed={selected}
              title={preset.name}
              aria-label={`${preset.name}${selected ? " (selected)" : ""}`}
              onClick={() => {
                setPresetId(preset.id);
                onClose();
              }}
            >
              <span
                className="background-picker-preview"
                aria-hidden="true"
                style={{ background: preset.background }}
              >
                <span style={{ color: preset.textColor }}>Aa</span>
              </span>
              <span className="background-picker-name">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
