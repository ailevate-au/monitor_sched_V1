/**
 * Tiny app-wide toast store. Replaces native `alert()` for non-blocking
 * feedback (errors, validation, success). It's a module-level pub/sub so any
 * code — component or not — can call `toast("…")` without prop-drilling or a
 * context; a single <Toaster/> mounted at the app root renders the stack.
 *
 * Note: this is for fire-and-forget messages only. Blocking questions that
 * need an answer (confirm/prompt) still need a dedicated modal.
 */

export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

/** Subscribe to the toast list (used by <Toaster/>). Returns an unsubscribe fn. */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Show a toast. Auto-dismisses after `durationMs` (pass 0 to keep it sticky). */
export function toast(message: string, kind: ToastKind = "info", durationMs = 5000): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  if (durationMs > 0) {
    setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

/** Errors linger a little longer so they're not missed. */
export const toastError = (message: string) => toast(message, "error", 6500);
export const toastSuccess = (message: string) => toast(message, "success", 4000);
