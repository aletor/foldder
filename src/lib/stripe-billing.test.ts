import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const walletMock = vi.hoisted(() => {
  class WalletConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "WalletConfigurationError";
    }
  }
  return {
    WalletConfigurationError,
    creditWalletBalance: vi.fn(),
    debitWalletBalance: vi.fn(),
    getWalletAccount: vi.fn(),
  };
});

const billingNotificationsMock = vi.hoisted(() => ({
  notifyBillingReviewRequired: vi.fn(),
  notifyWalletTopupConfirmed: vi.fn(),
}));

const stripeMock = vi.hoisted(() => ({
  chargesRetrieve: vi.fn(),
  checkoutSessionsCreate: vi.fn(),
  checkoutSessionsList: vi.fn(),
  constructEvent: vi.fn(),
  refundsList: vi.fn(),
}));

vi.mock("@/lib/wallet-ledger", () => ({
  WalletConfigurationError: walletMock.WalletConfigurationError,
  creditWalletBalance: walletMock.creditWalletBalance,
  debitWalletBalance: walletMock.debitWalletBalance,
  getWalletAccount: walletMock.getWalletAccount,
}));

vi.mock("@/lib/billing-notifications", () => ({
  notifyBillingReviewRequired: billingNotificationsMock.notifyBillingReviewRequired,
  notifyWalletTopupConfirmed: billingNotificationsMock.notifyWalletTopupConfirmed,
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    charges: {
      retrieve: stripeMock.chargesRetrieve,
    },
    checkout: {
      sessions: {
        create: stripeMock.checkoutSessionsCreate,
        list: stripeMock.checkoutSessionsList,
      },
    },
    refunds: {
      list: stripeMock.refundsList,
    },
    webhooks: {
      constructEvent: stripeMock.constructEvent,
    },
  })),
}));

import {
  StripeBillingConfigurationError,
  StripeBillingValidationError,
  allowedStripeTopupCents,
  clawbackWalletForDispute,
  clawbackWalletForRefundedCharge,
  clawbackWalletFromCheckoutSession,
  createWalletCheckoutSession,
  creditWalletFromCheckoutSession,
  parseRequestedTopupCents,
  stripeAutomaticTaxEnabled,
  walletClawbackMicrosFromCheckoutSessionAmount,
  walletCreditMicrosFromCheckoutSession,
} from "./stripe-billing";

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    amount_subtotal: 2500,
    amount_total: 3025,
    currency: "usd",
    customer_email: "buyer@example.com",
    customer_details: { email: "buyer@example.com" },
    metadata: {
      foldderPurpose: "wallet_topup",
      userEmail: "buyer@example.com",
      walletCreditMicros: "25000000",
      amountCents: "2500",
      currency: "usd",
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe("stripe-billing", () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...previousEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_foldder";
    delete process.env.FOLDDER_STRIPE_AUTOMATIC_TAX_ENABLED;
    delete process.env.FOLDDER_STRIPE_TOPUP_AMOUNTS_USD;
    walletMock.creditWalletBalance.mockReset();
    walletMock.creditWalletBalance.mockResolvedValue({});
    walletMock.debitWalletBalance.mockReset();
    walletMock.debitWalletBalance.mockResolvedValue({});
    walletMock.getWalletAccount.mockReset();
    walletMock.getWalletAccount.mockResolvedValue({
      availableMicros: 0,
      balanceMicros: 0,
      reservedMicros: 0,
      status: "active",
    });
    billingNotificationsMock.notifyBillingReviewRequired.mockReset();
    billingNotificationsMock.notifyBillingReviewRequired.mockResolvedValue(null);
    billingNotificationsMock.notifyWalletTopupConfirmed.mockReset();
    billingNotificationsMock.notifyWalletTopupConfirmed.mockResolvedValue(null);
    stripeMock.chargesRetrieve.mockReset();
    stripeMock.checkoutSessionsCreate.mockReset();
    stripeMock.checkoutSessionsList.mockReset();
    stripeMock.constructEvent.mockReset();
    stripeMock.refundsList.mockReset();
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it("keeps top-up amounts server controlled", () => {
    expect(allowedStripeTopupCents()).toEqual([1000, 2500, 5000, 10000, 25000]);
    expect(parseRequestedTopupCents({ amountUsd: 25 })).toBe(2500);
    expect(() => parseRequestedTopupCents({ amountUsd: 26 })).toThrow(StripeBillingValidationError);
  });

  it("supports configured top-up packages", () => {
    process.env.FOLDDER_STRIPE_TOPUP_AMOUNTS_USD = "5, 15, 30";
    expect(allowedStripeTopupCents()).toEqual([500, 1500, 3000]);
    expect(parseRequestedTopupCents({ amountCents: 1500 })).toBe(1500);
  });

  it("keeps Stripe automatic tax enabled by default but allows explicit staging disable", () => {
    expect(stripeAutomaticTaxEnabled()).toBe(true);
    process.env.FOLDDER_STRIPE_AUTOMATIC_TAX_ENABLED = "0";
    expect(stripeAutomaticTaxEnabled()).toBe(false);
  });

  it("checks wallet availability before creating a Stripe Checkout session", async () => {
    stripeMock.checkoutSessionsCreate.mockResolvedValue({
      id: "cs_checkout_ready",
      url: "https://checkout.stripe.test/session",
    });

    const checkout = await createWalletCheckoutSession({
      req: new Request("https://foldder.test/spaces"),
      userEmail: "Buyer@Example.com",
      amountCents: 2500,
    });

    expect(checkout).toMatchObject({
      id: "cs_checkout_ready",
      url: "https://checkout.stripe.test/session",
    });
    expect(walletMock.getWalletAccount).toHaveBeenCalledWith("Buyer@Example.com");
    expect(stripeMock.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: true },
        customer_email: "Buyer@Example.com",
        mode: "payment",
      }),
    );
  });

  it("returns Stripe Checkout to the active project when provided", async () => {
    stripeMock.checkoutSessionsCreate.mockResolvedValue({
      id: "cs_checkout_ready",
      url: "https://checkout.stripe.test/session",
    });

    await createWalletCheckoutSession({
      req: new Request("https://foldder.test/spaces"),
      userEmail: "Buyer@Example.com",
      amountCents: 2500,
      returnProjectId: " project_123-abc ",
    });

    expect(stripeMock.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://foldder.test/spaces?billing=success&projectId=project_123-abc&topupCents=2500&topupCurrency=usd",
        cancel_url: "https://foldder.test/spaces?billing=cancelled&projectId=project_123-abc",
        metadata: expect.objectContaining({
          returnProjectId: "project_123-abc",
        }),
        payment_intent_data: expect.objectContaining({
          metadata: expect.objectContaining({
            returnProjectId: "project_123-abc",
          }),
        }),
      }),
    );
  });

  it("rejects unsafe project ids for Stripe return URLs", async () => {
    await expect(
      createWalletCheckoutSession({
        req: new Request("https://foldder.test/spaces"),
        userEmail: "buyer@example.com",
        amountCents: 2500,
        returnProjectId: "https://evil.test/redirect",
      }),
    ).rejects.toThrow(StripeBillingValidationError);

    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("can create Checkout sessions with automatic tax disabled for unconfigured Stripe test accounts", async () => {
    process.env.FOLDDER_STRIPE_AUTOMATIC_TAX_ENABLED = "0";
    stripeMock.checkoutSessionsCreate.mockResolvedValue({
      id: "cs_checkout_ready",
      url: "https://checkout.stripe.test/session",
    });

    await createWalletCheckoutSession({
      req: new Request("https://foldder.test/spaces"),
      userEmail: "Buyer@Example.com",
      amountCents: 2500,
    });

    expect(stripeMock.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: false },
      }),
    );
  });

  it("does not create a Stripe Checkout session when the wallet ledger is unavailable", async () => {
    walletMock.getWalletAccount.mockRejectedValue(
      new walletMock.WalletConfigurationError("FOLDDER_WALLET_DDB_TABLE is required."),
    );

    await expect(
      createWalletCheckoutSession({
        req: new Request("https://foldder.test/spaces"),
        userEmail: "buyer@example.com",
        amountCents: 2500,
      }),
    ).rejects.toThrow(StripeBillingConfigurationError);

    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("credits only the wallet subtotal, not tax-inclusive total", () => {
    expect(walletCreditMicrosFromCheckoutSession(session())).toBe(25_000_000);
  });

  it("rejects wallet sessions whose server package metadata does not match Stripe totals", () => {
    expect(() =>
      walletCreditMicrosFromCheckoutSession(
        session({ metadata: { foldderPurpose: "wallet_topup", userEmail: "buyer@example.com" } }),
      ),
    ).toThrow(StripeBillingValidationError);

    expect(() =>
      walletCreditMicrosFromCheckoutSession(session({ amount_subtotal: 2600 })),
    ).toThrow(StripeBillingValidationError);

    expect(() =>
      walletCreditMicrosFromCheckoutSession(
        session({ metadata: { ...session().metadata, walletCreditMicros: "999" } }),
      ),
    ).toThrow(StripeBillingValidationError);
  });

  it("maps tax-inclusive Stripe refunds back to wallet credit only", () => {
    expect(walletClawbackMicrosFromCheckoutSessionAmount(session(), 3025)).toBe(25_000_000);
    expect(walletClawbackMicrosFromCheckoutSessionAmount(session(), 1513)).toBe(12_504_132);
  });

  it("credits paid wallet checkout sessions idempotently by session id", async () => {
    const result = await creditWalletFromCheckoutSession({
      eventId: "evt_1",
      eventType: "checkout.session.completed",
      session: session(),
    });

    expect(result).toMatchObject({ credited: true, amountMicros: 25_000_000 });
    expect(walletMock.creditWalletBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "buyer@example.com",
        amountMicros: 25_000_000,
        operationId: "stripe_checkout_session:cs_test_123:credit",
        type: "purchase",
        stripeEventId: "evt_1",
      }),
    );
    expect(billingNotificationsMock.notifyWalletTopupConfirmed).toHaveBeenCalledWith({
      userEmail: "buyer@example.com",
      amountMicros: 25_000_000,
      stripeCheckoutSessionId: "cs_test_123",
      stripeEventId: "evt_1",
    });
  });

  it("does not credit unpaid or unrelated sessions", async () => {
    await expect(
      creditWalletFromCheckoutSession({
        eventId: "evt_unpaid",
        eventType: "checkout.session.completed",
        session: session({ payment_status: "unpaid" }),
      }),
    ).resolves.toMatchObject({ credited: false, reason: "not_paid" });

    await expect(
      creditWalletFromCheckoutSession({
        eventId: "evt_other",
        eventType: "checkout.session.completed",
        session: session({ metadata: { foldderPurpose: "other" } }),
      }),
    ).resolves.toMatchObject({ credited: false, reason: "not_wallet_topup" });

    expect(walletMock.creditWalletBalance).not.toHaveBeenCalled();
    expect(billingNotificationsMock.notifyWalletTopupConfirmed).not.toHaveBeenCalled();
  });

  it("claws back refunds as wallet debit operations keyed by refund id", async () => {
    const result = await clawbackWalletFromCheckoutSession({
      eventId: "evt_refund",
      eventType: "charge.refunded",
      session: session(),
      stripeAmountCents: 3025,
      stripeObjectId: "re_123",
      operationId: "stripe_refund:re_123:clawback",
      type: "refund",
      reason: "stripe_refund",
    });

    expect(result).toEqual({ clawedBack: true, amountMicros: 25_000_000 });
    expect(walletMock.debitWalletBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "buyer@example.com",
        amountMicros: 25_000_000,
        operationId: "stripe_refund:re_123:clawback",
        type: "refund",
        stripeEventId: "evt_refund",
        flagAccount: true,
        blockAccount: false,
        billingReviewReason: "stripe_refund",
      }),
    );
    expect(billingNotificationsMock.notifyBillingReviewRequired).toHaveBeenCalledWith({
      userEmail: "buyer@example.com",
      amountMicros: 25_000_000,
      reason: "stripe_refund",
      stripeObjectId: "re_123",
      stripeEventId: "evt_refund",
    });
  });

  it("claws back repeated partial refunds by refund id, not by charge id", async () => {
    stripeMock.checkoutSessionsList.mockResolvedValue({ data: [session()] });
    stripeMock.refundsList.mockResolvedValue({
      data: [
        { id: "re_part_1", amount: 1513, status: "succeeded" },
        { id: "re_part_2", amount: 1512, status: "succeeded" },
      ],
    });

    const result = await clawbackWalletForRefundedCharge({
      eventId: "evt_charge_refunded",
      eventType: "charge.refunded",
      charge: {
        id: "ch_123",
        payment_intent: "pi_123",
      } as Stripe.Charge,
    });

    expect(result).toMatchObject({
      clawedBack: true,
      amountMicros: 25_000_000,
      refundCount: 2,
    });
    expect(walletMock.debitWalletBalance).toHaveBeenCalledTimes(2);
    expect(walletMock.debitWalletBalance).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amountMicros: 12_504_132,
        operationId: "stripe_refund:re_part_1:clawback",
        type: "refund",
      }),
    );
    expect(walletMock.debitWalletBalance).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amountMicros: 12_495_868,
        operationId: "stripe_refund:re_part_2:clawback",
        type: "refund",
      }),
    );
  });

  it("blocks the account for dispute clawbacks", async () => {
    await clawbackWalletFromCheckoutSession({
      eventId: "evt_dispute",
      eventType: "charge.dispute.created",
      session: session(),
      stripeAmountCents: 3025,
      stripeObjectId: "du_123",
      operationId: "stripe_dispute:du_123:clawback",
      type: "adjustment",
      reason: "stripe_dispute",
      blockAccount: true,
    });

    expect(walletMock.debitWalletBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "stripe_dispute:du_123:clawback",
        type: "adjustment",
        blockAccount: true,
      }),
    );
  });

  it("uses the same dispute idempotency key for created and funds_withdrawn events", async () => {
    const dispute = {
      id: "du_123",
      amount: 3025,
      charge: "ch_123",
    } as Stripe.Dispute;
    stripeMock.chargesRetrieve.mockResolvedValue({
      id: "ch_123",
      payment_intent: "pi_123",
    });
    stripeMock.checkoutSessionsList.mockResolvedValue({ data: [session()] });

    await clawbackWalletForDispute({
      eventId: "evt_dispute_created",
      eventType: "charge.dispute.created",
      dispute,
    });
    await clawbackWalletForDispute({
      eventId: "evt_dispute_withdrawn",
      eventType: "charge.dispute.funds_withdrawn",
      dispute,
    });

    expect(walletMock.debitWalletBalance).toHaveBeenCalledTimes(2);
    const operationIds = walletMock.debitWalletBalance.mock.calls.map(([input]) => input.operationId);
    expect(operationIds).toEqual([
      "stripe_dispute:du_123:clawback",
      "stripe_dispute:du_123:clawback",
    ]);
    expect(walletMock.debitWalletBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMicros: 25_000_000,
        blockAccount: true,
        type: "adjustment",
      }),
    );
  });
});
