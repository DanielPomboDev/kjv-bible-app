import type {
  CustomSlideItem,
  OutlineSection,
  Sermon,
  SermonDeckItem,
  VerseSlideItem,
} from "../domain/types";
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_PRESET_ID,
} from "../presentation/backgroundPresets";

/**
 * Pure sermon persistence helpers (AGENTS.md, Sermon library rules #2–4).
 *
 * The library is one localStorage record — the same mechanism settings
 * use (`store/settings.ts`): a JSON blob holding every sermon plus which
 * one is open. No backend, no dependency on Tauri; the WebView keeps
 * localStorage per app, so the collection survives restarts.
 *
 * Kept free of store imports on purpose: both `store/sermonLibrary.ts`
 * and `store/activeSermon.ts` boot from here, and neither may touch the
 * other store during module evaluation (ESM cycle). Cross-store sync
 * happens only inside action bodies, at runtime.
 */

/** Title of the migrated/first sermon, and the base for new ones. */
export const UNTITLED_SERMON_TITLE = "Untitled Sermon";

/** The library record: every sermon plus which one is open. */
export const LIBRARY_STORAGE_KEY = "bible.sermonLibrary";

/** Step-1 single-sermon snapshot — adopted into the library once. */
const ACTIVE_SNAPSHOT_KEY = "bible.activeSermon";
/** Pre-Sermon global keys — adopted once, then removed. */
const LEGACY_DECK_KEY = "bible.sermonDeck";
const LEGACY_BACKGROUND_KEY = "bible.presentationBackground";

function isVerseItem(value: unknown): value is VerseSlideItem {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  // `type` is optional so decks persisted before the verse/custom union
  // still load — a typeless entry is a verse by definition.
  if (entry.type !== undefined && entry.type !== "verse") return false;
  return (
    typeof entry.id === "number" &&
    typeof entry.label === "string" &&
    typeof entry.text === "string"
  );
}

function isCustomItem(value: unknown): value is CustomSlideItem {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (entry.type !== "custom") return false;
  return (
    typeof entry.id === "string" &&
    (entry.title === undefined || typeof entry.title === "string") &&
    typeof entry.body === "string"
  );
}

/**
 * Pull the optional presenter notes off a persisted deck item: a string
 * when present, otherwise undefined so old decks load unchanged.
 */
function normalizeNotes(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean.length === 0 ? undefined : clean;
}

/**
 * Normalize one persisted value to a deck item, or null when malformed.
 * Legacy verse entries (no `type` field) become `{ type: "verse", … }`
 * so old decks survive the union migration unchanged. Presenter notes
 * (when present) travel on whichever slide type carries them.
 */
function normalizeDeckItem(value: unknown): SermonDeckItem | null {
  if (isCustomItem(value)) {
    const { id, title, body } = value;
    const notes = normalizeNotes(
      (value as unknown as Record<string, unknown>).notes,
    );
    return {
      type: "custom",
      id,
      ...(title === undefined ? {} : { title }),
      body,
      ...(notes === undefined ? {} : { notes }),
    };
  }
  if (isVerseItem(value)) {
    const { id, label, text } = value;
    const notes = normalizeNotes(
      (value as unknown as Record<string, unknown>).notes,
    );
    return {
      type: "verse",
      id,
      label,
      text,
      ...(notes === undefined ? {} : { notes }),
    };
  }
  return null;
}

function normalizeDeck(value: unknown): SermonDeckItem[] | null {
  if (!Array.isArray(value)) return null;
  const deck: SermonDeckItem[] = [];
  for (const item of value) {
    const normalized = normalizeDeckItem(item);
    if (normalized !== null) deck.push(normalized);
  }
  return deck;
}

/**
 * Normalize one persisted value to an outline section, or null when
 * malformed. Anything malformed is dropped so a bad write can't break
 * the app.
 */
function normalizeOutlineSection(value: unknown): OutlineSection | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.heading !== "string" ||
    typeof obj.body !== "string"
  ) {
    return null;
  }
  return { id: obj.id, heading: obj.heading, body: obj.body };
}

/**
 * Normalize the persisted outline, or null when it isn't a list.
 * `undefined` (sermons persisted before outlines existed) becomes an
 * empty outline, so old sermons load unchanged.
 */
function normalizeOutline(value: unknown): OutlineSection[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const sections: OutlineSection[] = [];
  for (const item of value) {
    const normalized = normalizeOutlineSection(item);
    if (normalized !== null) sections.push(normalized);
  }
  return sections;
}

/** True when the value is a known slide background preset id. */
export function isPresetId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    BACKGROUND_PRESETS.some((preset) => preset.id === value)
  );
}

export function isSermon(value: unknown): value is Sermon {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.title === "string" &&
    typeof obj.date === "string" &&
    normalizeOutline(obj.outline) !== null &&
    normalizeDeck(obj.deck) !== null &&
    isPresetId(obj.backgroundPresetId)
  );
}

/** Normalize a validated sermon so malformed items can't break the app. */
function normalizeSermon(sermon: Sermon): Sermon {
  return {
    ...sermon,
    outline: normalizeOutline(sermon.outline) ?? [],
    deck: normalizeDeck(sermon.deck) ?? [],
  };
}

export function newSermonId(): string {
  return `sermon-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function freshSermon(title: string): Sermon {
  return {
    id: newSermonId(),
    title,
    date: new Date().toISOString(),
    outline: [],
    deck: [],
    backgroundPresetId: DEFAULT_BACKGROUND_PRESET_ID,
  };
}

/**
 * A title for a new sermon that doesn't collide with an existing one:
 * "Untitled Sermon", then "Untitled Sermon 2", "Untitled Sermon 3", …
 */
export function nextUntitledTitle(sermons: readonly Sermon[]): string {
  const taken = new Set(sermons.map((s) => s.title));
  if (!taken.has(UNTITLED_SERMON_TITLE)) return UNTITLED_SERMON_TITLE;
  let n = 2;
  while (taken.has(`${UNTITLED_SERMON_TITLE} ${n}`)) n += 1;
  return `${UNTITLED_SERMON_TITLE} ${n}`;
}

export interface LibrarySnapshot {
  sermons: Sermon[];
  activeId: string;
}

function parseLibrary(raw: string): LibrarySnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.sermons)) return null;
    const sermons: Sermon[] = [];
    for (const value of obj.sermons) {
      if (isSermon(value)) sermons.push(normalizeSermon(value));
    }
    // Drop anything malformed so a bad write can't break the app; an
    // empty collection is the same as no library at all.
    if (sermons.length === 0) return null;
    const activeId =
      typeof obj.activeId === "string" &&
      sermons.some((s) => s.id === obj.activeId)
        ? obj.activeId
        : sermons[0].id;
    return { sermons, activeId };
  } catch {
    return null;
  }
}

/** The step-1 single-sermon snapshot, if one was persisted. */
function loadActiveSnapshot(): Sermon | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSermon(parsed)) return null;
    return normalizeSermon(parsed);
  } catch {
    return null;
  }
}

/** The pre-Sermon global deck/background, if either was persisted. */
function loadLegacyGlobals(): Sermon | null {
  try {
    const deckRaw = localStorage.getItem(LEGACY_DECK_KEY);
    const bgRaw = localStorage.getItem(LEGACY_BACKGROUND_KEY);
    if (!deckRaw && !bgRaw) return null;
    let deck: SermonDeckItem[] = [];
    if (deckRaw) {
      const parsed: unknown = JSON.parse(deckRaw);
      deck = normalizeDeck(parsed) ?? [];
    }
    let backgroundPresetId = DEFAULT_BACKGROUND_PRESET_ID;
    if (bgRaw) {
      const parsed: unknown = JSON.parse(bgRaw);
      if (typeof parsed === "object" && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (isPresetId(obj.presetId)) backgroundPresetId = obj.presetId;
      } else if (isPresetId(parsed)) {
        // Tolerate a bare string from an older write.
        backgroundPresetId = parsed;
      }
    }
    return {
      id: newSermonId(),
      title: UNTITLED_SERMON_TITLE,
      date: new Date().toISOString(),
      outline: [],
      deck,
      backgroundPresetId,
    };
  } catch {
    return null;
  }
}

/**
 * Load the library: the persisted collection wins; otherwise adopt the
 * step-1 snapshot, then the legacy globals, then a fresh empty sermon —
 * so existing work is never lost (Sermon library rule #4). The adopted
 * state is persisted, and the superseded keys are removed so the library
 * record stays the single source of truth.
 */
export function loadLibraryState(): LibrarySnapshot {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (raw) {
      const snapshot = parseLibrary(raw);
      if (snapshot) return snapshot;
    }
  } catch {
    // Corrupted or unavailable storage: fall through to adoption.
  }

  const adopted =
    loadActiveSnapshot() ??
    loadLegacyGlobals() ??
    freshSermon(UNTITLED_SERMON_TITLE);
  const snapshot: LibrarySnapshot = {
    sermons: [adopted],
    activeId: adopted.id,
  };
  persistLibrary(snapshot.sermons, snapshot.activeId);
  try {
    localStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
    localStorage.removeItem(LEGACY_DECK_KEY);
    localStorage.removeItem(LEGACY_BACKGROUND_KEY);
  } catch {
    // Storage unavailable: harmless, adoption just re-runs next load.
  }
  return snapshot;
}

export function persistLibrary(
  sermons: readonly Sermon[],
  activeId: string | null,
): void {
  try {
    localStorage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({ sermons, activeId }),
    );
  } catch {
    // Storage full or unavailable: the library just won't persist.
  }
}
