import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FOLDDER_WALLET_COST_DECISION_EVENT, type WalletCostDecisionRequest } from "@/lib/wallet-client-events";
import { WalletCostGuardDialog } from "./WalletCostGuardDialog";

vi.mock("@/components/LanguageProvider", () => ({
  useLanguage: () => ({ language: "es" }),
}));

function costRequest(overrides: Partial<WalletCostDecisionRequest> = {}): WalletCostDecisionRequest {
  return {
    id: "cost_request_1",
    label: "Generar imagen IA",
    route: "/api/gemini/generate",
    category: "image",
    estimatedCostMicros: 101_000,
    reserveMicros: 116_150,
    tone: "confirm",
    wallet: {
      configured: true,
      account: {
        status: "active",
        currency: "usd",
        balanceMicros: 25_000_000,
        reservedMicros: 0,
        availableMicros: 25_000_000,
        lowBalanceThresholdMicros: 2_000_000,
        lowBalance: false,
        billingReviewRequired: false,
        updatedAt: "2026-06-10T00:00:00.000Z",
      },
      recentEntries: [],
      recentEntriesTruncated: false,
      topupPackages: [],
    },
    ...overrides,
  };
}

describe("WalletCostGuardDialog", () => {
  it("renders above Studio overlays from a body portal", async () => {
    const studioOverlay = document.createElement("div");
    studioOverlay.className = "fixed inset-0 z-[100090]";
    document.body.appendChild(studioOverlay);

    const { container } = render(
      <div data-testid="spaces-root">
        <WalletCostGuardDialog />
      </div>,
    );

    const resolve = vi.fn();
    window.dispatchEvent(
      new CustomEvent(FOLDDER_WALLET_COST_DECISION_EVENT, {
        detail: {
          request: costRequest(),
          handled: false,
          resolve,
        },
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Generar imagen IA" });
    const guardRoot = dialog.closest("[data-foldder-wallet-cost-guard]");

    expect(guardRoot).toBeTruthy();
    expect(guardRoot?.parentElement).toBe(document.body);
    expect(container.contains(guardRoot)).toBe(false);
    expect(guardRoot?.className).toContain("z-[100700]");

    await waitFor(() => {
      expect(document.body.style.overflow).toBe("hidden");
    });

    studioOverlay.remove();
  });
});
