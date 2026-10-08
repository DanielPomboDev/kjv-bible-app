import { useEffect, useRef, type RefObject } from "react";

/**
 * Restores focus to whatever held it before `open` turned true, when `open`
 * turns false. Closing a dialog/overlay/popover must never strand focus on
 * `document.body`. Safe when the opener is gone (checks `isConnected`).
 */
export function useFocusReturn(open: boolean) {
  const saved = useRef<Element | null>(null);
  const prev = useRef(open);
  useEffect(() => {
    if (open && !prev.current) saved.current = document.activeElement;
    if (!open && prev.current) {
      const el = saved.current;
      if (el instanceof HTMLElement && el.isConnected) {
        el.focus({ preventScroll: true });
      }
      saved.current = null;
    }
    prev.current = open;
  }, [open ]);
}

/**
 * Keeps Tab cycling inside `ref` while `active` — the focus trap every modal
 * dialog needs. Only wraps at the boundaries; normal Tab order inside is
 * untouched. Attach to modal dialogs, not to non-modal popovers.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const items = [
        ...ref.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, ref]);
}
