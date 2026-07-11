"use client";

import { readPaymentWarningsEnabled } from "@/lib/wallet-payment-warnings-preference";

export const FOLDDER_WALLET_OPEN_EVENT = "foldder:wallet-open";
export const FOLDDER_WALLET_REFRESH_EVENT = "foldder:wallet-refresh";
export const FOLDDER_WALLET_COST_DECISION_EVENT = "foldder:wallet-cost-decision";

export type WalletStatusResponse = {
  configured: boolean;
  account: null | {
    status: "active" | "blocked";
    currency: "usd";
    balanceMicros: number;
    reservedMicros: number;
    availableMicros: number;
    lowBalanceThresholdMicros: number;
    lowBalance: boolean;
    billingReviewRequired: boolean;
    billingReviewReason?: string;
    billingReviewUpdatedAt?: string;
    updatedAt: string;
  };
  recentEntries: Array<{
    entryId: string;
    type: "purchase" | "reserve" | "capture" | "release" | "refund" | "adjustment" | "grant";
    amountMicros: number;
    balanceDeltaMicros: number;
    reservedDeltaMicros: number;
    availableDeltaMicros: number;
    reservationId?: string;
    serviceId?: string;
    provider?: string;
    route?: string;
    createdAt: string;
  }>;
  recentEntriesTruncated: boolean;
  topupPackages: Array<{ amountCents: number; creditMicros: number }>;
};

export type WalletCostDecisionTone = "quiet" | "confirm" | "strong";

export type WalletCostDecisionRequest = {
  id: string;
  label: string;
  route: string;
  category: "text" | "image" | "video" | "analysis" | "utility";
  estimatedCostMicros: number;
  reserveMicros: number;
  tone: WalletCostDecisionTone;
  wallet: WalletStatusResponse;
  /** Líneas de desglose (p. ej. varias llamadas IA en ingesta BrandKit). */
  detailLines?: string[];
};

export type WalletCostDecisionResult = {
  allowed: boolean;
  reason: "approved" | "cancelled" | "insufficient_balance" | "wallet_not_configured";
};

export type WalletCostDecisionEventDetail = {
  request: WalletCostDecisionRequest;
  handled: boolean;
  resolve: (result: WalletCostDecisionResult) => void;
};

export function dispatchWalletOpen(reason?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FOLDDER_WALLET_OPEN_EVENT, {
      detail: { reason },
    }),
  );
}

export function dispatchWalletRefresh(reason?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(FOLDDER_WALLET_REFRESH_EVENT, {
      detail: { reason },
    }),
  );
}

export async function requestWalletCostDecision(
  request: WalletCostDecisionRequest,
): Promise<WalletCostDecisionResult> {
  if (typeof window === "undefined") return { allowed: true, reason: "approved" };

  const available = request.wallet.account?.availableMicros ?? 0;
  const blocked =
    request.wallet.account?.status === "blocked" ||
    request.wallet.account?.billingReviewRequired === true;
  const insufficient = request.wallet.configured && available < request.reserveMicros;

  if (!readPaymentWarningsEnabled()) {
    if (blocked || insufficient) {
      if (insufficient) dispatchWalletOpen("insufficient_balance");
      return {
        allowed: false,
        reason: insufficient ? "insufficient_balance" : "cancelled",
      };
    }
    return { allowed: true, reason: "approved" };
  }

  return new Promise<WalletCostDecisionResult>((resolve) => {
    const detail: WalletCostDecisionEventDetail = {
      request,
      handled: false,
      resolve,
    };
    window.dispatchEvent(new CustomEvent(FOLDDER_WALLET_COST_DECISION_EVENT, { detail }));
    if (detail.handled) return;

    const available = request.wallet.account?.availableMicros ?? 0;
    if (request.wallet.configured && available < request.reserveMicros) {
      dispatchWalletOpen("insufficient_balance");
      resolve({ allowed: false, reason: "insufficient_balance" });
      return;
    }
    if (request.tone === "strong") {
      const ok = window.confirm(
        `${request.label}\nReserva máxima: ${formatUsdForFallback(request.reserveMicros)}\nSaldo disponible: ${formatUsdForFallback(available)}`,
      );
      resolve({ allowed: ok, reason: ok ? "approved" : "cancelled" });
      return;
    }
    resolve({ allowed: true, reason: "approved" });
  });
}

function formatUsdForFallback(micros: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(micros) ? micros : 0) / 1_000_000);
}
