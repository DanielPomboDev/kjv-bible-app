import type { Sermon, SermonDeckItem } from "../domain/types";
import { getBackgroundPreset } from "../presentation/backgroundPresets";
import { renderPresetBackground } from "./backgrounds";

/**
 * Deck → PowerPoint export (one-way: the app assembles content,
 * PowerPoint owns design from here — edits there never come back).
 *
 * Pure mapping (`planDeck`) plus a thin renderer (`generateDeckPptx`)
 * over pptxgenjs (MIT, offline-safe, lazily imported so startup stays
 * fast). Zero backend changes: export only reads the open sermon.
 * Canonical 16:9 LAYOUT_WIDE matches the studio letterbox.
 */

export const PPTX_W_IN = 13.33;
export const PPTX_H_IN = 7.5;
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Slide background fills per preset. Patterned CSS presets have no
 * OOXML equivalent, so they map to a representative solid (documented
 * here, not guessed per export): the user restyles in PowerPoint. */
const PRESET_PPTX_BG: Record<string, string> = {
  "classic-black": "000000",
  "deep-navy": "14264A",
  "royal-amethyst": "3B1D6E",
  "stained-glass": "2A1545",
  "wood-pulpit": "4A2E17",
  "aged-parchment": "F3E9D2",
  "night-sky": "0B1A3A",
  "sunset-veil": "5B2350",
  "forest-glade": "123524",
  "galilee-waters": "0B4F5C",
};

/** Background fill for a preset id (Classic Black for unknown ids). */
export function pptxBackgroundFor(presetId: string): string {
  return PRESET_PPTX_BG[presetId] ?? "000000";
}

/** Block font id → PowerPoint face (max Office compatibility). */
const PPTX_FACES: Record<string, string> = {
  serif: "Georgia",
  sans: "Calibri",
  mono: "Consolas",
};

export function pptxFontFace(fontId: string): string {
  return PPTX_FACES[fontId] ?? "Georgia";
}

/** Percent-of-slide → inches on the 16:9 layout. */
export const pctToInX = (pct: number): number => (pct / 100) * PPTX_W_IN;
export const pctToInY = (pct: number): number => (pct / 100) * PPTX_H_IN;

/** Freeform size (% of slide width) → points. */
export const sizePctToPt = (sizePct: number): number =>
  (sizePct / 100) * PPTX_W_IN * 72;

const VERSE_REF_PT = 18;
const VERSE_BODY_PT = 32;
const TITLE_PT = 40;
const BODY_PT = 28;

export interface PptxRun {
  text: string;
  fontSize: number;
  fontFace: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface PptxTextBox {
  x: number;
  y: number;
  w: number;
  h?: number;
  align: "left" | "center" | "right";
  runs: PptxRun[];
  /** Shrink-to-fit (long verses, legacy bodies) vs user-sized boxes. */
  shrink?: boolean;
}

export interface PptxImageBox {
  x: number;
  y: number;
  w: number;
  src: string;
  alt: string;
}

export interface PptxSlidePlan {
  /** Resolved preset id (drives rendered-image backgrounds). */
  bgPresetId: string;
  /** Solid fallback fill (exact for solids; fallback without DOM). */
  background: string;
  texts: PptxTextBox[];
  images: PptxImageBox[];
  notes?: string;
}

function hex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

/** Resolved fill for one slide: rendered artwork when available,
 * otherwise the solid fallback. Pure except the painter (DOM); without
 * a document every preset resolves solid. */
export function resolveSlideBackground(
  presetId: string,
  fallbackColor: string,
): { color: string } | { data: string } {
  const image = renderPresetBackground(presetId);
  return image !== null ? { data: image } : { color: fallbackColor };
}

/** Resolved colors + fill for one slide (per-slide override supported). */
function slideLook(item: SermonDeckItem, sermonBg: string): {
  presetId: string;
  fill: string;
  textColor: string;
  refColor: string;
} {
  const override =
    item.type === "custom" ? item.backgroundPresetId : undefined;
  const preset = getBackgroundPreset(override ?? sermonBg);
  return {
    presetId: preset.id,
    fill: pptxBackgroundFor(preset.id),
    textColor: hex(preset.textColor),
    refColor: hex(preset.referenceColor),
  };
}

/** Pure mapping: one deck item → one slide plan (no library calls). */
export function planSlide(
  item: SermonDeckItem,
  sermonBg: string,
): PptxSlidePlan {
  const look = slideLook(item, sermonBg);
  const notes = item.notes;
  const plan: PptxSlidePlan = {
    bgPresetId: look.presetId,
    background: look.fill,
    texts: [],
    images: [],
    ...(notes !== undefined ? { notes } : {}),
  };

  if (item.type === "verse") {
    plan.texts.push({
      x: 0.5,
      y: 0.3,
      w: PPTX_W_IN - 1,
      h: 0.7,
      align: "center",
      runs: [
        {
          text: item.label,
          fontSize: VERSE_REF_PT,
          fontFace: "Georgia",
          color: look.refColor,
          bold: true,
        },
      ],
    });
    plan.texts.push({
      x: 0.5,
      y: 1.3,
      w: PPTX_W_IN - 1,
      h: 5.4,
      align: "center",
      runs: [
        {
          text: item.text,
          fontSize: VERSE_BODY_PT,
          fontFace: "Georgia",
          color: look.textColor,
        },
      ],
      shrink: true,
    });
    return plan;
  }

  if (item.blocks !== undefined && item.blocks.length > 0) {
    for (const block of item.blocks) {
      if (block.type === "text") {
        plan.texts.push({
          x: pctToInX(block.x),
          y: pctToInY(block.y),
          w: pctToInX(block.w),
          align: block.align,
          runs: [
            {
              text: block.text,
              fontSize: sizePctToPt(block.sizePct),
              fontFace: pptxFontFace(block.font),
              color: block.color !== undefined ? hex(block.color) : look.textColor,
              ...(block.bold === true ? { bold: true } : {}),
              ...(block.italic === true ? { italic: true } : {}),
              ...(block.underline === true ? { underline: true } : {}),
            },
          ],
        });
      } else {
        plan.images.push({
          x: pctToInX(block.x),
          y: pctToInY(block.y),
          w: pctToInX(block.w),
          src: block.src,
          alt: block.alt,
        });
      }
    }
    return plan;
  }

  let bodyY = 1;
  if (item.title !== undefined && item.title.trim().length > 0) {
    plan.texts.push({
      x: 0.5,
      y: 0.5,
      w: PPTX_W_IN - 1,
      h: 1.2,
      align: "center",
      runs: [
        {
          text: item.title,
          fontSize: TITLE_PT,
          fontFace: "Georgia",
          color: look.textColor,
          bold: true,
        },
      ],
    });
    bodyY = 2;
  }
  plan.texts.push({
    x: 0.5,
    y: bodyY,
    w: PPTX_W_IN - 1,
    h: 6.5 - bodyY,
    align: "center",
    runs: [
      {
        text: item.body,
        fontSize: BODY_PT,
        fontFace: "Georgia",
        color: look.textColor,
      },
    ],
    shrink: true,
  });
  return plan;
}

/** Pure mapping: whole sermon → slide plans in deck order. */
export function planDeck(sermon: Sermon): PptxSlidePlan[] {
  return sermon.deck.map((item) => planSlide(item, sermon.backgroundPresetId));
}

/** `My Sermon Title` → `my-sermon-title.pptx`. */
export function pptxFileName(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sermon";
  return `${slug}.pptx`;
}

/**
 * Render the sermon and trigger a browser download (v1 delivery: no
 * Tauri plugins — the WebView saves to the download folder). Throws on
 * an empty deck or generation failure for the caller to toast.
 */
export async function downloadDeckPptx(sermon: Sermon): Promise<void> {
  const blob = await generateDeckPptx(sermon);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = pptxFileName(sermon.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/** Blob → base64 without blowing the call stack on multi-MB files. */
function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

export interface ExportResult {
  /** What the user should open or look for. */
  fileName: string;
  /** Full path when saved through Tauri; bare name on fallback. */
  path: string;
  /** True when the OS opened it (PowerPoint) already. */
  opened: boolean;
}

/** True inside the Tauri WebView (backend commands + opener exist). */
function isTauriApp(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

/**
 * Export pipeline: render → save to Downloads via the backend → open
 * with the default app (PowerPoint). Outside Tauri (plain browser dev)
 * it falls back to an anchor download that the user opens by hand.
 * Backend/open failures throw with the reason so toasts stay honest.
 */
export async function exportDeckPptx(sermon: Sermon): Promise<ExportResult> {
  const blob = await generateDeckPptx(sermon);
  const fileName = pptxFileName(sermon.title);
  if (!isTauriApp()) {
    await downloadDeckPptx(sermon);
    return { fileName, path: fileName, opened: false };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const base64Data = await blobToBase64(blob);
  const path = (await invoke<string>("save_export", {
    fileName,
    base64Data,
  })) as string;
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(path);
  } catch (e) {
    // Saved but the OS wouldn't open it (no handler? denied?) — say
    // so, with the path, instead of failing silently.
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`saved to ${path}, but auto-open failed: ${reason}`);
  }
  return { fileName, path, opened: true };
}

/**
 * Render a sermon to a .pptx Blob. Lazy-imports pptxgenjs (startup
 * stays fast) and throws on an empty deck for the caller to toast.
 */
export async function generateDeckPptx(sermon: Sermon): Promise<Blob> {
  if (sermon.deck.length === 0) {
    throw new Error("Cannot export an empty deck.");
  }
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const plans = planDeck(sermon);
  // Rendered backgrounds are deterministic per preset: resolve once each.
  const bgArt = new Map<string, { color: string } | { data: string }>();
  for (const slide of plans) {
    if (!bgArt.has(slide.bgPresetId)) {
      bgArt.set(
        slide.bgPresetId,
        resolveSlideBackground(slide.bgPresetId, slide.background),
      );
    }
  }
  for (const slide of plans) {
    const pptSlide = pptx.addSlide();
    // Rendered artwork goes on as a full-bleed image shape behind the
    // content (slide `background.data` is documented but silently
    // dropped by this pptxgenjs version — verified by byte comparison).
    // The solid fallback stays underneath for the shape edges.
    const bg = bgArt.get(slide.bgPresetId) ?? { color: slide.background };
    if ("data" in bg) {
      pptSlide.background = { color: slide.background };
      pptSlide.addImage({
        data: bg.data,
        x: 0,
        y: 0,
        w: PPTX_W_IN,
        h: PPTX_H_IN,
      });
    } else {
      pptSlide.background = { color: bg.color };
    }
    for (const box of slide.texts) {
      pptSlide.addText(
        box.runs.map((run) => ({
          text: run.text,
          options: {
            fontSize: run.fontSize,
            fontFace: run.fontFace,
            color: run.color,
            ...(run.bold === true ? { bold: true } : {}),
            ...(run.italic === true ? { italic: true } : {}),
            ...(run.underline === true
              ? { underline: { style: "sng" as const } }
              : {}),
          },
        })),
        {
          x: box.x,
          y: box.y,
          w: box.w,
          ...(box.h !== undefined ? { h: box.h } : {}),
          align: box.align,
          ...(box.shrink === true ? { fit: "shrink" } : {}),
        },
      );
    }
    for (const image of slide.images) {
      pptSlide.addImage({
        data: image.src,
        x: image.x,
        y: image.y,
        w: image.w,
        altText: image.alt,
      });
    }
    if (slide.notes !== undefined) {
      pptSlide.addNotes(slide.notes);
    }
  }
  const buffer = (await pptx.write({
    outputType: "arraybuffer",
  })) as ArrayBuffer;
  return new Blob([buffer], { type: PPTX_MIME });
}
