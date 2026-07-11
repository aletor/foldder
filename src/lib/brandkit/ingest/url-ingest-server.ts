/**
 * Ingesta de URL acumulativa: visita la web y extrae paleta → logo → tipografía → visual → voz.
 */

import { computeLogoPHash } from "@/lib/brain/pdf-logo-pipeline";
import {
  discoverImageUrls,
  discoverLogoUrls,
  domainFromUrl,
  extractPaletteFromHtml,
  extractTypographyFromHtml,
  extractVoiceFromHtml,
  findExistingUrlSource,
  normalizePageUrl,
  scoreUrlLogoUrl,
  scoreUrlRasterLogo,
  sourceRefForUrl,
  titleFromHtml,
  buildLogoCandidateFromBuffer,
  URL_RASTER_LOGO_MIN_SCORE,
} from "../extractors/url-page";
import { buildTextSampleFromHtml, enrichVoiceExtraction } from "../extractors/voice-llm";
import { extractVisualFromFetchedImages } from "../extractors/url-visual";
import { visualTerritoryCount } from "../extractors/visual";
import { createCandidate, signal } from "../model/evidence";
import { textSignature } from "../model/signature";
import type { TaglineValue } from "../model/trait-values";
import {
  applyLogoCandidates,
  applyPaletteCandidates,
  applyTypographyExtraction,
  applyVisualExtraction,
  applyVoiceExtraction,
  type ApplyExtractionResult,
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
import { normalizeGenome, type Genome } from "../model/trait";
import { genomeHasPriorMaterial, type ApplyMaterialPromptOptions } from "./material-prompt";
import { allowPaidIngestAnalysis } from "./paid-extract-gate";
import { sectionPreviewFromGenome } from "./section-preview";
import { crownVectorLogoIntoGenome, hasCrownedLogoPrimary } from "./vector-logo-ingest";

function* emitApplyResult(result: ApplyExtractionResult): Generator<BrandKitIngestStreamEvent> {
  yield { type: "genome_update", genome: result.genome };
  for (const prompt of result.prompts) {
    yield { type: "material_prompt", prompt };
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Foldder-BrandKit/1.0", Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchImage(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/png";
    if (!mime.startsWith("image/")) return null;
    return { buffer: Buffer.from(await res.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

export async function* ingestUrlIntoGenome(
  url: string,
  genomeInput: Genome,
  opts: {
    userEmail?: string;
    allowMaterialPrompts?: boolean;
    allowPaidAnalysis?: boolean;
    paidAnalysisOperationId?: string;
  } = {},
): AsyncGenerator<BrandKitIngestStreamEvent> {
  const normalized = normalizePageUrl(url);
  const domain = domainFromUrl(normalized);
  const genomeSeed = normalizeGenome(genomeInput);
  let genome = genomeSeed;
  const promptOpts: ApplyMaterialPromptOptions = {
    allowMaterialPrompts: opts.allowMaterialPrompts ?? genomeHasPriorMaterial(genomeInput),
  };

  yield { type: "url_visiting", domain };
  yield { type: "ingest_reading", sourceCount: genome.sources.length + 1 };

  const existing = findExistingUrlSource(genome, normalized);
  const source = existing ?? sourceRefForUrl(normalized);
  const ingestAnalysisAllowed = allowPaidIngestAnalysis(Boolean(existing));
  const paidAnalysisAllowed = opts.allowPaidAnalysis === true;
  if (existing) {
    yield { type: "micro", text: `${domain} ya está en tus fuentes · releyendo` };
  }

  let html: string;
  try {
    html = await fetchHtml(normalized);
  } catch {
    yield { type: "source_error", fileName: domain, message: `No pude leer ${domain}` };
    yield { type: "genome_update", genome };
    return;
  }

  // ── Paleta ──────────────────────────────────────────────────────────────
  yield { type: "section_running", section: "palette", label: copySectionRunning("palette") };
  try {
    const candidates = extractPaletteFromHtml(html, source.id);
    const paletteApply = applyPaletteCandidates(genome, candidates, source, promptOpts);
    genome = paletteApply.genome;
    const swatches = candidates.map((c) => c.value.hex);
    yield* emitApplyResult(paletteApply);
    yield {
      type: "section_resolved",
      section: "palette",
      preview: sectionPreviewFromGenome(genome, "palette"),
      micro: swatches.length ? copyPaletteResolved(swatches.length) : "Sin colores claros en esta web",
    };
  } catch {
    yield { type: "section_error", section: "palette", fileName: domain, message: "No pude extraer la paleta" };
  }

  // ── Logo ────────────────────────────────────────────────────────────────
  yield { type: "section_running", section: "logo", label: copySectionRunning("logo") };
  try {
    const logoUrls = discoverLogoUrls(html, normalized);
    let logoResolved = false;

    if (!hasCrownedLogoPrimary(genome)) {
      for (const logoUrl of logoUrls) {
        const fetched = await fetchImage(logoUrl);
        if (!fetched) continue;
        const mime = fetched.mime.split(";")[0].toLowerCase();
        if (mime === "image/svg+xml" || logoUrl.toLowerCase().endsWith(".svg")) {
          const vectorApply = await crownVectorLogoIntoGenome({
            svgBuffer: fetched.buffer,
            label: domain,
            genomeInput: genome,
            source,
            signalDetail: "vector de marca en la web",
            opts: promptOpts,
          });
          genome = vectorApply.genome;
          yield* emitApplyResult(vectorApply);
          yield {
            type: "section_resolved",
            section: "logo",
            preview: sectionPreviewFromGenome(genome, "logo"),
            micro: "Vector de marca en la web coronado como logo principal",
          };
          logoResolved = true;
          break;
        }
      }
    }

    if (!logoResolved && !hasCrownedLogoPrimary(genome)) {
      let best: { trimmed: Buffer; url: string; score: number } | null = null;
      for (const logoUrl of logoUrls) {
        if (logoUrl.toLowerCase().endsWith(".svg")) continue;
        const fetched = await fetchImage(logoUrl);
        if (!fetched) continue;
        const urlScore = scoreUrlLogoUrl(logoUrl);
        const scored = await scoreUrlRasterLogo(logoUrl, fetched.buffer, urlScore);
        if (!scored || scored.total < URL_RASTER_LOGO_MIN_SCORE) continue;
        if (!best || scored.total > best.score) {
          best = { trimmed: scored.trimmed, url: logoUrl, score: scored.total };
        }
      }

      if (best) {
        const logoPHash = await computeLogoPHash(best.trimmed);
        const entry = buildLogoCandidateFromBuffer(best.trimmed, "image/png", source, domain, logoPHash);
        const logoApply = applyLogoCandidates(
          genome,
          [{ imageUrl: entry.imageUrl, signature: entry.signature, candidate: entry.candidate, slot: "primary" }],
          source,
          promptOpts,
        );
        genome = logoApply.genome;
        yield* emitApplyResult(logoApply);
        yield {
          type: "section_resolved",
          section: "logo",
          preview: sectionPreviewFromGenome(genome, "logo"),
          micro: copyLogoResolved(1, 1),
        };
        logoResolved = true;
      }
    }

    if (!logoResolved) {
      yield {
        type: "section_resolved",
        section: "logo",
        preview: sectionPreviewFromGenome(genome, "logo"),
        micro: hasCrownedLogoPrimary(genome)
          ? "Logo de marca ya definido en el brandKit"
          : "No encontré un logo claro en esta web",
      };
    }
  } catch {
    yield { type: "section_error", section: "logo", fileName: domain, message: "No pude leer el logo" };
  }

  // ── Tipografía ──────────────────────────────────────────────────────────
  yield { type: "section_running", section: "typography", label: copySectionRunning("typography") };
  try {
    const typography = extractTypographyFromHtml(html, [source]);
    const typoApply = applyTypographyExtraction(genome, typography, source, promptOpts);
    genome = typoApply.genome;
    const top = typography.primary[0];
    yield* emitApplyResult(typoApply);
    yield {
      type: "section_resolved",
      section: "typography",
      preview: sectionPreviewFromGenome(genome, "typography"),
      micro: top ? copyTypographyResolved(top.value.family) : "No reconocí una tipografía en esta web",
    };
  } catch {
    yield {
      type: "section_error",
      section: "typography",
      fileName: domain,
      message: "No pude leer la tipografía",
    };
  }

  // ── Universo visual ─────────────────────────────────────────────────────
  yield { type: "section_running", section: "visual", label: copySectionRunning("visual") };
  try {
    const imageUrls = discoverImageUrls(html, normalized).slice(0, 6);
    const fetchedImages: Array<{ buffer: Buffer; mime: string }> = [];
    for (const imageUrl of imageUrls) {
      const img = await fetchImage(imageUrl);
      if (img) fetchedImages.push(img);
      if (fetchedImages.length >= 4) break;
    }
    const visual = await extractVisualFromFetchedImages(fetchedImages, source.id);
    const visualApply = applyVisualExtraction(genome, visual, source, promptOpts);
    genome = visualApply.genome;
    const count = visualTerritoryCount(visual);
    yield* emitApplyResult(visualApply);
    yield {
      type: "section_resolved",
      section: "visual",
      preview: sectionPreviewFromGenome(genome, "visual"),
      micro: count ? copyVisualResolved(count) : "No encontré imágenes de referencia en esta web",
    };
  } catch {
    yield { type: "section_error", section: "visual", fileName: domain, message: "No pude leer el universo visual" };
  }

  // ── Voz ─────────────────────────────────────────────────────────────────
  yield { type: "section_running", section: "voice", label: copySectionRunning("voice") };
  try {
    const voiceHeuristic = extractVoiceFromHtml(html, source.id);
    const title = titleFromHtml(html);
    if (title && voiceHeuristic.tagline.length === 0) {
      voiceHeuristic.tagline.push(
        createCandidate<TaglineValue>({
          value: { text: title.slice(0, 120) },
          signals: [signal("headline", { sourceRef: source.id })],
          signature: textSignature(title),
          sourceRefs: [source.id],
        }),
      );
    }
    const voice = await enrichVoiceExtraction(
      voiceHeuristic,
      buildTextSampleFromHtml(html),
      source.id,
      { userEmail: opts.userEmail, allowPaidRefinement: paidAnalysisAllowed },
    );
    const voiceApply = applyVoiceExtraction(genome, voice, source, promptOpts);
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
        : `Sin tono claro en ${domain}`,
    };
  } catch {
    yield { type: "section_error", section: "voice", fileName: domain, message: "No pude leer la voz" };
  }

  yield { type: "genome_update", genome };
}
