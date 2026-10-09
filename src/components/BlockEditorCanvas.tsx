import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useActiveSermon } from "../store/activeSermon";
import type { SlideBlock } from "../domain/types";
import { slideFontStack } from "../presentation/slideFonts";
import { useToast } from "../store/toast";

/**
 * Freeform block editing overlay for the Deck Studio canvas (editor-only —
 * the stage never mounts this). Selection outlines sit in a transparent
 * layer above the rendered blocks, so every gesture is handled here and
 * the renderer underneath stays pure:
 *
 * - click selects, drag moves (6px threshold), SE handle resizes width
 * - double-click / Enter edits text in a mirrored overlay textarea
 * - arrows nudge (Shift ×4), Delete removes, Escape cancels/deselects
 * - text flowing off the slide gets a red outline and is reported up
 *   via onOverflow for the inspector note
 *
 * Geometry is measured from the rendered blocks (percent → px against
 * the slide frame), so outlines track auto-height text exactly.
 */

interface BlockGeom {
  l: number;
  t: number;
  w: number;
  h: number;
}

interface Gesture {
  pointerId: number;
  blockId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  frameLeft: number;
  frameTop: number;
  frameW: number;
  frameH: number;
  moved: boolean;
}

const MOVE_THRESHOLD_PX = 6;
const NUDGE_PCT = 0.5;
const NUDGE_BIG_PCT = 2;

export function BlockEditorCanvas({
  slideKey,
  blocks,
  selectedId,
  onSelect,
  snapshot,
  onOverflow,
}: {
  slideKey: string;
  blocks: SlideBlock[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Snapshot the deck for undo before a structural change. */
  snapshot: (label: string) => void;
  /** Currently slide-overflowing block ids (inspector note). */
  onOverflow: (ids: string[]) => void;
}) {
  const updateBlock = useActiveSermon((s) => s.updateBlock);
  const removeBlock = useActiveSermon((s) => s.removeBlock);
  const showToast = useToast((s) => s.showToast);

  const layerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [geom, setGeom] = useState<Record<string, BlockGeom>>({});
  const [frameW, setFrameW] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);

  const selected =
    selectedId !== null ? (blocks.find((b) => b.id === selectedId) ?? null) : null;

  // Measure rendered blocks against the slide frame.
  useEffect(() => {
    const layer = layerRef.current;
    const canvasEl = layer?.parentElement;
    const frame = canvasEl?.querySelector(".stage-slide-blocks");
    if (!layer || !canvasEl || !(frame instanceof HTMLElement)) return;
    const measure = () => {
      const canvasRect = canvasEl.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const next: Record<string, BlockGeom> = {};
      const overflowing: string[] = [];
      for (const block of blocks) {
        const el = frame.querySelector(
          `[data-blockid="${CSS.escape(block.id)}"]`,
        );
        if (!(el instanceof HTMLElement)) continue;
        const r = el.getBoundingClientRect();
        next[block.id] = {
          l: r.left - canvasRect.left,
          t: r.top - canvasRect.top,
          w: r.width,
          h: r.height,
        };
        // Bottom edge past the frame (padding-aware): flows off-slide.
        const padBottom = parseFloat(
          getComputedStyle(canvasEl).paddingBottom,
        );
        const contentBottom =
          canvasRect.bottom - (Number.isFinite(padBottom) ? padBottom : 0);
        if (r.bottom > contentBottom + 1 && block.type === "text") {
          overflowing.push(block.id);
        }
      }
      setGeom(next);
      setFrameW(frameRect.width);
      onOverflow(overflowing);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvasEl);
    return () => ro.disconnect();
    // Geometry follows blocks/slide only; callbacks are stable enough
    // (identity changes don't alter what's measured).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, slideKey]);

  // Safety net: a release outside the layer (no capture) still ends it.
  useEffect(() => {
    const onUp = () => {
      gestureRef.current = null;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const commitTextEdit = useCallback(
    (blockId: string, text: string) => {
      const clean = text.trim();
      if (clean.length === 0) {
        snapshot("Removed empty text box");
        removeBlock(slideKey, blockId);
        showToast("Removed empty text box");
      } else {
        updateBlock(slideKey, blockId, { text: clean });
      }
      setEditingId(null);
    },
    [slideKey, updateBlock, removeBlock, snapshot, showToast],
  );

  const startEdit = useCallback(
    (block: SlideBlock) => {
      if (block.type !== "text") return;
      cancelRef.current = false;
      setDraft(block.text);
      setEditingId(block.id);
    },
    [],
  );

  const onOutlinePointerDown = useCallback(
    (e: ReactPointerEvent, block: SlideBlock) => {
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (editingId !== null) return;
      e.stopPropagation();
      onSelect(block.id);
      const layer = layerRef.current;
      const frame = layer?.parentElement?.querySelector(
        ".stage-slide-blocks",
      );
      if (!(frame instanceof HTMLElement)) return;
      const frameRect = frame.getBoundingClientRect();
      gestureRef.current = {
        pointerId: e.pointerId,
        blockId: block.id,
        mode: "move",
        startX: e.clientX,
        startY: e.clientY,
        origX: block.x,
        origY: block.y,
        origW: block.w,
        frameLeft: frameRect.left,
        frameTop: frameRect.top,
        frameW: Math.max(1, frameRect.width),
        frameH: Math.max(1, frameRect.height),
        moved: false,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Best-effort: window pointerup still ends the gesture.
      }
      snapshot("Moved block");
      (e.currentTarget as HTMLElement).focus?.();
    },
    [editingId, onSelect, snapshot],
  );

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent, block: SlideBlock) => {
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const layer = layerRef.current;
      const frame = layer?.parentElement?.querySelector(
        ".stage-slide-blocks",
      );
      if (!(frame instanceof HTMLElement)) return;
      const frameRect = frame.getBoundingClientRect();
      gestureRef.current = {
        pointerId: e.pointerId,
        blockId: block.id,
        mode: "resize",
        startX: e.clientX,
        startY: e.clientY,
        origX: block.x,
        origY: block.y,
        origW: block.w,
        frameLeft: frameRect.left,
        frameTop: frameRect.top,
        frameW: Math.max(1, frameRect.width),
        frameH: Math.max(1, frameRect.height),
        moved: true,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Best-effort.
      }
      snapshot("Resized block");
    },
    [snapshot],
  );

  const onLayerPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gestureRef.current;
      if (g === null || !e.isPrimary || e.pointerId !== g.pointerId) return;
      const dist = Math.max(
        Math.abs(e.clientX - g.startX),
        Math.abs(e.clientY - g.startY),
      );
      if (!g.moved) {
        // Resize gestures start moved; moves start on threshold cross.
        if (dist < MOVE_THRESHOLD_PX) return;
        g.moved = true;
      }
      if (g.mode === "move") {
        const dxPct = ((e.clientX - g.startX) / g.frameW) * 100;
        const dyPct = ((e.clientY - g.startY) / g.frameH) * 100;
        updateBlock(slideKey, g.blockId, {
          x: Math.min(100, Math.max(0, g.origX + dxPct)),
          y: Math.min(100, Math.max(0, g.origY + dyPct)),
        });
      } else {
        const wPct = ((e.clientX - g.frameLeft) / g.frameW) * 100;
        updateBlock(slideKey, g.blockId, {
          w: Math.min(100, Math.max(5, wPct)),
        });
      }
    },
    [slideKey, updateBlock],
  );

  const onLayerPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      const g = gestureRef.current;
      if (g === null || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
    },
    [],
  );

  const onLayerKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      // The text-edit textarea stops its own keys; anything reaching
      // here targets the selected block.
      if (editingId !== null || selected === null) return;
      const step = e.shiftKey ? NUDGE_BIG_PCT : NUDGE_PCT;
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        e.stopPropagation();
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        snapshot("Moved block");
        updateBlock(slideKey, selected.id, {
          x: Math.min(100, Math.max(0, selected.x + dx)),
          y: Math.min(100, Math.max(0, selected.y + dy)),
        });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        snapshot("Removed block");
        removeBlock(slideKey, selected.id);
        onSelect(null);
        showToast("Removed block");
      } else if (e.key === "Enter" && selected.type === "text") {
        e.preventDefault();
        startEdit(selected);
      } else if (e.key === "Escape") {
        onSelect(null);
      }
    },
    [
      editingId,
      selected,
      slideKey,
      snapshot,
      updateBlock,
      removeBlock,
      onSelect,
      showToast,
      startEdit,
    ],
  );

  const editingBlock =
    editingId !== null
      ? (blocks.find((b) => b.id === editingId) ?? null)
      : null;
  const editingGeom =
    editingBlock !== null ? (geom[editingBlock.id] ?? null) : null;

  return (
    <div
      ref={layerRef}
      className="block-edit-layer"
      onPointerDown={(e) => {
        // Clicking empty canvas space deselects (block outlines stop
        // their own presses from reaching here).
        if (e.target === e.currentTarget) onSelect(null);
      }}
      onPointerMove={onLayerPointerMove}
      onPointerUp={onLayerPointerUp}
      onKeyDown={onLayerKeyDown}
    >
      {blocks.map((block, index) => {
        const g = geom[block.id];
        const isSelected = block.id === selected?.id;
        const isEditing = block.id === editingId;
        if (!g || isEditing) return null;
        const label =
          block.type === "text"
            ? block.text.slice(0, 40)
            : `Image: ${block.alt.slice(0, 40)}`;
        return (
          <div
            key={block.id}
            role="button"
            tabIndex={0}
            aria-label={`${block.type} block ${index + 1} of ${blocks.length}: ${label}. Enter to edit, Delete to remove, arrows to move.`}
            className={
              "block-outline" + (isSelected ? " block-outline-selected" : "")
            }
            style={{ left: g.l, top: g.t, width: g.w, height: g.h }}
            onPointerDown={(e) => onOutlinePointerDown(e, block)}
            onDoubleClick={() => startEdit(block)}
            onFocus={() => {
              if (selected?.id !== block.id) onSelect(block.id);
            }}
          >
            {isSelected && (
              <span
                className="block-resize-handle"
                aria-hidden="true"
                onPointerDown={(e) => onResizePointerDown(e, block)}
              />
            )}
          </div>
        );
      })}
      {editingBlock !== null &&
        editingBlock.type === "text" &&
        editingGeom !== null &&
        frameW > 0 && (
          <textarea
            autoFocus
            aria-label={`Edit text: ${editingBlock.text.slice(0, 60)}`}
            className="block-text-editor"
            style={{
              left: editingGeom.l,
              top: editingGeom.t,
              width: Math.max(editingGeom.w, 120),
              minHeight: Math.max(editingGeom.h, 40),
              fontFamily: slideFontStack(editingBlock.font),
              fontSize: `${(editingBlock.sizePct / 100) * frameW}px`,
              textAlign: editingBlock.align,
              color: editingBlock.color,
              fontWeight: editingBlock.bold ? 700 : 400,
              fontStyle: editingBlock.italic ? "italic" : "normal",
              textDecoration: editingBlock.underline ? "underline" : "none",
            }}
            value={draft}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (cancelRef.current) {
                cancelRef.current = false;
                setEditingId(null);
                return;
              }
              commitTextEdit(editingBlock.id, draft);
            }}
            onKeyDown={(e) => {
              // The layer must never see text-editing keys.
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRef.current = true;
                setEditingId(null);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitTextEdit(editingBlock.id, draft);
              }
            }}
          />
        )}
    </div>
  );
}
