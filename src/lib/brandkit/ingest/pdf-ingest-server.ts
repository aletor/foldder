/**
 * Ingesta de PDF en el servidor: paleta → logo → tipografía → universo visual → voz.
 */

import {
  countPdfPagesInBuffer,
} from "@/lib/brain/pdf-brand-extract";
import { createCandidate, signal, type Candidate, type SourceRef } from "../model/evidence";
import { extractTypographyFromPdf } from "../extractors/typography";
import { extractLogoFromPdf, buildBrandCorpusFromGenome, type BrandKitLogoCandidate } from "../extractors/logo";
import { extractEmbeddedSvgsFromPdfBuffer, selectCorpusVectorLogo } from "../extractors/pdf-vector-logo";
import { isLogoFilename } from "../extractors/logo-ness";
import { extractVisualFromPdf, visualTerritoryCount, buildVisualExtractionFromVisionPass, mergeVisualExtractions } from "../extractors/visual";
import { extractVoiceFromPdf, analyzePdfTextLines } from "../extractors/voice";
import { buildTextSampleFromPdfLines, enrichVoiceExtraction } from "../extractors/voice-llm";
import { bufferContentSha256 } from "./paid-operations-server";
import type { ColorValue, LogoValue } from "../model/trait-values";
import { colorTraitId, type ColorRole } from "../model/trait-ids";
import {
  applyLogoCandidates,
  applyPaletteCandidates,
  applyTypographyExtraction,
  applyVisualExtraction,
  applyVoiceExtraction,
} from "./apply-extract";
import {
  copyLogoResolved,
  copyPaletteResolved,
  copySectionRunning,
  copyTypographyResolved,
  copyVisualResolved,
  copyVoiceResolved,
} from "./feedback-copy";
import type { BrandKitIngestStreamEvent } from "./types";
import type { ApplyExtractionResult } from "./apply-extract";
import { getTrait, normalizeGenome, type Genome } from "../model/trait";
import { paletteRoleDisplayName } from "./palette-labels";
import { sectionPreviewFromGenome } from "./section-preview";
import { genomeHasPriorMaterial, type ApplyMaterialPromptOptions } from "./material-prompt";
import { allowPaidPostCoronaOps, resolveVisionIngestGate } from "./paid-extract-gate";
import {
  logLogoIsolationPath,
  logPaletteSource,
  logVisionApiFailed,
  logVisionApplied,
  logVisionGateDecision,
  logVisionIngestStart,
  logPageVisionPassStart,
  logPageVisionPassDone,
} from "./brand-kit-vision-debug";
import {
  releaseBrandKitIngestAnalysisCharge,
  reserveBrandKitIngestAnalysisCharge,
  settleBrandKitIngestAnalysisCharge,
} from "./brand-kit-ingest-wallet";
import { extractPdfPaletteForGenome } from "./pdf-palette-extract";
import {
  getOrRunBrandKitPdfVisionPass,
  typographyGuessFromVisionPass,
} from "./pdf-vision-pass";
import {
  isPageVisionPassEnabled,
  runPageVisionPassForPdf,
  summarizePageVisionPassRun,
  type PageVisionPassRunAudit,
} from "./page-vision-pass-runner";
import {
  isPageVisionNivel1Enabled,
  runPageVisionPassNivel1ForPdf,
  summarizeNivel1PageVisionRun,
} from "./page-vision-pass-nivel1-runner";
import {
  buildLogoCandidatesFromPageVision,
  buildProvisionalLogoCandidatesFromPageVision,
  buildVisualExtractionFromPageVision,
  pageVisionAuditHasLogos,
} from "./page-vision-pass-apply";
import {
  arbitrateBrandIdentity,
  refineVoiceWithIdentityArbitration,
} from "./page-vision-identity-arbitration";
import {
  pageVisionPassMetaFromAudit,
  skippedPageVisionPassMeta,
} from "./page-vision-pass-meta";
import { guaranteedVisionPageNumbers } from "./page-vision-pass-selection";
import type { BrandKitPdfVisionResult } from "./pdf-vision-types";
import type { EvidenceSignalKind } from "../model/evidence";
import { crownVectorLogoIntoGenome, hasCrownedLogoPrimary, applyRasterLogoExtraction, crownLogoPrimaryBySignature } from "./vector-logo-ingest";
import { logoCandidateAllowsCrown } from "../projection/logo-vectorize-action";
import { extractVisualImagesFromPdfBuffer } from "@/lib/brain/pdf-visual-extract";
import { persistBrandKitSourcePdf } from "./brand-kit-source-pdf-store";

function* emitApplyResult(result: ApplyExtractionResult): Generator<BrandKitIngestStreamEvent> {
  yield { type: "genome_update", genome: result.genome };
  for (const prompt of result.prompts) {
    yield { type: "material_prompt", prompt };
  }
}

const PALETTE_ROLE_MAP: Partial<Record<string, ColorRole>> = {
  primario: "primary",
  secundario: "secondary",
  acento: "accent",
  fondo: "background",
  soporte: "text",
};

function buildSource(fileName: string, kind: SourceRef["kind"] = "pdf", contentSha256?: string): SourceRef {
  return {
    id: `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    label: fileName,
    addedAt: new Date().toISOString(),
    ...(contentSha256 ? { contentSha256 } : {}),
  };
}

function paletteCandidatesFromPdf(
  palette: Awaited<ReturnType<typeof extractPdfPaletteForGenome>>["palette"],
  sourceId: string,
  signalKind: Extract<EvidenceSignalKind, "render-quantized" | "operator-color" | "llm-vision">,
): Candidate<ColorValue>[] {
  const out: Candidate<ColorValue>[] = [];
  for (const sw of palette) {
    const role = PALETTE_ROLE_MAP[sw.role];
    if (!role) continue;
    const fromVision = sw.detail.includes("visión");
    out.push(
      createCandidate<ColorValue>({
        value: { hex: sw.hex, role, name: paletteRoleDisplayName(sw.role) },
        signals: [
          signal(fromVision ? "llm-vision" : signalKind, {
            detail: sw.detail,
            sourceRef: sourceId,
            scale: fromVision ? 0.75 : sw.confidence,
          }),
          ...(fromVision ? [signal("render-quantized", { detail: sw.detail, sourceRef: sourceId, scale: sw.confidence })] : []),
        ],
        signature: sw.hex.toLowerCase(),
        sourceRefs: [sourceId],
      }),
    );
  }
  return out;
}

function logoCandidatesFromPdf(
  logos: BrandKitLogoCandidate[],
  sourceId: string,
  ambiguousPrimary = false,
): Array<{
  candidate: Candidate<LogoValue>;
  imageUrl: string;
  signature: string;
  pageNumber: number;
  slot: "primary" | "secondary";
}> {
  const viable = logos.filter((l) => !l.logoNess?.simpleSolidShape);
  const ordered = ambiguousPrimary
    ? viable.slice(0, 6)
    : [
        ...viable.filter((l) => l.slot === "primary"),
        ...viable.filter((l) => l.slot === "secondary"),
      ].slice(0, 4);

  return ordered.map((logo, index) => {
    const imageUrl = `data:image/png;base64,${logo.buffer.toString("base64")}`;
    const signature = logo.logoPHash;
    const slot = ambiguousPrimary ? "primary" : (logo.slot ?? (index === 0 ? "primary" : "secondary"));
    return {
      imageUrl,
      signature,
      pageNumber: logo.pageNumber,
      slot,
      candidate: createCandidate<LogoValue>({
        value: {
          imageUrl,
          variant: logo.variant,
          label: slot === "primary" ? "logo principal" : "logo secundario",
          sourcePageNumber: logo.pageNumber,
          sourceBbox: logo.sourceBbox,
        },
        signals: [
          signal("recurrence", {
            detail: logo.evidenceDetail ?? "comportamiento de marca en el corpus",
            sourceRef: sourceId,
            scale: logo.brandBehavior?.total ?? logo.confidence,
          }),
          signal("shape-dominant", {
            sourceRef: sourceId,
            scale: logo.brandBehavior?.invariance ?? logo.confidence,
          }),
        ],
        signature,
        sourceRefs: [sourceId],
      }),
    };
  });
}

export async function* ingestPdfIntoGenome(
  buffer: Buffer,
  fileName: string,
  genomeInput: Genome,
  opts: {
    userEmail?: string;
    allowMaterialPrompts?: boolean;
    /** Consentimiento explícito del usuario tras ver coste (cliente). */
    allowPaidAnalysis?: boolean;
    paidAnalysisOperationId?: string;
    /** Audit Fase A precalculado (regresión/CI sin LLM). */
    pageVisionAuditFixture?: PageVisionPassRunAudit;
    /** Logo-intake activo en el drop: omitir extractLogoFromPdf y upgrade nativo. */
    skipClassicLogoExtraction?: boolean;
  } = {},
): AsyncGenerator<BrandKitIngestStreamEvent> {
  const contentSha256 = bufferContentSha256(buffer);
  const duplicateContent = genomeInput.sources.some((s) => s.contentSha256 === contentSha256);
  let source = buildSource(fileName, "pdf", contentSha256);
  if (opts.userEmail) {
    try {
      await persistBrandKitSourcePdf(opts.userEmail, contentSha256, buffer);
    } catch (error) {
      console.warn("[brandKit/ingest] persist source pdf failed:", error);
    }
  }
  const genomeSeed = normalizeGenome(genomeInput);
  let genome = genomeSeed;
  const hasSources = true;
  const allowPaidPostCorona = allowPaidPostCoronaOps(genomeSeed);
  const visionGate = resolveVisionIngestGate({ duplicateContent, hasSources });
  logVisionIngestStart({
    sha256: contentSha256.slice(0, 16),
    duplicate: duplicateContent,
    allowPaidExtractOps: allowPaidPostCorona,
    allowPaidAnalysis: opts.allowPaidAnalysis === true,
  });
  logVisionGateDecision(visionGate);
  const promptOpts: ApplyMaterialPromptOptions = {
    allowMaterialPrompts: opts.allowMaterialPrompts ?? genomeHasPriorMaterial(genomeInput),
  };
  const maxPages = 20;
  let paletteDarkHex: string | undefined;

  let visionPass: BrandKitPdfVisionResult | null = null;
  let pageVisionAudit: PageVisionPassRunAudit | null = null;
  let walletCharge = null as Awaited<ReturnType<typeof reserveBrandKitIngestAnalysisCharge>>;
  const phaseAEnabled = isPageVisionPassEnabled();
  const totalPagesHint = await countPdfPagesInBuffer(buffer, 200).catch(() => 0);

  if (phaseAEnabled && duplicateContent) {
    source = {
      ...source,
      pageVisionPass: skippedPageVisionPassMeta({
        skipReason: "duplicate_content",
        totalPages: totalPagesHint,
        summary: "Documento duplicado",
      }),
    };
    yield {
      type: "page_vision_pass",
      fileName,
      status: "skipped",
      skipReason: "duplicate_content",
      summary: "Documento duplicado · sin Fase A",
    };
  } else if (phaseAEnabled && !visionGate.willRunVision) {
    source = {
      ...source,
      pageVisionPass: skippedPageVisionPassMeta({
        skipReason: "vision_gate_off",
        totalPages: totalPagesHint,
      }),
    };
  } else if (!phaseAEnabled && !duplicateContent) {
    source = {
      ...source,
      pageVisionPass: skippedPageVisionPassMeta({
        skipReason: "flag_disabled",
        totalPages: totalPagesHint,
      }),
    };
  }

  if (visionGate.willRunVision) {
    try {
      walletCharge = await reserveBrandKitIngestAnalysisCharge({
        userEmail: opts.userEmail,
        contentSignature: contentSha256,
        kind: "pdf",
        operationId: opts.paidAnalysisOperationId,
      });
    } catch (error) {
      logVisionApiFailed(error);
      walletCharge = null;
    }
    try {
      if (phaseAEnabled) {
        const auditFixture = opts.pageVisionAuditFixture;
        if (auditFixture) {
          if (auditFixture.contentSha256 !== contentSha256) {
            console.warn(
              `[brandKit/ingest] pageVisionAuditFixture sha mismatch: audit=${auditFixture.contentSha256.slice(0, 16)} pdf=${contentSha256.slice(0, 16)}`,
            );
          }
          pageVisionAudit = auditFixture;
          source = { ...source, pageVisionPass: pageVisionPassMetaFromAudit(pageVisionAudit) };
          const okPages = pageVisionAudit.pages.filter((p) => p.ok).length;
          const summary = summarizePageVisionPassRun(pageVisionAudit);
          yield {
            type: "page_vision_pass",
            fileName,
            status: okPages === 0 ? "failed" : "completed",
            pagesAnalyzed: okPages,
            pagesSelected: pageVisionAudit.selectedPages.length,
            summary: `${summary} · audit cacheado`,
          };
          yield { type: "micro", text: `Fase A · audit cacheado (${okPages} páginas)` };
        } else if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim()) {
          source = {
            ...source,
            pageVisionPass: skippedPageVisionPassMeta({
              skipReason: "missing_api_key",
              totalPages: totalPagesHint,
            }),
          };
          yield {
            type: "page_vision_pass",
            fileName,
            status: "skipped",
            skipReason: "missing_api_key",
            summary: "Sin GEMINI_API_KEY en servidor",
          };
          yield { type: "micro", text: "Fase A omitida · falta GEMINI_API_KEY" };
        } else {
          const nivel1 = isPageVisionNivel1Enabled();
          const selectedHint = nivel1 ? Math.min(5, totalPagesHint) : guaranteedVisionPageNumbers(totalPagesHint).length;
          yield {
            type: "page_vision_pass",
            fileName,
            status: "running",
            pagesSelected: selectedHint,
          };
          logPageVisionPassStart({
            fileName,
            selectionScope: nivel1 ? "nivel1-batch" : "guaranteed-only",
            selectedPages: selectedHint,
            totalPages: totalPagesHint,
          });
          pageVisionAudit = nivel1
            ? await runPageVisionPassNivel1ForPdf({
                buffer,
                contentSha256,
                fileName,
                userEmail: opts.userEmail,
                route: "/lib/brandKit/ingest/pdf-ingest-server",
                writeAudit: true,
              })
            : await runPageVisionPassForPdf({
                buffer,
                contentSha256,
                fileName,
                userEmail: opts.userEmail,
                route: "/lib/brandKit/ingest/pdf-ingest-server",
                selectionScope: "guaranteed-only",
                writeAudit: true,
              });
          source = { ...source, pageVisionPass: pageVisionPassMetaFromAudit(pageVisionAudit) };
          const okPages = pageVisionAudit.pages.filter((p) => p.ok).length;
          const logoCount = pageVisionAudit.pages.reduce(
            (n, p) => n + (p.ok ? (p.result?.logoInstances.length ?? 0) : 0),
            0,
          );
          const imageCount = pageVisionAudit.pages.reduce(
            (n, p) => n + (p.ok ? (p.result?.images.length ?? 0) : 0),
            0,
          );
          logPageVisionPassDone({
            fileName,
            okPages,
            totalPages: pageVisionAudit.pages.length,
            logoInstances: logoCount,
            images: imageCount,
          });
          await settleBrandKitIngestAnalysisCharge(walletCharge, "pdf");
          const summary = nivel1
            ? summarizeNivel1PageVisionRun(pageVisionAudit)
            : summarizePageVisionPassRun(pageVisionAudit);
          yield {
            type: "page_vision_pass",
            fileName,
            status:
              okPages === 0
                ? "failed"
                : okPages < pageVisionAudit.pages.length
                  ? "partial"
                  : "completed",
            pagesAnalyzed: okPages,
            pagesSelected: pageVisionAudit.selectedPages.length,
            summary,
          };
          yield { type: "micro", text: summary };
        }
      } else {
        visionPass = await getOrRunBrandKitPdfVisionPass({
          buffer,
          contentSha256,
          maxPages: 6,
          userEmail: opts.userEmail,
          route: "/lib/brandKit/ingest/pdf-ingest-server",
          requireResult: false,
        });
        if (visionPass) {
          logVisionApplied(visionPass);
          await settleBrandKitIngestAnalysisCharge(walletCharge, "pdf");
          yield {
            type: "micro",
            text: `Análisis visual · ${visionPass.palette.length} colores${visionPass.logo?.emitter ? " · logo localizado" : ""}`,
          };
        } else {
          logVisionApiFailed(new Error("vision pass returned null"));
          await releaseBrandKitIngestAnalysisCharge(walletCharge, new Error("vision pass returned null"));
          yield {
            type: "micro",
            text: "Análisis visual sin respuesta · paleta desde render",
          };
        }
      }
    } catch (error) {
      logVisionApiFailed(error);
      await releaseBrandKitIngestAnalysisCharge(walletCharge, error);
      if (phaseAEnabled) {
        source = {
          ...source,
          pageVisionPass: skippedPageVisionPassMeta({
            skipReason: "ingest_error",
            totalPages: totalPagesHint,
            summary: error instanceof Error ? error.message : "Fase A falló",
          }),
        };
        yield {
          type: "page_vision_pass",
          fileName,
          status: "failed",
          summary: error instanceof Error ? error.message : "Fase A falló",
        };
      }
      yield {
        type: "micro",
        text: phaseAEnabled ? "Fase A falló · paleta desde render" : "Análisis visual falló · paleta desde render",
      };
    }
  } else if (duplicateContent) {
    yield {
      type: "micro",
      text: "Documento duplicado · sin nueva llamada de visión",
    };
  } else if (!visionGate.willRunVision) {
    yield {
      type: "micro",
      text: "Análisis visual no ejecutado · solo lectura determinista",
    };
  }

  // ── Paleta (rápida) ─────────────────────────────────────────────────────
  yield {
    type: "section_running",
    section: "palette",
    label: copySectionRunning("palette"),
  };
  try {
    const { palette, signalKind, paletteSource, visionMatchCount } = await extractPdfPaletteForGenome(
      buffer,
      maxPages,
      visionPass,
    );
    logPaletteSource({
      source: paletteSource,
      visionMatchCount,
      roles: palette.map((c) => c.role),
    });
    paletteDarkHex = palette.find((c) => c.role === "primario")?.hex;
    const candidates = paletteCandidatesFromPdf(palette, source.id, signalKind);
    const paletteApply = applyPaletteCandidates(genome, candidates, source, promptOpts);
    genome = paletteApply.genome;
    const swatches = candidates.map((c) => c.value.hex);
    yield* emitApplyResult(paletteApply);
    yield {
      type: "section_resolved",
      section: "palette",
      preview: sectionPreviewFromGenome(genome, "palette"),
      micro: swatches.length ? copyPaletteResolved(swatches.length) : "Sin colores de marca claros en este documento",
    };
  } catch {
    yield {
      type: "section_error",
      section: "palette",
      fileName,
      message: "No pude extraer la paleta",
    };
  }

  // ── Logo ────────────────────────────────────────────────────────────────
  const skipFallbackLogo = opts.skipClassicLogoExtraction === true;
  if (skipFallbackLogo) {
    console.info(
      "[brandKit/ingest] skip_classic_logo_fallback",
      JSON.stringify({
        fileName,
        skipped: "extractLogoFromPdf+nativeUpgrade",
        keeps: "embeddedSvg+faseA",
      }),
    );
  }

  yield { type: "section_running", section: "logo", label: copySectionRunning("logo") };
  try {
    const totalPages = await countPdfPagesInBuffer(buffer, maxPages);
    let logoResolved = false;

    if (!hasCrownedLogoPrimary(genome)) {
      const embedded = extractEmbeddedSvgsFromPdfBuffer(buffer, fileName);
      const vectorPick = selectCorpusVectorLogo(embedded, fileName);
      if (vectorPick) {
        const vectorApply = await crownVectorLogoIntoGenome({
          svgBuffer: Buffer.from(vectorPick.svg, "utf8"),
          label: vectorPick.label,
          genomeInput: genome,
          source,
          signalDetail: "vector de marca embebido en el documento",
          opts: promptOpts,
        });
        genome = vectorApply.genome;
        yield* emitApplyResult(vectorApply);
        yield {
          type: "section_resolved",
          section: "logo",
          preview: sectionPreviewFromGenome(genome, "logo"),
          micro: "Vector de marca embebido coronado como logo principal",
        };
        logoResolved = true;
      }
    }

    if (!logoResolved && !hasCrownedLogoPrimary(genome)) {
      let entries: ReturnType<typeof logoCandidatesFromPdf> = [];
      let ambiguousPrimary = false;
      let primaryLogos: BrandKitLogoCandidate[] = [];
      let logos: BrandKitLogoCandidate[] = [];
      const fromPhaseA = pageVisionAuditHasLogos(pageVisionAudit);
      let deferNativeUpgrade = false;

      if (fromPhaseA) {
        deferNativeUpgrade = isPageVisionNivel1Enabled() && !skipFallbackLogo;
        entries = isPageVisionNivel1Enabled()
          ? await buildProvisionalLogoCandidatesFromPageVision(pageVisionAudit!, buffer, source.id)
          : await buildLogoCandidatesFromPageVision(pageVisionAudit!, buffer, source.id);
        ambiguousPrimary = entries.filter((e) => e.slot === "primary").length > 1;
      } else if (!skipFallbackLogo) {
        const corpus = buildBrandCorpusFromGenome(genome);
        const extracted = await extractLogoFromPdf(buffer, {
          maxPages,
          paletteDarkHex,
          documentId: source.id,
          corpus,
          visionEmitter: visionPass?.logo?.emitter,
        });
        logos = extracted.logos;
        primaryLogos = extracted.primaryLogos;
        ambiguousPrimary = extracted.ambiguousPrimary;
        entries = logoCandidatesFromPdf(logos, source.id, ambiguousPrimary);
      } else {
        yield {
          type: "section_resolved",
          section: "logo",
          preview: sectionPreviewFromGenome(genome, "logo"),
          micro: "detección de logo en curso por análisis visual",
        };
        logoResolved = true;
      }

      if (!logoResolved && entries.length > 0) {
      const logoApplyRaw = applyLogoCandidates(
        genome,
        entries.map((e) => ({
          imageUrl: e.imageUrl,
          signature: e.signature,
          candidate: e.candidate,
          slot: e.slot,
        })),
        source,
        promptOpts,
      );
      const logoApply = applyRasterLogoExtraction(
        genome,
        logoApplyRaw,
        fromPhaseA ? undefined : primaryLogos[0],
        promptOpts,
        ambiguousPrimary,
      );
      genome = logoApply.genome;
      const primaryEntries = entries.filter((e) => e.slot === "primary");
      if (
        fromPhaseA &&
        !ambiguousPrimary &&
        primaryEntries.length === 1 &&
        promptOpts.allowMaterialPrompts === false
      ) {
        const primaryEntry = primaryEntries[0]!;
        const logoTrait = getTrait(genome, "logo.primary");
        const match = logoTrait?.candidates.find((c) => c.signature === primaryEntry.signature);
        if (match && logoCandidateAllowsCrown(genome, "logo.primary", match.id)) {
          genome = crownLogoPrimaryBySignature(genome, primaryEntry.signature);
          yield { type: "genome_update", genome };
        }
      }
      const pagesWithLogo = fromPhaseA
        ? new Set(entries.map((e) => e.pageNumber)).size
        : new Set(logos.map((l) => l.pageNumber)).size;
      yield* emitApplyResult(logoApply);
      yield {
        type: "section_resolved",
        section: "logo",
        preview: sectionPreviewFromGenome(genome, "logo"),
        micro: ambiguousPrimary && fromPhaseA
          ? `Logo Fase A · ${entries.length} candidatos — elige el principal`
          : ambiguousPrimary
            ? "Varios logos posibles — elige cuál es el de tu marca"
            : fromPhaseA
              ? deferNativeUpgrade
                ? `Logo provisional · ${entries.length} candidato${entries.length === 1 ? "" : "s"}`
                : `Logo Fase A · ${entries.length} candidato${entries.length === 1 ? "" : "s"}`
              : primaryLogos.length
              ? copyLogoResolved(Math.max(1, pagesWithLogo), totalPages)
              : logos.length
                ? "Logos secundarios detectados; sin marca principal recurrente"
                : "No encontré un logo claro en este documento",
      };

      if (deferNativeUpgrade && fromPhaseA && pageVisionAudit && entries.length > 0 && !skipFallbackLogo) {
        yield { type: "logo_native_upgrade_running", label: "Mejorando logo…" };
        const upgradeStarted = Date.now();
        try {
          const upgraded = await buildLogoCandidatesFromPageVision(pageVisionAudit, buffer, source.id);
          if (upgraded.length) {
            const upgradeApplyRaw = applyLogoCandidates(
              genome,
              upgraded.map((e) => ({
                imageUrl: e.imageUrl,
                signature: e.signature,
                candidate: e.candidate,
                slot: e.slot,
              })),
              source,
              promptOpts,
            );
            genome = upgradeApplyRaw.genome;
            const primaryUpgraded = upgraded.find((e) => e.slot === "primary") ?? upgraded[0]!;
            if (!ambiguousPrimary && promptOpts.allowMaterialPrompts === false) {
              const logoTrait = getTrait(genome, "logo.primary");
              const match = logoTrait?.candidates.find((c) => c.signature === primaryUpgraded.signature);
              if (match && logoCandidateAllowsCrown(genome, "logo.primary", match.id)) {
                genome = crownLogoPrimaryBySignature(genome, primaryUpgraded.signature, {
                  replaceExisting: true,
                });
              }
            }
            yield { type: "genome_update", genome };
            const logoNativeUpgradeMs = Date.now() - upgradeStarted;
            const finalOrigin = primaryUpgraded.candidate.value.assetOrigin ?? "render_crop";
            if (pageVisionAudit.ingestMetrics) {
              pageVisionAudit.ingestMetrics.logoNativeUpgradeMs = logoNativeUpgradeMs;
              pageVisionAudit.ingestMetrics.logoPath = finalOrigin;
              pageVisionAudit.ingestMetrics.latencyMs =
                (pageVisionAudit.ingestMetrics.interactiveLatencyMs ?? pageVisionAudit.ingestMetrics.latencyMs) +
                logoNativeUpgradeMs;
            }
            yield {
              type: "logo_native_upgrade_resolved",
              micro: `Logo nativo · ${finalOrigin}`,
              logoPath: finalOrigin,
              logoNativeUpgradeMs,
            };
          }
        } catch {
          yield {
            type: "logo_native_upgrade_resolved",
            micro: "Logo provisional conservado · extracción nativa no disponible",
            logoPath: "render_crop",
            logoNativeUpgradeMs: Date.now() - upgradeStarted,
          };
        }
      }
      }
    } else if (!logoResolved) {
      yield {
        type: "section_resolved",
        section: "logo",
        preview: sectionPreviewFromGenome(genome, "logo"),
        micro: "Logo de marca ya definido en el brandKit",
      };
    }
  } catch {
    yield {
      type: "section_error",
      section: "logo",
      fileName,
      message: "No pude leer el logo",
    };
  }

  // ── Tipografía ─────────────────────────────────────────────────────────
  yield { type: "section_running", section: "typography", label: copySectionRunning("typography") };
  try {
    const typography = await extractTypographyFromPdf(buffer, {
      sources: [source],
      maxPages,
      visionGuess: typographyGuessFromVisionPass(visionPass?.typography),
    });
    const typoApply = applyTypographyExtraction(genome, typography, source, promptOpts);
    genome = typoApply.genome;
    const top = typography.primary[0];
    yield* emitApplyResult(typoApply);
    yield {
      type: "section_resolved",
      section: "typography",
      preview: sectionPreviewFromGenome(genome, "typography"),
      micro: top ? copyTypographyResolved(top.value.family) : "No reconocí una tipografía de marca",
    };
  } catch {
    yield {
      type: "section_error",
      section: "typography",
      fileName,
      message: "No pude leer la tipografía",
    };
  }

  // ── Universo visual ─────────────────────────────────────────────────────
  yield { type: "section_running", section: "visual", label: copySectionRunning("visual") };
  try {
    const visualHeuristic = await extractVisualFromPdf(buffer, fileName, { sources: [source], maxImages: 8 });
    let visual = visualHeuristic;
    if (pageVisionAudit) {
      const fromPhaseA = await buildVisualExtractionFromPageVision(pageVisionAudit, buffer, source);
      visual = mergeVisualExtractions(fromPhaseA, visualHeuristic);
    } else if (visionPass?.visual?.length) {
      const embedded = await extractVisualImagesFromPdfBuffer(buffer, fileName);
      const fromVision = buildVisualExtractionFromVisionPass(visionPass, source.id, embedded);
      visual = mergeVisualExtractions(fromVision, visualHeuristic);
    }
    const visualApply = applyVisualExtraction(genome, visual, source, promptOpts);
    genome = visualApply.genome;
    const count = visualTerritoryCount(visual);
    yield* emitApplyResult(visualApply);
    yield {
      type: "section_resolved",
      section: "visual",
      preview: sectionPreviewFromGenome(genome, "visual"),
      micro: count ? copyVisualResolved(count) : "No encontré imágenes de referencia claras",
    };
  } catch {
    yield {
      type: "section_error",
      section: "visual",
      fileName,
      message: "No pude leer el universo visual",
    };
  }

  // ── Voz ─────────────────────────────────────────────────────────────────
  yield { type: "section_running", section: "voice", label: copySectionRunning("voice") };
  try {
    const voiceHeuristic = await extractVoiceFromPdf(buffer, { sources: [source], maxPages });
    const lines = await analyzePdfTextLines(buffer, maxPages);
    const voice = duplicateContent
      ? voiceHeuristic
      : await enrichVoiceExtraction(voiceHeuristic, buildTextSampleFromPdfLines(lines), source.id, {
          userEmail: opts.userEmail,
          allowPaidRefinement: visionGate.willRunVision,
        });
    const voiceApply = applyVoiceExtraction(
      genome,
      pageVisionAudit
        ? refineVoiceWithIdentityArbitration(
            voice,
            arbitrateBrandIdentity(pageVisionAudit),
            source.id,
          )
        : voice,
      source,
      promptOpts,
    );
    genome = voiceApply.genome;
    const toneTraits = voice.tone.map((t) => t.value.text);
    const hasVoice = toneTraits.length > 0 || voice.tagline.length > 0;
    yield* emitApplyResult(voiceApply);
    yield {
      type: "section_resolved",
      section: "voice",
      preview: sectionPreviewFromGenome(genome, "voice"),
      micro: hasVoice
        ? copyVoiceResolved(toneTraits)
        : voice.tagline[0]
          ? `${voice.tagline[0].value.text} toma forma como mensaje`
          : "No destilé un tono claro en este documento",
    };
  } catch {
    yield {
      type: "section_error",
      section: "voice",
      fileName,
      message: "No pude leer la voz de marca",
    };
  }
}

export async function ingestImageIntoGenome(
  buffer: Buffer,
  fileName: string,
  mime: string,
  genomeInput: Genome,
  opts: { allowMaterialPrompts?: boolean } = {},
): Promise<{ events: BrandKitIngestStreamEvent[]; genome: Genome }> {
  const source = buildSource(fileName, "image");
  let genome = normalizeGenome(genomeInput);
  const imageUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const nameBoost = isLogoFilename(fileName);
  const candidate = createCandidate<LogoValue>({
    value: { imageUrl, variant: "positive", label: fileName },
    signals: [
      signal("shape-dominant", {
        detail: nameBoost ? "nombre de archivo sugiere logo" : "imagen suelta con forma dominante",
        sourceRef: source.id,
        scale: nameBoost ? 0.85 : 0.5,
      }),
    ],
    signature: `img_${fileName.replace(/\W+/g, "").toLowerCase().slice(0, 24)}`,
    sourceRefs: [source.id],
  });
  const logoApplyRaw = applyLogoCandidates(
    genome,
    [{ imageUrl, signature: candidate.signature, candidate, slot: "primary" }],
    source,
    opts,
  );
  genome = logoApplyRaw.genome;

  if (nameBoost && opts.allowMaterialPrompts === false && !hasCrownedLogoPrimary(genome)) {
    genome = crownLogoPrimaryBySignature(genome, candidate.signature);
  }

  const logoApply = { ...logoApplyRaw, genome };
  const events: BrandKitIngestStreamEvent[] = [
    { type: "section_running", section: "logo", label: copySectionRunning("logo") },
    {
      type: "section_resolved",
      section: "logo",
      preview: sectionPreviewFromGenome(genome, "logo"),
      micro: nameBoost && hasCrownedLogoPrimary(genome)
        ? "Imagen de logo coronada como principal"
        : nameBoost
          ? "Imagen con nombre de logo recibida como candidata principal"
          : "Imagen recibida como candidata de logo",
    },
    ...emitApplyResult(logoApply),
  ];
  return { events, genome };
}

export async function ingestSvgIntoGenome(
  buffer: Buffer,
  fileName: string,
  genomeInput: Genome,
): Promise<{ events: BrandKitIngestStreamEvent[]; genome: Genome }> {
  const contentSha256 = bufferContentSha256(buffer);
  const source = buildSource(fileName, "image", contentSha256);
  let genome = normalizeGenome(genomeInput);

  const vectorApply = await crownVectorLogoIntoGenome({
    svgBuffer: buffer,
    label: fileName,
    genomeInput: genome,
    source,
    signalDetail: "SVG de marca aportado",
    userSupplied: true,
  });
  genome = vectorApply.genome;

  const events: BrandKitIngestStreamEvent[] = [
    { type: "section_running", section: "logo", label: copySectionRunning("logo") },
    {
      type: "section_resolved",
      section: "logo",
      preview: sectionPreviewFromGenome(genome, "logo"),
      micro: "SVG de marca coronado como logo principal",
    },
    ...emitApplyResult(vectorApply),
  ];
  return { events, genome };
}
