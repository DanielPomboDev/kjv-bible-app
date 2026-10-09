import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useDeck } from "../store/deck";
import { exportDeckPptx, exportToast } from "../export/pptx";
import { useNavigation } from "../store/navigation";
import { deckKey, type SermonDeckItem } from "../domain/types";
import { getBackgroundPreset } from "../presentation/backgroundPresets";
import { BackgroundPicker } from "../presentation/BackgroundPicker";
import { SlideView } from "./SlideView";
import { CustomSlideView } from "./CustomSlideView";
import { BlockSlideView } from "./BlockSlideView";
import { useToast } from "../store/toast";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  GripVerticalIcon,
} from "./icons";
import { insertionIndex } from "../domain/deckOrder";
import {
  STAGE_1080P_PX,
  previewScaleForWidth,
} from "../presentation/stageScale";
import { renderMode } from "../domain/blocks";

/** One-level undo for destructive deck ops (remove / clear / move). */
interface DeckUndo {
  deck: SermonDeckItem[];
  label: string;
  selectedKey: string | null;
}

/**
 * Deck Studio — the PowerPoint-like full-tab deck editor.
 *
 * Three panes: filmstrip (select + drag-reorder), canvas (live WYSIWYG
 * preview reusing SlideView/CustomSlideView + background preset), and
 * inspector (edit card / add custom card / notes / actions).
 *
 * Verse slides are scripture — text itself is read-only; notes,
 * duplicate, reorder, and remove still apply. Custom slides are fully
 * editable (title + body) inline.
 */
export function DeckStudio() {
  const deck = useDeck((s) => s.deck);
  const backgroundPresetId = useDeck((s) => s.backgroundPresetId);
  const removeFromDeck = useDeck((s) => s.removeFromDeck);
  const duplicateDeckItem = useDeck((s) => s.duplicateDeckItem);
  const moveInDeck = useDeck((s) => s.moveInDeck);
  const clearDeck = useDeck((s) => s.clearDeck);
  const setView = useNavigation((s) => s.setView);
  const showToast = useToast((s) => s.showToast);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    position: "before" | "after";
  } | null>(null);
  const [dropAtEnd, setDropAtEnd] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [undo, setUndo] = useState<DeckUndo | null>(null);
  const filmstripRef = useRef<HTMLOListElement>(null);
  const bgButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Keep selection valid: default to first slide, follow removals to a neighbour.
  useEffect(() => {
    if (deck.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey === null || !deck.some((e) => deckKey(e) === selectedKey)) {
      setSelectedKey(deckKey(deck[0]));
    }
  }, [deck, selectedKey]);

  const selectedIndex = useMemo(
    () => deck.findIndex((e) => deckKey(e) === selectedKey),
    [deck, selectedKey],
  );
  const selected = selectedIndex >= 0 ? deck[selectedIndex] : null;
  const selectedCustom =
    selected !== null && selected.type === "custom" ? selected : null;
  const isFreeform =
    selectedCustom !== null && renderMode(selectedCustom) === "blocks";

  const draggedItem =
    dragKey !== null && dragPos !== null
      ? (deck.find((e) => deckKey(e) === dragKey) ?? null)
      : null;

  // Keep the selected card visible in the filmstrip as selection follows
  // canvas navigation, drops, and undo.
  useEffect(() => {
    if (selectedKey === null) return;
    filmstripRef.current
      ?.querySelector(`[data-slide="${CSS.escape(selectedKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  // Letterboxed 16:9 stage frame: the audience stage is fullscreen
  // (usually 16:9), so the preview's wrapping and auto-fit only match it
  // when they share the aspect. Measured with ResizeObserver — never
  // magic numbers. SlideView's own observer refits text after each tick.
  // Callback-ref element (not a static ref): the frame remounts between
  // the draft placeholder and the live preview, and observation must
  // follow whichever is mounted.
  const [stageWrapEl, setStageWrapEl] = useState<HTMLDivElement | null>(
    null,
  );
  const [stageBox, setStageBox] = useState<{ w: number; h: number } | null>(
    null,
  );
  useEffect(() => {
    if (!stageWrapEl) return;
    const update = () => {
      const r = stageWrapEl.getBoundingClientRect();
      let w = Math.max(0, r.width);
      let h = (w * 9) / 16;
      if (h > r.height) {
        h = Math.max(0, r.height);
        w = (h * 16) / 9;
      }
      w = Math.floor(w);
      h = Math.floor(h);
      setStageBox((prev) =>
        prev !== null && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1
          ? prev
          : { w, h },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stageWrapEl);
    return () => ro.disconnect();
  }, [stageWrapEl]);

  // Snapshot the deck before every structural op; single-level undo.
  const stash = useCallback(
    (label: string) => {
      const state = useDeck.getState();
      setUndo({
        deck: [...state.deck],
        label,
        selectedKey,
      });
    },
    [selectedKey],
  );

  const restoreUndo = useCallback(() => {
    if (undo === null) return;
    useDeck.getState().restoreDeck(undo.deck);
    setSelectedKey(undo.selectedKey);
    showToast(`Undid: ${undo.label}`);
    setUndo(null);
  }, [undo, showToast]);

  // Ctrl/Cmd+Z undoes the last structural op — except inside text fields,
  // where native text undo wins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (e.shiftKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (undo === null) return;
      e.preventDefault();
      restoreUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, restoreUndo]);

  // Background popover: Esc or an outside click closes it and returns
  // focus to the Background button.
  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => {
      setPickerOpen(false);
      bgButtonRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        pickerRef.current &&
        target &&
        !pickerRef.current.contains(target) &&
        !target.closest("[data-deck-bg-toggle]")
      ) {
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pickerOpen]);

  const preset = getBackgroundPreset(
    selectedCustom?.backgroundPresetId ?? backgroundPresetId,
  );
  const canvasStyle = {
    background: preset.background,
    "--stage-text": preset.textColor,
    "--stage-dim": preset.referenceColor,
  } as CSSProperties;

  // Preview type scale: the frame is a fraction of a 1080p stage, so the
  // viewport-locked stage tokens are overridden per-subtree with scaled
  // 1080p equivalents (see presentation/stageScale.ts). Fixed type and
  // the auto-fit ceiling/floor then shrink with the frame. Unmeasured
  // (first frame) falls back to the raw tokens rather than zeroes.
  const previewVars =
    stageBox === null
      ? undefined
      : ({
          "--stage-text-size": `${STAGE_1080P_PX.text * previewScaleForWidth(stageBox.w)}px`,
          "--stage-text-min-size": `${STAGE_1080P_PX.floor * previewScaleForWidth(stageBox.w)}px`,
          "--stage-ref-size": `${STAGE_1080P_PX.ref * previewScaleForWidth(stageBox.w)}px`,
          "--stage-padding": `${STAGE_1080P_PX.padding * previewScaleForWidth(stageBox.w)}px`,
        }) as CSSProperties | undefined;

  const [exporting, setExporting] = useState(false);

  // One-way export to PowerPoint.
  const onExportPptx = useCallback(() => {
    const { deck: current, backgroundPresetId: bg } = useDeck.getState();
    if (current.length === 0) {
      showToast("Nothing to export — the deck is empty");
      return;
    }
    setExporting(true);
    void (async () => {
      try {
        const result = await exportDeckPptx({
          title: "Sermon Deck",
          deck: [...current],
          backgroundPresetId: bg,
        });
        showToast(exportToast(result, current.length));
      } catch (e) {
        showToast(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setExporting(false);
      }
    })();
  }, [showToast]);

  const selectAndFocus = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  // Reordering is drag-first; the up/down buttons are gone on purpose.
  // Keyboard parity lives in the filmstrip (arrows select, Ctrl+Arrow
  // moves) so every reorder stays reachable without a pointer.
  const doMove = useCallback(
    (from: number, to: number, label: string) => {
      if (from === to) return;
      if (from < 0 || from >= deck.length || to < 0 || to >= deck.length)
        return;
      stash(`Moved ${label}`);
      moveInDeck(from, to);
    },
    [deck.length, moveInDeck, stash],
  );

  const duplicateSelected = useCallback(() => {
    if (selectedIndex < 0) return;
    const source = deck[selectedIndex];
    const label =
      source.type === "verse" ? source.label : source.title || "Custom slide";
    stash(`Duplicated ${label}`);
    if (duplicateDeckItem(selectedIndex)) {
      // Select the copy (inserted right after the source).
      const next = useDeck.getState().deck[selectedIndex + 1];
      if (next) setSelectedKey(deckKey(next));
      showToast("Slide duplicated");
    } else {
      setUndo(null);
    }
  }, [selectedIndex, deck, duplicateDeckItem, showToast, stash]);

  const removeSelected = useCallback(() => {
    if (selected === null) return;
    const key = deckKey(selected);
    const label =
      selected.type === "verse"
        ? selected.label
        : selected.title || "Custom slide";
    // Choose neighbour before removal so focus never strands.
    const neighbour =
      deck[selectedIndex + 1] ?? deck[selectedIndex - 1] ?? null;
    stash(`Removed ${label}`);
    removeFromDeck(key);
    setSelectedKey(neighbour ? deckKey(neighbour) : null);
  }, [selected, selectedIndex, deck, removeFromDeck, stash]);

  const clearWithUndo = useCallback(() => {
    if (deck.length === 0) return;
    stash(`Cleared ${deck.length} slide${deck.length === 1 ? "" : "s"}`);
    clearDeck();
    setSelectedKey(null);
  }, [deck.length, clearDeck, stash]);

  // Filmstrip keyboard: arrows move selection, Ctrl+Arrow reorders (the
  // keyboard parity for drag-and-drop — no pointer required).
  const onFilmstripKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (selectedIndex < 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        if (e.ctrlKey || e.metaKey) {
          const label =
            deck[selectedIndex].type === "verse"
              ? deck[selectedIndex].label
              : deck[selectedIndex].title || "Custom slide";
          doMove(selectedIndex, selectedIndex + delta, label);
        } else {
          const next = deck[selectedIndex + delta];
          if (next) setSelectedKey(deckKey(next));
        }
      }
    },
    [selectedIndex, deck, doMove],
  );

  const clearDrag = useCallback(() => {
    setDragKey(null);
    setDropTarget(null);
    setDropAtEnd(false);
    setDragPos(null);
  }, []);

  // Pointer-drag reorder (mouse / touch / pen). Native HTML5 DnD proved
  // unreliable in some WebView2 hosts (dragover never accepted the drop),
  // so the gesture is tracked manually: press selects, moving 6px+ starts
  // the drag, release commits. The commit path (insertionIndex + doMove +
  // undo) is shared with keyboard reorder.
  const gestureRef = useRef<{
    pointerId: number;
    key: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const DRAG_THRESHOLD_PX = 6;

  const updatePointerTarget = useCallback(
    (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const slide =
        el instanceof Element ? el.closest("[data-slide]") : null;
      if (slide) {
        const targetKey = slide.getAttribute("data-slide");
        if (
          targetKey === null ||
          targetKey === gestureRef.current?.key
        ) {
          setDropTarget(null);
          setDropAtEnd(false);
          return;
        }
        const rect = (slide as HTMLElement).getBoundingClientRect();
        const position =
          clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDropAtEnd(false);
        setDropTarget((prev) =>
          prev !== null &&
          prev.key === targetKey &&
          prev.position === position
            ? prev
            : { key: targetKey, position },
        );
      } else if (
        el instanceof Node &&
        filmstripRef.current?.contains(el)
      ) {
        // Empty padding inside the list appends to the end.
        setDropTarget(null);
        setDropAtEnd(true);
      } else {
        setDropTarget(null);
        setDropAtEnd(false);
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current;
      if (g === null || !e.isPrimary || e.pointerId !== g.pointerId) return;
      const dist = Math.max(
        Math.abs(e.clientX - g.startX),
        Math.abs(e.clientY - g.startY),
      );
      if (!g.moved && dist < DRAG_THRESHOLD_PX) return;
      if (!g.moved) {
        g.moved = true;
        setDragKey(g.key);
      }
      setDragPos({ x: e.clientX, y: e.clientY });
      updatePointerTarget(e.clientX, e.clientY);
    },
    [updatePointerTarget],
  );

  const onCardPointerDown = useCallback(
    (e: React.PointerEvent, key: string) => {
      if (!e.isPrimary) return;
      // Touch/pen have no buttons; mouse needs the primary button.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      gestureRef.current = {
        pointerId: e.pointerId,
        key,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      // Keep the gesture tracked if the pointer slides off the card.
      // Capture is best-effort: window pointerup still resolves the drop.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers and edge cases: fall through.
      }
      setSelectedKey(key);
    },
    [],
  );

  const onDropOn = useCallback(
    (targetIndex: number, position: "before" | "after") => {
      if (dragKey === null) return;
      const from = deck.findIndex((e) => deckKey(e) === dragKey);
      if (from === -1 || from === targetIndex) {
        clearDrag();
        return;
      }
      const item = deck[from];
      const label =
        item.type === "verse" ? item.label : item.title || "Custom slide";
      doMove(from, insertionIndex(from, targetIndex, position), label);
      clearDrag();
    },
    [dragKey, deck, doMove, clearDrag],
  );

  const onDropAtEnd = useCallback(() => {
    if (dragKey === null) return;
    const from = deck.findIndex((e) => deckKey(e) === dragKey);
    if (from === -1) {
      clearDrag();
      return;
    }
    const item = deck[from];
    const label =
      item.type === "verse" ? item.label : item.title || "Custom slide";
    doMove(from, deck.length - 1, label);
    clearDrag();
  }, [dragKey, deck, doMove, clearDrag]);

  const commitPointerDrop = useCallback(() => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g === null || !g.moved) {
      clearDrag();
      return;
    }
    // State below is current: commit runs from a fresh render's handler.
    if (dropTarget !== null) {
      const ti = deck.findIndex((e) => deckKey(e) === dropTarget.key);
      if (ti !== -1) {
        onDropOn(ti, dropTarget.position);
        return;
      }
    }
    if (dropAtEnd) {
      onDropAtEnd();
      return;
    }
    clearDrag();
  }, [deck, dropTarget, dropAtEnd, onDropOn, onDropAtEnd, clearDrag]);

  // Fresh-commit mirror: window pointerup/Escape always resolve the
  // gesture, even when released outside the list (no capture, no bubble).
  const commitRef = useRef(commitPointerDrop);
  commitRef.current = commitPointerDrop;
  useEffect(() => {
    const onUp = () => commitRef.current();
    const onCancelGesture = () => {
      if (gestureRef.current !== null) {
        gestureRef.current = null;
        clearDrag();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gestureRef.current !== null) {
        e.stopPropagation();
        gestureRef.current = null;
        clearDrag();
      }
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancelGesture);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancelGesture);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [clearDrag]);

  return (
    <div
      className="deck-studio"
      role="tabpanel"
      id="view-panel-deck"
      aria-labelledby="view-tab-deck"
      aria-label="Deck studio"
    >
      <header className="deck-studio-top">
        <div className="deck-studio-title-wrap">
          <h2 className="deck-studio-title">Sermon Deck</h2>
          <span className="deck-studio-count" aria-live="polite">
            {deck.length === 0
              ? "Empty deck"
              : `${deck.length} slide${deck.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="deck-studio-top-actions">
          <button
            type="button"
            ref={bgButtonRef}
            data-deck-bg-toggle
            className="sermon-deck-secondary"
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            onClick={() => setPickerOpen((o) => !o)}
          >
            Background
          </button>
          {deck.length > 0 && (
            <>
              <button
                type="button"
                className="sermon-deck-present"
                disabled={exporting}
                title="Download the deck as .pptx — continue editing in PowerPoint (one-way)"
                onClick={onExportPptx}
              >
                {exporting ? "Exporting…" : "Export .pptx"}
              </button>
              <button
                type="button"
                className="sermon-deck-clear"
                onClick={clearWithUndo}
              >
                Clear
              </button>
            </>
          )}
        </div>
        {pickerOpen && (
          <div ref={pickerRef} className="deck-studio-picker-pop">
            <BackgroundPicker
              onClose={() => {
                setPickerOpen(false);
                bgButtonRef.current?.focus();
              }}
            />
          </div>
        )}
      </header>
      {undo !== null && (
        <div className="deck-studio-undo" role="status">
          <span className="deck-studio-undo-label">{undo.label}</span>
          <button
            type="button"
            className="deck-studio-undo-btn"
            onClick={restoreUndo}
          >
            Undo
          </button>
        </div>
      )}

      {/* Empty deck: queue verses from the reading pane. */}
      {deck.length === 0 ? (
        <div className="deck-studio-empty">
          <p>
            No slides yet. Go to{" "}
            <button
              type="button"
              className="deck-studio-link"
              onClick={() => setView("read")}
            >
              Read
            </button>{" "}
            and right-click a verse → “Add to Sermon Deck”.
          </p>
        </div>
      ) : (
        <div className="deck-studio-body">
          <aside className="deck-studio-filmstrip" aria-label="Slides">
            <ol
              ref={filmstripRef}
              className="deck-studio-list"
              role="listbox"
              aria-label="Slides. Arrow keys select, Control plus arrow keys reorder, or drag to reorder."
              aria-orientation="vertical"
              onKeyDown={onFilmstripKeyDown}
              onPointerMove={onPointerMove}
            >
              {deck.map((item, index) => {
                const key = deckKey(item);
                const ref =
                  item.type === "verse"
                    ? item.label
                    : item.title || "Custom slide";
                const preview =
                  item.type === "verse" ? item.text : item.body;
                const isSelected = key === selectedKey;
                const isDragging = key === dragKey;
                const drop =
                  dropTarget !== null && dropTarget.key === key && !isDragging
                    ? dropTarget.position
                    : null;
                return (
                  <li
                    key={key}
                    className={
                      "deck-studio-thumb-wrap" +
                      (drop === "before" ? " deck-studio-drop-before" : "") +
                      (drop === "after" ? " deck-studio-drop-after" : "")
                    }
                  >
                    <button
                      type="button"
                      role="option"
                      data-slide={key}
                      aria-selected={isSelected}
                      aria-posinset={index + 1}
                      aria-setsize={deck.length}
                      aria-label={`Slide ${index + 1} of ${deck.length}: ${ref}. Drag to reorder, or Control plus arrow keys to move.`}
                      className={
                        "deck-studio-thumb" +
                        (isSelected ? " deck-studio-thumb-selected" : "") +
                        (isDragging ? " deck-studio-thumb-dragging" : "")
                      }
                      draggable={false}
                      onClick={() => selectAndFocus(key)}
                      onPointerDown={(e) => onCardPointerDown(e, key)}
                      onPointerMove={onPointerMove}
                    >
                      <span
                        className="deck-studio-grip"
                        aria-hidden="true"
                        title="Drag to reorder"
                      >
                        <GripVerticalIcon />
                      </span>
                      <span className="deck-studio-thumb-num" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="deck-studio-thumb-ref">
                        {ref}
                        {item.type === "custom" && (
                          <span className="sermon-deck-kind" aria-hidden="true">
                            Custom
                          </span>
                        )}
                      </span>
                      <span className="deck-studio-thumb-preview">
                        {preview}
                      </span>
                      {(item.notes?.length ?? 0) > 0 && (
                        <span
                          className="sermon-deck-notes-dot"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            {dropAtEnd && (
              <div
                className="deck-studio-drop-end"
                aria-hidden="true"
              />
            )}
            <p className="deck-studio-hint">
              Drag to reorder. Arrow keys select, Ctrl+Arrow moves, Ctrl+Z
              undoes.
            </p>
          </aside>

          <section
            className="deck-studio-canvas-wrap"
            aria-label="Slide preview"
          >
            <div className="deck-studio-canvas-nav">
              <button
                type="button"
                className="sermon-deck-btn"
                aria-label="Previous slide"
                disabled={selectedIndex <= 0}
                onClick={() => {
                  const prev = deck[selectedIndex - 1];
                  if (prev) setSelectedKey(deckKey(prev));
                }}
              >
                <ChevronLeftIcon />
              </button>
              <span aria-live="polite" className="deck-studio-pos">
                {`${selectedIndex + 1} / ${deck.length}`}
              </span>
              <button
                type="button"
                className="sermon-deck-btn"
                aria-label="Next slide"
                disabled={selectedIndex >= deck.length - 1}
                onClick={() => {
                  const next = deck[selectedIndex + 1];
                  if (next) setSelectedKey(deckKey(next));
                }}
              >
                <ChevronRightIcon />
              </button>
            </div>
            {selected?.type === "custom" || selected?.type === "verse" ? (
              <div className="deck-studio-stage-fit" ref={setStageWrapEl}>
                <div
                  className="deck-studio-canvas"
                  style={{
                    ...canvasStyle,
                    ...previewVars,
                    ...(stageBox
                      ? { width: stageBox.w, height: stageBox.h }
                      : undefined),
                  }}
                >
                  {selectedCustom !== null && isFreeform ? (
                    <BlockSlideView
                      slide={{
                        id: selectedCustom.id,
                        blocks: selectedCustom.blocks ?? [],
                      }}
                    />
                  ) : selected?.type === "custom" ? (
                    <CustomSlideView slide={selected} />
                  ) : (
                    <SlideView
                      slide={selected?.type === "verse" ? selected : null}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="deck-studio-stage-fit" ref={setStageWrapEl}>
                <div className="deck-studio-canvas deck-studio-canvas-draft">
                  <p>Select a slide to preview it.</p>
                </div>
              </div>
            )}
          </section>

          <aside className="deck-studio-inspector" aria-label="Slide details">
            {selected === null ? (
              <p>Select a slide.</p>
            ) : (
              <ReadOnlyCard
                key={deckKey(selected)}
                item={selected}
                onDuplicate={duplicateSelected}
                onRemove={removeSelected}
              />
            )}
          </aside>
        </div>
      )}
      {/* Floating drag preview: follows the cursor so a drag reads as a
          drag (PowerPoint feel). Pointer-events-none so hit-testing — and
          therefore drop targeting — passes straight through it. */}
      {draggedItem !== null && dragPos !== null && (
        <div
          className="deck-studio-drag-ghost"
          aria-hidden="true"
          style={{ left: dragPos.x + 14, top: dragPos.y + 14 }}
        >
          <span className="deck-studio-thumb-ref">
            {draggedItem.type === "verse"
              ? draggedItem.label
              : draggedItem.title || "Custom slide"}
          </span>
          <span className="deck-studio-thumb-preview">
            {draggedItem.type === "verse"
              ? draggedItem.text
              : draggedItem.body}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only slide summary: slides are assembled here and designed in
 * PowerPoint after export — nothing here edits slide content.
 */
function ReadOnlyCard({
  item,
  onDuplicate,
  onRemove,
}: {
  item: SermonDeckItem;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const label =
    item.type === "verse" ? item.label : item.title || "Custom slide";
  const text = item.type === "verse" ? item.text : item.body;

  return (
    <div className="deck-studio-form">
      <h3 className="deck-studio-form-title">{label}</h3>
      <p className="deck-studio-verse-text">{text}</p>
      {item.type === "custom" && (item.blocks ?? []).length > 0 && (
        <p className="custom-slide-hint">
          Freeform slide ({item.blocks?.length} block
          {item.blocks?.length === 1 ? "" : "s"}) — edit it in PowerPoint
          after export.
        </p>
      )}
      {item.type === "verse" && (
        <p className="custom-slide-hint">
          Scripture is read-only. Duplicate to show it twice.
        </p>
      )}

      <div
        className="deck-studio-row-actions"
        role="group"
        aria-label="Slide actions"
      >
        <button
          type="button"
          className="sermon-deck-btn"
          aria-label={`Duplicate ${label}`}
          onClick={onDuplicate}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="sermon-deck-btn sermon-deck-btn-remove"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
