import { useState } from "react";
import { useActiveSermon } from "../store/activeSermon";
import type { CustomSlideItem } from "../domain/types";
import { newBlockId } from "../domain/blocks";
import { SLIDE_FONTS } from "../presentation/slideFonts";
import { SLIDE_TEMPLATES } from "../presentation/slideTemplates";
import { BACKGROUND_PRESETS } from "../presentation/backgroundPresets";
import { useToast } from "../store/toast";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, CopyIcon } from "./icons";

/**
 * Freeform slide inspector for the Deck Studio: block tools when a
 * block is selected, slide tools (add/templates/background) always,
 * presenter notes at the bottom. Every mutation snapshots first so the
 * studio's single-level undo covers block edits too. Range/color inputs
 * snapshot per tick (coarse but never wrong); discrete controls snapshot
 * per action.
 */

const TEXT_SWATCHES = ["#FFFFFF", "#F4E9DA", "#FFD98A", "#D9A25C", "#2A2118"];

export function FreeformInspector({
  slideKey,
  item,
  selectedBlockId,
  onSelectBlock,
  overflowIds,
  onAddText,
  onPickImage,
  snapshot,
}: {
  slideKey: string;
  item: CustomSlideItem;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  overflowIds: string[];
  onAddText: () => void;
  onPickImage: () => void;
  snapshot: (label: string) => void;
}) {
  const updateBlock = useActiveSermon((s) => s.updateBlock);
  const removeBlock = useActiveSermon((s) => s.removeBlock);
  const moveBlockInSlide = useActiveSermon((s) => s.moveBlockInSlide);
  const setBlocks = useActiveSermon((s) => s.setBlocks);
  const addBlock = useActiveSermon((s) => s.addBlock);
  const setSlideNotes = useActiveSermon((s) => s.setSlideNotes);
  const setSlideBackground = useActiveSermon((s) => s.setSlideBackground);
  const showToast = useToast((s) => s.showToast);
  const [notes, setNotes] = useState(item.notes ?? "");

  const blocks = item.blocks ?? [];
  const selected =
    selectedBlockId !== null
      ? (blocks.find((b) => b.id === selectedBlockId) ?? null)
      : null;
  const selectedIndex =
    selected !== null ? blocks.findIndex((b) => b.id === selected.id) : -1;

  const mutate = (
    blockId: string,
    patch: Record<string, unknown>,
    label: string,
  ) => {
    snapshot(label);
    if (!updateBlock(slideKey, blockId, patch)) {
      showToast("Couldn't apply that change");
    }
  };

  const deleteSelected = () => {
    if (selected === null) return;
    snapshot("Removed block");
    removeBlock(slideKey, selected.id);
    onSelectBlock(null);
    showToast("Removed block");
  };

  const duplicateSelected = () => {
    if (selected === null) return;
    const copy = {
      ...selected,
      id: newBlockId(),
      x: Math.min(95, selected.x + 3),
      y: Math.min(95, selected.y + 3),
    };
    snapshot("Duplicated block");
    if (addBlock(slideKey, copy)) {
      onSelectBlock(copy.id);
      showToast("Duplicated block");
    }
  };

  const saveNotes = () => {
    setSlideNotes(slideKey, notes.trim());
    showToast(notes.trim().length === 0 ? "Notes cleared" : "Notes saved");
  };

  return (
    <div className="deck-studio-form">
      <h3 className="deck-studio-form-title">Freeform slide</h3>

      {selected !== null && (
        <section aria-label={`${selected.type} block tools`}>
          <p className="custom-slide-hint">
            {selected.type === "text" ? "Text box" : "Image"} selected —{" "}
            <button
              type="button"
              className="deck-studio-link"
              onClick={() => onSelectBlock(null)}
            >
              select slide
            </button>
          </p>

          {selected.type === "text" && (
            <>
              <label className="custom-slide-label" htmlFor="block-font">
                Font
              </label>
              <select
                id="block-font"
                className="custom-slide-input"
                value={selected.font}
                onChange={(e) =>
                  mutate(selected.id, { font: e.target.value }, "Changed font")
                }
              >
                {SLIDE_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>

              <label className="custom-slide-label" htmlFor="block-size">
                Size — {selected.sizePct.toFixed(1)}% of slide width
              </label>
              <input
                id="block-size"
                type="range"
                className="block-range"
                min={1}
                max={12}
                step={0.5}
                value={selected.sizePct}
                aria-valuetext={`${selected.sizePct.toFixed(1)} percent of slide width`}
                onChange={(e) =>
                  mutate(
                    selected.id,
                    { sizePct: Number(e.target.value) },
                    "Changed text size",
                  )
                }
              />

              <span className="custom-slide-label" id="block-color-label">
                Color
              </span>
              <div
                className="block-swatches"
                role="group"
                aria-labelledby="block-color-label"
              >
                <button
                  type="button"
                  className={
                    selected.color === undefined
                      ? "block-swatch block-swatch-selected"
                      : "block-swatch"
                  }
                  aria-pressed={selected.color === undefined}
                  title="Auto (background preset color)"
                  onClick={() =>
                    mutate(selected.id, { color: undefined }, "Changed color")
                  }
                >
                  A
                </button>
                {TEXT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={
                      selected.color === swatch
                        ? "block-swatch block-swatch-selected"
                        : "block-swatch"
                    }
                    aria-pressed={selected.color === swatch}
                    aria-label={`Text color ${swatch}`}
                    title={swatch}
                    style={{ background: swatch }}
                    onClick={() =>
                      mutate(selected.id, { color: swatch }, "Changed color")
                    }
                  />
                ))}
                <input
                  type="color"
                  className="block-color-native"
                  aria-label="Custom text color"
                  value={selected.color ?? "#ffffff"}
                  onChange={(e) =>
                    mutate(
                      selected.id,
                      { color: e.target.value },
                      "Changed color",
                    )
                  }
                />
              </div>

              <div className="block-toggles" role="group" aria-label="Text style">
                {(
                  [
                    ["bold", "B", "Bold"],
                    ["italic", "I", "Italic"],
                    ["underline", "U", "Underline"],
                  ] as const
                ).map(([styleKey, glyph, name]) => (
                  <button
                    key={styleKey}
                    type="button"
                    className={
                      selected[styleKey] === true
                        ? "block-toggle block-toggle-on"
                        : "block-toggle"
                    }
                    aria-pressed={selected[styleKey] === true}
                    aria-label={name}
                    title={name}
                    onClick={() =>
                      mutate(
                        selected.id,
                        { [styleKey]: !(selected[styleKey] === true) },
                        `Toggled ${name.toLowerCase()}`,
                      )
                    }
                  >
                    <span
                      style={{
                        fontWeight: styleKey === "bold" ? 700 : 400,
                        fontStyle: styleKey === "italic" ? "italic" : "normal",
                        textDecoration:
                          styleKey === "underline" ? "underline" : "none",
                      }}
                    >
                      {glyph}
                    </span>
                  </button>
                ))}
                {(
                  [
                    ["left", "Left"],
                    ["center", "Center"],
                    ["right", "Right"],
                  ] as const
                ).map(([value, name]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      selected.align === value
                        ? "block-toggle block-toggle-on"
                        : "block-toggle"
                    }
                    aria-pressed={selected.align === value}
                    aria-label={`Align ${name.toLowerCase()}`}
                    title={`Align ${name.toLowerCase()}`}
                    onClick={() =>
                      mutate(selected.id, { align: value }, "Changed alignment")
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>

              {overflowIds.includes(selected.id) && (
                <p className="custom-slide-hint" role="status">
                  Text flows off the slide — shrink it or grow the box.
                </p>
              )}
            </>
          )}

          {selected.type === "image" && (
            <>
              <label className="custom-slide-label" htmlFor="block-alt">
                Alt text (required)
              </label>
              <input
                id="block-alt"
                type="text"
                className="custom-slide-input"
                defaultValue={selected.alt}
                placeholder="Describe the image"
                onBlur={(e) => {
                  const clean = e.target.value.trim();
                  if (clean.length === 0) {
                    showToast("Alt text is required");
                    e.target.value = selected.alt;
                    return;
                  }
                  if (clean !== selected.alt) {
                    mutate(selected.id, { alt: clean }, "Changed alt text");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <label className="custom-slide-label" htmlFor="block-fit">
                Fit
              </label>
              <select
                id="block-fit"
                className="custom-slide-input"
                value={selected.fit ?? "contain"}
                onChange={(e) =>
                  mutate(selected.id, { fit: e.target.value }, "Changed image fit")
                }
              >
                <option value="contain">Fit whole image</option>
                <option value="cover">Fill box (crop)</option>
              </select>
            </>
          )}

          <div
            className="deck-studio-row-actions"
            role="group"
            aria-label="Block actions"
          >
            <button
              type="button"
              className="sermon-deck-btn"
              aria-label="Send block backward"
              disabled={selectedIndex <= 0}
              onClick={() => {
                snapshot("Reordered blocks");
                moveBlockInSlide(slideKey, selectedIndex, selectedIndex - 1);
              }}
            >
              <ArrowDownIcon />
            </button>
            <button
              type="button"
              className="sermon-deck-btn"
              aria-label="Bring block forward"
              disabled={selectedIndex < 0 || selectedIndex >= blocks.length - 1}
              onClick={() => {
                snapshot("Reordered blocks");
                moveBlockInSlide(slideKey, selectedIndex, selectedIndex + 1);
              }}
            >
              <ArrowUpIcon />
            </button>
            <button
              type="button"
              className="sermon-deck-btn"
              aria-label="Duplicate block"
              onClick={duplicateSelected}
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              className="sermon-deck-btn sermon-deck-btn-remove"
              aria-label="Delete block"
              onClick={deleteSelected}
            >
              <CloseIcon />
            </button>
          </div>
        </section>
      )}

      <section aria-label="Slide tools">
        <span className="custom-slide-label">Add to slide</span>
        <div className="custom-slide-actions">
          <button
            type="button"
            className="sermon-deck-secondary"
            onClick={onAddText}
          >
            + Text
          </button>
          <button
            type="button"
            className="sermon-deck-secondary"
            onClick={onPickImage}
          >
            + Image
          </button>
        </div>

        <label className="custom-slide-label" htmlFor="block-template">
          Layout
        </label>
        <select
          id="block-template"
          className="custom-slide-input"
          defaultValue=""
          aria-label="Apply a layout template (replaces blocks, undoable)"
          onChange={(e) => {
            if (e.target.value !== "") {
              const templateId = e.target.value;
              const templateName =
                SLIDE_TEMPLATES.find((t) => t.id === templateId)?.name ??
                "layout";
              snapshot(`Applied ${templateName} layout`);
              setBlocks(slideKey, 
                (SLIDE_TEMPLATES.find((t) => t.id === templateId)?.make() ?? []),
              );
              onSelectBlock(null);
              showToast(`Applied ${templateName}`);
              e.target.value = "";
            }
          }}
        >
          <option value="" disabled>
            Apply layout…
          </option>
          {SLIDE_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>

        <label className="custom-slide-label" htmlFor="block-slide-bg">
          Background
        </label>
        <select
          id="block-slide-bg"
          className="custom-slide-input"
          value={item.backgroundPresetId ?? ""}
          onChange={(e) => {
            snapshot("Changed slide background");
            setSlideBackground(
              slideKey,
              e.target.value === "" ? undefined : e.target.value,
            );
          }}
        >
          <option value="">Sermon default</option>
          {BACKGROUND_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <p className="custom-slide-hint">
          Double-click text to edit · drag to move · arrow keys nudge · Del
          removes · Ctrl+Z undoes.
        </p>
      </section>

      <label className="custom-slide-label" htmlFor="freeform-notes">
        Presenter notes (private)
      </label>
      <textarea
        id="freeform-notes"
        className="custom-slide-input custom-slide-body"
        rows={4}
        placeholder="What to remember when this slide is up?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          setSlideNotes(slideKey, notes.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveNotes();
          }
        }}
      />
      <div className="custom-slide-actions">
        <button
          type="button"
          className="sermon-deck-secondary"
          onClick={saveNotes}
        >
          Save Notes
        </button>
      </div>
    </div>
  );
}
