import { randomUUID } from "node:crypto";
import {
  reserveApiWalletCharge,
  releaseApiWalletChargeOnError,
  reserveUsdToMicros,
  walletGateMode,
  WalletDuplicateOperationError,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { GEMINI_VISION_ANALYSIS_SERVICE_ID } from "@/lib/brain/brain-vision-usage";
import {
  estimateBrandKitIngestAnalysisUsd,
  type BrandKitIngestPaidKind,
} from "./brand-kit-ingest-cost";
import { freshBrandKitIngestOperationId } from "./paid-operations";

function serverFreshIngestOperationId(contentSignature: string): string {
  return freshBrandKitIngestOperationId(contentSignature, `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`);
}

async function reserveIngestChargeOnce(input: {
  userEmail: string;
  kind: BrandKitIngestPaidKind;
  contentSignature: string;
  operationId: string;
}): Promise<ApiWalletCharge | null> {
  const estimatedUsd = estimateBrandKitIngestAnalysisUsd(input.kind);
  return reserveApiWalletCharge({
    userEmail: input.userEmail,
    operationId: input.operationId,
    route: "/api/spaces/brandKit/ingest",
    provider: "gemini",
    serviceId: GEMINI_VISION_ANALYSIS_SERVICE_ID,
    maxCostMicros: reserveUsdToMicros(estimatedUsd, { multiplier: 1.25 }),
    metadata: {
      kind: input.kind,
      contentSignature: input.contentSignature.slice(0, 16),
      walletOperationId: input.operationId,
    },
  });
}

export async function reserveBrandKitIngestAnalysisCharge(input: {
  userEmail?: string;
  contentSignature: string;
  kind: BrandKitIngestPaidKind;
  operationId?: string;
}): Promise<ApiWalletCharge | null> {
  if (!input.userEmail) return null;

  const primaryId =
    input.operationId?.trim() || serverFreshIngestOperationId(input.contentSignature);
  const estimatedUsd = estimateBrandKitIngestAnalysisUsd(input.kind);

  const attempt = async (operationId: string) =>
    reserveIngestChargeOnce({
      userEmail: input.userEmail!,
      kind: input.kind,
      contentSignature: input.contentSignature,
      operationId,
    });

  try {
    return await attempt(primaryId);
  } catch (error) {
    if (error instanceof WalletDuplicateOperationError) {
      const retryId = serverFreshIngestOperationId(input.contentSignature);
      console.warn(
        `[vision] wallet duplicate on ${primaryId}, retrying as ${retryId} (~$${estimatedUsd.toFixed(3)})`,
      );
      try {
        return await attempt(retryId);
      } catch (retryError) {
        if (walletGateMode() === "enforce") throw retryError;
        return null;
      }
    }
    if (walletGateMode() === "enforce") throw error;
    return null;
  }
}

export async function settleBrandKitIngestAnalysisCharge(
  charge: ApiWalletCharge | null,
  kind: BrandKitIngestPaidKind,
): Promise<void> {
  if (!charge) return;
  await charge.capture({
    actualCostUsd: estimateBrandKitIngestAnalysisUsd(kind) * 0.85,
    metadata: { kind },
  });
}

export async function releaseUnusedBrandKitIngestAnalysisCharge(
  charge: ApiWalletCharge | null,
  reason: string,
): Promise<void> {
  if (!charge) return;
  try {
    await charge.release({ reason, metadata: { unused: true } });
  } catch (error) {
    console.error("[brandKit/ingest/wallet] failed to release unused charge:", error);
  }
}

export async function releaseBrandKitIngestAnalysisCharge(
  charge: ApiWalletCharge | null,
  error: unknown,
): Promise<void> {
  await releaseApiWalletChargeOnError(charge, error);
}
