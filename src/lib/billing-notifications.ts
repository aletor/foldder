import { createHash, randomUUID } from "node:crypto";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddbClient } from "@/lib/dynamo-utils";
import { withDynamoRetry } from "@/lib/dynamo-retry";

export const BILLING_NOTIFICATIONS_MODE_ENV = "FOLDDER_BILLING_NOTIFICATIONS_MODE";
export const BILLING_EMAIL_FROM_ENV = "FOLDDER_BILLING_EMAIL_FROM";
export const BILLING_EMAIL_REPLY_TO_ENV = "FOLDDER_BILLING_EMAIL_REPLY_TO";
export const RESEND_API_KEY_ENV = "RESEND_API_KEY";
export const WALLET_DDB_TABLE_ENV = "FOLDDER_WALLET_DDB_TABLE";
export const DEFAULT_LOW_BALANCE_MICROS = 2_000_000;

export type BillingNotificationMode = "off" | "log" | "send";

export type BillingNotificationKind =
  | "wallet_topup_confirmed"
  | "wallet_low_balance"
  | "wallet_operation_blocked"
  | "billing_review_required";

export type BillingNotificationResult =
  | {
      sent: false;
      skipped: true;
      reason:
        | "mode_off"
        | "missing_table"
        | "missing_recipient"
        | "missing_sender"
        | "missing_resend_key"
        | "duplicate";
    }
  | { sent: true; skipped: false; mode: Exclude<BillingNotificationMode, "off">; notificationId: string }
  | { sent: false; skipped: false; reason: "send_failed"; notificationId: string; error: string };

type BillingNotificationTemplate = {
  subject: string;
  text: string;
  html: string;
};

export type BillingNotificationInput = {
  kind: BillingNotificationKind;
  userEmail: string;
  dedupeKey: string;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
  now?: Date;
};

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function walletAccountIdForNotification(email: string): string {
  return `acct_${sha256(normalizeEmail(email)).slice(0, 32)}`;
}

function walletTableName(): string | null {
  return process.env[WALLET_DDB_TABLE_ENV]?.trim() || null;
}

export function billingNotificationsMode(): BillingNotificationMode {
  const raw = process.env[BILLING_NOTIFICATIONS_MODE_ENV]?.trim().toLowerCase();
  if (raw === "off" || raw === "log" || raw === "send") return raw;
  return process.env[RESEND_API_KEY_ENV]?.trim() ? "send" : "off";
}

export function walletLowBalanceThresholdMicros(): number {
  const raw = process.env.FOLDDER_WALLET_LOW_BALANCE_USD;
  const value = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_LOW_BALANCE_MICROS;
  return Math.round(value * 1_000_000);
}

function formatUsd(micros: number): string {
  const usd = (Number.isFinite(micros) ? micros : 0) / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphHtml(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function renderBillingEmail(args: { title: string; body: string; cta?: string }): BillingNotificationTemplate {
  const text = `${args.title}\n\n${args.body}${args.cta ? `\n\n${args.cta}` : ""}`;
  const html = [
    "<div style=\"font-family:Inter,Arial,sans-serif;line-height:1.55;color:#0f172a;max-width:560px\">",
    `<h1 style=\"font-size:22px;line-height:1.2;margin:0 0 16px\">${escapeHtml(args.title)}</h1>`,
    `<div style=\"font-size:14px;color:#334155\">${paragraphHtml(args.body)}</div>`,
    args.cta
      ? `<p style=\"margin-top:20px;font-size:13px;font-weight:700;color:#475569\">${escapeHtml(args.cta)}</p>`
      : "",
    "<p style=\"margin-top:28px;font-size:12px;color:#64748b\">Foldder Billing</p>",
    "</div>",
  ].join("");
  return { subject: args.title, text, html };
}

export function topupConfirmedTemplate(input: { amountMicros: number }): BillingNotificationTemplate {
  return renderBillingEmail({
    title: "Recarga confirmada en Foldder",
    body: `Has añadido ${formatUsd(input.amountMicros)} a tu saldo Foldder.\nEl saldo ya puede utilizarse para generar texto, imagen y vídeo desde tu workspace.`,
    cta: "Puedes revisar el movimiento desde Centro de consumo.",
  });
}

export function lowBalanceTemplate(input: {
  availableMicros: number;
  thresholdMicros: number;
}): BillingNotificationTemplate {
  return renderBillingEmail({
    title: "Tu saldo Foldder está bajo",
    body: `Tu saldo disponible es ${formatUsd(input.availableMicros)}. El umbral de aviso está en ${formatUsd(input.thresholdMicros)}.\nRecarga antes de lanzar generaciones largas, imágenes pesadas o vídeo para evitar bloqueos en mitad del flujo.`,
    cta: "El vídeo siempre pedirá confirmación antes de consumir saldo.",
  });
}

export function operationBlockedTemplate(input: {
  requiredMicros: number;
  availableMicros?: number;
}): BillingNotificationTemplate {
  const availableText =
    input.availableMicros == null ? "" : ` Tu saldo disponible era ${formatUsd(input.availableMicros)}.`;
  return renderBillingEmail({
    title: "Operación bloqueada por saldo insuficiente",
    body: `Foldder no inició una operación porque necesitaba cubrir una reserva máxima de ${formatUsd(input.requiredMicros)}.${availableText}\nNo se ha llamado al proveedor y no se ha consumido saldo.`,
    cta: "Recarga saldo y vuelve a lanzar la operación.",
  });
}

export function billingReviewTemplate(input: {
  amountMicros: number;
  reason: string;
}): BillingNotificationTemplate {
  const reason =
    input.reason === "stripe_dispute"
      ? "una disputa de pago"
      : input.reason === "stripe_refund"
        ? "un reembolso"
        : "un ajuste de facturación";
  return renderBillingEmail({
    title: "Tu cuenta Foldder está en revisión de facturación",
    body: `Hemos aplicado un ajuste de ${formatUsd(input.amountMicros)} por ${reason}.\nLas operaciones con coste pueden quedar limitadas hasta revisar el estado de la cuenta.`,
    cta: "Si crees que se trata de un error, responde a este correo.",
  });
}

function notificationPk(userEmail: string): string {
  return `BILLING_NOTIFICATION#${walletAccountIdForNotification(userEmail)}`;
}

function notificationSk(kind: BillingNotificationKind, dedupeKey: string): string {
  return `NOTICE#${kind}#${sha256(dedupeKey).slice(0, 32)}`;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (error as { name?: string })?.name === "ConditionalCheckFailedException";
}

async function claimNotification(input: BillingNotificationInput & {
  tableName: string;
  notificationId: string;
  createdAt: string;
}): Promise<"claimed" | "duplicate"> {
  const pk = notificationPk(input.userEmail);
  const sk = notificationSk(input.kind, input.dedupeKey);
  try {
    await withDynamoRetry(() =>
      ddbClient.send(
        new PutCommand({
          TableName: input.tableName,
          Item: {
            pk,
            sk,
            entityType: "billing-notification",
            notificationId: input.notificationId,
            kind: input.kind,
            userEmail: normalizeEmail(input.userEmail),
            dedupeKeyHash: sha256(input.dedupeKey),
            status: "claimed",
            subject: input.subject,
            metadata: input.metadata,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
          },
          ConditionExpression: "attribute_not_exists(#pk) OR #status = :failed",
          ExpressionAttributeNames: {
            "#pk": "pk",
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":failed": "failed",
          },
        }),
      ),
    );
    return "claimed";
  } catch (error) {
    if (isConditionalCheckFailed(error)) return "duplicate";
    throw error;
  }
}

async function markNotificationStatus(input: {
  tableName: string;
  userEmail: string;
  kind: BillingNotificationKind;
  dedupeKey: string;
  status: "sent" | "logged" | "failed";
  error?: string;
  now: string;
}): Promise<void> {
  await withDynamoRetry(() =>
    ddbClient.send(
      new UpdateCommand({
        TableName: input.tableName,
        Key: {
          pk: notificationPk(input.userEmail),
          sk: notificationSk(input.kind, input.dedupeKey),
        },
        UpdateExpression: "SET #status = :status, #updatedAt = :now, #error = :error",
        ExpressionAttributeNames: {
          "#error": "error",
          "#status": "status",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":error": input.error,
          ":now": input.now,
          ":status": input.status,
        },
      }),
    ),
  );
}

async function sendViaResend(input: BillingNotificationInput & { from: string; replyTo?: string }): Promise<void> {
  const apiKey = process.env[RESEND_API_KEY_ENV]?.trim();
  if (!apiKey) throw new Error(`${RESEND_API_KEY_ENV} is required.`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [normalizeEmail(input.userEmail)],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body.slice(0, 240)}`);
  }
}

export async function sendBillingNotification(
  input: BillingNotificationInput,
): Promise<BillingNotificationResult> {
  const mode = billingNotificationsMode();
  if (mode === "off") return { sent: false, skipped: true, reason: "mode_off" };
  const userEmail = normalizeEmail(input.userEmail);
  if (!userEmail) return { sent: false, skipped: true, reason: "missing_recipient" };
  const tableName = walletTableName();
  if (!tableName) return { sent: false, skipped: true, reason: "missing_table" };

  const createdAt = nowIso(input.now);
  const notificationId = `bn_${randomUUID()}`;
  const claim = await claimNotification({
    ...input,
    userEmail,
    tableName,
    notificationId,
    createdAt,
  });
  if (claim === "duplicate") return { sent: false, skipped: true, reason: "duplicate" };

  if (mode === "log") {
    console.info("[billing-notification]", {
      kind: input.kind,
      notificationId,
      subject: input.subject,
      userEmail,
    });
    await markNotificationStatus({
      tableName,
      userEmail,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "logged",
      now: nowIso(),
    });
    return { sent: true, skipped: false, mode, notificationId };
  }

  const from = process.env[BILLING_EMAIL_FROM_ENV]?.trim();
  if (!from) return { sent: false, skipped: true, reason: "missing_sender" };
  if (!process.env[RESEND_API_KEY_ENV]?.trim()) return { sent: false, skipped: true, reason: "missing_resend_key" };

  try {
    await sendViaResend({
      ...input,
      userEmail,
      from,
      replyTo: process.env[BILLING_EMAIL_REPLY_TO_ENV]?.trim() || undefined,
    });
    await markNotificationStatus({
      tableName,
      userEmail,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "sent",
      now: nowIso(),
    });
    return { sent: true, skipped: false, mode, notificationId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markNotificationStatus({
      tableName,
      userEmail,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      status: "failed",
      error: message.slice(0, 500),
      now: nowIso(),
    }).catch((markError) => {
      console.error("[billing-notification] failed to mark send failure", markError);
    });
    return { sent: false, skipped: false, reason: "send_failed", notificationId, error: message };
  }
}

export async function safeSendBillingNotification(
  input: BillingNotificationInput,
): Promise<BillingNotificationResult | null> {
  try {
    return await sendBillingNotification(input);
  } catch (error) {
    console.error("[billing-notification] failed", error);
    return null;
  }
}

export async function notifyWalletTopupConfirmed(input: {
  userEmail: string;
  amountMicros: number;
  stripeCheckoutSessionId: string;
  stripeEventId: string;
}): Promise<BillingNotificationResult | null> {
  const template = topupConfirmedTemplate({ amountMicros: input.amountMicros });
  return safeSendBillingNotification({
    kind: "wallet_topup_confirmed",
    userEmail: input.userEmail,
    dedupeKey: `topup:${input.stripeCheckoutSessionId}`,
    subject: template.subject,
    text: template.text,
    html: template.html,
    metadata: {
      amountMicros: input.amountMicros,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      stripeEventId: input.stripeEventId,
    },
  });
}

export async function notifyBillingReviewRequired(input: {
  userEmail: string;
  amountMicros: number;
  reason: string;
  stripeObjectId: string;
  stripeEventId: string;
}): Promise<BillingNotificationResult | null> {
  const template = billingReviewTemplate({ amountMicros: input.amountMicros, reason: input.reason });
  return safeSendBillingNotification({
    kind: "billing_review_required",
    userEmail: input.userEmail,
    dedupeKey: `review:${input.stripeObjectId}`,
    subject: template.subject,
    text: template.text,
    html: template.html,
    metadata: {
      amountMicros: input.amountMicros,
      reason: input.reason,
      stripeObjectId: input.stripeObjectId,
      stripeEventId: input.stripeEventId,
    },
  });
}

export async function notifyLowWalletBalance(input: {
  userEmail: string;
  availableMicros: number;
  thresholdMicros: number;
  operationId: string;
  now?: Date;
}): Promise<BillingNotificationResult | null> {
  if (input.availableMicros > input.thresholdMicros) return null;
  const now = input.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const template = lowBalanceTemplate({
    availableMicros: input.availableMicros,
    thresholdMicros: input.thresholdMicros,
  });
  return safeSendBillingNotification({
    kind: "wallet_low_balance",
    userEmail: input.userEmail,
    dedupeKey: `low-balance:${day}`,
    subject: template.subject,
    text: template.text,
    html: template.html,
    metadata: {
      availableMicros: input.availableMicros,
      thresholdMicros: input.thresholdMicros,
      operationId: input.operationId,
      window: day,
    },
    now,
  });
}

export async function notifyWalletOperationBlocked(input: {
  userEmail: string;
  requiredMicros: number;
  availableMicros?: number;
  route: string;
  operationId: string;
  now?: Date;
}): Promise<BillingNotificationResult | null> {
  const now = input.now ?? new Date();
  const hour = now.toISOString().slice(0, 13);
  const template = operationBlockedTemplate({
    requiredMicros: input.requiredMicros,
    availableMicros: input.availableMicros,
  });
  return safeSendBillingNotification({
    kind: "wallet_operation_blocked",
    userEmail: input.userEmail,
    dedupeKey: `blocked:${input.route}:${hour}`,
    subject: template.subject,
    text: template.text,
    html: template.html,
    metadata: {
      availableMicros: input.availableMicros,
      operationId: input.operationId,
      requiredMicros: input.requiredMicros,
      route: input.route,
      window: hour,
    },
    now,
  });
}
