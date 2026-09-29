import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FOLDDER_WALLET_COST_DECISION_EVENT,
  requestWalletCostDecision,
  type WalletCostDecisionRequest,
  type WalletStatusResponse,
} from "./wallet-client-events";
import {
  resetPaymentWarningsPreferenceForTests,
  writePaymentWarningsEnabled,
} from "./wallet-payment-warnings-preference";

function baseRequest(availableMicros: number): WalletCostDecisionRequest {
  const wallet: WalletStatusResponse = {
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
  return {
    id: "test",
    label: "Generar imagen",
    route: "/api/gemini/generate",
    category: "image",
    estimatedCostMicros: 50_000,
    reserveMicros: 100_000,
    tone: "confirm",
    wallet,
  };
}

describe("requestWalletCostDecision", () => {
  afterEach(() => {
    resetPaymentWarningsPreferenceForTests();
    vi.restoreAllMocks();
  });

  it("auto-approves when payment warnings are disabled and balance is sufficient", async () => {
    writePaymentWarningsEnabled(false);
    let eventFired = false;
    const onDecision = () => {
      eventFired = true;
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    const result = await requestWalletCostDecision(baseRequest(2_000_000));

    window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);
    expect(result).toEqual({ allowed: true, reason: "approved" });
    expect(eventFired).toBe(false);
  });

  it("blocks without modal when warnings disabled and balance is insufficient", async () => {
    writePaymentWarningsEnabled(false);
    let eventFired = false;
    const onDecision = () => {
      eventFired = true;
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    const result = await requestWalletCostDecision(baseRequest(10_000));

    window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);
    expect(result).toEqual({ allowed: false, reason: "insufficient_balance" });
    expect(eventFired).toBe(false);
  });

  it("still asks before a Writer call when payment warnings are off", async () => {
    writePaymentWarningsEnabled(false);
    let eventFired = false;
    const onDecision = (event: Event) => {
      eventFired = true;
      const detail = (event as CustomEvent<{ handled: boolean; resolve: (result: { allowed: boolean; reason: "cancelled" }) => void }>).detail;
      detail.handled = true;
      detail.resolve({ allowed: false, reason: "cancelled" });
    };
    window.addEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);

    const result = await requestWalletCostDecision({
      ...baseRequest(2_000_000),
      requireExplicitConfirm: true,
    });

    window.removeEventListener(FOLDDER_WALLET_COST_DECISION_EVENT, onDecision);
    expect(eventFired).toBe(true);
    expect(result).toEqual({ allowed: false, reason: "cancelled" });
  });
});
