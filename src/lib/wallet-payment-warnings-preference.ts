/**
 * Preferencia de usuario: mostrar modales de aviso de coste antes de operaciones de pago.
 * Persistida en localStorage (por dispositivo/navegador).
 */

const STORAGE_KEY = "foldder-wallet-payment-warnings";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function readPaymentWarningsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* noop */
  }
  return true;
}

export function writePaymentWarningsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* noop */
  }
  notify();
}

export function subscribePaymentWarningsPreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPaymentWarningsEnabledSnapshot(): boolean {
  return readPaymentWarningsEnabled();
}

/** Tests / Strict Mode */
export function resetPaymentWarningsPreferenceForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  notify();
}
