import { useToast } from "../store/toast";

/** Brief confirmation bubble ("Copied 3 verses"), one at a time. */
export function Toast() {
  const toast = useToast((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}
