import { randomUUID } from "node:crypto";
import {
  reserveApiWalletCharge,
  WalletDuplicateOperationError,
  reserveUsdToMicros,
  walletGateMode,
  type ApiWalletCharge,
} from "@/lib/wallet-api-gate";
import { estimateGeminiImageGenerationUsd } from "@/lib/pricing-config";
import { freshBrandKitVisualOperationId } from "./paid-operations";

function serverFreshVisualOperationId(axesSignature: string): string {
  return freshBrandKitVisualOperationId(axesSignature, `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`);
}

async function reserveVisualChargeOnce(input: {
  req?: Request;
  userEmail: string;
  axesSignature: string;
  operationId: string;
}): Promise<ApiWalletCharge | null> {
  const estimatedCostUsd = estimateGeminiImageGenerationUsd("flash31", "1k");
  return reserveApiWalletCharge({
    req: input.req,
    userEmail: input.userEmail,
    operationId: input.operationId,
    route: "/api/spaces/brandKit/visual/generate",
    provider: "gemini",
    serviceId: "gemini-nano",
    maxCostMicros: reserveUsdToMicros(estimatedCostUsd, { multiplier: 1.15 }),
    metadata: { feature: "brand-kit-visual", axesSignature: input.axesSignature },
  });
}

export async function reserveBrandKitVisualGenerateCharge(input: {
  req?: Request;
  userEmail?: string;
  axesSignature: string;
  operationId?: string;
}): Promise<ApiWalletCharge | null> {
  if (!input.userEmail) return null;

  const primaryId = input.operationId?.trim() || serverFreshVisualOperationId(input.axesSignature);

  const attempt = async (operationId: string) =>
    reserveVisualChargeOnce({
      req: input.req,
      userEmail: input.userEmail!,
      axesSignature: input.axesSignature,
      operationId,
    });

  try {
    return await attempt(primaryId);
  } catch (error) {
    if (error instanceof WalletDuplicateOperationError) {
      const retryId = serverFreshVisualOperationId(input.axesSignature);
      console.warn(`[brandKit-visual] wallet duplicate on ${primaryId}, retrying as ${retryId}`);
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
