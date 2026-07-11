import type { BrandKitIngestPaidKind } from "./brand-kit-ingest-cost";

export const BRAND_KIT_INGEST_ALLOW_PAID_FIELD = "allowPaidAnalysis";
export const BRAND_KIT_INGEST_OPERATION_ID_FIELD = "paidAnalysisOperationId";
export const BRAND_KIT_INGEST_PAID_KIND_FIELD = "paidAnalysisKind";

export type BrandKitIngestPaidOpts = {
  allowPaidAnalysis: boolean;
  paidAnalysisOperationId?: string;
  paidAnalysisKind?: BrandKitIngestPaidKind;
};

export function parseBrandKitIngestPaidOpts(formData: FormData): BrandKitIngestPaidOpts {
  const allowPaidAnalysis = formData.get(BRAND_KIT_INGEST_ALLOW_PAID_FIELD) === "1";
  const paidAnalysisOperationId = formData.get(BRAND_KIT_INGEST_OPERATION_ID_FIELD);
  const kindRaw = formData.get(BRAND_KIT_INGEST_PAID_KIND_FIELD);
  const paidAnalysisKind =
    kindRaw === "pdf" || kindRaw === "url" ? kindRaw : undefined;
  return {
    allowPaidAnalysis,
    paidAnalysisOperationId:
      typeof paidAnalysisOperationId === "string" && paidAnalysisOperationId.trim()
        ? paidAnalysisOperationId.trim()
        : undefined,
    paidAnalysisKind,
  };
}
