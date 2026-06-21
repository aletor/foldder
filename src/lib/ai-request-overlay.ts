import { createGuardedFetch } from "@/lib/external-api-guard";
import { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";
import {
  aiActiveJobEndFetch,
  aiActiveJobStartFetch,
  isNodeManagedAiPath,
} from "@/lib/ai-active-jobs";
import {
  notifyWalletFromApiResponse,
  runWalletFetchPreflight,
  shouldSkipWalletPreflightForFetch,
} from "@/lib/wallet-fetch-preflight";

export { getAiRequestLabelForPathname } from "@/lib/ai-api-labels";

type Listener = () => void;
const listeners = new Set<Listener>();
/** Pila de ids de trabajo (o marcadores skip) por petición concurrente. */
const stack: string[] = [];

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeAiRequestOverlay(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @deprecated Usar getActiveAiJobsSnapshot */
export function getAiRequestOverlaySnapshot(): string | null {
  return null;
}

function shouldSkipFetchHudTracking(
  pathname: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  return isNodeManagedAiPath(pathname) || shouldSkipWalletPreflightForFetch(input, init);
}

function beginDisplay(
  pathname: string,
  apiLabel: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  if (shouldSkipFetchHudTracking(pathname, input, init)) {
    const skipId = "skip:node-managed";
    stack.push(skipId);
    return skipId;
  }
  const id = aiActiveJobStartFetch(apiLabel);
  stack.push(id);
  notify();
  return id;
}

function endDisplay() {
  const id = stack.pop();
  if (!id) return;
  aiActiveJobEndFetch(id);
  notify();
}

/**
 * Intercepta fetch solo en el cliente hacia rutas /api/* de IA.
 * Aplica guardián (8 concurrentes, 4 s entre repeticiones idénticas, bloqueo tras ráfagas).
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
    if (label) beginDisplay(pathname, label, input, init);
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
