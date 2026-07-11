import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { countPdfPagesInBuffer } from "@/lib/brain/pdf-brand-extract";
import { bufferContentSha256 } from "@/lib/brandkit/ingest/paid-operations-server";
import { runPageVisionPassNivel1ForPdf } from "@/lib/brandkit/ingest/page-vision-pass-nivel1-runner";
import type { PageVisionPassRunAudit } from "@/lib/brandkit/ingest/page-vision-pass-runner";
import { resolveAuditBbox } from "@/lib/brandkit/ingest/page-vision-pass-bbox";
import { selectNivel1GuaranteedVisionPages } from "@/lib/brandkit/ingest/page-vision-prepass";
import { harvestLogoLabDocument } from "@/lib/brandkit/logo-lab/harvest-document-logos";
import { logoLabRefineKey } from "@/lib/brandkit/logo-lab/harvest-types";
import { bboxIoU, frameBboxToPageBbox } from "@/lib/brandkit/logo-lab/golden/coords";
import { loadGoldenManifest } from "@/lib/brandkit/logo-lab/golden/manifest";
import {
  BENCHMARK_RUNS_DIR,
  resolveGoldenPdfPath,
} from "@/lib/brandkit/logo-lab/golden/paths";
import type {
  BenchmarkResult,
  DocumentResult,
  FailureClass,
  GoldenDocument,
} from "@/lib/brandkit/logo-lab/golden/types";
import {
  readVisionCacheEnvelope,
  writeVisionCache,
  type VisionCacheSource,
} from "@/lib/brandkit/logo-lab/golden/vision-cache";
import sharp from "sharp";

export type BenchmarkRunOptions = {
  docId?: string;
  noCache?: boolean;
  onVisionCall?: (docId: string) => void;
  onVisionCacheHit?: (docId: string) => void;
};

const MIN_CROP_PX = 24;

export function resolvePipelineGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function sampledVisionPages(totalPages: number): number[] {
  return selectNivel1GuaranteedVisionPages({ totalPages, maxPages: 5 });
}

function primaryGtOnDoc(doc: GoldenDocument): GoldenDocument["groundTruth"] {
  return doc.groundTruth.filter((g) => g.role === "primary");
}

function classifyFailure(input: {
  doc: GoldenDocument;
  totalPages: number;
  predictedPage: number | null;
  predictedBboxPage: [number, number, number, number] | null;
  bestIoU: number;
  cropPass: boolean;
}): FailureClass | undefined {
  const sampled = sampledVisionPages(input.totalPages);
  const primaryPages = primaryGtOnDoc(input.doc).map((g) => g.page);
  const allPrimaryUnsampled =
    primaryPages.length > 0 && primaryPages.every((p) => !sampled.includes(p));
  if (allPrimaryUnsampled) return "page_not_sampled";

  if (input.predictedPage === null || !input.predictedBboxPage) return "no_detection";

  const gtOnPage = primaryGtOnDoc(input.doc).filter((g) => g.page === input.predictedPage);
  if (!gtOnPage.length) return "wrong_object";

  if (input.bestIoU < 0.1) return "wrong_object";
  if (input.bestIoU <= 0.5) return "bad_bbox";
  if (!input.cropPass) return "crop_unusable";
  return undefined;
}

export async function cropPassFromBase64(logoCropBase64: string): Promise<boolean> {
  try {
    const buf = Buffer.from(logoCropBase64, "base64");
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    return w > 0 && h > 0 && Math.min(w, h) >= MIN_CROP_PX;
  } catch {
    return false;
  }
}

async function resolveVisionAudit(
  doc: GoldenDocument,
  pdfBuffer: Buffer,
  options: BenchmarkRunOptions,
): Promise<{ audit: PageVisionPassRunAudit; cacheSource: VisionCacheSource | "miss" }> {
  const contentSha256 = bufferContentSha256(pdfBuffer);
  if (contentSha256 !== doc.sha256) {
    throw new Error(`sha256_mismatch:${doc.id}`);
  }

  if (!options.noCache) {
    const cached = readVisionCacheEnvelope(contentSha256);
    if (cached) {
      options.onVisionCacheHit?.(doc.id);
      return { audit: cached.audit, cacheSource: cached.source };
    }
  }

  options.onVisionCall?.(doc.id);
  const audit = await runPageVisionPassNivel1ForPdf({
    buffer: pdfBuffer,
    fileName: doc.file,
    contentSha256,
    writeAudit: false,
    route: "benchmark:logos",
  });
  writeVisionCache(contentSha256, audit, "gemini_live");
  return { audit, cacheSource: "gemini_live" };
}

/** Todas las detecciones de visión en el audit (logoInstances por página muestreada). */
export function listVisionLogoDetections(
  audit: PageVisionPassRunAudit,
): { pageNumber: number; index: number; bboxFrame: readonly [number, number, number, number] }[] {
  return audit.pages.flatMap((page) =>
    (page.result?.logoInstances ?? []).map((instance, index) => ({
      pageNumber: page.pageNumber,
      index,
      bboxFrame: resolveAuditBbox(instance.bbox),
    })),
  );
}

/** Detección: max IoU entre GT primary y cualquier logoInstance de visión en la misma página. */
export async function computeDocumentDetectionRecall(
  doc: GoldenDocument,
  audit: PageVisionPassRunAudit,
  pdfBuffer: Buffer,
): Promise<{ hits: number; total: number; recallAt50: number }> {
  const detections = listVisionLogoDetections(audit);
  let hits = 0;
  let total = 0;

  for (const gt of primaryGtOnDoc(doc)) {
    total += 1;
    const onPage = detections.filter((d) => d.pageNumber === gt.page);
    let bestIoU = 0;
    for (const det of onPage) {
      const bboxPage = await frameBboxToPageBbox(pdfBuffer, gt.page, [
        det.bboxFrame[0],
        det.bboxFrame[1],
        det.bboxFrame[2],
        det.bboxFrame[3],
      ]);
      bestIoU = Math.max(bestIoU, bboxIoU(bboxPage, gt.bboxPage));
    }
    if (bestIoU > 0.5) hits += 1;
  }

  return {
    hits,
    total,
    recallAt50: total > 0 ? hits / total : 0,
  };
}

export async function computeInstanceRecallAt50(
  docs: GoldenDocument[],
  audits: Map<string, PageVisionPassRunAudit>,
  pdfBuffers: Map<string, Buffer>,
): Promise<number> {
  let total = 0;
  let hits = 0;

  for (const doc of docs) {
    const audit = audits.get(doc.id);
    const pdfBuffer = pdfBuffers.get(doc.id);
    if (!audit || !pdfBuffer) continue;

    const recall = await computeDocumentDetectionRecall(doc, audit, pdfBuffer);
    hits += recall.hits;
    total += recall.total;
  }

  return total > 0 ? hits / total : 0;
}

async function evaluateDocument(
  doc: GoldenDocument,
  audit: PageVisionPassRunAudit,
  pdfBuffer: Buffer,
  visionCacheSource?: VisionCacheSource | "miss",
): Promise<DocumentResult> {
  const totalPages = await countPdfPagesInBuffer(pdfBuffer, 500);
  const sampledPages = sampledVisionPages(totalPages);
  const gtPrimaryPages = [...new Set(primaryGtOnDoc(doc).map((g) => g.page))].sort((a, b) => a - b);

  const detection = await computeDocumentDetectionRecall(doc, audit, pdfBuffer);
  const harvest = await harvestLogoLabDocument({ pdfBuffer, audit });

  let predictedPage: number | null = null;
  let predictedBboxPage: [number, number, number, number] | null = null;
  let bestIoU = 0;
  let cropPass = false;

  if (harvest.best) {
    const { pageNumber, index } = harvest.best;
    const refine = harvest.refines[logoLabRefineKey(pageNumber, index)];
    const pageAudit = audit.pages.find((p) => p.pageNumber === pageNumber);
    const instance = pageAudit?.result?.logoInstances?.[index];
    const frameBbox =
      refine?.refinedBbox ??
      (instance ? resolveAuditBbox(instance.bbox) : null);

    if (frameBbox) {
      predictedPage = pageNumber;
      predictedBboxPage = await frameBboxToPageBbox(pdfBuffer, pageNumber, [
        frameBbox[0],
        frameBbox[1],
        frameBbox[2],
        frameBbox[3],
      ]);

      const gtOnPage = primaryGtOnDoc(doc).filter((g) => g.page === predictedPage);
      for (const gt of gtOnPage) {
        bestIoU = Math.max(bestIoU, bboxIoU(predictedBboxPage, gt.bboxPage));
      }

      if (refine?.logoCropBase64) {
        cropPass = await cropPassFromBase64(refine.logoCropBase64);
      }
    }
  }

  const iouPass = bestIoU > 0.5;
  const usable = iouPass && cropPass;
  const failureClass = usable
    ? undefined
    : classifyFailure({
        doc,
        totalPages,
        predictedPage,
        predictedBboxPage,
        bestIoU,
        cropPass,
      });

  return {
    docId: doc.id,
    predictedPage,
    predictedBboxPage,
    bestIoU,
    iouPass,
    cropPass,
    usable,
    failureClass,
    sampledPages,
    gtPrimaryPages,
    detectionHits: detection.hits,
    detectionTotal: detection.total,
    detectionRecallAt50: detection.recallAt50,
    visionCacheSource: visionCacheSource,
  };
}

export async function runLogoBenchmark(
  options: BenchmarkRunOptions = {},
): Promise<BenchmarkResult> {
  const manifest = loadGoldenManifest();
  let documents = manifest.documents;
  if (options.docId) {
    documents = documents.filter((d) => d.id === options.docId);
    if (!documents.length) throw new Error(`unknown_golden_doc:${options.docId}`);
  }

  const audits = new Map<string, PageVisionPassRunAudit>();
  const pdfBuffers = new Map<string, Buffer>();
  const perDocument: DocumentResult[] = [];

  for (const doc of documents) {
    const pdfPath = resolveGoldenPdfPath(doc.file);
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`golden_pdf_missing:${doc.file}`);
    }
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { audit, cacheSource } = await resolveVisionAudit(doc, pdfBuffer, options);
    audits.set(doc.id, audit);
    pdfBuffers.set(doc.id, pdfBuffer);
    perDocument.push(await evaluateDocument(doc, audit, pdfBuffer, cacheSource));
  }

  const docsWithUsablePrimary = perDocument.filter((d) => d.usable).length;
  const meanBestIoU =
    perDocument.length > 0
      ? perDocument.reduce((s, d) => s + d.bestIoU, 0) / perDocument.length
      : 0;

  const runId = new Date().toISOString().replace(/[:.]/g, "-");

  const result: BenchmarkResult = {
    runId,
    pipelineVersion: resolvePipelineGitSha(),
    perDocument,
    summary: {
      docsTotal: perDocument.length,
      docsWithUsablePrimary,
      usableRate: perDocument.length > 0 ? docsWithUsablePrimary / perDocument.length : 0,
      meanBestIoU,
      instanceRecallAt50: await computeInstanceRecallAt50(documents, audits, pdfBuffers),
    },
  };

  fs.mkdirSync(BENCHMARK_RUNS_DIR, { recursive: true });
  const outPath = path.join(BENCHMARK_RUNS_DIR, `${runId}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  return result;
}

export function listBenchmarkRuns(): { runId: string; fileName: string; mtimeMs: number }[] {
  if (!fs.existsSync(BENCHMARK_RUNS_DIR)) return [];
  return fs
    .readdirSync(BENCHMARK_RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((fileName) => {
      const stat = fs.statSync(path.join(BENCHMARK_RUNS_DIR, fileName));
      return { runId: fileName.replace(/\.json$/, ""), fileName, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function loadBenchmarkRun(runId: string): BenchmarkResult {
  const filePath = path.join(BENCHMARK_RUNS_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) throw new Error(`benchmark_run_not_found:${runId}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as BenchmarkResult;
}

export function loadLatestBenchmarkRun(): BenchmarkResult | null {
  const runs = listBenchmarkRuns();
  if (!runs.length) return null;
  return loadBenchmarkRun(runs[0]!.runId);
}

export function formatBenchmarkTable(result: BenchmarkResult): string {
  const header = [
    "doc".padEnd(16),
    "usable".padEnd(8),
    "sel IoU".padEnd(8),
    "det %".padEnd(8),
    "crop".padEnd(6),
    "failure".padEnd(18),
    "pred p".padEnd(8),
    "cache".padEnd(12),
  ].join(" ");

  const rows = result.perDocument.map((d) =>
    [
      d.docId.padEnd(16),
      (d.usable ? "yes" : "no").padEnd(8),
      d.bestIoU.toFixed(3).padEnd(8),
      `${d.detectionHits}/${d.detectionTotal}`.padEnd(8),
      (d.cropPass ? "ok" : "fail").padEnd(6),
      (d.failureClass ?? "—").padEnd(18),
      String(d.predictedPage ?? "—").padEnd(8),
      (d.visionCacheSource ?? "—").padEnd(12),
    ].join(" "),
  );

  const summary = [
    "",
    `usableRate (selección): ${(result.summary.usableRate * 100).toFixed(1)}% (${result.summary.docsWithUsablePrimary}/${result.summary.docsTotal})`,
    `meanBestIoU (selección): ${result.summary.meanBestIoU.toFixed(3)}`,
    `instanceRecall@50 (detección visión): ${(result.summary.instanceRecallAt50 * 100).toFixed(1)}%`,
    `pipeline: ${result.pipelineVersion}`,
    `runId: ${result.runId}`,
  ].join("\n");

  return [header, ...rows, summary].join("\n");
}
