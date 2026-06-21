import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { UsageProvider, UsageServiceId } from "@/lib/api-usage";
import {
  billingNotificationsMode,
  notifyLowWalletBalance,
  notifyWalletOperationBlocked,
  walletLowBalanceThresholdMicros,
} from "@/lib/billing-notifications";
import { isDynamoTransactionConflict } from "@/lib/dynamo-retry";
import {
  SpendControlConfigurationError,
  SpendControlLimitExceededError,
  SpendControlProviderDisabledError,
  checkAndRecordSpendControl,
  releaseSpendControl,
} from "@/lib/spend-controls";
import {
  WALLET_DDB_TABLE_ENV,
  captureWalletReservation,
  getWalletAccount,
  linkWalletReservationToProviderJob,
  recordPendingWalletCapture,
  readWalletReservationForProviderJob,
  releaseWalletReservation,
  reserveWalletAmount,
  WalletConfigurationError,
  WalletInsufficientFundsError,
} from "@/lib/wallet-ledger";

export const WALLET_GATE_MODE_ENV = "FOLDDER_WALLET_GATE_MODE";

export type WalletGateMode = "off" | "dry_run" | "enforce";

export class WalletDuplicateOperationError extends Error {
  constructor(public operationId: string) {
    super(`Duplicate wallet operation: ${operationId}`);
    this.name = "WalletDuplicateOperationError";
  }
}

export type ApiWalletCharge = {
  mode: WalletGateMode;
  operationId: string;
  reservationId: string;
  reservedMicros: number;
  capture: (input: {
    actualCostMicros?: number;
    actualCostUsd?: number;
    providerCostId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  release: (input?: { reason?: string; metadata?: Record<string, unknown> }) => Promise<void>;
};

export type ProviderJobWalletSettlement =
  | { action: "none"; reason: "wallet_gate_off" | "dry_run" | "not_found" | "status_pending" }
  | { action: "capture"; reservationId: string; capturedMicros: number; duplicate?: boolean }
  | { action: "capture_pending"; reservationId: string; capturedMicros: number }
  | { action: "release"; reservationId: string; releasedMicros: number; duplicate?: boolean };

export function usdToMicros(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.ceil(usd * 1_000_000);
}

export function microsToUsd(micros: number): number {
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return Math.round(micros) / 1_000_000;
}

export function reserveUsdToMicros(usd: number, options?: { multiplier?: number; minimumMicros?: number }): number {
  const base = usdToMicros(usd);
  if (base <= 0) return 0;
  const multiplier = options?.multiplier ?? 1.25;
  const minimumMicros = options?.minimumMicros ?? 1_000;
  return Math.max(minimumMicros, Math.ceil(base * multiplier));
}

export function walletGateMode(): WalletGateMode {
  const raw = process.env[WALLET_GATE_MODE_ENV]?.trim().toLowerCase();
  if (raw === "off" || raw === "dry_run" || raw === "enforce") return raw;
  if (process.env.FOLDDER_WALLET_GATE_ENABLED === "0") return "off";
  if (process.env.FOLDDER_WALLET_GATE_ENABLED === "1") return "enforce";
  if (process.env.FOLDDER_SAAS_MODE === "1") return "enforce";
  return process.env[WALLET_DDB_TABLE_ENV]?.trim() ? "enforce" : "off";
}

function requestOperationId(req: Request | undefined, route: string): string {
  const header =
    req?.headers.get("x-foldder-operation-id") ||
    req?.headers.get("x-foldder-request-id") ||
    req?.headers.get("idempotency-key") ||
    "";
  const normalized = header.trim();
  if (normalized) return `${route}:${normalized}`;
  return `${route}:${randomUUID()}`;
}

function normalizeUserEmail(userEmail: string): string {
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) throw new WalletConfigurationError("Wallet gate requires an authenticated user email.");
  return normalized;
}

function defaultReservationTtlMs(input: {
  provider: UsageProvider;
  route: string;
  serviceId: UsageServiceId;
}): number {
  if (
    (input.provider === "runway" && input.route === "/api/runway/generate") ||
    (input.provider === "grok" && input.route === "/api/grok/generate")
  ) {
    return 48 * 60 * 60 * 1000;
  }
  if (input.serviceId.includes("video")) return 2 * 60 * 60 * 1000;
  return 30 * 60 * 1000;
}

function expiresAtFromTtl(ttlMs: number): string {
  return new Date(Date.now() + Math.max(1, ttlMs)).toISOString();
}

async function notifyLowBalanceIfNeeded(input: {
  userEmail: string;
  operationId: string;
}): Promise<void> {
  if (billingNotificationsMode() === "off") return;
  try {
    const account = await getWalletAccount(input.userEmail);
    const thresholdMicros = walletLowBalanceThresholdMicros();
    if (account.availableMicros > thresholdMicros) return;
    await notifyLowWalletBalance({
      userEmail: input.userEmail,
      availableMicros: account.availableMicros,
      thresholdMicros,
      operationId: input.operationId,
    });
  } catch (error) {
    console.error("[wallet-gate] low-balance notification failed:", error);
  }
}

async function notifyOperationBlockedByBalance(input: {
  userEmail: string;
  route: string;
  operationId: string;
  requiredMicros: number;
}): Promise<void> {
  if (billingNotificationsMode() === "off") return;
  try {
    const account = await getWalletAccount(input.userEmail).catch(() => null);
    await notifyWalletOperationBlocked({
      userEmail: input.userEmail,
      availableMicros: account?.availableMicros,
      requiredMicros: input.requiredMicros,
      route: input.route,
      operationId: input.operationId,
    });
  } catch (error) {
    console.error("[wallet-gate] blocked-operation notification failed:", error);
  }
}

export async function reserveApiWalletCharge(input: {
  req?: Request;
  userEmail: string;
  serviceId: UsageServiceId;
  provider: UsageProvider;
  route: string;
  maxCostMicros: number;
  operationId?: string;
  requestId?: string;
  expiresAt?: string;
  reservationTtlMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<ApiWalletCharge | null> {
  const mode = walletGateMode();
  if (mode === "off") return null;

  const maxCostMicros = Math.ceil(input.maxCostMicros);
  if (!Number.isSafeInteger(maxCostMicros) || maxCostMicros <= 0) {
    throw new WalletConfigurationError(`Wallet gate requires a positive maxCostMicros for ${input.route}.`);
  }

  const userEmail = normalizeUserEmail(input.userEmail);
  const operationId = input.operationId?.trim() || requestOperationId(input.req, input.route);
  const requestId = input.requestId?.trim() || operationId;
  const spendControlOperationId = `${operationId}:spend-control`;
  const expiresAt =
    input.expiresAt?.trim() ||
    expiresAtFromTtl(
      input.reservationTtlMs ??
        defaultReservationTtlMs({
          provider: input.provider,
          route: input.route,
          serviceId: input.serviceId,
        }),
    );

  if (mode === "dry_run") {
    return null;
  }

  let reservation: Awaited<ReturnType<typeof reserveWalletAmount>>;
  try {
    reservation = await reserveWalletAmount({
      userEmail,
      amountMicros: maxCostMicros,
      operationId: `${operationId}:reserve`,
      serviceId: input.serviceId,
      provider: input.provider,
      route: input.route,
      requestId,
      expiresAt,
      metadata: input.metadata,
    });
  } catch (error) {
    if (error instanceof WalletInsufficientFundsError) {
      await notifyOperationBlockedByBalance({
        userEmail,
        route: input.route,
        operationId,
        requiredMicros: maxCostMicros,
      });
    }
    throw error;
  }

  if (reservation.duplicate) {
    throw new WalletDuplicateOperationError(operationId);
  }

  try {
    const spendControl = await checkAndRecordSpendControl({
      userEmail,
      provider: input.provider,
      serviceId: input.serviceId,
      route: input.route,
      amountMicros: maxCostMicros,
      operationId: spendControlOperationId,
      requestId,
    });
    if (spendControl.mode === "dry_run" && spendControl.wouldBlock) {
      console.warn("[wallet-gate] spend controls dry_run would block operation", spendControl);
    }
  } catch (error) {
    try {
      await releaseWalletReservation({
        userEmail,
        reservationId: reservation.reservationId,
        operationId: `${operationId}:release-spend-control-denied`,
        reason: "spend_control_denied",
        metadata: {
          errorName: error instanceof Error ? error.name : undefined,
          errorMessage: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
        },
      });
    } catch (releaseError) {
      console.error("[wallet-gate] failed to release reservation after spend control denial:", releaseError);
    }
    throw error;
  }

  let closed = false;
  const releaseSpend = async (params: {
    amountMicros: number;
    releaseOperationId: string;
    reason: string;
  }) => {
    if (params.amountMicros <= 0) return;
    try {
      await releaseSpendControl({
        userEmail,
        operationId: spendControlOperationId,
        releaseOperationId: params.releaseOperationId,
        amountMicros: params.amountMicros,
        reason: params.reason,
      });
    } catch (error) {
      console.error("[wallet-gate] failed to release spend-control counters:", error);
    }
  };
  const charge: ApiWalletCharge = {
    mode,
    operationId,
    reservationId: reservation.reservationId,
    reservedMicros: maxCostMicros,
    capture: async (captureInput) => {
      if (closed) return;
      const requestedMicros =
        captureInput.actualCostMicros != null
          ? Math.ceil(captureInput.actualCostMicros)
          : usdToMicros(captureInput.actualCostUsd ?? 0);
      if (!Number.isSafeInteger(requestedMicros) || requestedMicros <= 0) {
        await charge.release({
          reason: "zero_actual_cost",
          metadata: captureInput.metadata,
        });
        return;
      }
      const capturedMicros = Math.min(requestedMicros, maxCostMicros);
      await captureWalletReservation({
        userEmail,
        reservationId: reservation.reservationId,
        captureMicros: capturedMicros,
        operationId: `${operationId}:capture`,
        providerCostId: captureInput.providerCostId,
        metadata: {
          ...captureInput.metadata,
          actualCostMicros: requestedMicros,
          underreservedMicros: Math.max(0, requestedMicros - maxCostMicros),
        },
      }).catch(async (error) => {
        await recordPendingWalletCapture({
          userEmail,
          reservationId: reservation.reservationId,
          captureMicros: capturedMicros,
          operationId: `${operationId}:capture`,
          providerCostId: captureInput.providerCostId,
          metadata: {
            ...captureInput.metadata,
            actualCostMicros: requestedMicros,
            underreservedMicros: Math.max(0, requestedMicros - maxCostMicros),
          },
          lastError: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        console.error("[wallet-gate] capture failed; pending capture recorded:", error);
      });
      await releaseSpend({
        amountMicros: maxCostMicros - capturedMicros,
        releaseOperationId: `${spendControlOperationId}:release-capture-remainder`,
        reason: "capture_remainder",
      });
      await notifyLowBalanceIfNeeded({ userEmail, operationId: `${operationId}:capture` });
      closed = true;
    },
    release: async (releaseInput) => {
      if (closed) return;
      const reason = releaseInput?.reason || "wallet_release";
      await releaseWalletReservation({
        userEmail,
        reservationId: reservation.reservationId,
        operationId: `${operationId}:release`,
        reason,
        metadata: releaseInput?.metadata,
      });
      await releaseSpend({
        amountMicros: maxCostMicros,
        releaseOperationId: `${spendControlOperationId}:release`,
        reason,
      });
      closed = true;
    },
  };

  return charge;
}

export async function linkApiWalletChargeToProviderJob(
  charge: ApiWalletCharge | null,
  input: {
    userEmail: string;
    provider: UsageProvider;
    providerJobId: string;
    serviceId?: UsageServiceId;
    route?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!charge) return;
  if (charge.mode !== "enforce") return;
  await linkWalletReservationToProviderJob({
    userEmail: input.userEmail,
    reservationId: charge.reservationId,
    reservedMicros: charge.reservedMicros,
    provider: input.provider,
    providerJobId: input.providerJobId,
    serviceId: input.serviceId,
    route: input.route,
    operationId: `${charge.operationId}:provider-job:${input.provider}:${input.providerJobId}`,
    metadata: {
      ...input.metadata,
      walletOperationId: charge.operationId,
      spendControlOperationId: `${charge.operationId}:spend-control`,
    },
  });
}

function linkedSpendControlOperationId(link: { metadata?: Record<string, unknown> }): string | null {
  const value = link.metadata?.spendControlOperationId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function releaseLinkedSpendControl(input: {
  link: { userEmail: string; metadata?: Record<string, unknown> };
  amountMicros: number;
  releaseOperationId: string;
  reason: string;
}): Promise<void> {
  if (input.amountMicros <= 0) return;
  const operationId = linkedSpendControlOperationId(input.link);
  if (!operationId) return;
  try {
    await releaseSpendControl({
      userEmail: input.link.userEmail,
      operationId,
      releaseOperationId: input.releaseOperationId,
      amountMicros: input.amountMicros,
      reason: input.reason,
    });
  } catch (error) {
    console.error("[wallet-gate] failed to release linked spend-control counters:", error);
  }
}

export async function settleProviderJobWalletCharge(input: {
  provider: UsageProvider;
  providerJobId: string;
  status: string;
  successStatuses: string[];
  failureStatuses: string[];
  actualCostMicros?: number;
  actualCostUsd?: number;
  metadata?: Record<string, unknown>;
}): Promise<ProviderJobWalletSettlement> {
  const mode = walletGateMode();
  if (mode === "off") return { action: "none", reason: "wallet_gate_off" };
  if (mode === "dry_run") return { action: "none", reason: "dry_run" };

  const normalizedStatus = input.status.trim().toLowerCase();
  const isSuccess = input.successStatuses.map((s) => s.toLowerCase()).includes(normalizedStatus);
  const isFailure = input.failureStatuses.map((s) => s.toLowerCase()).includes(normalizedStatus);
  if (!isSuccess && !isFailure) return { action: "none", reason: "status_pending" };

  const link = await readWalletReservationForProviderJob({
    provider: input.provider,
    providerJobId: input.providerJobId,
  });
  if (!link) return { action: "none", reason: "not_found" };

  if (isFailure) {
    const released = await releaseWalletReservation({
      userEmail: link.userEmail,
      reservationId: link.reservationId,
      operationId: `provider-job:${input.provider}:${input.providerJobId}:release`,
      reason: `provider_status_${normalizedStatus}`,
      metadata: input.metadata,
    });
    await releaseLinkedSpendControl({
      link,
      amountMicros: link.reservedMicros,
      releaseOperationId: `provider-job:${input.provider}:${input.providerJobId}:spend-release`,
      reason: `provider_status_${normalizedStatus}`,
    });
    return {
      action: "release",
      reservationId: link.reservationId,
      releasedMicros: released.releasedMicros,
      duplicate: released.duplicate,
    };
  }

  const linkedEstimateMicros =
    typeof link.metadata?.estimatedCostMicros === "number"
      ? Math.ceil(link.metadata.estimatedCostMicros)
      : 0;
  const requestedMicros =
    input.actualCostMicros != null
      ? Math.ceil(input.actualCostMicros)
      : input.actualCostUsd != null
        ? usdToMicros(input.actualCostUsd)
        : linkedEstimateMicros;
  if (!Number.isSafeInteger(requestedMicros) || requestedMicros <= 0) {
    const released = await releaseWalletReservation({
      userEmail: link.userEmail,
      reservationId: link.reservationId,
      operationId: `provider-job:${input.provider}:${input.providerJobId}:release-zero-cost`,
      reason: "zero_actual_cost",
      metadata: input.metadata,
    });
    await releaseLinkedSpendControl({
      link,
      amountMicros: link.reservedMicros,
      releaseOperationId: `provider-job:${input.provider}:${input.providerJobId}:spend-release-zero-cost`,
      reason: "zero_actual_cost",
    });
    return {
      action: "release",
      reservationId: link.reservationId,
      releasedMicros: released.releasedMicros,
      duplicate: released.duplicate,
    };
  }

  const capturedMicros = Math.min(requestedMicros, link.reservedMicros);
  const captureOperationId = `provider-job:${input.provider}:${input.providerJobId}:capture`;
  let captured: Awaited<ReturnType<typeof captureWalletReservation>>;
  try {
    captured = await captureWalletReservation({
      userEmail: link.userEmail,
      reservationId: link.reservationId,
      captureMicros: capturedMicros,
      operationId: captureOperationId,
      providerCostId: input.providerJobId,
      metadata: {
        ...input.metadata,
        actualCostMicros: requestedMicros,
        underreservedMicros: Math.max(0, requestedMicros - link.reservedMicros),
      },
    });
  } catch (error) {
    await recordPendingWalletCapture({
      userEmail: link.userEmail,
      reservationId: link.reservationId,
      captureMicros: capturedMicros,
      operationId: captureOperationId,
      providerCostId: input.providerJobId,
      metadata: {
        ...input.metadata,
        actualCostMicros: requestedMicros,
        underreservedMicros: Math.max(0, requestedMicros - link.reservedMicros),
      },
      lastError: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    console.error("[wallet-gate] async capture failed; pending capture recorded:", error);
    await releaseLinkedSpendControl({
      link,
      amountMicros: link.reservedMicros - capturedMicros,
      releaseOperationId: `provider-job:${input.provider}:${input.providerJobId}:spend-release-capture-remainder`,
      reason: "capture_remainder",
    });
    return {
      action: "capture_pending",
      reservationId: link.reservationId,
      capturedMicros,
    };
  }
  await releaseLinkedSpendControl({
    link,
    amountMicros: link.reservedMicros - capturedMicros,
    releaseOperationId: `provider-job:${input.provider}:${input.providerJobId}:spend-release-capture-remainder`,
    reason: "capture_remainder",
  });
  await notifyLowBalanceIfNeeded({
    userEmail: link.userEmail,
    operationId: captureOperationId,
  });
  return {
    action: "capture",
    reservationId: link.reservationId,
    capturedMicros: captured.capturedMicros,
    duplicate: captured.duplicate,
  };
}

export async function releaseApiWalletChargeOnError(
  charge: ApiWalletCharge | null,
  error: unknown,
): Promise<void> {
  if (!charge) return;
  try {
    await charge.release({
      reason: "provider_or_route_error",
      metadata: {
        errorName: error instanceof Error ? error.name : undefined,
        errorMessage: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      },
    });
  } catch (releaseError) {
    console.error("[wallet-gate] failed to release reservation after route error:", releaseError);
  }
}

export function walletGateErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof WalletInsufficientFundsError) {
    return NextResponse.json(
      {
        error: "Saldo insuficiente para ejecutar esta operación.",
        code: "insufficient_balance",
        amountMicros: error.amountMicros,
      },
      { status: 402 },
    );
  }
  if (error instanceof WalletDuplicateOperationError) {
    return NextResponse.json(
      {
        error: "Esta operación ya fue aceptada. Genera una operación nueva para volver a intentarlo.",
        code: "duplicate_wallet_operation",
        operationId: error.operationId,
      },
      { status: 409 },
    );
  }
  if (error instanceof SpendControlLimitExceededError) {
    return NextResponse.json(
      {
        error: "Has alcanzado el límite temporal de gasto para esta operación.",
        code: "spend_limit_exceeded",
        windowKind: error.windowKind,
        provider: error.provider,
        limitMicros: error.limitMicros,
        amountMicros: error.amountMicros,
      },
      { status: 429 },
    );
  }
  if (error instanceof SpendControlProviderDisabledError) {
    return NextResponse.json(
      {
        error: "Este proveedor está temporalmente desactivado por control de gasto.",
        code: "provider_spend_disabled",
        provider: error.provider,
      },
      { status: 423 },
    );
  }
  if (error instanceof SpendControlConfigurationError) {
    return NextResponse.json(
      {
        error: "Los límites de gasto de Foldder no están configurados correctamente.",
        code: "spend_controls_configuration_error",
      },
      { status: 503 },
    );
  }
  if (error instanceof WalletConfigurationError) {
    return NextResponse.json(
      {
        error: "El wallet de Foldder no está configurado correctamente.",
        code: "wallet_configuration_error",
      },
      { status: 503 },
    );
  }
  if (isDynamoTransactionConflict(error)) {
    return NextResponse.json(
      {
        error: "Otra operación del wallet está en curso. Vuelve a intentarlo en un instante.",
        code: "wallet_transaction_conflict",
      },
      { status: 409 },
    );
  }
  return null;
}
