import { createGuardedFetch } from "@/lib/external-api-guard";
import { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";
import {
  notifyWalletFromApiResponse,
  runWalletFetchPreflight,
} from "@/lib/wallet-fetch-preflight";

export { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";

type Listener = () => void;
const listeners = new Set<Listener>();
/** Pila: peticiones concurrentes (la visible es la última iniciada). */
const stack: string[] = [];

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeAiRequestOverlay(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAiRequestOverlaySnapshot(): string | null {
  if (stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function beginDisplay(apiLabel: string) {
  stack.push(apiLabel);
  notify();
}

function endDisplay() {
  stack.pop();
  notify();
}

/**
 * Intercepta fetch solo en el cliente hacia rutas /api/* de IA.
 * Aplica guardián (5 concurrentes, 4 s entre repeticiones de la misma petición, bloqueo hasta «Verificar»).
 * Devuelve cleanup para desinstalar (Strict Mode / desmontaje).
 */
export function installAiFetchOverlay(): () => void {
  if (typeof window === "undefined") return () => {};

  const w = window as Window & { __foldderOrigFetch?: typeof fetch };
  if (w.__foldderOrigFetch) {
    return () => {};
  }

  const orig = window.fetch.bind(window);
  w.__foldderOrigFetch = orig;

  const overlayInner = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    let urlStr: string;
    if (typeof input === "string") urlStr = input;
    else if (input instanceof Request) urlStr = input.url;
    else urlStr = input.href;

    let pathname: string;
    try {
      const abs = new URL(urlStr, window.location.origin);
      if (abs.origin !== window.location.origin) {
        return orig(input, init);
      }
      pathname = abs.pathname;
    } catch {
      return orig(input, init);
    }

    const label = getAiRequestLabelForPathname(pathname);
    if (label) {
      const preflightResponse = await runWalletFetchPreflight({
        route: pathname,
        requestInput: input,
        requestInit: init,
        fetcher: orig,
      });
      if (preflightResponse) return preflightResponse;
    }
    if (label) beginDisplay(label);
    try {
      const response = await orig(input, init);
      if (label) void notifyWalletFromApiResponse(response.clone());
      return response;
    } finally {
      if (label) endDisplay();
    }
  };

  window.fetch = createGuardedFetch(overlayInner);

  return () => {
    if (w.__foldderOrigFetch) {
      window.fetch = w.__foldderOrigFetch;
      delete w.__foldderOrigFetch;
    }
  };
}
