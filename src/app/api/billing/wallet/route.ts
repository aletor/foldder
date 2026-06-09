import { NextRequest, NextResponse } from "next/server";
import { requireSpacesAuthUser } from "@/lib/spaces-access-control";
import { walletLowBalanceThresholdMicros } from "@/lib/billing-notifications";
import {
  allowedStripeTopupCents,
  walletCreditMicrosFromCents,
} from "@/lib/stripe-billing";
import {
  WalletConfigurationError,
  getWalletAccount,
  listWalletLedgerEntriesForAccount,
  type WalletLedgerEntry,
} from "@/lib/wallet-ledger";

export const runtime = "nodejs";

function sanitizeLedgerEntry(entry: WalletLedgerEntry) {
  return {
    entryId: entry.entryId,
    type: entry.type,
    amountMicros: entry.amountMicros,
    balanceDeltaMicros: entry.balanceDeltaMicros,
    reservedDeltaMicros: entry.reservedDeltaMicros,
    availableDeltaMicros: entry.availableDeltaMicros,
    serviceId: entry.serviceId,
    provider: entry.provider,
    route: entry.route,
    createdAt: entry.createdAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authState = await requireSpacesAuthUser(req);
    if (!authState.ok) return authState.response;
    const limitRaw = Number(new URL(req.url).searchParams.get("limit") || 20);
    const limit = Math.max(1, Math.min(Math.round(limitRaw), 50));
    const [account, ledger] = await Promise.all([
      getWalletAccount(authState.user.email),
      listWalletLedgerEntriesForAccount(authState.user.email, { limit }),
    ]);
    const thresholdMicros = walletLowBalanceThresholdMicros();

    return NextResponse.json({
      configured: true,
      account: {
        status: account.status,
        currency: account.currency,
        balanceMicros: account.balanceMicros,
        reservedMicros: account.reservedMicros,
        availableMicros: account.availableMicros,
        lowBalanceThresholdMicros: thresholdMicros,
        lowBalance: account.availableMicros <= thresholdMicros,
        billingReviewRequired: account.billingReviewRequired === true,
        billingReviewReason: account.billingReviewReason,
        billingReviewUpdatedAt: account.billingReviewUpdatedAt,
        updatedAt: account.updatedAt,
      },
      recentEntries: ledger.entries.map(sanitizeLedgerEntry),
      recentEntriesTruncated: ledger.truncated,
      topupPackages: allowedStripeTopupCents().map((amountCents) => ({
        amountCents,
        creditMicros: walletCreditMicrosFromCents(amountCents),
      })),
    });
  } catch (error) {
    if (error instanceof WalletConfigurationError) {
      return NextResponse.json({
        configured: false,
        account: null,
        recentEntries: [],
        recentEntriesTruncated: false,
        topupPackages: allowedStripeTopupCents().map((amountCents) => ({
          amountCents,
          creditMicros: walletCreditMicrosFromCents(amountCents),
        })),
      });
    }
    console.error("[billing/wallet]", error);
    return NextResponse.json({ error: "wallet_status_failed" }, { status: 500 });
  }
}
