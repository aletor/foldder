#!/usr/bin/env npx tsx
/**
 * Re-graba audits Nivel 1 (OARO · catalogo26 · EINF) con GEMINI_API_KEY.
 * Única vía legítima de cerrar Nivel 1: audits + ingestMetrics con measured: true.
 * Fixture canónico OARO: fixtures/brandkit/sample-brand-deck.pdf (sha 1403be85…).
 */

import fs from "node:fs";
import path from "node:path";
import {
  ATRESMEDIA_EINF_FILENAME,
  ATRESMEDIA_EINF_PDF,
  CATALOGO26_FILENAME,
  CATALOGO26_PDF,
  SAMPLE_BRAND_DECK_FILENAME,
  SAMPLE_BRAND_DECK_PDF,
  hasAtresmediaEinfPdf,
  hasCatalogo26Pdf,
  hasSampleBrandDeckPdf,
} from "../src/lib/brandKit/fixtures/brandkit-paths";
import { bufferContentSha256 } from "../src/lib/brandKit/ingest/paid-operations-server";
import {
  auditHasMeasuredNivel1Metrics,
  runPageVisionPassNivel1ForPdf,
  summarizeNivel1PageVisionRun,
} from "../src/lib/brandKit/ingest/page-vision-pass-nivel1-runner";
import type { PageVisionPassRunAudit } from "../src/lib/brandKit/ingest/page-vision-pass-runner";
import { assertValidGeminiApiKey } from "./load-script-env";

const EVIDENCE_PATH = path.join(process.cwd(), "docs/brandKit-evidence/nivel1-ingest-metrics.json");

function metricsSnapshot(key: string, audit: PageVisionPassRunAudit) {
  const m = audit.ingestMetrics!;
  return {
    measured: m.measured,
    llmCallsAtIngest: m.llmCallsAtIngest,
    batchFallbackUsed: m.batchFallbackUsed,
    interactiveLatencyMs: m.interactiveLatencyMs ?? m.latencyMs,
    batchLatencyMs: m.batchLatencyMs,
    logoNativeUpgradeMs: m.logoNativeUpgradeMs,
    latencyMs: m.latencyMs,
    estimatedCostUsd: m.estimatedCostUsd,
    logoPath: m.logoPath,
    prepassMs: m.prepassMs,
    renderMs: m.renderMs,
    batchLongEdgePx: m.batchLongEdgePx,
    batchJpegQuality: m.batchJpegQuality,
    batchImagePayloadBytes: m.batchImagePayloadBytes,
    batchImagePayloadBytesByPage: m.batchImagePayloadBytesByPage,
    candidatesTokenCount: m.geminiUsage?.candidatesTokenCount,
    finishReason: m.geminiUsage?.finishReason,
    geminiModel: m.geminiModel,
    nivel0BaselineLlmCalls: m.nivel0BaselineLlmCalls,
    selectedPages: audit.selectedPages.length,
    contentSha256: audit.contentSha256,
    fileName: audit.fileName,
  };
}

async function record(pdfPath: string, fileName: string): Promise<PageVisionPassRunAudit> {
  const buffer = fs.readFileSync(pdfPath);
  const contentSha256 = await bufferContentSha256(buffer);
  console.info(`\n=== Nivel 1 · ${fileName} sha=${contentSha256.slice(0, 16)}… ===`);
  const audit = await runPageVisionPassNivel1ForPdf({
    buffer,
    contentSha256,
    fileName,
    route: "/scripts/run-nivel1-rerecord-audits",
    writeAudit: true,
  });
  if (!auditHasMeasuredNivel1Metrics(audit)) {
    throw new Error(`Audit sin measured:true · ${fileName}`);
  }
  console.info(summarizeNivel1PageVisionRun(audit));
  console.info(JSON.stringify(audit.ingestMetrics, null, 2));
  for (const page of audit.pages) {
    console.info(
      `p${page.pageNumber} ok=${page.ok} logos=${page.result?.logoInstances.length ?? 0} bne=${page.result?.brandNameEvidence.length ?? 0}${page.rootError ? ` err=${page.rootError}` : ""}`,
    );
  }
  return audit;
}

async function main() {
  assertValidGeminiApiKey();
  if (process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED !== "1") {
    console.error("Set BRAND_KIT_PAGE_VISION_PASS_ENABLED=1 en .env.local");
    process.exit(1);
  }
  if (process.env.BRAND_KIT_PAGE_VISION_NIVEL1 !== "1") {
    console.error("Set BRAND_KIT_PAGE_VISION_NIVEL1=1 en .env.local");
    process.exit(1);
  }

  const cases: Record<string, ReturnType<typeof metricsSnapshot>> = {};

  if (hasSampleBrandDeckPdf()) {
    cases.oaro = metricsSnapshot("oaro", await record(SAMPLE_BRAND_DECK_PDF, SAMPLE_BRAND_DECK_FILENAME));
  }
  if (hasCatalogo26Pdf()) {
    cases.catalogo26 = metricsSnapshot(
      "catalogo26",
      await record(CATALOGO26_PDF, CATALOGO26_FILENAME),
    );
  }
  if (hasAtresmediaEinfPdf()) {
    cases.einf = metricsSnapshot(
      "einf",
      await record(ATRESMEDIA_EINF_PDF, ATRESMEDIA_EINF_FILENAME),
    );
  }

  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(
    EVIDENCE_PATH,
    `${JSON.stringify({ measured: true, generatedAt: new Date().toISOString(), cases }, null, 2)}\n`,
    "utf8",
  );
  console.info(`\nEvidence escrita: ${EVIDENCE_PATH}`);
}

void main();
