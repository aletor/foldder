import type { GenomaIngestPaidKind } from "./genoma-ingest-cost";

export const GENOMA_INGEST_ALLOW_PAID_FIELD = "allowPaidAnalysis";
export const GENOMA_INGEST_OPERATION_ID_FIELD = "paidAnalysisOperationId";
export const GENOMA_INGEST_PAID_KIND_FIELD = "paidAnalysisKind";

export type GenomaIngestPaidOpts = {
  allowPaidAnalysis: boolean;
  paidAnalysisOperationId?: string;
  paidAnalysisKind?: GenomaIngestPaidKind;
};

export function parseGenomaIngestPaidOpts(formData: FormData): GenomaIngestPaidOpts {
  const allowPaidAnalysis = formData.get(GENOMA_INGEST_ALLOW_PAID_FIELD) === "1";
  const paidAnalysisOperationId = formData.get(GENOMA_INGEST_OPERATION_ID_FIELD);
  const kindRaw = formData.get(GENOMA_INGEST_PAID_KIND_FIELD);
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
