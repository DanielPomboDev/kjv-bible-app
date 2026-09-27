import { invoke } from "@tauri-apps/api/core";

/**
 * Connected displays for the monitor picker (Presenter notes
 * rule #3). Enumeration lives behind the `list_monitors` command so no
 * extra Tauri capability is needed — the Rust side calls
 * `available_monitors` directly. Outside Tauri (plain browser dev) the
 * invoke rejects and callers fall back to presenting as before.
 */

/** One connected display, mirroring the backend's `MonitorInfo`. */
export interface MonitorInfo {
  /** Display name, e.g. `\\.\DISPLAY1` — null on platforms without one. */
  name: string | null;
  /** Physical pixels in the virtual desktop (the match fallback). */
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

/** The picked display as sent back to `present_deck_command`. */
export interface MonitorTarget {
  name: string | null;
  x: number;
  y: number;
}

/** List every connected display, in the backend's order. */
export function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

/**
 * The remembered monitor choice, persisted like settings (project notes,
 * Sermon rule #5 mechanism) so next time the picker opens with the last
 * used display preselected.
 */
export interface MonitorChoice {
  name: string | null;
  x: number;
  y: number;
}

const STORAGE_KEY = "bible.presentationMonitor";

/** Stable identity for matching: the name, else its position. */
export function monitorKey(m: {
  name: string | null;
  x: number;
  y: number;
}): string {
  return m.name ?? `${m.x},${m.y}`;
}

function isChoice(value: unknown): value is MonitorChoice {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.name === null || typeof obj.name === "string") &&
    typeof obj.x === "number" &&
    typeof obj.y === "number"
  );
}

export function loadMonitorChoice(): MonitorChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isChoice(parsed) ? parsed : null;
  } catch {
    // Corrupted or unavailable storage: just ask every time.
    return null;
  }
}

export function saveMonitorChoice(choice: MonitorChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage full or unavailable: the choice just won't persist.
  }
}

/**
 * Which monitor to preselect: the remembered one when still connected,
 * else the first non-primary display (the app stays on the main screen,
 * the stage goes to the projector), else the first display.
 */
export function defaultMonitor(
  monitors: readonly MonitorInfo[],
  saved: MonitorChoice | null,
): MonitorInfo | null {
  if (monitors.length === 0) return null;
  if (saved) {
    const key = monitorKey(saved);
    const found = monitors.find((m) => monitorKey(m) === key);
    if (found) return found;
  }
  return monitors.find((m) => !m.isPrimary) ?? monitors[0];
}

export function choiceOf(monitor: MonitorInfo): MonitorChoice {
  return { name: monitor.name, x: monitor.x, y: monitor.y };
}
