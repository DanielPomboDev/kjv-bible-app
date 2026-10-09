/**
 * Slide background artwork for PowerPoint export.
 *
 * Solid presets stay exact solid fills (tiny + exact). Layered CSS
 * presets (gradients, conic stained glass, wood grain, parchment,
 * starfield) have no OOXML equivalent, so they are painted onto a
 * 1920×1080 canvas mirroring `backgroundPresets.ts` stop-for-stop and
 * embedded as a slide background image. Fully deterministic (fixed
 * star positions, no randomness) so repeated exports are byte-stable.
 *
 * DOM-dependent (canvas) — registry coverage is unit-tested; pixels
 * are verified in a real Chromium/WebView, never in node.
 */

export const BG_RENDER_W = 1920;
export const BG_RENDER_H = 1080;

/** Presets painted to images (everyone else is an exact solid). */
const RENDERED_PRESETS = new Set([
  "royal-amethyst",
  "stained-glass",
  "wood-pulpit",
  "aged-parchment",
  "night-sky",
  "sunset-veil",
  "forest-glade",
  "galilee-waters",
]);

export function isRenderedBackground(presetId: string): boolean {
  return RENDERED_PRESETS.has(presetId);
}

/**
 * CSS linear-gradient angle → canvas gradient endpoints. CSS measures
 * clockwise from up; the line passes through the center spanning the
 * box corners, exactly like the browser lays it out.
 */
function linearByCssAngle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  degCss: number,
): CanvasGradient {
  const t = (degCss * Math.PI) / 180;
  const vx = Math.sin(t);
  const vy = -Math.cos(t);
  const half = (Math.abs(w * vx) + Math.abs(h * vy)) / 2;
  return ctx.createLinearGradient(
    w / 2 - vx * half,
    h / 2 - vy * half,
    w / 2 + vx * half,
    h / 2 + vy * half,
  );
}

/** Fixed night-sky starfield (mirrors the CSS radial dots, deterministic). */
const STARS: ReadonlyArray<readonly [number, number]> = [
  [0.18, 0.22],
  [0.72, 0.14],
  [0.55, 0.32],
  [0.85, 0.55],
  [0.35, 0.6],
];

function paintPreset(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  presetId: string,
): void {
  switch (presetId) {
    case "royal-amethyst": {
      const g = linearByCssAngle(ctx, w, h, 135);
      g.addColorStop(0, "#1E1033");
      g.addColorStop(0.55, "#3B1D6E");
      g.addColorStop(1, "#5B2A86");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "galilee-waters": {
      const g = linearByCssAngle(ctx, w, h, 135);
      g.addColorStop(0, "#062A33");
      g.addColorStop(0.5, "#0B4F5C");
      g.addColorStop(1, "#12707A");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "stained-glass": {
      // conic-gradient(from 45deg at 30% 25%, …): canvas 0 rad is east,
      // so 45° clockwise from north is -π/4. Stops evenly spaced.
      const g = ctx.createConicGradient(-Math.PI / 4, w * 0.3, h * 0.25);
      const colors = ["#7B2D5B", "#2D4C9B", "#1F7A6D", "#8A5A2B", "#6B1F3A"];
      colors.forEach((c, i) => g.addColorStop(i / colors.length, c));
      g.addColorStop(1, colors[0]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(8, 6, 18, 0.78)";
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "wood-pulpit": {
      const g = linearByCssAngle(ctx, w, h, 160);
      g.addColorStop(0, "#2A1A0E");
      g.addColorStop(0.45, "#4A2E17");
      g.addColorStop(1, "#6B4423");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Subtle grain: 2px light lines every 9px, tilted like the CSS.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(0.0524);
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      for (let x = -w; x < w; x += 9) {
        ctx.fillRect(x, -h, 2, h * 2);
      }
      ctx.restore();
      break;
    }
    case "aged-parchment": {
      ctx.fillStyle = "#E2D2AE";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h * 0.3);
      ctx.scale(1, 0.7);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
      g.addColorStop(0, "#FBF6E9");
      g.addColorStop(0.55, "#F3E9D2");
      g.addColorStop(1, "#E2D2AE");
      ctx.fillStyle = g;
      ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
      break;
    }
    case "night-sky": {
      const g = linearByCssAngle(ctx, w, h, 180);
      g.addColorStop(0, "#050914");
      g.addColorStop(1, "#0B1A3A");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#FFFFFF";
      for (const [sx, sy] of STARS) {
        ctx.beginPath();
        ctx.arc(sx * w, sy * h, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "sunset-veil": {
      const g = linearByCssAngle(ctx, w, h, 180);
      g.addColorStop(0, "#1A1033");
      g.addColorStop(0.45, "#5B2350");
      g.addColorStop(0.75, "#C65B3A");
      g.addColorStop(1, "#E89B4B");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const veil = linearByCssAngle(ctx, w, h, 180);
      veil.addColorStop(0, "rgba(10, 5, 20, 0.35)");
      veil.addColorStop(1, "rgba(10, 5, 20, 0.45)");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "forest-glade": {
      const g = linearByCssAngle(ctx, w, h, 170);
      g.addColorStop(0, "#0A1F14");
      g.addColorStop(0.6, "#123524");
      g.addColorStop(1, "#1B4A30");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h * 1.2);
      ctx.scale(1, 0.9);
      const glade = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.7);
      glade.addColorStop(0, "#2D5A3D");
      glade.addColorStop(0.6, "rgba(45, 90, 61, 0)");
      glade.addColorStop(1, "rgba(45, 90, 61, 0)");
      ctx.fillStyle = glade;
      ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
      break;
    }
    default: {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      break;
    }
  }
}

/**
 * Paint a preset to a JPEG dataURL, or null for exact-solid presets
 * (the caller uses a solid fill) and unknown ids. Null outside a DOM
 * (canvas needs a document) — callers fall back to solids there.
 */
export function renderPresetBackground(presetId: string): string | null {
  if (!isRenderedBackground(presetId)) return null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = BG_RENDER_W;
  canvas.height = BG_RENDER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintPreset(ctx, BG_RENDER_W, BG_RENDER_H, presetId);
  return canvas.toDataURL("image/jpeg", 0.85);
}
