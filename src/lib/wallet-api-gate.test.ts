import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const walletLedgerMock = vi.hoisted(() => ({
  captureWalletReservation: vi.fn(),
  getWalletAccount: vi.fn(),
  recordPendingWalletCapture: vi.fn(),
  releaseWalletReservation: vi.fn(),
  reserveWalletAmount: vi.fn(),
}));

const billingNotificationsMock = vi.hoisted(() => ({
  billingNotificationsMode: vi.fn(),
  notifyLowWalletBalance: vi.fn(),
  notifyWalletOperationBlocked: vi.fn(),
  walletLowBalanceThresholdMicros: vi.fn(),
}));

const spendControlsMock = vi.hoisted(() => ({
  checkAndRecordSpendControl: vi.fn(),
  releaseSpendControl: vi.fn(),
}));

vi.mock("@/lib/wallet-ledger", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wallet-ledger")>("@/lib/wallet-ledger");
  return {
    ...actual,
    captureWalletReservation: walletLedgerMock.captureWalletReservation,
    getWalletAccount: walletLedgerMock.getWalletAccount,
    recordPendingWalletCapture: walletLedgerMock.recordPendingWalletCapture,
    releaseWalletReservation: walletLedgerMock.releaseWalletReservation,
    reserveWalletAmount: walletLedgerMock.reserveWalletAmount,
  };
});

vi.mock("@/lib/billing-notifications", () => ({
  billingNotificationsMode: billingNotificationsMock.billingNotificationsMode,
  notifyLowWalletBalance: billingNotificationsMock.notifyLowWalletBalance,
  notifyWalletOperationBlocked: billingNotificationsMock.notifyWalletOperationBlocked,
  walletLowBalanceThresholdMicros: billingNotificationsMock.walletLowBalanceThresholdMicros,
}));

vi.mock("@/lib/spend-controls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/spend-controls")>("@/lib/spend-controls");
  return {
    ...actual,
    checkAndRecordSpendControl: spendControlsMock.checkAndRecordSpendControl,
    releaseSpendControl: spendControlsMock.releaseSpendControl,
  };
});

import {
  reserveApiWalletCharge,
  reserveUsdToMicros,
  usdToMicros,
  walletGateErrorResponse,
  walletGateMode,
} from "./wallet-api-gate";
import { WalletInsufficientFundsError } from "./wallet-ledger";
import { SpendControlLimitExceededError } from "./spend-controls";

describe("wallet-api-gate", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.FOLDDER_WALLET_DDB_TABLE;
    delete process.env.FOLDDER_WALLET_GATE_ENABLED;
    delete process.env.FOLDDER_WALLET_GATE_MODE;
    delete process.env.FOLDDER_SAAS_MODE;
    walletLedgerMock.captureWalletReservation.mockReset();
    walletLedgerMock.getWalletAccount.mockReset();
    walletLedgerMock.recordPendingWalletCapture.mockReset();
    walletLedgerMock.releaseWalletReservation.mockReset();
    walletLedgerMock.reserveWalletAmount.mockReset();
    billingNotificationsMock.billingNotificationsMode.mockReset();
    billingNotificationsMock.billingNotificationsMode.mockReturnValue("off");
    billingNotificationsMock.notifyLowWalletBalance.mockReset();
    billingNotificationsMock.notifyLowWalletBalance.mockResolvedValue(null);
    billingNotificationsMock.notifyWalletOperationBlocked.mockReset();
    billingNotificationsMock.notifyWalletOperationBlocked.mockResolvedValue(null);
    billingNotificationsMock.walletLowBalanceThresholdMicros.mockReset();
    billingNotificationsMock.walletLowBalanceThresholdMicros.mockReturnValue(2_000_000);
    spendControlsMock.checkAndRecordSpendControl.mockReset();
    spendControlsMock.releaseSpendControl.mockReset();
    spendControlsMock.checkAndRecordSpendControl.mockResolvedValue({
      mode: "off",
      operationId: "spend_ok",
      amountMicros: 0,
      provider: "openai",
      accountId: "acct_test",
      duplicate: false,
      wouldBlock: false,
    });
    spendControlsMock.releaseSpendControl.mockResolvedValue({
      mode: "enforce",
      released: true,
      duplicate: false,
    });
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("stays off by default when no wallet table is configured", async () => {
    expect(walletGateMode()).toBe("off");
    const charge = await reserveApiWalletCharge({
      userEmail: "creator@example.com",
      serviceId: "openai-enhance",
      provider: "openai",
      route: "/api/openai/enhance",
      maxCostMicros: 10_000,
    });

    expect(charge).toBeNull();
    expect(walletLedgerMock.reserveWalletAmount).not.toHaveBeenCalled();
  });

  it("reserves in enforce mode and captures actual cost", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_1",
    });
    walletLedgerMock.captureWalletReservation.mockResolvedValue({});

    const req = new Request("https://foldder.test/api/openai/enhance", {
      headers: { "x-foldder-operation-id": "op_123" },
    });
    const charge = await reserveApiWalletCharge({
      req,
      userEmail: "Creator@Example.com",
      serviceId: "openai-enhance",
      provider: "openai",
      route: "/api/openai/enhance",
      maxCostMicros: 20_000,
    });

    expect(charge?.reservationId).toBe("rsv_1");
    expect(walletLedgerMock.reserveWalletAmount).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 20_000,
        operationId: "/api/openai/enhance:op_123:reserve",
        userEmail: "creator@example.com",
      }),
    );
    expect(spendControlsMock.checkAndRecordSpendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 20_000,
        operationId: "/api/openai/enhance:op_123:spend-control",
        provider: "openai",
        route: "/api/openai/enhance",
        userEmail: "creator@example.com",
      }),
    );

    await charge?.capture({ actualCostMicros: 12_345 });
    expect(walletLedgerMock.captureWalletReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMicros: 12_345,
        operationId: "/api/openai/enhance:op_123:capture",
        reservationId: "rsv_1",
      }),
    );
    expect(spendControlsMock.releaseSpendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 7_655,
        operationId: "/api/openai/enhance:op_123:spend-control",
        releaseOperationId: "/api/openai/enhance:op_123:spend-control:release-capture-remainder",
        reason: "capture_remainder",
        userEmail: "creator@example.com",
      }),
    );
  });

  it("notifies low balance after a successful capture crosses the threshold", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    billingNotificationsMock.billingNotificationsMode.mockReturnValue("log");
    billingNotificationsMock.walletLowBalanceThresholdMicros.mockReturnValue(2_000_000);
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_low",
    });
    walletLedgerMock.captureWalletReservation.mockResolvedValue({});
    walletLedgerMock.getWalletAccount.mockResolvedValue({
      availableMicros: 1_250_000,
    });

    const charge = await reserveApiWalletCharge({
      userEmail: "creator@example.com",
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 50_000,
      operationId: "img_low",
    });

    await charge?.capture({ actualCostMicros: 42_000 });

    expect(billingNotificationsMock.notifyLowWalletBalance).toHaveBeenCalledWith({
      userEmail: "creator@example.com",
      availableMicros: 1_250_000,
      thresholdMicros: 2_000_000,
      operationId: "img_low:capture",
    });
  });

  it("notifies blocked operations when the wallet reserve fails for insufficient funds", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    billingNotificationsMock.billingNotificationsMode.mockReturnValue("log");
    walletLedgerMock.reserveWalletAmount.mockRejectedValue(new WalletInsufficientFundsError(80_000));
    walletLedgerMock.getWalletAccount.mockResolvedValue({
      availableMicros: 10_000,
    });

    await expect(
      reserveApiWalletCharge({
        userEmail: "creator@example.com",
        serviceId: "openai-enhance",
        provider: "openai",
        route: "/api/openai/enhance",
        maxCostMicros: 80_000,
        operationId: "blocked_low",
      }),
    ).rejects.toBeInstanceOf(WalletInsufficientFundsError);

    expect(billingNotificationsMock.notifyWalletOperationBlocked).toHaveBeenCalledWith({
      userEmail: "creator@example.com",
      availableMicros: 10_000,
      requiredMicros: 80_000,
      route: "/api/openai/enhance",
      operationId: "blocked_low",
    });
  });

  it("clamps capture to the reserved maximum and marks underreserved micros", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_2",
    });
    walletLedgerMock.captureWalletReservation.mockResolvedValue({});

    const charge = await reserveApiWalletCharge({
      userEmail: "creator@example.com",
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 50_000,
      operationId: "img_1",
    });

    await charge?.capture({ actualCostMicros: 75_000 });
    expect(walletLedgerMock.captureWalletReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMicros: 50_000,
        metadata: expect.objectContaining({
          actualCostMicros: 75_000,
          underreservedMicros: 25_000,
        }),
      }),
    );
  });

  it("records a pending capture when final capture fails after provider success", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const captureError = new Error("dynamo temporarily unavailable");
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_pending",
    });
    walletLedgerMock.captureWalletReservation.mockRejectedValue(captureError);
    walletLedgerMock.recordPendingWalletCapture.mockResolvedValue({});

    const charge = await reserveApiWalletCharge({
      userEmail: "creator@example.com",
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 50_000,
      operationId: "img_pending",
    });

    await expect(charge?.capture({ actualCostMicros: 42_000 })).resolves.toBeUndefined();
    expect(walletLedgerMock.recordPendingWalletCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMicros: 42_000,
        operationId: "img_pending:capture",
        reservationId: "rsv_pending",
        userEmail: "creator@example.com",
      }),
    );
    consoleError.mockRestore();
  });

  it("releases wallet reservations when spend controls deny the operation", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    const error = new SpendControlLimitExceededError("account_hour", 10_000, 20_000, "openai");
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_blocked",
    });
    walletLedgerMock.releaseWalletReservation.mockResolvedValue({});
    spendControlsMock.checkAndRecordSpendControl.mockRejectedValue(error);

    await expect(
      reserveApiWalletCharge({
        userEmail: "creator@example.com",
        serviceId: "openai-enhance",
        provider: "openai",
        route: "/api/openai/enhance",
        maxCostMicros: 20_000,
        operationId: "blocked_op",
      }),
    ).rejects.toBe(error);

    expect(walletLedgerMock.releaseWalletReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "rsv_blocked",
        operationId: "blocked_op:release-spend-control-denied",
        reason: "spend_control_denied",
      }),
    );
    expect(walletLedgerMock.captureWalletReservation).not.toHaveBeenCalled();
    expect(spendControlsMock.releaseSpendControl).not.toHaveBeenCalled();
  });

  it("releases spend counters when a provider error releases the wallet reservation", async () => {
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-test";
    walletLedgerMock.reserveWalletAmount.mockResolvedValue({
      duplicate: false,
      reservationId: "rsv_release",
    });
    walletLedgerMock.releaseWalletReservation.mockResolvedValue({});

    const charge = await reserveApiWalletCharge({
      userEmail: "creator@example.com",
      serviceId: "openai-enhance",
      provider: "openai",
      route: "/api/openai/enhance",
      maxCostMicros: 20_000,
      operationId: "release_op",
    });

    await charge?.release({ reason: "provider_create_error" });

    expect(walletLedgerMock.releaseWalletReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "release_op:release",
        reason: "provider_create_error",
        reservationId: "rsv_release",
      }),
    );
    expect(spendControlsMock.releaseSpendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 20_000,
        operationId: "release_op:spend-control",
        releaseOperationId: "release_op:spend-control:release",
        reason: "provider_create_error",
      }),
    );
  });

  it("maps insufficient funds to HTTP 402", async () => {
    const response = walletGateErrorResponse(new WalletInsufficientFundsError(123_000));
    expect(response?.status).toBe(402);
    await expect(response?.json()).resolves.toMatchObject({
      code: "insufficient_balance",
      amountMicros: 123_000,
    });
  });

  it("maps spend limit denials to HTTP 429", async () => {
    const response = walletGateErrorResponse(
      new SpendControlLimitExceededError("provider_day", 1_000_000, 2_000_000, "gemini"),
    );
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      code: "spend_limit_exceeded",
      windowKind: "provider_day",
      provider: "gemini",
    });
  });

  it("converts USD estimates to reservation micros with a safety multiplier", () => {
    expect(usdToMicros(0.001001)).toBe(1001);
    expect(reserveUsdToMicros(0.01, { multiplier: 1.5 })).toBe(15_000);
    expect(reserveUsdToMicros(0.0000001)).toBe(1_000);
  });
});
