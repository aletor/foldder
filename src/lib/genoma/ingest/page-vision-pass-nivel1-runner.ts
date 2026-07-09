/**
 * Nivel 1 — pre-pase determinista → ≤5 páginas clave → 1 llamada LLM batch slim.
 * El batch NO consume miniaturas del prepass — solo JPEGs renderizados con tag.
 * Prepass corre en paralelo al tramo render→batch (metadatos + audit).
 */

import fs from "node:fs";
import path from "node:path";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { renderPdfPages } from "@/lib/brain/pdf-page-render";
import { pageVisionAuditHasLogos } from "./page-vision-pass-apply";
import {
  invokePageVisionPassBatchModel,
  type PageVisionBatchPageInput,
} from "./page-vision-pass-batch-invoker";
import { buildPageVisionImageTag } from "./page-vision-page-tag-burn";
import { buildPageVisionBatchFrame } from "./page-vision-batch-frame";
import { resolveNivel1BatchPageByEchoedTag } from "./page-vision-pass-nivel1-attribution";
import {
  parseNivel1BatchRoot,
  validateNivel1SlimPage,
} from "./page-vision-pass-nivel1-schema";
import {
  runPageVisionPrepass,
  selectNivel1GuaranteedVisionPages,
} from "./page-vision-prepass";
import type {
  PageVisionPassPageAudit,
  PageVisionPassRunAudit,
  RunPageVisionPassForPdfInput,
} from "./page-vision-pass-runner";
import { guaranteedVisionPageNumbers } from "./page-vision-pass-selection";
import type { LogoAssetOrigin } from "../model/trait-values";
import {
  GENOMA_PAGE_VISION_NIVEL1_VERSION,
  GENOMA_PAGE_VISION_PASS_VERSION,
  PAGE_VISION_NIVEL1_JPEG_QUALITY,
  PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
  PAGE_VISION_NIVEL1_RENDER_DPI,
  PAGE_VISION_PASS_DPI,
  pageVisionNivel1CacheKey,
} from "./page-vision-pass-version";

const RUNS_DIR = path.join(process.cwd(), "fixtures/page-vision-pass/runs");
const NIVEL1_MAX_PAGES = 5;

export function isPageVisionNivel1Enabled(): boolean {
  return process.env.GENOMA_PAGE_VISION_NIVEL1 === "1";
}

function inferProvisionalLogoPath(audit: PageVisionPassRunAudit): LogoAssetOrigin | "unknown" {
  if (pageVisionAuditHasLogos(audit)) return "render_crop";
  const hasWordmark = audit.pages.some(
    (p) => p.ok && p.result?.brandNameEvidence.some((e) => e.kind === "wordmark_logo"),
  );
  return hasWordmark ? "render_crop" : "unknown";
}

export async function runPageVisionPassNivel1ForPdf(
  input: RunPageVisionPassForPdfInput,
): Promise<PageVisionPassRunAudit> {
  const started = Date.now();
  const maxPages = input.maxPages ?? 200;
  const totalPages = await countPdfPagesInBuffer(input.buffer, maxPages);

  const forcedPages = (input.forcedPageNumbers ?? []).filter((page) => page >= 1 && page <= totalPages);
  const selectedPages = forcedPages.length
    ? [...new Set(forcedPages)].sort((a, b) => a - b)
    : selectNivel1GuaranteedVisionPages({
        totalPages,
        maxPages: NIVEL1_MAX_PAGES,
      });

  const prepassPromise = runPageVisionPrepass({
    buffer: input.buffer,
    fileName: input.fileName,
    maxPages: totalPages,
    profile: "nivel1",
  });

  const renderStarted = Date.now();
  const rendered = await renderPdfPages(input.buffer, {
    maxPages: totalPages,
    dpi: PAGE_VISION_NIVEL1_RENDER_DPI,
  });
  const renderMs = Date.now() - renderStarted;

  const pngByPage = new Map(rendered.map((p) => [p.pageNumber, p.pngBuffer]));

  const batchInputs: PageVisionBatchPageInput[] = [];
  const batchImagePayloadBytesByPage: Record<number, number> = {};
  let batchImagePayloadBytes = 0;
  for (const pageNumber of selectedPages) {
    const pngBuffer = pngByPage.get(pageNumber);
    if (!pngBuffer) continue;
    const imageTag = buildPageVisionImageTag(pageNumber);
    const batchFrame = await buildPageVisionBatchFrame(pngBuffer, pageNumber);
    batchImagePayloadBytesByPage[pageNumber] = batchFrame.modelJpeg.length;
    batchImagePayloadBytes += batchFrame.modelJpeg.length;
    batchInputs.push({
      pageNumber,
      totalPages,
      imageBase64: batchFrame.modelJpeg.toString("base64"),
      imageMimeType: "image/jpeg",
      imageTag,
    });
  }

  if (!batchInputs.length) {
    console.warn("[page-vision-nivel1] no rendered pages for batch — degraded audit");
    return finishNivel1RunAudit(input, {
      started,
      totalPages,
      selectedPages,
      batchInputs: [],
      prepassPromise,
      renderMs,
      batchImagePayloadBytes: 0,
      batchImagePayloadBytesByPage: {},
      pages: selectedPages.map((pageNumber) => ({
        pageNumber,
        cacheKey: pageVisionNivel1CacheKey(input.contentSha256, pageNumber),
        ok: false,
        rootError: "batch_no_rendered_pages",
        rejected: [],
        warnings: [],
        retried: false,
      })),
      batch: null,
      batchInvokeError: "Nivel 1 · ninguna página renderizada para batch.",
    });
  }

  let batch: Awaited<ReturnType<typeof invokePageVisionPassBatchModel>> | null = null;
  let batchInvokeError: string | undefined;
  try {
    batch = await invokePageVisionPassBatchModel({
      pages: batchInputs,
      userEmail: input.userEmail,
      route: input.route ?? "/lib/genoma/ingest/page-vision-pass-nivel1",
      operationId: `genoma:nivel1:${input.contentSha256.slice(0, 16)}`,
    });
  } catch (error) {
    batchInvokeError = error instanceof Error ? error.message : String(error);
    console.warn("[page-vision-nivel1] batch invoke failed — degraded audit:", error);
  }

  const prepass = await prepassPromise.catch((error) => {
    console.warn("[page-vision-nivel1] prepass failed — continuing batch without prepass:", error);
    return {
      durationMs: 0,
      recurrentXObjectPages: [] as number[],
      embeddedSvgCount: 0,
      domainHints: [] as string[],
      logoLikelyPages: selectedPages,
      degraded: true,
      prepassErrors: [error instanceof Error ? error.message : String(error)],
    };
  });
  prepass.totalPages = totalPages;

  if (!batch) {
    return finishNivel1RunAudit(input, {
      started,
      totalPages,
      selectedPages,
      batchInputs,
      prepass,
      renderMs,
      batchImagePayloadBytes,
      batchImagePayloadBytesByPage,
      pages: buildBatchFailedPages(input, batchInputs, batchInvokeError ?? "batch_invoke_failed"),
      batch: null,
      batchInvokeError,
    });
  }

  const batchRoot = parseNivel1BatchRoot(batch.raw);
  const docKind = batchRoot?.docKind;
  const emitterBrandHint = batchRoot?.emitterBrandHint;
  const deepPassTriagedPages = batchRoot?.deepPassTriagedPages ?? [];
  const deepPassTriagedImages = batchRoot?.deepPassTriagedImages ?? [];

  const pages: PageVisionPassPageAudit[] = [];

  for (const pageInput of batchInputs) {
    const pageNumber = pageInput.pageNumber;
    const expectedTag = pageInput.imageTag;
    const resolved = resolveNivel1BatchPageByEchoedTag({
      pages: batchRoot?.pages,
      expectedTag,
    });

    if (!resolved.page) {
      const suffix = resolved.error ?? "missing";
      pages.push({
        pageNumber,
        cacheKey: pageVisionNivel1CacheKey(input.contentSha256, pageNumber),
        ok: false,
        rootError: `batch_${suffix}_page:${expectedTag}`,
        rejected: [],
        warnings: [],
        retried: false,
      });
      continue;
    }

    const validated = validateNivel1SlimPage(resolved.page, { pageNumber });
    pages.push({
      pageNumber,
      cacheKey: pageVisionNivel1CacheKey(input.contentSha256, pageNumber),
      ok: validated.ok,
      rootError: validated.ok ? undefined : validated.rootError,
      result: validated.ok ? validated.result : undefined,
      rejected: validated.rejected,
      warnings: validated.ok ? validated.warnings : [],
      retried: false,
    });
  }

  return finishNivel1RunAudit(input, {
    started,
    totalPages,
    selectedPages,
    batchInputs,
    prepass,
    renderMs,
    batchImagePayloadBytes,
    batchImagePayloadBytesByPage,
    pages,
    batch,
    partialAuditExtras: {
      docKind,
      emitterBrandHint,
      deepPassTriagedPages,
      deepPassTriagedImages,
      logoPath: inferProvisionalLogoPath({
        version: GENOMA_PAGE_VISION_PASS_VERSION,
        dpi: PAGE_VISION_PASS_DPI,
        contentSha256: input.contentSha256,
        fileName: input.fileName,
        totalPages,
        selectedPages,
        pages,
        generatedAt: new Date().toISOString(),
        nivel1Contract: GENOMA_PAGE_VISION_NIVEL1_VERSION,
      }),
      interactiveLatencyMs: Date.now() - started,
    },
  });
}

function buildBatchFailedPages(
  input: RunPageVisionPassForPdfInput,
  batchInputs: PageVisionBatchPageInput[],
  rootError: string,
): PageVisionPassPageAudit[] {
  return batchInputs.map((pageInput) => ({
    pageNumber: pageInput.pageNumber,
    cacheKey: pageVisionNivel1CacheKey(input.contentSha256, pageInput.pageNumber),
    ok: false,
    rootError: rootError.slice(0, 240),
    rejected: [],
    warnings: [],
    retried: false,
  }));
}

async function finishNivel1RunAudit(
  input: RunPageVisionPassForPdfInput,
  ctx: {
    started: number;
    totalPages: number;
    selectedPages: number[];
    batchInputs: PageVisionBatchPageInput[];
    prepass: Awaited<ReturnType<typeof runPageVisionPrepass>> | Promise<Awaited<ReturnType<typeof runPageVisionPrepass>>>;
    renderMs: number;
    batchImagePayloadBytes: number;
    batchImagePayloadBytesByPage: Record<number, number>;
    pages: PageVisionPassPageAudit[];
    batch: Awaited<ReturnType<typeof invokePageVisionPassBatchModel>> | null;
    batchInvokeError?: string;
    partialAuditExtras?: {
      docKind?: string;
      emitterBrandHint?: string;
      deepPassTriagedPages?: number[];
      deepPassTriagedImages?: PageVisionPassRunAudit["deepPassTriagedImages"];
      logoPath?: LogoAssetOrigin | "unknown";
      interactiveLatencyMs?: number;
    };
  },
): Promise<PageVisionPassRunAudit> {
  const prepass = await Promise.resolve(ctx.prepass);
  const interactiveLatencyMs = ctx.partialAuditExtras?.interactiveLatencyMs ?? Date.now() - ctx.started;
  const partialAudit: PageVisionPassRunAudit = {
    version: GENOMA_PAGE_VISION_PASS_VERSION,
    dpi: PAGE_VISION_PASS_DPI,
    contentSha256: input.contentSha256,
    fileName: input.fileName,
    totalPages: ctx.totalPages,
    selectedPages: ctx.selectedPages,
    pages: ctx.pages,
    generatedAt: new Date().toISOString(),
    nivel1Contract: GENOMA_PAGE_VISION_NIVEL1_VERSION,
    prepass: {
      durationMs: prepass.durationMs,
      recurrentXObjectPages: prepass.recurrentXObjectPages,
      embeddedSvgCount: prepass.embeddedSvgCount,
      domainHints: prepass.domainHints,
      logoLikelyPages: prepass.logoLikelyPages,
    },
    docKind: ctx.partialAuditExtras?.docKind,
    emitterBrandHint: ctx.partialAuditExtras?.emitterBrandHint,
    deepPassTriagedPages: ctx.partialAuditExtras?.deepPassTriagedPages,
    deepPassTriagedImages: ctx.partialAuditExtras?.deepPassTriagedImages,
  };
  const logoPath = ctx.partialAuditExtras?.logoPath ?? inferProvisionalLogoPath(partialAudit);

  const runAudit: PageVisionPassRunAudit = {
    ...partialAudit,
    ingestMetrics: ctx.batch
      ? {
          nivel: 1,
          measured: true,
          llmCallsAtIngest: ctx.batch.llmCalls,
          latencyMs: interactiveLatencyMs,
          interactiveLatencyMs,
          estimatedCostUsd: ctx.batch.estimatedCostUsd,
          logoPath,
          prepassMs: prepass.durationMs,
          renderMs: ctx.renderMs,
          parallelPrepassRenderMs: Math.max(prepass.durationMs, ctx.renderMs),
          nivel0BaselineLlmCalls: guaranteedVisionPageNumbers(ctx.totalPages).length,
          batchLongEdgePx: PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
          batchJpegQuality: PAGE_VISION_NIVEL1_JPEG_QUALITY,
          batchImagePayloadBytes: ctx.batchImagePayloadBytes,
          batchImagePayloadBytesByPage: ctx.batchImagePayloadBytesByPage,
          batchLatencyMs: ctx.batch.latencyMs,
          batchFallbackUsed: ctx.batch.batchFallbackUsed,
          batchAttempts: ctx.batch.batchAttempts,
          geminiModel: ctx.batch.modelName,
          geminiUsage: ctx.batch.geminiUsage,
        }
      : {
          nivel: 1,
          measured: true,
          llmCallsAtIngest: 0,
          latencyMs: interactiveLatencyMs,
          interactiveLatencyMs,
          estimatedCostUsd: 0,
          logoPath: "unknown",
          prepassMs: prepass.durationMs,
          renderMs: ctx.renderMs,
          parallelPrepassRenderMs: Math.max(prepass.durationMs, ctx.renderMs),
          nivel0BaselineLlmCalls: guaranteedVisionPageNumbers(ctx.totalPages).length,
          batchLongEdgePx: PAGE_VISION_NIVEL1_MAX_LONG_EDGE,
          batchJpegQuality: PAGE_VISION_NIVEL1_JPEG_QUALITY,
          batchImagePayloadBytes: ctx.batchImagePayloadBytes,
          batchImagePayloadBytesByPage: ctx.batchImagePayloadBytesByPage,
          batchLatencyMs: 0,
          batchFallbackUsed: false,
          batchAttempts: [],
          geminiModel: undefined,
          geminiUsage: undefined,
        },
  };

  if (ctx.batchInvokeError) {
    runAudit.batchInvokeError = ctx.batchInvokeError.slice(0, 500);
  }

  if (input.writeAudit !== false) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    const stamp = runAudit.generatedAt.replace(/[:.]/g, "-");
    const auditPath = path.join(
      RUNS_DIR,
      `${input.contentSha256.slice(0, 12)}-${stamp}.audit.json`,
    );
    fs.writeFileSync(auditPath, `${JSON.stringify(runAudit, null, 2)}\n`, "utf8");
  }

  return runAudit;
}

export function auditHasMeasuredNivel1Metrics(
  audit: PageVisionPassRunAudit | null | undefined,
): boolean {
  return audit?.ingestMetrics?.measured === true;
}

export function summarizeNivel1PageVisionRun(audit: PageVisionPassRunAudit): string {
  const okPages = audit.pages.filter((p) => p.ok).length;
  const m = audit.ingestMetrics;
  const outTok = m?.geminiUsage?.candidatesTokenCount ?? "?";
  const payload =
    m?.batchImagePayloadBytes != null
      ? ` · payload ${Math.round(m.batchImagePayloadBytes / 1024)}KB`
      : "";
  const budget =
    m != null
      ? ` · ${m.llmCallsAtIngest} LLM · interactivo ${m.interactiveLatencyMs ?? m.latencyMs}ms (batch ${m.batchLatencyMs ?? "?"}ms · out ${outTok} tok${payload}) · $${m.estimatedCostUsd.toFixed(4)} · ${m.logoPath}`
      : "";
  return `Nivel 1 · ${okPages}/${audit.pages.length} páginas${budget}`;
}
