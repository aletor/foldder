import Stripe from "stripe";
import {
  notifyBillingReviewRequired,
  notifyWalletTopupConfirmed,
} from "@/lib/billing-notifications";
import {
  WalletConfigurationError,
  creditWalletBalance,
  debitWalletBalance,
  getWalletAccount,
} from "@/lib/wallet-ledger";

export const STRIPE_SECRET_KEY_ENV = "STRIPE_SECRET_KEY";
export const STRIPE_WEBHOOK_SECRET_ENV = "STRIPE_WEBHOOK_SECRET";
export const STRIPE_TOPUP_AMOUNTS_ENV = "FOLDDER_STRIPE_TOPUP_AMOUNTS_USD";
export const STRIPE_CURRENCY_ENV = "FOLDDER_STRIPE_CURRENCY";

const DEFAULT_TOPUP_AMOUNTS_USD = [10, 25, 50, 100, 250];
const WALLET_TOPUP_PURPOSE = "wallet_topup";
const STRIPE_BACKFILL_EVENT_TYPE = "stripe.checkout.session.backfill";
const SECONDS_PER_DAY = 86_400;

export class StripeBillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeBillingConfigurationError";
  }
}

export class StripeBillingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeBillingValidationError";
  }
}

function stripeSecretKey(): string {
  const key = process.env[STRIPE_SECRET_KEY_ENV]?.trim();
  if (!key) throw new StripeBillingConfigurationError(`${STRIPE_SECRET_KEY_ENV} is required.`);
  return key;
}

export function stripeWebhookSecret(): string {
  const secret = process.env[STRIPE_WEBHOOK_SECRET_ENV]?.trim();
  if (!secret) throw new StripeBillingConfigurationError(`${STRIPE_WEBHOOK_SECRET_ENV} is required.`);
  return secret;
}

export function stripeCurrency(): string {
  return (process.env[STRIPE_CURRENCY_ENV]?.trim().toLowerCase() || "usd");
}

export function stripeClient(): Stripe {
  return new Stripe(stripeSecretKey());
}

export function allowedStripeTopupCents(): number[] {
  const configured = (process.env[STRIPE_TOPUP_AMOUNTS_ENV] || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  const amounts = configured.length > 0 ? configured : DEFAULT_TOPUP_AMOUNTS_USD;
  return [...new Set(amounts.map((usd) => Math.round(usd * 100)))].sort((a, b) => a - b);
}

export function parseRequestedTopupCents(body: {
  amountCents?: unknown;
  amountUsd?: unknown;
}): number {
  const fromCents = typeof body.amountCents === "number" ? body.amountCents : null;
  const fromUsd = typeof body.amountUsd === "number" ? Math.round(body.amountUsd * 100) : null;
  const amountCents = Math.round(fromCents ?? fromUsd ?? 0);
  const allowed = allowedStripeTopupCents();
  if (!Number.isSafeInteger(amountCents) || !allowed.includes(amountCents)) {
    throw new StripeBillingValidationError(
      `Invalid top-up amount. Allowed cents: ${allowed.join(",")}`,
    );
  }
  return amountCents;
}

export function walletCreditMicrosFromCents(amountCents: number): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StripeBillingValidationError("amountCents must be a positive integer.");
  }
  return amountCents * 10_000;
}

export function absoluteAppUrl(req: Request, path: string): string {
  const configured =
    process.env.FOLDDER_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const origin = configured || new URL(req.url).origin;
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

export async function createWalletCheckoutSession(input: {
  req: Request;
  userEmail: string;
  amountCents: number;
}): Promise<Stripe.Checkout.Session> {
  const amountCents = parseRequestedTopupCents({ amountCents: input.amountCents });
  const walletCreditMicros = walletCreditMicrosFromCents(amountCents);
  const currency = stripeCurrency();
  if (currency !== "usd") {
    throw new StripeBillingConfigurationError("Wallet ledger is currently USD-only; set FOLDDER_STRIPE_CURRENCY=usd.");
  }

  try {
    await getWalletAccount(input.userEmail);
  } catch (error) {
    if (error instanceof WalletConfigurationError) {
      throw new StripeBillingConfigurationError("Wallet ledger is not configured for checkout.");
    }
    throw new StripeBillingConfigurationError("Wallet ledger is not available for checkout.");
  }

  const metadata = {
    foldderPurpose: WALLET_TOPUP_PURPOSE,
    userEmail: input.userEmail.trim().toLowerCase(),
    walletCreditMicros: String(walletCreditMicros),
    amountCents: String(amountCents),
    currency,
  };

  return stripeClient().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: input.userEmail,
    customer_creation: "always",
    billing_address_collection: "required",
    automatic_tax: { enabled: true },
    payment_intent_data: {
      metadata,
    },
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Foldder credit · $${(amountCents / 100).toFixed(2)}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata,
    success_url: absoluteAppUrl(input.req, "/spaces?billing=success"),
    cancel_url: absoluteAppUrl(input.req, "/spaces?billing=cancelled"),
  });
}

function stringMetadata(session: Stripe.Checkout.Session, key: string): string {
  return typeof session.metadata?.[key] === "string" ? session.metadata[key].trim() : "";
}

function stripeObjectId(value: string | { id?: string } | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.id === "string") return value.id.trim();
  return "";
}

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function metadataPositiveInteger(session: Stripe.Checkout.Session, key: string): number | null {
  const value = Number(stringMetadata(session, key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function walletCreditMicrosFromCheckoutSession(session: Stripe.Checkout.Session): number {
  const amountCents = metadataPositiveInteger(session, "amountCents");
  if (!amountCents) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} has no server top-up amount.`);
  }
  parseRequestedTopupCents({ amountCents });

  const metadataMicros = metadataPositiveInteger(session, "walletCreditMicros");
  const expectedMicros = walletCreditMicrosFromCents(amountCents);
  if (metadataMicros !== expectedMicros) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} has mismatched wallet credit metadata.`);
  }

  const currency = (session.currency || "").toLowerCase();
  const metadataCurrency = stringMetadata(session, "currency").toLowerCase();
  if ((currency && currency !== "usd") || (metadataCurrency && metadataCurrency !== "usd")) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} is not USD.`);
  }

  const subtotalCents = safePositiveInteger(session.amount_subtotal);
  if (subtotalCents && subtotalCents !== amountCents) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} subtotal does not match top-up package.`);
  }

  const totalCents = safePositiveInteger(session.amount_total);
  if (totalCents && totalCents < amountCents) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} total is lower than the top-up package.`);
  }

  return expectedMicros;
}

export function walletClawbackMicrosFromCheckoutSessionAmount(
  session: Stripe.Checkout.Session,
  stripeAmountCents: number,
): number {
  if (!Number.isSafeInteger(stripeAmountCents) || stripeAmountCents <= 0) {
    throw new StripeBillingValidationError("stripeAmountCents must be a positive integer.");
  }
  const walletCreditMicros = walletCreditMicrosFromCheckoutSession(session);
  const totalCents =
    safePositiveInteger(session.amount_total) ||
    safePositiveInteger(session.amount_subtotal) ||
    Number(stringMetadata(session, "amountCents"));
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} has no paid total.`);
  }
  if (stripeAmountCents >= totalCents) return walletCreditMicros;
  return Math.min(
    walletCreditMicros,
    Math.max(1, Math.round((stripeAmountCents / totalCents) * walletCreditMicros)),
  );
}

export async function creditWalletFromCheckoutSession(input: {
  eventId: string;
  eventType: string;
  session: Stripe.Checkout.Session;
}): Promise<{ credited: boolean; reason?: string; amountMicros?: number }> {
  const session = input.session;
  if (session.mode !== "payment") return { credited: false, reason: "not_payment_mode" };
  if (session.payment_status !== "paid") return { credited: false, reason: "not_paid" };
  if (stringMetadata(session, "foldderPurpose") !== WALLET_TOPUP_PURPOSE) {
    return { credited: false, reason: "not_wallet_topup" };
  }

  const userEmail = stringMetadata(session, "userEmail") || session.customer_details?.email || session.customer_email || "";
  if (!userEmail.trim()) {
    throw new StripeBillingValidationError(`Checkout session ${session.id} has no user email.`);
  }
  const amountMicros = walletCreditMicrosFromCheckoutSession(session);
  await creditWalletBalance({
    userEmail,
    amountMicros,
    operationId: `stripe_checkout_session:${session.id}:credit`,
    type: "purchase",
    stripeEventId: input.eventId,
    metadata: {
      stripeEventId: input.eventId,
      stripeEventType: input.eventType,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      amountSubtotal: session.amount_subtotal,
      amountTotal: session.amount_total,
      currency: session.currency,
    },
  });
  await notifyWalletTopupConfirmed({
    userEmail,
    amountMicros,
    stripeCheckoutSessionId: session.id,
    stripeEventId: input.eventId,
  });
  return { credited: true, amountMicros };
}

async function checkoutSessionForPaymentIntent(paymentIntentId: string): Promise<Stripe.Checkout.Session | null> {
  if (!paymentIntentId) return null;
  const sessions = await stripeClient().checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data.find((session) => stringMetadata(session, "foldderPurpose") === WALLET_TOPUP_PURPOSE) ?? null;
}

async function checkoutSessionForCharge(charge: Stripe.Charge): Promise<Stripe.Checkout.Session | null> {
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  return checkoutSessionForPaymentIntent(paymentIntentId);
}

function userEmailFromCheckoutSession(session: Stripe.Checkout.Session): string {
  return stringMetadata(session, "userEmail") || session.customer_details?.email || session.customer_email || "";
}

async function listRefundsForCharge(chargeId: string): Promise<Stripe.Refund[]> {
  const refunds = await stripeClient().refunds.list({ charge: chargeId, limit: 100 });
  return refunds.data;
}

async function retrieveCharge(chargeId: string): Promise<Stripe.Charge> {
  return stripeClient().charges.retrieve(chargeId);
}

export async function clawbackWalletFromCheckoutSession(input: {
  eventId: string;
  eventType: string;
  session: Stripe.Checkout.Session;
  stripeAmountCents: number;
  stripeObjectId: string;
  operationId: string;
  type: "refund" | "adjustment";
  reason: string;
  blockAccount?: boolean;
}): Promise<{ clawedBack: boolean; amountMicros: number }> {
  if (stringMetadata(input.session, "foldderPurpose") !== WALLET_TOPUP_PURPOSE) {
    return { clawedBack: false, amountMicros: 0 };
  }
  const userEmail = userEmailFromCheckoutSession(input.session);
  if (!userEmail.trim()) {
    throw new StripeBillingValidationError(`Checkout session ${input.session.id} has no user email.`);
  }
  const amountMicros = walletClawbackMicrosFromCheckoutSessionAmount(
    input.session,
    input.stripeAmountCents,
  );
  await debitWalletBalance({
    userEmail,
    amountMicros,
    operationId: input.operationId,
    type: input.type,
    stripeEventId: input.eventId,
    flagAccount: true,
    blockAccount: input.blockAccount === true,
    billingReviewReason: input.reason,
    metadata: {
      stripeEventId: input.eventId,
      stripeEventType: input.eventType,
      stripeCheckoutSessionId: input.session.id,
      stripeObjectId: input.stripeObjectId,
      stripeAmountCents: input.stripeAmountCents,
      stripeWalletClawbackReason: input.reason,
    },
  });
  await notifyBillingReviewRequired({
    userEmail,
    amountMicros,
    reason: input.reason,
    stripeObjectId: input.stripeObjectId,
    stripeEventId: input.eventId,
  });
  return { clawedBack: true, amountMicros };
}

export async function clawbackWalletForRefundedCharge(input: {
  eventId: string;
  eventType: string;
  charge: Stripe.Charge;
}): Promise<{ clawedBack: boolean; reason?: string; amountMicros: number; refundCount: number }> {
  const session = await checkoutSessionForCharge(input.charge);
  if (!session) {
    return { clawedBack: false, reason: "no_wallet_topup_session", amountMicros: 0, refundCount: 0 };
  }
  const refunds = await listRefundsForCharge(input.charge.id);
  let amountMicros = 0;
  let refundCount = 0;
  for (const refund of refunds) {
    const refundStatus = typeof refund.status === "string" ? refund.status : "";
    if (refundStatus === "failed" || refundStatus === "canceled") continue;
    const refundAmountCents = safePositiveInteger(refund.amount);
    if (!refundAmountCents) continue;
    const result = await clawbackWalletFromCheckoutSession({
      eventId: input.eventId,
      eventType: input.eventType,
      session,
      stripeAmountCents: refundAmountCents,
      stripeObjectId: refund.id,
      operationId: `stripe_refund:${refund.id}:clawback`,
      type: "refund",
      reason: "stripe_refund",
    });
    amountMicros += result.amountMicros;
    refundCount += result.clawedBack ? 1 : 0;
  }
  return {
    clawedBack: refundCount > 0,
    reason: refundCount > 0 ? undefined : "no_refunds_to_clawback",
    amountMicros,
    refundCount,
  };
}

export async function clawbackWalletForDispute(input: {
  eventId: string;
  eventType: string;
  dispute: Stripe.Dispute;
}): Promise<{ clawedBack: boolean; reason?: string; amountMicros: number }> {
  const chargeId = stripeObjectId(input.dispute.charge);
  if (!chargeId) return { clawedBack: false, reason: "no_charge_id", amountMicros: 0 };
  const charge = await retrieveCharge(chargeId);
  const session = await checkoutSessionForCharge(charge);
  if (!session) return { clawedBack: false, reason: "no_wallet_topup_session", amountMicros: 0 };
  const disputeAmountCents = safePositiveInteger(input.dispute.amount);
  if (!disputeAmountCents) {
    return { clawedBack: false, reason: "no_dispute_amount", amountMicros: 0 };
  }
  return clawbackWalletFromCheckoutSession({
    eventId: input.eventId,
    eventType: input.eventType,
    session,
    stripeAmountCents: disputeAmountCents,
    stripeObjectId: input.dispute.id,
    operationId: `stripe_dispute:${input.dispute.id}:clawback`,
    type: "adjustment",
    reason: "stripe_dispute",
    blockAccount: true,
  });
}

export async function backfillPaidWalletCheckoutSessions(input: {
  createdGte?: number;
  dryRun?: boolean;
  maxSessions?: number;
} = {}): Promise<{
  scanned: number;
  credited: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
  createdGte: number;
}> {
  const createdGte =
    input.createdGte && Number.isSafeInteger(input.createdGte)
      ? input.createdGte
      : Math.floor(Date.now() / 1000) - 30 * SECONDS_PER_DAY;
  const maxSessions = Math.max(1, Math.min(input.maxSessions ?? 1_000, 10_000));
  const dryRun = input.dryRun === true;
  let scanned = 0;
  let credited = 0;
  let skipped = 0;
  let failed = 0;
  let startingAfter: string | undefined;

  while (scanned < maxSessions) {
    const remaining = maxSessions - scanned;
    const page = await stripeClient().checkout.sessions.list({
      created: { gte: createdGte },
      limit: Math.min(100, remaining),
      status: "complete",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (page.data.length === 0) break;

    for (const session of page.data) {
      scanned += 1;
      if (
        session.mode !== "payment" ||
        session.payment_status !== "paid" ||
        stringMetadata(session, "foldderPurpose") !== WALLET_TOPUP_PURPOSE
      ) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        credited += 1;
        continue;
      }
      try {
        await creditWalletFromCheckoutSession({
          eventId: `backfill:${session.id}`,
          eventType: STRIPE_BACKFILL_EVENT_TYPE,
          session,
        });
        credited += 1;
      } catch (error) {
        failed += 1;
        console.error("[stripe-billing/backfill]", session.id, error);
      }
    }

    if (!page.has_more || scanned >= maxSessions) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return { scanned, credited, skipped, failed, dryRun, createdGte };
}

export async function handleStripeWebhook(input: {
  payload: string;
  signature: string;
}): Promise<{
  received: true;
  credited: boolean;
  clawedBack: boolean;
  reason?: string;
  eventId: string;
  eventType: string;
}> {
  const event = stripeClient().webhooks.constructEvent(
    input.payload,
    input.signature,
    stripeWebhookSecret(),
  );

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    if (event.type === "charge.refunded") {
      const result = await clawbackWalletForRefundedCharge({
        eventId: event.id,
        eventType: event.type,
        charge: event.data.object as Stripe.Charge,
      });
      return {
        received: true,
        credited: false,
        clawedBack: result.clawedBack,
        reason: result.reason,
        eventId: event.id,
        eventType: event.type,
      };
    }
    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.funds_withdrawn"
    ) {
      const result = await clawbackWalletForDispute({
        eventId: event.id,
        eventType: event.type,
        dispute: event.data.object as Stripe.Dispute,
      });
      return {
        received: true,
        credited: false,
        clawedBack: result.clawedBack,
        reason: result.reason,
        eventId: event.id,
        eventType: event.type,
      };
    }
    return {
      received: true,
      credited: false,
      clawedBack: false,
      reason: "ignored_event",
      eventId: event.id,
      eventType: event.type,
    };
  }

  const result = await creditWalletFromCheckoutSession({
    eventId: event.id,
    eventType: event.type,
    session: event.data.object as Stripe.Checkout.Session,
  });
  return {
    received: true,
    credited: result.credited,
    clawedBack: false,
    reason: result.reason,
    eventId: event.id,
    eventType: event.type,
  };
}
