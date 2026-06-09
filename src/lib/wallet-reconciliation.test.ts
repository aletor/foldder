import { beforeEach, describe, expect, it, vi } from "vitest";

const apiUsageMock = vi.hoisted(() => ({
  inferServiceIdFromRecord: vi.fn((record: { serviceId?: string }) => record.serviceId || "unknown-ai"),
  readUsageRecordsSince: vi.fn(),
}));

const walletLedgerMock = vi.hoisted(() => ({
  listExpiredWalletReservations: vi.fn(),
  listPendingWalletCaptures: vi.fn(),
  releaseExpiredWalletReservations: vi.fn(),
  retryPendingWalletCaptures: vi.fn(),
  scanWalletAccounts: vi.fn(),
  scanWalletLedgerEntries: vi.fn(),
}));

vi.mock("@/lib/api-usage", () => ({
  inferServiceIdFromRecord: apiUsageMock.inferServiceIdFromRecord,
  readUsageRecordsSince: apiUsageMock.readUsageRecordsSince,
}));

vi.mock("@/lib/wallet-ledger", () => ({
  listExpiredWalletReservations: walletLedgerMock.listExpiredWalletReservations,
  listPendingWalletCaptures: walletLedgerMock.listPendingWalletCaptures,
  releaseExpiredWalletReservations: walletLedgerMock.releaseExpiredWalletReservations,
  retryPendingWalletCaptures: walletLedgerMock.retryPendingWalletCaptures,
  scanWalletAccounts: walletLedgerMock.scanWalletAccounts,
  scanWalletLedgerEntries: walletLedgerMock.scanWalletLedgerEntries,
}));

import { reconcileWallet } from "./wallet-reconciliation";

describe("wallet-reconciliation", () => {
  beforeEach(() => {
    apiUsageMock.inferServiceIdFromRecord.mockClear();
    apiUsageMock.readUsageRecordsSince.mockReset();
    walletLedgerMock.listExpiredWalletReservations.mockReset();
    walletLedgerMock.listPendingWalletCaptures.mockReset();
    walletLedgerMock.releaseExpiredWalletReservations.mockReset();
    walletLedgerMock.retryPendingWalletCaptures.mockReset();
    walletLedgerMock.scanWalletAccounts.mockReset();
    walletLedgerMock.scanWalletLedgerEntries.mockReset();

    apiUsageMock.readUsageRecordsSince.mockResolvedValue([
      {
        ts: "2026-06-09T10:00:00.000Z",
        provider: "gemini",
        userEmail: "creator@example.com",
        serviceId: "gemini-nano",
        route: "/api/gemini/generate",
        costUsd: 0.012,
      },
    ]);
    walletLedgerMock.scanWalletLedgerEntries.mockResolvedValue({
      limit: 5_000,
      scanned: 2,
      truncated: false,
      entries: [
        {
          entryId: "led_capture",
          type: "capture",
          accountId: "acct_1",
          userEmail: "creator@example.com",
          currency: "usd",
          amountMicros: 10_000,
          balanceDeltaMicros: -10_000,
          reservedDeltaMicros: -10_000,
          availableDeltaMicros: 0,
          reservationId: "rsv_1",
          serviceId: "gemini-nano",
          provider: "gemini",
          route: "/api/gemini/generate",
          operationId: "op_1:capture",
          createdAt: "2026-06-09T10:00:01.000Z",
          metadata: { underreservedMicros: 2_000 },
        },
      ],
    });
    walletLedgerMock.scanWalletAccounts.mockResolvedValue({
      limit: 5_000,
      scanned: 1,
      truncated: false,
      accounts: [
        {
          accountId: "acct_1",
          userEmail: "creator@example.com",
          currency: "usd",
          status: "active",
          balanceMicros: -1,
          reservedMicros: 0,
          availableMicros: -1,
          createdAt: "2026-06-09T09:00:00.000Z",
          updatedAt: "2026-06-09T10:00:00.000Z",
        },
      ],
    });
    walletLedgerMock.listPendingWalletCaptures.mockResolvedValue([
      {
        accountId: "acct_1",
        userEmail: "creator@example.com",
        reservationId: "rsv_pending",
        captureMicros: 5_000,
        operationId: "op_pending:capture",
        status: "open",
        attemptCount: 0,
        createdAt: "2026-06-09T10:00:00.000Z",
        updatedAt: "2026-06-09T10:00:00.000Z",
        nextAttemptAt: "2026-06-09T10:05:00.000Z",
      },
    ]);
    walletLedgerMock.listExpiredWalletReservations.mockResolvedValue([
      {
        accountId: "acct_1",
        userEmail: "creator@example.com",
        reservationId: "rsv_expired",
        status: "reserved",
        amountMicros: 7_000,
        capturedMicros: 0,
        releasedMicros: 0,
        createdAt: "2026-06-09T09:00:00.000Z",
        updatedAt: "2026-06-09T09:00:00.000Z",
        expiresAt: "2026-06-09T09:30:00.000Z",
      },
    ]);
    walletLedgerMock.retryPendingWalletCaptures.mockResolvedValue({
      dryRun: false,
      checked: 1,
      captured: 1,
      postponed: 0,
      failed: 0,
      pendingCaptures: [],
    });
    walletLedgerMock.releaseExpiredWalletReservations.mockResolvedValue({
      dryRun: false,
      checked: 1,
      released: 1,
      skipped: 0,
      failed: 0,
      reservations: [],
    });
  });

  it("reports critical money drift and operational repair candidates in dry-run", async () => {
    const report = await reconcileWallet({
      dryRun: true,
      sinceIso: "2026-06-09T00:00:00.000Z",
      nowIso: "2026-06-09T11:00:00.000Z",
      toleranceMicros: 500,
    });

    expect(report.ok).toBe(false);
    expect(report.totals).toMatchObject({
      usageCostMicros: 12_000,
      walletCapturedMicros: 10_000,
      pendingCaptureMicros: 5_000,
      expiredReservationMicros: 7_000,
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "usage_without_wallet_capture",
        "pending_captures",
        "expired_reservations",
        "negative_wallet_account",
        "underreserved_capture",
      ]),
    );
    expect(walletLedgerMock.retryPendingWalletCaptures).not.toHaveBeenCalled();
    expect(walletLedgerMock.releaseExpiredWalletReservations).not.toHaveBeenCalled();
  });

  it("runs only idempotent repairs when dryRun is false", async () => {
    const report = await reconcileWallet({
      dryRun: false,
      sinceIso: "2026-06-09T00:00:00.000Z",
      nowIso: "2026-06-09T11:00:00.000Z",
      maintenanceLimit: 25,
    });

    expect(walletLedgerMock.retryPendingWalletCaptures).toHaveBeenCalledWith({
      limit: 25,
      nowIso: "2026-06-09T11:00:00.000Z",
    });
    expect(walletLedgerMock.releaseExpiredWalletReservations).toHaveBeenCalledWith({
      limit: 25,
      nowIso: "2026-06-09T11:00:00.000Z",
    });
    expect(report.repairs).toMatchObject({
      pendingCaptures: { captured: 1 },
      expiredReservations: { released: 1 },
    });
  });
});
