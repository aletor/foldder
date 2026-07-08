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
  estimateGenomaIngestAnalysisUsd,
  type GenomaIngestPaidKind,
} from "./genoma-ingest-cost";
import { freshGenomaIngestOperationId } from "./paid-operations";

function serverFreshIngestOperationId(contentSignature: string): string {
  return freshGenomaIngestOperationId(contentSignature, `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`);
}

async function reserveIngestChargeOnce(input: {
  userEmail: string;
  kind: GenomaIngestPaidKind;
  contentSignature: string;
  operationId: string;
}): Promise<ApiWalletCharge | null> {
  const estimatedUsd = estimateGenomaIngestAnalysisUsd(input.kind);
  return reserveApiWalletCharge({
    userEmail: input.userEmail,
    operationId: input.operationId,
    route: "/api/spaces/genoma/ingest",
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

export async function reserveGenomaIngestAnalysisCharge(input: {
  userEmail?: string;
  contentSignature: string;
  kind: GenomaIngestPaidKind;
  operationId?: string;
}): Promise<ApiWalletCharge | null> {
  if (!input.userEmail) return null;

  const primaryId =
    input.operationId?.trim() || serverFreshIngestOperationId(input.contentSignature);
  const estimatedUsd = estimateGenomaIngestAnalysisUsd(input.kind);

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

export async function settleGenomaIngestAnalysisCharge(
  charge: ApiWalletCharge | null,
  kind: GenomaIngestPaidKind,
): Promise<void> {
  if (!charge) return;
  await charge.capture({
    actualCostUsd: estimateGenomaIngestAnalysisUsd(kind) * 0.85,
    metadata: { kind },
  });
}

export async function releaseGenomaIngestAnalysisCharge(
  charge: ApiWalletCharge | null,
  error: unknown,
): Promise<void> {
  await releaseApiWalletChargeOnError(charge, error);
}
