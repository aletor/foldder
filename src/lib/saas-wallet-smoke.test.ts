import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const walletSmoke = vi.hoisted(() => {
  type Account = {
    accountId: string;
    userEmail: string;
    balanceMicros: number;
    reservedMicros: number;
    availableMicros: number;
    status: "active" | "blocked";
    createdAt: string;
    updatedAt: string;
  };

  type Reservation = {
    accountId: string;
    userEmail: string;
    reservationId: string;
    amountMicros: number;
    capturedMicros: number;
    releasedMicros: number;
    status: "reserved" | "captured" | "released";
    provider?: string;
    route?: string;
    serviceId?: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
  };

  type ProviderJobLink = {
    provider: string;
    providerJobId: string;
    accountId: string;
    userEmail: string;
    reservationId: string;
    reservedMicros: number;
    serviceId?: string;
    route?: string;
    operationId: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };

  type LedgerEntry = {
    type: string;
    userEmail: string;
    amountMicros: number;
    operationId: string;
    reservationId?: string;
  };

  class WalletConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "WalletConfigurationError";
    }
  }

  class WalletValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "WalletValidationError";
    }
  }

  class WalletInsufficientFundsError extends Error {
    constructor(
      public amountMicros: number,
      message = "Saldo insuficiente para reservar la operacion.",
    ) {
      super(message);
      this.name = "WalletInsufficientFundsError";
    }
  }

  class WalletReservationStateError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "WalletReservationStateError";
    }
  }

  const accounts = new Map<string, Account>();
  const reservations = new Map<string, Reservation>();
  const operations = new Map<string, Record<string, unknown>>();
  const providerJobLinks = new Map<string, ProviderJobLink>();
  const pendingCaptures: Record<string, unknown>[] = [];
  const ledger: LedgerEntry[] = [];
  let reservationSequence = 0;

  function normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      throw new WalletValidationError("Wallet user email is required.");
    }
    return normalized;
  }

  function walletAccountIdForEmail(email: string): string {
    const normalized = normalizeEmail(email);
    return `acct_${normalized.replace(/[^a-z0-9]/g, "_").slice(0, 32)}`;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function assertPositiveMicros(amountMicros: number, label: string): number {
    const amount = Math.ceil(amountMicros);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new WalletValidationError(`${label} must be a positive safe integer.`);
    }
    return amount;
  }

  function accountFor(userEmail: string): Account {
    const normalizedEmail = normalizeEmail(userEmail);
    const accountId = walletAccountIdForEmail(normalizedEmail);
    const existing = accounts.get(normalizedEmail);
    if (existing) return existing;

    const createdAt = nowIso();
    const account: Account = {
      accountId,
      userEmail: normalizedEmail,
      balanceMicros: 0,
      reservedMicros: 0,
      availableMicros: 0,
      status: "active",
      createdAt,
      updatedAt: createdAt,
    };
    accounts.set(normalizedEmail, account);
    return account;
  }

  function snapshot(userEmail: string) {
    const account = accountFor(userEmail);
    return {
      ...account,
      currency: "usd",
    };
  }

  function operationResult<T extends Record<string, unknown>>(operationId: string): T | null {
    return (operations.get(operationId) as T | undefined) ?? null;
  }

  function rememberOperation<T extends Record<string, unknown>>(operationId: string, result: T): T {
    operations.set(operationId, result);
    return result;
  }

  function providerJobKey(provider: string, providerJobId: string): string {
    return `${provider}:${providerJobId}`;
  }

  return {
    WalletConfigurationError,
    WalletInsufficientFundsError,
    WalletReservationStateError,
    WalletValidationError,
    pendingCaptures,
    ledger,
    reset: () => {
      accounts.clear();
      reservations.clear();
      operations.clear();
      providerJobLinks.clear();
      pendingCaptures.length = 0;
      ledger.length = 0;
      reservationSequence = 0;
    },
    account: (userEmail: string) => snapshot(userEmail),
    walletAccountIdForEmail,
    getWalletAccount: async (userEmail: string) => snapshot(userEmail),
    creditWalletBalance: async (input: {
      userEmail: string;
      amountMicros: number;
      operationId: string;
      type: string;
    }) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const amountMicros = assertPositiveMicros(input.amountMicros, "amountMicros");
      const account = accountFor(input.userEmail);
      account.balanceMicros += amountMicros;
      account.availableMicros += amountMicros;
      account.updatedAt = nowIso();

      ledger.push({
        type: input.type,
        userEmail: account.userEmail,
        amountMicros,
        operationId: input.operationId,
      });

      return rememberOperation(input.operationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_${ledger.length}`,
        duplicate: false,
        type: input.type,
        amountMicros,
      });
    },
    debitWalletBalance: async (input: {
      userEmail: string;
      amountMicros: number;
      operationId: string;
      type: "refund" | "adjustment";
      blockAccount?: boolean;
    }) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const amountMicros = assertPositiveMicros(input.amountMicros, "amountMicros");
      const account = accountFor(input.userEmail);
      account.balanceMicros -= amountMicros;
      account.availableMicros -= amountMicros;
      if (input.blockAccount) account.status = "blocked";
      account.updatedAt = nowIso();

      ledger.push({
        type: input.type,
        userEmail: account.userEmail,
        amountMicros,
        operationId: input.operationId,
      });

      return rememberOperation(input.operationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_${ledger.length}`,
        duplicate: false,
        type: input.type,
        amountMicros,
        accountFlagged: true,
        accountBlocked: input.blockAccount === true,
      });
    },
    reserveWalletAmount: async (input: {
      userEmail: string;
      amountMicros: number;
      operationId: string;
      provider?: string;
      route?: string;
      serviceId?: string;
      expiresAt?: string;
    }) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const amountMicros = assertPositiveMicros(input.amountMicros, "amountMicros");
      const account = accountFor(input.userEmail);
      if (account.status !== "active") {
        throw new WalletConfigurationError("Wallet account is blocked.");
      }
      if (account.availableMicros < amountMicros) {
        throw new WalletInsufficientFundsError(amountMicros);
      }

      const reservationId = `rsv_smoke_${++reservationSequence}`;
      const createdAt = nowIso();
      account.availableMicros -= amountMicros;
      account.reservedMicros += amountMicros;
      account.updatedAt = createdAt;
      reservations.set(reservationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        reservationId,
        amountMicros,
        capturedMicros: 0,
        releasedMicros: 0,
        status: "reserved",
        provider: input.provider,
        route: input.route,
        serviceId: input.serviceId,
        createdAt,
        updatedAt: createdAt,
        expiresAt: input.expiresAt,
      });
      ledger.push({
        type: "reserve",
        userEmail: account.userEmail,
        amountMicros,
        operationId: input.operationId,
        reservationId,
      });

      return rememberOperation(input.operationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_${ledger.length}`,
        duplicate: false,
        type: "reserve",
        reservationId,
        amountMicros,
      });
    },
    captureWalletReservation: async (input: {
      userEmail: string;
      reservationId: string;
      captureMicros: number;
      operationId: string;
    }) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const captureMicros = assertPositiveMicros(input.captureMicros, "captureMicros");
      const reservation = reservations.get(input.reservationId);
      if (!reservation || reservation.status !== "reserved") {
        throw new WalletReservationStateError("Reservation is not open.");
      }
      if (captureMicros > reservation.amountMicros) {
        throw new WalletValidationError("captureMicros cannot exceed the reserved amount.");
      }

      const account = accountFor(input.userEmail);
      const releasedMicros = reservation.amountMicros - captureMicros;
      account.balanceMicros -= captureMicros;
      account.reservedMicros -= reservation.amountMicros;
      account.availableMicros += releasedMicros;
      account.updatedAt = nowIso();
      reservation.status = "captured";
      reservation.capturedMicros = captureMicros;
      reservation.releasedMicros = releasedMicros;
      reservation.updatedAt = account.updatedAt;
      ledger.push({
        type: "capture",
        userEmail: account.userEmail,
        amountMicros: captureMicros,
        operationId: input.operationId,
        reservationId: input.reservationId,
      });

      return rememberOperation(input.operationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_${ledger.length}`,
        duplicate: false,
        type: "capture",
        reservationId: input.reservationId,
        reservedMicros: reservation.amountMicros,
        capturedMicros: captureMicros,
        releasedMicros,
      });
    },
    releaseWalletReservation: async (input: {
      userEmail: string;
      reservationId: string;
      operationId: string;
      reason?: string;
    }) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const reservation = reservations.get(input.reservationId);
      if (!reservation || reservation.status !== "reserved") {
        throw new WalletReservationStateError("Reservation is not open.");
      }

      const account = accountFor(input.userEmail);
      account.reservedMicros -= reservation.amountMicros;
      account.availableMicros += reservation.amountMicros;
      account.updatedAt = nowIso();
      reservation.status = "released";
      reservation.releasedMicros = reservation.amountMicros;
      reservation.updatedAt = account.updatedAt;
      ledger.push({
        type: "release",
        userEmail: account.userEmail,
        amountMicros: reservation.amountMicros,
        operationId: input.operationId,
        reservationId: input.reservationId,
      });

      return rememberOperation(input.operationId, {
        accountId: account.accountId,
        userEmail: account.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_${ledger.length}`,
        duplicate: false,
        type: "release",
        reservationId: input.reservationId,
        releasedMicros: reservation.amountMicros,
        reason: input.reason,
      });
    },
    recordPendingWalletCapture: async (input: Record<string, unknown>) => {
      pendingCaptures.push(input);
      return input;
    },
    linkWalletReservationToProviderJob: async (input: ProviderJobLink) => {
      const existing = operationResult(input.operationId);
      if (existing) return { ...existing, duplicate: true };

      const createdAt = nowIso();
      const link = {
        ...input,
        createdAt,
        updatedAt: createdAt,
      };
      providerJobLinks.set(providerJobKey(input.provider, input.providerJobId), link);
      return rememberOperation(input.operationId, {
        accountId: input.accountId,
        userEmail: input.userEmail,
        operationId: input.operationId,
        ledgerEntryId: `led_link_${providerJobLinks.size}`,
        duplicate: false,
      });
    },
    readWalletReservationForProviderJob: async (input: { provider: string; providerJobId: string }) =>
      providerJobLinks.get(providerJobKey(input.provider, input.providerJobId)) ?? null,
  };
});

const billingNotificationsMock = vi.hoisted(() => ({
  billingNotificationsMode: vi.fn(() => "off"),
  notifyBillingReviewRequired: vi.fn(),
  notifyLowWalletBalance: vi.fn(),
  notifyWalletOperationBlocked: vi.fn(),
  notifyWalletTopupConfirmed: vi.fn(),
  walletLowBalanceThresholdMicros: vi.fn(() => 2_000_000),
}));

const spendControlsMock = vi.hoisted(() => {
  class SpendControlConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SpendControlConfigurationError";
    }
  }

  class SpendControlLimitExceededError extends Error {
    constructor(
      public windowKind: string,
      public limitMicros: number,
      public amountMicros: number,
      public provider: string,
    ) {
      super(`Spend limit exceeded for ${windowKind}.`);
      this.name = "SpendControlLimitExceededError";
    }
  }

  class SpendControlProviderDisabledError extends Error {
    constructor(public provider: string) {
      super(`Provider disabled by spend controls: ${provider}`);
      this.name = "SpendControlProviderDisabledError";
    }
  }

  return {
    SpendControlConfigurationError,
    SpendControlLimitExceededError,
    SpendControlProviderDisabledError,
    checkAndRecordSpendControl: vi.fn(),
    releaseSpendControl: vi.fn(),
  };
});

vi.mock("@/lib/wallet-ledger", () => ({
  WALLET_CURRENCY: "usd",
  WALLET_DDB_TABLE_ENV: "FOLDDER_WALLET_DDB_TABLE",
  WALLET_DDB_WORK_GSI_ENV: "FOLDDER_WALLET_DDB_WORK_GSI",
  WalletConfigurationError: walletSmoke.WalletConfigurationError,
  WalletInsufficientFundsError: walletSmoke.WalletInsufficientFundsError,
  WalletReservationStateError: walletSmoke.WalletReservationStateError,
  WalletValidationError: walletSmoke.WalletValidationError,
  captureWalletReservation: walletSmoke.captureWalletReservation,
  creditWalletBalance: walletSmoke.creditWalletBalance,
  debitWalletBalance: walletSmoke.debitWalletBalance,
  getWalletAccount: walletSmoke.getWalletAccount,
  linkWalletReservationToProviderJob: walletSmoke.linkWalletReservationToProviderJob,
  readWalletReservationForProviderJob: walletSmoke.readWalletReservationForProviderJob,
  recordPendingWalletCapture: walletSmoke.recordPendingWalletCapture,
  releaseWalletReservation: walletSmoke.releaseWalletReservation,
  reserveWalletAmount: walletSmoke.reserveWalletAmount,
  walletAccountIdForEmail: walletSmoke.walletAccountIdForEmail,
}));

vi.mock("@/lib/billing-notifications", () => ({
  billingNotificationsMode: billingNotificationsMock.billingNotificationsMode,
  notifyBillingReviewRequired: billingNotificationsMock.notifyBillingReviewRequired,
  notifyLowWalletBalance: billingNotificationsMock.notifyLowWalletBalance,
  notifyWalletOperationBlocked: billingNotificationsMock.notifyWalletOperationBlocked,
  notifyWalletTopupConfirmed: billingNotificationsMock.notifyWalletTopupConfirmed,
  walletLowBalanceThresholdMicros: billingNotificationsMock.walletLowBalanceThresholdMicros,
}));

vi.mock("@/lib/spend-controls", () => ({
  SpendControlConfigurationError: spendControlsMock.SpendControlConfigurationError,
  SpendControlLimitExceededError: spendControlsMock.SpendControlLimitExceededError,
  SpendControlProviderDisabledError: spendControlsMock.SpendControlProviderDisabledError,
  checkAndRecordSpendControl: spendControlsMock.checkAndRecordSpendControl,
  releaseSpendControl: spendControlsMock.releaseSpendControl,
}));

import { creditWalletFromCheckoutSession } from "./stripe-billing";
import {
  linkApiWalletChargeToProviderJob,
  reserveApiWalletCharge,
  reserveUsdToMicros,
  settleProviderJobWalletCharge,
  walletGateErrorResponse,
} from "./wallet-api-gate";
import { WalletInsufficientFundsError } from "./wallet-ledger";

function paidTopupSession(input: {
  amountCents?: number;
  customerEmail?: string;
  id?: string;
} = {}): Stripe.Checkout.Session {
  const amountCents = input.amountCents ?? 2500;
  const userEmail = input.customerEmail ?? "buyer@example.com";
  return {
    id: input.id ?? "cs_smoke_25",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_subtotal: amountCents,
    amount_total: Math.ceil(amountCents * 1.21),
    currency: "usd",
    customer_email: userEmail,
    customer_details: { email: userEmail },
    metadata: {
      foldderPurpose: "wallet_topup",
      userEmail,
      walletCreditMicros: String(amountCents * 10_000),
      amountCents: String(amountCents),
      currency: "usd",
    },
    payment_intent: `pi_${input.id ?? "smoke_25"}`,
  } as Stripe.Checkout.Session;
}

async function creditWallet(input: { userEmail: string; amountCents?: number; sessionId?: string }) {
  return creditWalletFromCheckoutSession({
    eventId: `evt_${input.sessionId ?? "topup"}`,
    eventType: "checkout.session.completed",
    session: paidTopupSession({
      amountCents: input.amountCents,
      customerEmail: input.userEmail,
      id: input.sessionId,
    }),
  });
}

describe("SaaS wallet smoke flow", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    process.env.FOLDDER_WALLET_DDB_TABLE = "wallet-smoke";
    process.env.FOLDDER_WALLET_GATE_MODE = "enforce";
    process.env.FOLDDER_BILLING_NOTIFICATIONS_MODE = "off";
    process.env.FOLDDER_SPEND_CONTROLS_MODE = "off";
    walletSmoke.reset();
    billingNotificationsMock.billingNotificationsMode.mockReset();
    billingNotificationsMock.billingNotificationsMode.mockReturnValue("off");
    billingNotificationsMock.notifyBillingReviewRequired.mockReset();
    billingNotificationsMock.notifyLowWalletBalance.mockReset();
    billingNotificationsMock.notifyWalletOperationBlocked.mockReset();
    billingNotificationsMock.notifyWalletTopupConfirmed.mockReset();
    billingNotificationsMock.walletLowBalanceThresholdMicros.mockReset();
    billingNotificationsMock.walletLowBalanceThresholdMicros.mockReturnValue(2_000_000);
    spendControlsMock.checkAndRecordSpendControl.mockReset();
    spendControlsMock.checkAndRecordSpendControl.mockResolvedValue({
      mode: "off",
      operationId: "spend_smoke",
      amountMicros: 0,
      provider: "gemini",
      accountId: "acct_smoke",
      duplicate: false,
      wouldBlock: false,
    });
    spendControlsMock.releaseSpendControl.mockReset();
    spendControlsMock.releaseSpendControl.mockResolvedValue({
      mode: "off",
      operationId: "spend_smoke",
      releaseOperationId: "spend_release_smoke",
      amountMicros: 0,
      accountId: "acct_smoke",
      duplicate: false,
      released: true,
    });
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("credits a Stripe top-up once, then reserves and captures provider usage", async () => {
    const userEmail = "Creator@Example.com";
    await creditWallet({ userEmail, sessionId: "cs_smoke_topup" });
    await creditWallet({ userEmail, sessionId: "cs_smoke_topup" });

    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 25_000_000,
      reservedMicros: 0,
      availableMicros: 25_000_000,
    });
    expect(walletSmoke.ledger.filter((entry) => entry.type === "purchase")).toHaveLength(1);

    const reservedMicros = reserveUsdToMicros(0.101, { multiplier: 1.15 });
    const charge = await reserveApiWalletCharge({
      userEmail,
      serviceId: "gemini-image",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: reservedMicros,
      operationId: "smoke:image:1",
    });

    expect(charge?.reservedMicros).toBe(reservedMicros);
    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 25_000_000,
      reservedMicros,
      availableMicros: 25_000_000 - reservedMicros,
    });

    await charge?.capture({ actualCostMicros: 101_000, providerCostId: "gemini-cost-1" });

    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 24_899_000,
      reservedMicros: 0,
      availableMicros: 24_899_000,
    });
    expect(spendControlsMock.releaseSpendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: reservedMicros - 101_000,
        reason: "capture_remainder",
      }),
    );
  });

  it("releases both wallet and spend reservations when the provider fails before spending", async () => {
    const userEmail = "creator@example.com";
    await creditWallet({ userEmail, amountCents: 1000, sessionId: "cs_smoke_release" });

    const charge = await reserveApiWalletCharge({
      userEmail,
      serviceId: "gemini-nano",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 50_000,
      operationId: "smoke:text:release",
    });

    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 10_000_000,
      reservedMicros: 50_000,
      availableMicros: 9_950_000,
    });

    await charge?.release({ reason: "provider_error" });

    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 10_000_000,
      reservedMicros: 0,
      availableMicros: 10_000_000,
    });
    expect(spendControlsMock.releaseSpendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 50_000,
        reason: "provider_error",
      }),
    );
  });

  it("blocks insufficient balance before the provider call and maps it to 402", async () => {
    const userEmail = "creator@example.com";
    await creditWallet({ userEmail, amountCents: 1000, sessionId: "cs_smoke_low_balance" });

    const reservePromise = reserveApiWalletCharge({
      userEmail,
      serviceId: "video-generation",
      provider: "runway",
      route: "/api/runway/generate",
      maxCostMicros: 12_000_000,
      operationId: "smoke:video:insufficient",
    });

    await expect(reservePromise).rejects.toBeInstanceOf(WalletInsufficientFundsError);
    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 10_000_000,
      reservedMicros: 0,
      availableMicros: 10_000_000,
    });

    const response = walletGateErrorResponse(new WalletInsufficientFundsError(12_000_000));
    expect(response?.status).toBe(402);
  });

  it("keeps concurrent reservations atomic so a wallet cannot go negative", async () => {
    const userEmail = "creator@example.com";
    await creditWallet({ userEmail, amountCents: 1000, sessionId: "cs_smoke_concurrent" });

    const firstReserve = reserveApiWalletCharge({
      userEmail,
      serviceId: "gemini-image",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 7_000_000,
      operationId: "smoke:concurrent:1",
    });
    const secondReserve = reserveApiWalletCharge({
      userEmail,
      serviceId: "gemini-image",
      provider: "gemini",
      route: "/api/gemini/generate",
      maxCostMicros: 7_000_000,
      operationId: "smoke:concurrent:2",
    });

    const results = await Promise.allSettled([firstReserve, secondReserve]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: 10_000_000,
      reservedMicros: 7_000_000,
      availableMicros: 3_000_000,
    });
  });

  it("settles asynchronous provider jobs idempotently by provider job id", async () => {
    const userEmail = "creator@example.com";
    await creditWallet({ userEmail, amountCents: 1000, sessionId: "cs_smoke_async" });

    const charge = await reserveApiWalletCharge({
      userEmail,
      serviceId: "video-generation",
      provider: "runway",
      route: "/api/runway/generate",
      maxCostMicros: 2_000_000,
      operationId: "smoke:video:async",
    });
    await linkApiWalletChargeToProviderJob(charge, {
      userEmail,
      provider: "runway",
      providerJobId: "runway_job_1",
      serviceId: "video-generation",
      route: "/api/runway/generate",
    });

    const firstSettlement = await settleProviderJobWalletCharge({
      provider: "runway",
      providerJobId: "runway_job_1",
      status: "succeeded",
      successStatuses: ["succeeded"],
      failureStatuses: ["failed", "cancelled"],
      actualCostMicros: 1_750_000,
    });
    const balanceAfterFirstSettlement = walletSmoke.account(userEmail);
    const replaySettlement = await settleProviderJobWalletCharge({
      provider: "runway",
      providerJobId: "runway_job_1",
      status: "succeeded",
      successStatuses: ["succeeded"],
      failureStatuses: ["failed", "cancelled"],
      actualCostMicros: 1_750_000,
    });

    expect(firstSettlement).toMatchObject({
      action: "capture",
      capturedMicros: 1_750_000,
    });
    expect(replaySettlement).toMatchObject({
      action: "capture",
      capturedMicros: 1_750_000,
      duplicate: true,
    });
    expect(walletSmoke.account(userEmail)).toMatchObject({
      balanceMicros: balanceAfterFirstSettlement.balanceMicros,
      reservedMicros: 0,
      availableMicros: balanceAfterFirstSettlement.availableMicros,
    });
  });
});
