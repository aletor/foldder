/**
 * Fase A — orquestación por página + audit log (rejected/warnings).
 */

import fs from "node:fs";
import path from "node:path";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { clusterPdfPagesByLayout } from "./page-vision-pass-page-clusters";
import { invokePageVisionPassModel } from "./page-vision-pass-invoker";
import { selectPageVisionPassPages, guaranteedVisionPageNumbers } from "./page-vision-pass-selection";
import {
  validatePageVisionPass,
  type PageVisionParseRejection,
  type PageVisionPassResult,
  type PageVisionPassWarning,
} from "./page-vision-pass-schema";
import {
  GENOMA_PAGE_VISION_NIVEL1_VERSION,
  GENOMA_PAGE_VISION_PASS_VERSION,
  PAGE_VISION_PASS_DPI,
  pageVisionPassCacheKey,
} from "./page-vision-pass-version";
import type { PageVisionGeminiUsageSnapshot } from "./page-vision-batch-gemini-usage";
import type { Nivel1BatchAttemptMetrics } from "./page-vision-pass-batch-invoker";

const RUNS_DIR = path.join(process.cwd(), "fixtures/page-vision-pass/runs");
const GOLDEN_DIR = path.join(process.cwd(), "fixtures/page-vision-pass");

/** Gate único de Fase A — solo `GENOMA_PAGE_VISION_PASS_ENABLED=1` (sin heurística por filename). */
export function isPageVisionPassEnabled(): boolean {
  return process.env.GENOMA_PAGE_VISION_PASS_ENABLED === "1";
}

export type PageVisionPassPageAudit = {
  pageNumber: number;
  cacheKey: string;
  ok: boolean;
  rootError?: string;
  result?: PageVisionPassResult;
  rejected: PageVisionParseRejection[];
  warnings: PageVisionPassWarning[];
  retried: boolean;
};

export type PageVisionPassPrepassSnapshot = {
  durationMs: number;
  recurrentXObjectPages: number[];
  embeddedSvgCount: number;
  domainHints: string[];
  logoLikelyPages: number[];
};

export type { PageVisionGeminiUsageSnapshot } from "./page-vision-batch-gemini-usage";
export type { Nivel1BatchAttemptMetrics } from "./page-vision-pass-batch-invoker";

export type PageVisionIngestMetrics = {
  nivel: 1;
  /** false = campos numéricos no verificados (sin corrida LLM real). */
  measured: boolean;
  llmCallsAtIngest: number;
  latencyMs: number;
  estimatedCostUsd: number;
  logoPath: import("../model/trait-values").LogoAssetOrigin | "unknown";
  prepassMs: number;
  renderMs: number;
  /** Wall-clock del tramo prepass∥render (≈ max, no suma). */
  parallelPrepassRenderMs?: number;
  /** Tiempo hasta genoma interactivo (sin harvest nativo). */
  interactiveLatencyMs?: number;
  /** Extracción nativa diferida — medida aparte del camino crítico. */
  logoNativeUpgradeMs?: number;
  logoHarvestMs?: number;
  nivel0BaselineLlmCalls?: number;
  batchLongEdgePx?: number;
  batchJpegQuality?: number;
  /** Suma bytes JPEG (sin base64) enviados al batch. */
  batchImagePayloadBytes?: number;
  batchImagePayloadBytesByPage?: Record<number, number>;
  batchLatencyMs?: number;
  batchFallbackUsed?: boolean;
  batchAttempts?: Nivel1BatchAttemptMetrics[];
  geminiModel?: string;
  geminiUsage?: PageVisionGeminiUsageSnapshot;
};

export type Nivel1DeepPassImageRef = {
  pageNumber: number;
  bbox: [number, number, number, number];
  tag?: string;
};

export type PageVisionPassRunAudit = {
  version: typeof GENOMA_PAGE_VISION_PASS_VERSION;
  dpi: typeof PAGE_VISION_PASS_DPI;
  contentSha256: string;
  fileName: string;
  totalPages: number;
  selectedPages: number[];
  pages: PageVisionPassPageAudit[];
  generatedAt: string;
  /** Contrato slim Nivel 1 usado en batch. */
  nivel1Contract?: typeof GENOMA_PAGE_VISION_NIVEL1_VERSION;
  prepass?: PageVisionPassPrepassSnapshot;
  docKind?: string;
  emitterBrandHint?: string;
  deepPassTriagedPages?: number[];
  deepPassTriagedImages?: Nivel1DeepPassImageRef[];
  ingestMetrics?: PageVisionIngestMetrics;
  /** Error del invocador batch cuando se degrada sin throw (audit failed). */
  batchInvokeError?: string;
};

export type PageVisionSelectionScope = "stratified" | "guaranteed-only";

export type RunPageVisionPassForPdfInput = {
  buffer: Buffer;
  contentSha256: string;
  fileName: string;
  userEmail?: string;
  route?: string;
  maxPages?: number;
  writeAudit?: boolean;
  writeGoldenPages?: number[];
  /** Ingesta app: solo portada + anclas; script: muestreo estratificado completo. */
  selectionScope?: PageVisionSelectionScope;
};

async function analyzeOnePage(input: {
  buffer: Buffer;
  pageNumber: number;
  totalPages: number;
  pngBase64: string;
  userEmail?: string;
  route?: string;
  contentSha256: string;
  retried: boolean;
}): Promise<Omit<PageVisionPassPageAudit, "cacheKey" | "retried">> {
  const operationId = pageVisionPassCacheKey(input.contentSha256, input.pageNumber);
  try {
    const raw = await invokePageVisionPassModel({
      pageNumber: input.pageNumber,
      totalPages: input.totalPages,
      pngBase64: input.pngBase64,
      userEmail: input.userEmail,
      route: input.route,
      operationId,
    });
    const validated = validatePageVisionPass(raw, { pageNumber: input.pageNumber });
    if (validated.ok) {
      return {
        pageNumber: input.pageNumber,
        ok: true,
        result: validated.result,
        rejected: validated.rejected,
        warnings: validated.warnings,
      };
    }
    return {
      pageNumber: input.pageNumber,
      ok: false,
      rootError: validated.rootError,
      rejected: validated.rejected,
      warnings: [],
    };
  } catch (error) {
    return {
      pageNumber: input.pageNumber,
      ok: false,
      rootError: error instanceof Error ? error.message : String(error),
      rejected: [],
      warnings: [],
    };
  }
}

export async function runPageVisionPassForPdf(
  input: RunPageVisionPassForPdfInput,
): Promise<PageVisionPassRunAudit> {
  const maxPages = input.maxPages ?? 200;
  const totalPages = await countPdfPagesInBuffer(input.buffer, maxPages);
  const clusters = await clusterPdfPagesByLayout(input.buffer, totalPages, maxPages);
  const guaranteed = guaranteedVisionPageNumbers(totalPages);
  const plan =
    input.selectionScope === "guaranteed-only"
      ? {
          guaranteed,
          sampled: [] as number[],
          selected: guaranteed,
          estimatedCalls: guaranteed.length,
        }
      : selectPageVisionPassPages({
          totalPages,
          templateClusters: clusters,
          pagesPerCluster: 2,
        });

  const rendered = await renderPdfPages(input.buffer, {
    maxPages: totalPages,
    dpi: PAGE_VISION_PASS_DPI,
  });
  const pngByPage = new Map(rendered.map((p) => [p.pageNumber, p.pngBuffer.toString("base64")]));

  const pages: PageVisionPassPageAudit[] = [];
  for (const pageNumber of plan.selected) {
    const pngBase64 = pngByPage.get(pageNumber);
    if (!pngBase64) continue;

    let audit = await analyzeOnePage({
      buffer: input.buffer,
      pageNumber,
      totalPages,
      pngBase64,
      userEmail: input.userEmail,
      route: input.route,
      contentSha256: input.contentSha256,
      retried: false,
    });

    let retried = false;
    if (!audit.ok) {
      retried = true;
      audit = await analyzeOnePage({
        buffer: input.buffer,
        pageNumber,
        totalPages,
        pngBase64,
        userEmail: input.userEmail,
        route: input.route ?? "/lib/genoma/ingest/page-vision-pass-retry",
        contentSha256: `${input.contentSha256.slice(0, 16)}-retry-${pageNumber}`,
        retried: true,
      });
    }

    pages.push({
      ...audit,
      cacheKey: pageVisionPassCacheKey(input.contentSha256, pageNumber),
      retried,
    });
  }

  const runAudit: PageVisionPassRunAudit = {
    version: GENOMA_PAGE_VISION_PASS_VERSION,
    dpi: PAGE_VISION_PASS_DPI,
    contentSha256: input.contentSha256,
    fileName: input.fileName,
    totalPages,
    selectedPages: plan.selected,
    pages,
    generatedAt: new Date().toISOString(),
  };

  if (input.writeAudit !== false) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    const stamp = runAudit.generatedAt.replace(/[:.]/g, "-");
    const auditPath = path.join(
      RUNS_DIR,
      `${input.contentSha256.slice(0, 12)}-${stamp}.audit.json`,
    );
    fs.writeFileSync(auditPath, `${JSON.stringify(runAudit, null, 2)}\n`, "utf8");
  }

  for (const pageNumber of input.writeGoldenPages ?? []) {
    const entry = pages.find((p) => p.pageNumber === pageNumber && p.ok && p.result);
    if (!entry?.result) continue;
    const { version: _v, page: _p, ...modelOutput } = entry.result;
    const goldenPath = path.join(GOLDEN_DIR, `page-${pageNumber}.model.golden.json`);
    fs.writeFileSync(goldenPath, `${JSON.stringify(modelOutput, null, 2)}\n`, "utf8");
  }

  return runAudit;
}

export function summarizePageVisionPassRun(audit: PageVisionPassRunAudit): string {
  const okPages = audit.pages.filter((p) => p.ok).length;
  const rejectedTotal = audit.pages.reduce((n, p) => n + p.rejected.length, 0);
  const warningsTotal = audit.pages.reduce((n, p) => n + p.warnings.length, 0);
  return `Fase A · ${okPages}/${audit.pages.length} páginas · ${rejectedTotal} rejected · ${warningsTotal} warnings`;
}
