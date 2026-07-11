/**
 * Matriz Fase B — validación sobre audits cacheados + apply/harvest (NO es el gate de ingesta).
 *
 * Gate honesto de ingesta real: `brand-kit-real-ingest-gate.test.ts` (sin pageVisionAuditFixture).
 * Estos tests leen JSON pre-grabado; verdes aquí NO prueban que la app complete Fase A en vivo.
 */

import { vi } from "vitest";

vi.mock("./brand-kit-ingest-wallet", () => ({
  reserveBrandKitIngestAnalysisCharge: vi.fn(async () => null),
  releaseBrandKitIngestAnalysisCharge: vi.fn(async () => {}),
  settleBrandKitIngestAnalysisCharge: vi.fn(async () => {}),
}));

vi.mock("./brand-kit-source-pdf-store", () => ({
  persistBrandKitSourcePdf: vi.fn(async () => {}),
}));

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLogoCandidatesFromPageVision } from "./page-vision-pass-apply";
import { arbitrateBrandIdentity } from "./page-vision-identity-arbitration";
import { wordmarkIntegrityPasses } from "./page-vision-wordmark-integrity";
import { nativeAssetAllowsVectorize } from "./page-vision-native-extract";
import { extractEmbeddedSvgsFromPdfBuffer, selectCorpusVectorLogo } from "../extractors/pdf-vector-logo";
import { pageVisionAuditHasLogos } from "./page-vision-pass-apply";
import type { PageVisionPassRunAudit } from "./page-vision-pass-runner";
import { auditHasMeasuredNivel1Metrics } from "./page-vision-pass-nivel1-runner";
import { ingestPdfIntoGenome } from "./pdf-ingest-server";
import { emptyGenome, getTrait } from "../model/trait";
import { findCrownedLogoVectorizeJob } from "../projection/logo-vectorize-action";
import type { LogoValue } from "../model/trait-values";
import { bufferContentSha256 } from "./paid-operations-server";
import {
  ATRESMEDIA_EINF_PDF,
  CATALOGO26_PDF,
  ESADE_PITCH_FILENAME,
  ESADE_PITCH_PDF,
  LEAN_FINANCE_PITCH_FILENAME,
  LEAN_FINANCE_PITCH_PDF,
  SAMPLE_BRAND_DECK_PDF,
  SAMPLE_BRAND_DECK_FILENAME,
  hasAtresmediaEinfPdf,
  hasCatalogo26Pdf,
  hasEsadePitchPdf,
  hasLeanFinancePitchPdf,
  hasSampleBrandDeckPdf,
} from "../fixtures/brandkit-paths";
import { runPageVisionPrepass } from "./page-vision-prepass";

const RUNS = path.join(process.cwd(), "fixtures/page-vision-pass/runs");

function loadAudit(prefix: string): PageVisionPassRunAudit | null {
  const file = fs
    .readdirSync(RUNS)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".audit.json"))
    .sort()
    .pop();
  if (!file) return null;
  return JSON.parse(fs.readFileSync(path.join(RUNS, file), "utf8")) as PageVisionPassRunAudit;
}

type MatrixRow = {
  id: string;
  pdfPath: string;
  auditPrefix: string;
  expectOrigin: "vector_native" | "xobject_native" | "render_crop" | "any";
  expectEmitter: string;
  requireIntegrity?: boolean;
  requireVectorizeGate?: boolean;
};

const MATRIX: MatrixRow[] = [
  {
    id: "oaro-deck",
    pdfPath: SAMPLE_BRAND_DECK_PDF,
    auditPrefix: "1403be85f444",
    expectOrigin: "xobject_native",
    expectEmitter: "OARO",
    requireVectorizeGate: true,
  },
  {
    id: "catalogo26",
    pdfPath: CATALOGO26_PDF,
    auditPrefix: "f9e683edde0a",
    expectOrigin: "vector_native",
    expectEmitter: "ATRESMEDIA",
    requireIntegrity: true,
  },
  {
    id: "raster-only",
    pdfPath: SAMPLE_BRAND_DECK_PDF,
    auditPrefix: "1403be85f444",
    expectOrigin: "xobject_native",
    expectEmitter: "OARO",
    requireVectorizeGate: true,
  },
];

function hasPdf(row: MatrixRow): boolean {
  if (row.id === "catalogo26") return hasCatalogo26Pdf();
  if (row.id === "oaro-deck" || row.id === "raster-only") return hasSampleBrandDeckPdf();
  return fs.existsSync(row.pdfPath);
}

/** Solo corrida real Nivel 1 — nunca placeholders offline. */
function assertNivel1MeasuredBudget(audit: PageVisionPassRunAudit) {
  expect(audit.ingestMetrics?.measured).toBe(true);
  expect(audit.nivel1Contract).toBe("2026-07-07-nivel1-slim-7");
  expect(audit.selectedPages.length).toBeLessThanOrEqual(5);
  expect(audit.ingestMetrics!.nivel).toBe(1);
  expect(audit.ingestMetrics!.llmCallsAtIngest).toBe(1);
  expect(audit.ingestMetrics!.batchFallbackUsed).toBe(false);
  expect(audit.ingestMetrics!.batchLatencyMs).toBeLessThan(20_000);
  expect(audit.ingestMetrics!.interactiveLatencyMs ?? audit.ingestMetrics!.latencyMs).toBeLessThan(20_000);
  expect(audit.ingestMetrics!.geminiUsage?.thoughtsTokenCount ?? 0).toBe(0);
  expect(audit.ingestMetrics!.estimatedCostUsd).toBeGreaterThan(0);
  expect(audit.ingestMetrics!.logoPath).not.toBe("unknown");
  expect(audit.prepass).toBeDefined();
}

function auditIsNivel1SlimMeasured(audit: PageVisionPassRunAudit | null): boolean {
  return (
    auditHasMeasuredNivel1Metrics(audit) &&
    audit?.nivel1Contract === "2026-07-07-nivel1-slim-7"
  );
}

describe("brandKit regression matrix (Fase B · audits cacheados)", () => {
  for (const row of MATRIX) {
    describe.skipIf(!hasPdf(row))(row.id, () => {
      it("Fase A con logoInstances y arbitraje de identidad", () => {
        const audit = loadAudit(row.auditPrefix);
        expect(audit).not.toBeNull();
        expect(pageVisionAuditHasLogos(audit)).toBe(true);
        const identity = arbitrateBrandIdentity(audit!);
        expect(identity.emitterBrand).toBe(row.expectEmitter);
      });

      it("audit contentSha256 alinea con PDF fixture (corrida real, no re-etiquetado)", () => {
        const audit = loadAudit(row.auditPrefix)!;
        const pdfSha = bufferContentSha256(fs.readFileSync(row.pdfPath));
        expect(audit.contentSha256).toBe(pdfSha);
        expect(audit.fileName).toBe(path.basename(row.pdfPath));
      });

      it.skipIf(!auditIsNivel1SlimMeasured(loadAudit(row.auditPrefix)))(
        "presupuesto Nivel 1 slim medido",
        () => {
          assertNivel1MeasuredBudget(loadAudit(row.auditPrefix)!);
        },
      );

      it.skipIf(!auditHasMeasuredNivel1Metrics(loadAudit(row.auditPrefix)))(
        "batch Nivel 1 <20s (rojo si medido y fuera de presupuesto)",
        () => {
          expect(loadAudit(row.auditPrefix)!.ingestMetrics!.batchLatencyMs).toBeLessThan(20_000);
        },
      );

      it.skipIf(!auditHasMeasuredNivel1Metrics(loadAudit(row.auditPrefix)))(
        "time-to-interactivo Nivel 1 <20s (rojo si medido y fuera de presupuesto)",
        () => {
          const m = loadAudit(row.auditPrefix)!.ingestMetrics!;
          expect(m.interactiveLatencyMs ?? m.latencyMs).toBeLessThan(20_000);
        },
      );

      it.skipIf(!auditHasMeasuredNivel1Metrics(loadAudit(row.auditPrefix)))(
        "exactamente 1 llamada LLM facturada por documento",
        () => {
          expect(loadAudit(row.auditPrefix)!.ingestMetrics!.llmCallsAtIngest).toBe(1);
        },
      );

      it(
        "logo primary con origin esperado",
        async () => {
          const audit = loadAudit(row.auditPrefix)!;
          const buffer = fs.readFileSync(row.pdfPath);
          const embedded = extractEmbeddedSvgsFromPdfBuffer(buffer, path.basename(row.pdfPath));
          expect(selectCorpusVectorLogo(embedded, path.basename(row.pdfPath))).toBeNull();

          const entries = await buildLogoCandidatesFromPageVision(audit, buffer, `matrix_${row.id}`);
          expect(entries.length).toBeGreaterThan(0);
          const primary = entries.find((e) => e.slot === "primary") ?? entries[0]!;
          const origin = primary.candidate.value.assetOrigin ?? "render_crop";
          if (row.expectOrigin !== "any") {
            expect(origin).toBe(row.expectOrigin);
          }
          if (row.requireIntegrity) {
            expect(wordmarkIntegrityPasses(primary.candidate.signals)).toBe(true);
          }
          if (row.requireVectorizeGate) {
            expect(nativeAssetAllowsVectorize(origin)).toBe(true);
          }
          if (auditHasMeasuredNivel1Metrics(audit) && audit.nivel1Contract) {
            expect(audit.ingestMetrics!.logoPath).toBe("render_crop");
          } else if (auditHasMeasuredNivel1Metrics(audit)) {
            expect(audit.ingestMetrics!.logoPath).toBe(origin);
          }
        },
        row.id === "catalogo26" ? 120_000 : 60_000,
      );

      if (row.id === "oaro-deck") {
        it(
          "ingesta e2e con audit cacheado corona logo y habilita vectorize",
          async () => {
            const prev = process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED;
            const prevNivel1 = process.env.BRAND_KIT_PAGE_VISION_NIVEL1;
            process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED = "1";
            process.env.BRAND_KIT_PAGE_VISION_NIVEL1 = "1";
            try {
              const audit = loadAudit(row.auditPrefix)!;
              const buffer = fs.readFileSync(row.pdfPath);
              let genome = emptyGenome();
              let finalOrigin: string | undefined;
              for await (const event of ingestPdfIntoGenome(buffer, SAMPLE_BRAND_DECK_FILENAME, genome, {
                allowPaidAnalysis: true,
                allowMaterialPrompts: false,
                pageVisionAuditFixture: audit,
              })) {
                if (event.type === "genome_update") genome = event.genome;
                if (event.type === "logo_native_upgrade_resolved") finalOrigin = event.logoPath;
              }
              const trait = getTrait(genome, "logo.primary");
              expect(trait?.crownedIds?.length).toBe(1);
              const crowned = trait?.candidates.find((c) => c.id === trait!.crownedIds[0]);
              const logo = crowned?.value as LogoValue;
              expect(finalOrigin ?? logo.assetOrigin ?? "render_crop").toBe(row.expectOrigin);
              expect(logo.assetOrigin ?? finalOrigin ?? "render_crop").toBe(row.expectOrigin);
              expect(findCrownedLogoVectorizeJob(genome)).not.toBeNull();
            } finally {
              if (prev === undefined) delete process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED;
              else process.env.BRAND_KIT_PAGE_VISION_PASS_ENABLED = prev;
              if (prevNivel1 === undefined) delete process.env.BRAND_KIT_PAGE_VISION_NIVEL1;
              else process.env.BRAND_KIT_PAGE_VISION_NIVEL1 = prevNivel1;
            }
          },
          120_000,
        );
      }
    });
  }

  describe.skipIf(!hasAtresmediaEinfPdf())("einf-atresmedia", () => {
    it("PDF fixture presente", () => {
      expect(fs.existsSync(ATRESMEDIA_EINF_PDF)).toBe(true);
    });

    it.skipIf(!auditIsNivel1SlimMeasured(loadAudit("7f779ce9b0b0")))(
      "audit Nivel 1 medido alineado con fixture EINF",
      () => {
        const audit = loadAudit("7f779ce9b0b0")!;
        const pdfSha = bufferContentSha256(fs.readFileSync(ATRESMEDIA_EINF_PDF));
        expect(audit.contentSha256).toBe(pdfSha);
        assertNivel1MeasuredBudget(audit);
        const identity = arbitrateBrandIdentity(audit);
        expect(identity.emitterBrand).toBe("ATRESMEDIA");
      },
    );
  });
});

describe.skipIf(!hasLeanFinancePitchPdf())("lean-finance-pitch — JPEG2000 fixture", () => {
  it("PDF fixture permanente presente", () => {
    expect(fs.existsSync(LEAN_FINANCE_PITCH_PDF)).toBe(true);
  });

  it("prepass completa sin abortar la ingesta", async () => {
    const buffer = fs.readFileSync(LEAN_FINANCE_PITCH_PDF);
    const prepass = await runPageVisionPrepass({
      buffer,
      fileName: LEAN_FINANCE_PITCH_FILENAME,
      profile: "nivel1",
    });
    expect(prepass.logoLikelyPages.length).toBeGreaterThan(0);
  }, 60_000);
});

describe.skipIf(!hasEsadePitchPdf())("esade-pitch — JPEG2000 fixture", () => {
  it("PDF fixture permanente presente", () => {
    expect(fs.existsSync(ESADE_PITCH_PDF)).toBe(true);
  });

  it("prepass completa sin abortar la ingesta", async () => {
    const buffer = fs.readFileSync(ESADE_PITCH_PDF);
    const prepass = await runPageVisionPrepass({
      buffer,
      fileName: ESADE_PITCH_FILENAME,
      profile: "nivel1",
    });
    expect(prepass.logoLikelyPages).toContain(1);
  }, 60_000);
});

describe("nivel1 evidence (solo mediciones reales)", () => {
  it.skipIf(
    !auditHasMeasuredNivel1Metrics(loadAudit("1403be85f444")!) ||
      !auditHasMeasuredNivel1Metrics(loadAudit("f9e683edde0a")!),
  )("docs/brand-kit-evidence/nivel1-ingest-metrics.json existe tras corrida medida", () => {
    const evidencePath = path.join(process.cwd(), "docs/brand-kit-evidence/nivel1-ingest-metrics.json");
    expect(fs.existsSync(evidencePath)).toBe(true);
    const doc = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as {
      measured: boolean;
      cases: Record<string, { measured: boolean }>;
    };
    expect(doc.measured).toBe(true);
    for (const row of Object.values(doc.cases)) {
      expect(row.measured).toBe(true);
    }
  });
});
