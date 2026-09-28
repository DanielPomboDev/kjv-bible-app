import { create } from "zustand";
import type {
  OutlineSection,
  SermonDeckItem,
  StageSlide,
} from "../domain/types";
import { presentDeck, presentNow } from "../services/presentation";
import {
  choiceOf,
  defaultMonitor,
  listMonitors,
  loadMonitorChoice,
  monitorKey,
  saveMonitorChoice,
  type MonitorChoice,
  type MonitorInfo,
} from "../presentation/monitors";
import { useToast } from "./toast";
import { useSettings } from "./settings";

/**
 * The gate before every fullscreen present. Both entry points — the deck panel's Present button and
 * the verse menu's Present Now — come through `requestPresent` instead
 * of invoking the backend directly:
 *
 * - 2+ monitors → the picker dialog (`phase: "pick"`), preselecting the
 *   remembered display when still connected.
 * - 1 monitor → a warning dialog (`phase: "warn"`): notes will be
 *   visible to the audience, so never proceed silently.
 * - 0 monitors, or not under Tauri at all (plain browser dev) → present
 *   exactly as before, no dialog.
 *
 * Confirming persists the choice like settings do, so next time the
 * same display is preselected.
 */

export type PendingPresent =
  | {
      kind: "deck";
      deck: SermonDeckItem[];
      background: string;
      /** Open sermon's outline snapshot — presenter reference only. */
      outline: OutlineSection[];
    }
  | {
      kind: "single";
      slide: StageSlide;
      background: string;
      /** Open sermon's outline snapshot — presenter reference only. */
      outline: OutlineSection[];
    };

type Phase = "closed" | "pick" | "warn";

interface PresentFlowState {
  readonly phase: Phase;
  readonly monitors: readonly MonitorInfo[];
  /** Key (see `monitorKey`) of the preselected/selected monitor. */
  readonly selectedKey: string | null;
  readonly pending: PendingPresent | null;
  /** List monitors, then open the picker, warn, or present directly. */
  requestPresent: (pending: PendingPresent) => void;
  setSelectedKey: (key: string) => void;
  /** Present on the selected monitor and remember the choice. */
  confirmPresent: () => void;
  /** Single-monitor warning accepted: present on that display. */
  presentAnyway: () => void;
  cancelPresent: () => void;
}

const idle = {
  phase: "closed" as const,
  monitors: [] as readonly MonitorInfo[],
  selectedKey: null as string | null,
  pending: null as PendingPresent | null,
};

function fire(pending: PendingPresent, monitor?: MonitorChoice): void {
  const target =
    monitor !== undefined
      ? { name: monitor.name, x: monitor.x, y: monitor.y }
      : undefined;
  // Snapshot the app theme with everything else: the pre-warmed
  // presenter loaded once at startup, so without this it would keep
  // whatever theme was persisted then, ignoring later toggles.
  const theme = useSettings.getState().theme;
  const task =
    pending.kind === "deck"
      ? presentDeck({
          deck: pending.deck,
          background: pending.background,
          monitor: target,
          outline: pending.outline,
          theme,
        })
      : presentNow({
          slide: pending.slide,
          background: pending.background,
          monitor: target,
          outline: pending.outline,
          theme,
        });
  task.catch((e) => useToast.getState().showToast(`Presentation failed: ${e}`));
}

export const usePresentFlow = create<PresentFlowState>()((set, get) => ({
  ...idle,

  requestPresent: (pending) => {
    void listMonitors().then(
      (monitors) => {
        if (monitors.length <= 1) {
          // Zero (shouldn't happen) behaves like one minus the warning:
          // just present where the window already is.
          if (monitors.length === 0) fire(pending);
          else set({ phase: "warn", monitors, selectedKey: null, pending });
          return;
        }
        const def = defaultMonitor(monitors, loadMonitorChoice());
        set({
          phase: "pick",
          monitors,
          selectedKey: def ? monitorKey(def) : null,
          pending,
        });
      },
      () => {
        // Not under Tauri (plain browser): no monitors, no dialog —
        // today's behavior, which then toasts its own failure.
        fire(pending);
      },
    );
  },

  setSelectedKey: (selectedKey) => set({ selectedKey }),

  confirmPresent: () => {
    const { monitors, selectedKey, pending } = get();
    if (!pending) {
      set(idle);
      return;
    }
    const chosen = monitors.find((m) => monitorKey(m) === selectedKey);
    if (!chosen) {
      // Selection lost (can't happen via the dialog) — present
      // directly rather than stranding the user.
      set(idle);
      fire(pending);
      return;
    }
    const choice = choiceOf(chosen);
    saveMonitorChoice(choice);
    set(idle);
    fire(pending, choice);
  },

  presentAnyway: () => {
    const { monitors, pending } = get();
    if (!pending) {
      set(idle);
      return;
    }
    const only = monitors.length === 1 ? choiceOf(monitors[0]) : undefined;
    set(idle);
    fire(pending, only);
  },

  cancelPresent: () => set(idle),
}));
