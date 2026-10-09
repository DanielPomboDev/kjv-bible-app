import { deckKey, type SermonDeckItem } from "../domain/types";

/**
 * Last-export snapshots per sermon, powering the append flow: when the
 * current deck starts with exactly the exported prefix, only the new
 * tail needs a file — the user's designed PowerPoint deck stays
 * untouched (re-exporting would wipe their PowerPoint-side work).
 * localStorage-guarded like every other persistence in this app.
 */

export interface ExportRecord {
  sermonId: string;
  /** Main file the full deck went to (for "drag into …" guidance). */
  fileName: string;
  /** Deck keys in exported order — prefix-matched, never fuzzy. */
  keys: string[];
  exportedAt: string;
}

const STORAGE_KEY = "bible.exportHistory";

type HistoryFile = Record<string, ExportRecord>;

function isRecord(value: unknown): value is ExportRecord {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.sermonId === "string" &&
    typeof obj.fileName === "string" &&
    Array.isArray(obj.keys) &&
    obj.keys.every((k) => typeof k === "string") &&
    typeof obj.exportedAt === "string"
  );
}

function loadAll(): HistoryFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: HistoryFile = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (isRecord(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Last full export of one sermon, or null (never exported/corrupt). */
export function loadExportRecord(sermonId: string): ExportRecord | null {
  return loadAll()[sermonId] ?? null;
}

/** Remember a full export (append exports never touch the record). */
export function saveExportRecord(record: ExportRecord): void {
  try {
    const all = loadAll();
    all[record.sermonId] = record;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full: append flow just won't trigger next time.
  }
}

/**
 * Slides appended since the recorded full export: the deck tail past
 * the recorded prefix, or null when there is no record, nothing new,
 * or the deck changed mid-way (reorder/removal → full re-export).
 */
export function newSlidesSince(
  deck: readonly SermonDeckItem[],
  record: ExportRecord | null,
): SermonDeckItem[] | null {
  if (record === null) return null;
  const prev = record.keys;
  if (prev.length === 0 || deck.length <= prev.length) return null;
  for (let i = 0; i < prev.length; i += 1) {
    if (deckKey(deck[i]) !== prev[i]) return null;
  }
  return [...deck.slice(prev.length)];
}
