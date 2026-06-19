import { afterEach, describe, expect, it, vi } from "vitest";

import { clearWalletPreflightCache, runWalletFetchPreflight } from "./wallet-fetch-preflight";
import {
  FOLDDER_WALLET_COST_DECISION_EVENT,
  type WalletCostDecisionEventDetail,
  type WalletStatusResponse,
} from "./wallet-client-events";

function walletStatus(availableMicros: number): WalletStatusResponse {
  return {
    configured: true,
    account: {
      status: "active",
      currency: "usd",
      balanceMicros: availableMicros,
      reservedMicros: 0,
      availableMicros,
      lowBalanceThresholdMicros: 500_000,
      lowBalance: availableMicros < 500_000,
      billingReviewRequired: false,
      updatedAt: "2026-06-10T00:00:00.000Z",
    },
    recentEntries: [],
    recentEntriesTruncated: false,
    topupPackages: [],
  };
}

function configuredFetch(status: WalletStatusResponse): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("wallet-fetch-preflight", () => {
  afterEach(() => {
    clearWalletPreflightCache();
    vi.restoreAllMocks();
  });

  it("asks for a decision even on small paid text operations", async () => {
    let requestedLabel = "";
    const onDecision = (event: Event) => {
      const detail = (event as CustomEvent<WalletCostDecisionEventDetail>).detail;
      requestedLabel = detail.request.label;
      detail.handled = true;
      detail.resolve({ allowed: true, reason: "approved" });
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    const response = await runWalletFetchPreflight({
      route: "/api/spaces/text-content",
      requestInput: "/api/spaces/text-content",
      requestInit: {
        method: "POST",
        body: JSON.stringify({ text: "Corrige esta frase." }),
      },
      fetcher: configuredFetch(walletStatus(1_000_000)),
    });

    window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    expect(response).toBeNull();
    expect(requestedLabel).toBe("Editar texto");
  });

  it("blocks before the provider call when balance cannot cover the reserve", async () => {
    const response = await runWalletFetchPreflight({
      route: "/api/gemini/video",
      requestInput: "/api/gemini/video",
      requestInit: {
        method: "POST",
        body: JSON.stringify({ resolution: "1080p", durationSeconds: 4 }),
      },
      fetcher: configuredFetch(walletStatus(100_000)),
    });

    expect(response?.status).toBe(402);
    await expect(response?.json()).resolves.toMatchObject({
      code: "insufficient_balance",
      amountMicros: 552_000,
      availableMicros: 100_000,
    });
  });

  it("lets the user cancel a costly generation before any provider request", async () => {
    const onDecision = (event: Event) => {
      const detail = (event as CustomEvent<WalletCostDecisionEventDetail>).detail;
      detail.handled = true;
      detail.resolve({ allowed: false, reason: "cancelled" });
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    const response = await runWalletFetchPreflight({
      route: "/api/gemini/video",
      requestInput: "/api/gemini/video",
      requestInit: {
        method: "POST",
        body: JSON.stringify({ resolution: "1080p", durationSeconds: 4 }),
      },
      fetcher: configuredFetch(walletStatus(2_000_000)),
    });

    window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      code: "wallet_preflight_cancelled",
      amountMicros: 552_000,
    });
  });

  it("skips preflight when the skip header is set", async () => {
    const fetcher = vi.fn();
    const response = await runWalletFetchPreflight({
      route: "/api/spaces/describe",
      requestInput: "/api/spaces/describe",
      requestInit: {
        method: "POST",
        headers: { "x-foldder-wallet-preflight-skip": "1" },
        body: JSON.stringify({ url: "https://example.com/a.jpg", type: "image" }),
      },
      fetcher,
    });

    expect(response).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
