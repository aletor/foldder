"use client";

import { estimateWalletCostForRoute } from "@/lib/wallet-cost-estimates";
import {
  dispatchWalletOpen,
  dispatchWalletRefresh,
  requestWalletCostDecision,
  type WalletStatusResponse,
} from "@/lib/wallet-client-events";

const WALLET_STATUS_TTL_MS = 12_000;

export const FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER = "x-foldder-wallet-preflight-skip";

export function shouldSkipWalletPreflight(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const headers = init.headers;
  if (headers instanceof Headers) {
    return headers.get(FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER) === "1";
  }
  if (Array.isArray(headers)) {
    return headers.some(
      ([key, value]) =>
        key.toLowerCase() === FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER && value === "1",
    );
  }
  const record = headers as Record<string, string>;
  return record[FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER] === "1"
    || record[FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER.toLowerCase()] === "1";
}

export function shouldSkipWalletPreflightForFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  if (shouldSkipWalletPreflight(init)) return true;
  if (input instanceof Request) {
    return input.headers.get(FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER) === "1";
  }
  return false;
}

export function getOrigWindowFetch(): typeof fetch {
  if (typeof window === "undefined") return fetch;
  const w = window as Window & { __foldderOrigFetch?: typeof fetch };
  return w.__foldderOrigFetch ?? fetch;
}

let cachedWallet:
  | {
      loadedAt: number;
      value: WalletStatusResponse;
    }
  | null = null;

function syntheticWalletResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function parseRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const body = init?.body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (input instanceof Request) {
    try {
      return await input.clone().json();
    } catch {
      return null;
    }
  }
  return null;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (
    init?.method ||
    (input instanceof Request ? input.method : undefined) ||
    "GET"
  ).toUpperCase();
}

async function readWalletStatus(fetcher: typeof fetch): Promise<WalletStatusResponse | null> {
  if (cachedWallet && Date.now() - cachedWallet.loadedAt < WALLET_STATUS_TTL_MS) {
    return cachedWallet.value;
  }
  try {
    const response = await fetcher("/api/billing/wallet?limit=8", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as WalletStatusResponse | null;
    if (!response.ok || !json) return null;
    cachedWallet = { loadedAt: Date.now(), value: json };
    return json;
  } catch {
    return null;
  }
}

export function clearWalletPreflightCache(): void {
  cachedWallet = null;
}

export async function runWalletFetchPreflight(input: {
  route: string;
  requestInput: RequestInfo | URL;
  requestInit?: RequestInit;
  fetcher: typeof fetch;
}): Promise<Response | null> {
  if (typeof window === "undefined") return null;
  if (shouldSkipWalletPreflight(input.requestInit)) return null;
  if (requestMethod(input.requestInput, input.requestInit) !== "POST") return null;

  const body = await parseRequestBody(input.requestInput, input.requestInit);
  const estimate = estimateWalletCostForRoute(input.route, body);
  if (!estimate || estimate.reserveMicros <= 0) return null;

  const wallet = await readWalletStatus(input.fetcher);
  const walletSnapshot: WalletStatusResponse = wallet ?? {
    configured: false,
    account: null,
    recentEntries: [],
    recentEntriesTruncated: false,
    topupPackages: [],
  };

  const decision = await requestWalletCostDecision({
    id: `${input.route}:${Date.now()}`,
    ...estimate,
    wallet: walletSnapshot,
  });
  if (decision.allowed) return null;

  const availableMicros = walletSnapshot.account?.availableMicros ?? 0;
  dispatchWalletRefresh("preflight_blocked");
  if (decision.reason === "insufficient_balance") dispatchWalletOpen("insufficient_balance");
  return syntheticWalletResponse(
    {
      error:
        decision.reason === "cancelled"
          ? "Operación cancelada antes de reservar saldo."
          : "Saldo insuficiente para ejecutar esta operación.",
      code: decision.reason === "cancelled" ? "wallet_preflight_cancelled" : "insufficient_balance",
      amountMicros: estimate.reserveMicros,
      availableMicros,
      estimatedCostMicros: estimate.estimatedCostMicros,
      route: input.route,
    },
    decision.reason === "cancelled" ? 409 : 402,
  );
}

export async function fetchPostWithWalletPreflight(
  route: string,
  body: unknown,
  init?: Omit<RequestInit, "method" | "body">,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const requestInit: RequestInit = {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };
  const fetcher = getOrigWindowFetch();
  const blocked = await runWalletFetchPreflight({
    route,
    requestInput: route,
    requestInit,
    fetcher,
  });
  if (blocked) return blocked;

  headers.set(FOLDDER_WALLET_PREFLIGHT_SKIP_HEADER, "1");
  return fetch(route, { ...requestInit, headers });
}

export async function notifyWalletFromApiResponse(response: Response): Promise<void> {
  if (typeof window === "undefined") return;
  if (response.status === 402) {
    try {
      const body = (await response.clone().json()) as { code?: string };
      if (body.code === "insufficient_balance") {
        clearWalletPreflightCache();
        dispatchWalletRefresh("insufficient_balance");
        dispatchWalletOpen("insufficient_balance");
      }
    } catch {
      return;
    }
    return;
  }
  if (response.ok) {
    clearWalletPreflightCache();
    dispatchWalletRefresh("api_success");
  }
}
