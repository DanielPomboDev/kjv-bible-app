import type {
  CustomSlideItem,
  ImageSlideBlock,
  SlideBlock,
  SlideBlockAlign,
  TextSlideBlock,
} from "./types";

/**
 * Pure helpers for freeform slide blocks (see domain/types.ts).
 * Everything here is DOM-free and unit-tested: geometry lives in
 * percent-of-slide, ids are unique per slide, and normalization drops
 * malformed input so a bad write can never break rendering.
 */

const MIN_W = 5;
const MAX_W = 100;
const MIN_SIZE_PCT = 1;
const MAX_SIZE_PCT = 12;

function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function clampWidth(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return 80;
  return Math.min(MAX_W, Math.max(MIN_W, n));
}

function clampSizePct(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(MAX_SIZE_PCT, Math.max(MIN_SIZE_PCT, n));
}

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 && clean.length <= 120 ? clean : null;
}

function cleanFont(value: unknown): string {
  if (typeof value !== "string") return "serif";
  const clean = value.trim();
  return clean.length > 0 && clean.length <= 60 ? clean : "serif";
}

function cleanColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(clean) ? clean : undefined;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

/** Only safe image sources survive: no `javascript:` or exotic schemes. */
function cleanSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (clean.length === 0 || clean.length > 6_000_000) return null;
  if (
    clean.startsWith("data:image/") ||
    clean.startsWith("https://") ||
    clean.startsWith("http://") ||
    clean.startsWith("blob:") ||
    clean.startsWith("asset://")
  ) {
    return clean;
  }
  return null;
}

/** Fresh block id in its own namespace, unique across restarts. */
export function newBlockId(): string {
  return `block-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

/** Type guard for persisted values (id presence is checked on normalize). */
export function isSlideBlock(value: unknown): value is SlideBlock {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.trim().length === 0) return false;
  if (obj.type === "text") return typeof obj.text === "string";
  if (obj.type === "image") return typeof obj.src === "string";
  return false;
}

/**
 * Normalize one persisted value to a block, or null when malformed.
 * Out-of-range geometry is clamped, unknown enums fall back, blank text
 * and missing alt/src are rejected.
 */
export function normalizeSlideBlock(value: unknown): SlideBlock | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const id = cleanId(obj.id);
  if (id === null) return null;
  const x = clampPercent(obj.x, 10);
  const y = clampPercent(obj.y, 10);
  const w = clampWidth(obj.w);

  if (obj.type === "text") {
    const text = cleanText(obj.text);
    if (text === null) return null;
    const align =
      obj.align === "left" || obj.align === "right" ? obj.align : "center";
    const block: TextSlideBlock = {
      type: "text",
      id,
      x,
      y,
      w,
      align: align as SlideBlockAlign,
      font: cleanFont(obj.font),
      sizePct: clampSizePct(obj.sizePct),
      text,
    };
    const color = cleanColor(obj.color);
    if (color !== undefined) block.color = color;
    if (obj.bold === true) block.bold = true;
    if (obj.italic === true) block.italic = true;
    if (obj.underline === true) block.underline = true;
    return block;
  }

  if (obj.type === "image") {
    const src = cleanSrc(obj.src);
    const alt = cleanText(obj.alt);
    if (src === null || alt === null) return null;
    const block: ImageSlideBlock = {
      type: "image",
      id,
      x,
      y,
      w,
      src,
      alt,
    };
    if (obj.fit === "cover") block.fit = "cover";
    else block.fit = "contain";
    return block;
  }

  return null;
}

/** Normalize a persisted blocks list, dropping malformed entries. */
export function normalizeSlideBlocks(value: unknown): SlideBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: SlideBlock[] = [];
  for (const item of value) {
    const normalized = normalizeSlideBlock(item);
    if (normalized !== null) blocks.push(normalized);
  }
  return blocks;
}

/** How a custom slide renders: blocks win when the key exists (even an
 * explicit empty list — a blank freeform frame), else legacy. */
export function renderMode(item: Pick<CustomSlideItem, "blocks">): "blocks" | "legacy" {
  return item.blocks !== undefined ? "blocks" : "legacy";
}

/**
 * Convert legacy title/body into centered freeform boxes (the "Convert
 * to freeform" action). Legacy fields are kept by the caller as a
 * fallback — this only builds the blocks.
 */
export function customSlideToBlocks(
  title: string | undefined,
  body: string,
): TextSlideBlock[] {
  const blocks: TextSlideBlock[] = [];
  const cleanTitle = title?.trim() ?? "";
  const cleanBody = body.trim();
  if (cleanTitle.length > 0) {
    blocks.push({
      type: "text",
      id: newBlockId(),
      x: 10,
      y: 8,
      w: 80,
      align: "center",
      font: "serif",
      sizePct: 4.5,
      bold: true,
      text: cleanTitle,
    });
  }
  if (cleanBody.length > 0) {
    blocks.push({
      type: "text",
      id: newBlockId(),
      x: 10,
      y: cleanTitle.length > 0 ? 30 : 20,
      w: 80,
      align: "center",
      font: "serif",
      sizePct: 2.8,
      text: cleanBody,
    });
  }
  return blocks;
}

/**
 * Move the block at one 0-based index to another (later paints on top,
 * so moving later brings forward). Invalid moves return a copy with
 * identical contents.
 */
export function moveBlock<T>(blocks: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    from >= blocks.length ||
    to < 0 ||
    to >= blocks.length
  ) {
    return [...blocks];
  }
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Readable fallback text for a freeform slide (presenter thumbnails,
 * toasts): first text boxes joined, else empty.
 */
export function freeformPreviewText(blocks: readonly SlideBlock[]): string {
  return blocks
    .filter((b): b is TextSlideBlock => b.type === "text")
    .map((b) => b.text)
    .join(" / ");
}

