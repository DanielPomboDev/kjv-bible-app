/**
 * Image import helpers for freeform slides (DOM-dependent — no unit
 * tests; kept small and total: every failure resolves to null and the
 * caller toasts).
 *
 * Phase 1 stores dataURLs inline so Export/Import backups keep working
 * unchanged. localStorage is ~5MB, so imports are downscaled and the
 * caller must check `fitsImageBudget` BEFORE committing.
 */

/** Longest edge after downscale — church logos stay crisp, photos shrink. */
export const IMAGE_MAX_DIM = 1600;

/** Refuse images that would push the deck near the storage quota. */
export const IMAGE_BUDGET_BYTES = 4_000_000;

export interface ImportedImage {
  src: string;
  /** Intrinsic aspect (width / height) for placeholder sizing. */
  aspect: number;
}

/** Rough persisted size of a deck payload (JSON length ≈ UTF-16 units). */
export function estimateDeckBytes(deck: unknown): number {
  try {
    return JSON.stringify(deck)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** True when the deck plus one image still fits the offline budget. */
export function fitsImageBudget(deck: unknown, imageBytes: number): boolean {
  return estimateDeckBytes(deck) + imageBytes < IMAGE_BUDGET_BYTES;
}

function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Older WebViews: fall back to an <img> through an object URL.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    img.src = url;
  });
}

function canvasToDataURL(
  canvas: HTMLCanvasElement,
  keepPng: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const type = keepPng ? "image/png" : "image/jpeg";
    const quality = keepPng ? undefined : 0.85;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("encode failed"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Downscale an image file to a slide-ready dataURL. PNG sources stay
 * PNG (transparency for logos); everything else becomes JPEG. Null
 * when the file isn't a readable image.
 */
export async function fileToSlideImage(
  file: Blob,
): Promise<ImportedImage | null> {
  try {
    const bitmap = await loadBitmap(file);
    const srcW =
      bitmap instanceof HTMLImageElement
        ? bitmap.naturalWidth
        : bitmap.width;
    const srcH =
      bitmap instanceof HTMLImageElement
        ? bitmap.naturalHeight
        : bitmap.height;
    if (!(srcW > 0 && srcH > 0)) return null;
    const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
    const keepPng =
      typeof file.type === "string" && file.type === "image/png";
    const src = await canvasToDataURL(canvas, keepPng);
    return { src, aspect: w / h };
  } catch {
    return null;
  }
}

/** Pull the first image out of a paste event, if any. */
export async function clipboardToSlideImage(
  e: ClipboardEvent,
): Promise<ImportedImage | null> {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return fileToSlideImage(file);
    }
  }
  return null;
}
