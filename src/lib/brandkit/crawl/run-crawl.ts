import axios from "axios";
import * as cheerio from "cheerio";
import { randomUUID } from "node:crypto";
import type { EssenceValue, GalleryValue, LegacyOnelinerValue, LegacyValuesValue, Provenance, SlotState, VisualWorldValue } from "../brand-kit-types";
import { mergeFontFamilies } from "./color-utils";
import {
  brandNameFromPage,
  cssVarColors,
  hexColorsFromCss,
  fontFaceFamilies,
  fontFaces,
  fontLinks,
  headerLogoHeuristic,
  iconsFromHead,
  imageHarvester,
  inlineFontFamilies,
  logoFromAltText,
  logoFromJsonLd,
  themeColorMeta,
} from "./parsers";
import { buildCopyCorpus } from "./copy-corpus";
import { buildCopyUnits, copyUnitsToCorpus, formatCopyUnitsForLlm } from "./copy-units";
import { selectEvidenceCandidates } from "../brand-kit-evidence-candidates";
import { buildEssenceHeadlineCandidates, buildEssenceHeadlineAlternatives, buildResolvedEssenceFromIngest, canResolveEssence } from "../brand-kit-essence-headline";
import { galleryItemSourceUrl } from "../brand-kit-gallery-media";
import { buildGalleryContextForLlm, filterHarvestedGallery, galleryRefIds, galleryUsefulCount } from "../brand-kit-gallery-filter";
import { buildVisualWorldFromGallery } from "../brand-kit-visual-synthesis";
import {
  extractOnelinerCandidatesFromPages,
  extractOnelinerDeterministic,
  extractValuesDeterministic,
  extractVoiceDeterministic,
  isWeakOneliner,
} from "./copy-extract";
import {
  labelLogoCandidatesWithVision,
  synthesizeOnelinerOptions,
} from "../llm/brand-kit-llm-synthesis";
import { essenceCandidatesFromOnelinerLlm } from "../llm/brand-kit-llm-validate";
import { batchLlmProvenance, buildBatchSlotPatch, synthesizeBrandKitBatch } from "../llm/brand-kit-llm-batch";
import { applyMirroredPreviewUrl, mirrorExternalImagesForCrawl } from "./mirror-crawl-images";
import { buildLogoSlotPatch, resolvedLogoPreviewUrl } from "../brand-kit-logo-policy";
import { buildPaletteValue, buildTypographyValue, rankLogoCandidates } from "./scoring";
import type { BrandKitCrawlOptions } from "./crawl-options";
import type { CrawlPageSnapshot, BrandKitStreamEvent } from "./types";
import { DEFAULT_CRAWL_BUDGET, BRAND_KIT_CRAWL_USER_AGENT } from "./types";
import {
  crawlPathPrefix,
  discoverSameOriginLinks,
  extractInlineStyles,
  extractLinkedStylesheets,
  isAllowedCrawlUrl,
  normalizeHttpUrl,
  scorePagePriority,
} from "./url-utils";
import { assertPublicHttpUrl, SsrfBlockedUrlError } from "@/lib/ssrf-url-guard";

const NOW = () => new Date().toISOString();
const CRAWL_TOTAL_STEPS = 6;
const CRAWL_BATCH_STAGGER_MS = 200;

function batchStagger(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, CRAWL_BATCH_STAGGER_MS));
}

function slotPatch(partial: Partial<SlotState<unknown>>): Partial<SlotState<unknown>> {
  return { updatedAt: NOW(), ...partial };
}

function beliefsFromValues(values: LegacyValuesValue | null | undefined): EssenceValue["beliefs"] {
  if (!values?.values?.length) return [];
  return values.values.map((item) => ({ label: item.label, evidence: item.evidence }));
}

function essenceCandidatesFromDeterministicOneliners(
  oneliners: LegacyOnelinerValue[],
  beliefs: EssenceValue["beliefs"],
  provenance: Provenance,
  llmAttempted = false,
): SlotState<EssenceValue>["candidates"] {
  return oneliners.map((value, index) => ({
    value: {
      summary: llmAttempted
        ? "Propuesta de respaldo extraída del sitio. La síntesis con IA no pasó validación de calidad."
        : "Opción extraída de la web — activa IA o edita para una síntesis defendible.",
      headline: value.text,
      headlineOrigin: value.origin,
      beliefs,
      evidence: [{ quote: value.text, sourceUrl: provenance.sourceUrl }],
    },
    score: 0.58 - index * 0.05,
    provenance,
  }));
}

function fallbackEssenceSummary(llmAttempted: boolean): string {
  return llmAttempted
    ? "Propuesta de respaldo a partir del manifiesto. La síntesis con IA no pasó validación de calidad."
    : "Creencias detectadas en el manifiesto — activa IA para una síntesis completa.";
}

function fallbackSlotPatchAfterLlmDegrade(
  partial: Partial<SlotState<unknown>>,
): Partial<SlotState<unknown>> {
  return slotPatch({
    needsReviewReason: "La síntesis necesita revisión",
    ...partial,
  });
}

async function fetchText(url: string, timeoutMs: number, maxBytes: number, rootUrl?: string): Promise<string> {
  if (rootUrl && !isAllowedCrawlUrl(url, rootUrl)) {
    throw new SsrfBlockedUrlError("URL de recurso fuera del crawl permitido");
  }
  await assertPublicHttpUrl(url);

  const res = await axios.get<string>(url, {
    timeout: timeoutMs,
    maxContentLength: maxBytes,
    maxRedirects: 3,
    responseType: "text",
    headers: {
      "User-Agent": BRAND_KIT_CRAWL_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,text/css,*/*;q=0.8",
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return String(res.data ?? "");
}

export async function fetchCrawlPages(
  rootUrl: string,
  budget = DEFAULT_CRAWL_BUDGET,
  emit?: (event: BrandKitStreamEvent) => void,
): Promise<CrawlPageSnapshot[]> {
  const started = Date.now();
  const normalized = normalizeHttpUrl(rootUrl);
  if (!normalized) throw new Error("URL inválida");

  const root = normalized.toString();
  const pathPrefix = crawlPathPrefix(root);
  const queue: string[] = [root];
  const seen = new Set<string>();
  const pages: CrawlPageSnapshot[] = [];
  let totalBytes = 0;

  while (queue.length && pages.length < budget.maxPages) {
    if (Date.now() - started > budget.maxMs) break;
    queue.sort((a, b) => scorePagePriority(b, b === root, root) - scorePagePriority(a, a === root, root));
    const url = queue.shift();
    if (!url || seen.has(url) || !isAllowedCrawlUrl(url, root)) continue;
    seen.add(url);

    emit?.({
      type: "progress",
      phase: "crawl",
      step: 1,
      totalSteps: CRAWL_TOTAL_STEPS,
      message: pathPrefix
        ? `Explorando ${pages.length + 1}/${budget.maxPages} en ${pathPrefix}…`
        : `Explorando ${pages.length + 1}/${budget.maxPages}: ${new URL(url).pathname || "/"}`,
    });

    let html: string;
    try {
      html = await fetchText(url, Math.min(15_000, budget.maxMs), budget.maxAssetBytes, root);
    } catch {
      continue;
    }

    totalBytes += html.length;
    if (totalBytes > budget.maxBytes) break;

    const cssUrls = extractLinkedStylesheets(html, url);
    const cssTexts: string[] = [...extractInlineStyles(html)];
    for (const cssUrl of cssUrls) {
      if (Date.now() - started > budget.maxMs) break;
      if (!isAllowedCrawlUrl(cssUrl, root)) continue;
      try {
        const css = await fetchText(cssUrl, 10_000, budget.maxAssetBytes, root);
        cssTexts.push(css);
      } catch {
        // skip broken stylesheets
      }
    }

    pages.push({ url, html, cssTexts });
    emit?.({
      type: "page_fetched",
      url,
      pageIndex: pages.length,
      pageTotal: budget.maxPages,
    });

    for (const link of discoverSameOriginLinks(html, url, budget.maxPages * 3, root)) {
      if (!seen.has(link) && !queue.includes(link)) queue.push(link);
    }
  }

  return pages;
}

export async function* runBrandKitCrawl(
  rootUrl: string,
  jobId = randomUUID(),
  options?: BrandKitCrawlOptions,
): AsyncGenerator<BrandKitStreamEvent> {
  yield {
    type: "progress",
    phase: "connect",
    step: 0,
    totalSteps: CRAWL_TOTAL_STEPS,
    message: "Conectando con la web…",
  };

  let pages: CrawlPageSnapshot[];
  const collectedEvents: BrandKitStreamEvent[] = [];
  const captureEmit = (event: BrandKitStreamEvent) => {
    collectedEvents.push(event);
  };

  try {
    pages = await fetchCrawlPages(rootUrl, DEFAULT_CRAWL_BUDGET, captureEmit);
    for (const event of collectedEvents) yield event;
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "No se pudo analizar la URL",
    };
    return;
  }

  if (!pages.length) {
    yield { type: "error", message: "No se pudo obtener contenido de la web" };
    return;
  }

  yield {
    type: "phase_complete",
    phase: "crawl",
  };
  yield {
    type: "progress",
    phase: "visual",
    step: 2,
    totalSteps: CRAWL_TOTAL_STEPS,
    message: `Analizando ${pages.length} página${pages.length === 1 ? "" : "s"}…`,
  };
  yield { type: "source_added", kind: "url", ref: rootUrl };

  const rootNormalized = normalizeHttpUrl(rootUrl)?.toString() ?? rootUrl;
  const crawlPrefix = crawlPathPrefix(rootNormalized);
  const logoSignals = [];
  const paletteColors: { hex: string; provenance: import("../brand-kit-types").Provenance; weight?: number; varName?: string }[] = [];
  const fontFamilyGroups: string[][] = [];
  const harvestedRaw: { url: string; provenance: import("../brand-kit-types").Provenance; score: number }[] = [];
  const harvestedSeen = new Set<string>();
  let brandName: string | undefined;

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const isHomePage =
      page.url === rootNormalized || (crawlPrefix ? new URL(page.url).pathname === crawlPrefix : new URL(page.url).pathname === "/");

    logoSignals.push(
      ...iconsFromHead($, page.url),
      ...logoFromJsonLd($, page.url),
      ...headerLogoHeuristic($, page.url),
      ...logoFromAltText($, page.url),
    );

    const theme = themeColorMeta($, page.url);
    if (theme) paletteColors.push({ hex: theme.hex, provenance: theme.provenance, weight: 0.6 });

    fontFamilyGroups.push(fontLinks($, page.url), inlineFontFamilies($));

    for (const css of page.cssTexts) {
      paletteColors.push(
        ...cssVarColors(css, page.url).map((c) => ({ ...c, weight: 0.5 + (c.varName ? 0.1 : 0) })),
        ...hexColorsFromCss(css, page.url),
      );
      fontFamilyGroups.push(fontFaceFamilies(css), fontFaces(css));
    }

    for (const img of imageHarvester($, page.url, isHomePage)) {
      if (crawlPrefix) {
        try {
          if (!new URL(img.url).pathname.startsWith(crawlPrefix)) continue;
        } catch {
          continue;
        }
      }
      if (harvestedSeen.has(img.url)) continue;
      harvestedSeen.add(img.url);
      harvestedRaw.push({
        url: img.url,
        provenance: img.provenance,
        score: img.score ?? 0,
      });
    }

    if (pages[0]?.url === page.url) {
      const brand = brandNameFromPage($, page.url);
      if (brand) {
        brandName = brand.value;
        yield { type: "brand_name", value: brand.value, provenance: brand.provenance };
      }
    }
  }

  const fontFamilies = mergeFontFamilies(...fontFamilyGroups);
  const copyUnits = buildCopyUnits(pages);
  const corpus = copyUnitsToCorpus(copyUnits);
  const evidenceCandidates = selectEvidenceCandidates(copyUnits);
  const llmEnabled = options?.llmEnabled === true;
  let synthesisInput: import("../llm/brand-kit-llm-synthesis").BrandKitSynthesisInput = {
    corpus,
    structuredCorpus: formatCopyUnitsForLlm(copyUnits),
    evidenceCandidates,
    brandName,
    userEmail: options?.userEmail,
    route: "/api/spaces/brandKit/crawl",
    onLlmCostUsd: options?.onLlmCostUsd,
  };

  yield { type: "progress", phase: "visual", step: 3, totalSteps: CRAWL_TOTAL_STEPS, message: "Logo y paleta…" };
  yield { type: "slot_update", slotId: "logo", patch: slotPatch({ status: "pending" }) };
  yield { type: "slot_update", slotId: "palette", patch: slotPatch({ status: "pending" }) };

  let logoCandidates = rankLogoCandidates(logoSignals);
  if (logoCandidates.length && llmEnabled) {
    yield { type: "llm_progress", step: "logo_vision", status: "running", detail: "Etiquetando logos…" };
    logoCandidates = await labelLogoCandidatesWithVision(logoCandidates, synthesisInput);
    yield {
      type: "llm_progress",
      step: "logo_vision",
      status: "done",
      detail: `${logoCandidates.length} candidatos`,
    };
  }

  if (logoCandidates.length && options?.userEmail) {
    const logoUrls = logoCandidates
      .map((candidate) => candidate.value.previewUrl ?? candidate.value.assetId)
      .filter((url): url is string => Boolean(url?.startsWith("http")));
    const mirroredLogos = await mirrorExternalImagesForCrawl(options.userEmail, logoUrls);
    if (mirroredLogos.size) {
      logoCandidates = logoCandidates.map((candidate) => {
        const sourceUrl = candidate.value.previewUrl ?? candidate.value.assetId;
        const previewUrl = applyMirroredPreviewUrl(sourceUrl, mirroredLogos);
        if (previewUrl === sourceUrl) return candidate;
        return { ...candidate, value: { ...candidate.value, previewUrl } };
      });
    }
  }

  const logoPatch = buildLogoSlotPatch(logoCandidates);
  yield {
    type: "slot_update",
    slotId: "logo",
    patch: slotPatch({ ...logoPatch, locked: false }),
  };

  const paletteBuilt = buildPaletteValue(paletteColors);
  if (paletteBuilt) {
    yield {
      type: "slot_update",
      slotId: "palette",
      patch: slotPatch({
        status: "resolved",
        value: paletteBuilt.value,
        provenance: paletteBuilt.provenance,
        confidence: 0.85,
      }),
    };
  } else {
    yield { type: "slot_update", slotId: "palette", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
  }

  yield { type: "progress", phase: "visual", step: 3, totalSteps: CRAWL_TOTAL_STEPS, message: "Tipografías…" };
  yield { type: "slot_update", slotId: "typography", patch: slotPatch({ status: "pending" }) };
  const typographyBuilt = buildTypographyValue(fontFamilies);
  if (typographyBuilt) {
    yield {
      type: "slot_update",
      slotId: "typography",
      patch: slotPatch({
        status: "resolved",
        value: typographyBuilt.value,
        provenance: typographyBuilt.provenance,
        confidence: 0.8,
      }),
    };
  } else {
    yield { type: "slot_update", slotId: "typography", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
  }

  yield {
    type: "progress",
    phase: "visual",
    step: 4,
    totalSteps: CRAWL_TOTAL_STEPS,
    message: `Galería (${harvestedRaw.length} imágenes encontradas)…`,
  };

  let harvested = filterHarvestedGallery(
    harvestedRaw
      .sort((a, b) => b.score - a.score)
      .map((item) => ({
        assetId: item.url,
        previewUrl: item.url,
        included: true,
        provenance: item.provenance,
      })),
    {
      logoUrls: [
        resolvedLogoPreviewUrl(logoPatch),
        ...logoCandidates.map((candidate) => candidate.value.previewUrl ?? candidate.value.assetId),
      ].filter(Boolean) as string[],
    },
  );

  if (harvested.length && options?.userEmail) {
    const galleryUrls = harvested.map((item) => galleryItemSourceUrl(item)).filter((url) => url.startsWith("http"));
    const mirroredGallery = await mirrorExternalImagesForCrawl(options.userEmail, galleryUrls);
    harvested = harvested.map((item) => {
      const sourceUrl = galleryItemSourceUrl(item);
      const previewUrl = applyMirroredPreviewUrl(sourceUrl, mirroredGallery);
      return previewUrl && previewUrl !== item.previewUrl ? { ...item, previewUrl } : item;
    });
  }

  const galleryValue: GalleryValue = { harvested, generated: [], stylePromptVersion: 0 };
  const galleryContext = buildGalleryContextForLlm(galleryValue);

  synthesisInput = {
    corpus,
    structuredCorpus: formatCopyUnitsForLlm(copyUnits),
    galleryContext: galleryContext || undefined,
    evidenceCandidates,
    brandName,
    userEmail: options?.userEmail,
    route: "/api/spaces/brandKit/crawl",
    onLlmCostUsd: options?.onLlmCostUsd,
  };

  if (harvested.length) {
    yield {
      type: "slot_update",
      slotId: "gallery",
      patch: slotPatch({
        status: "resolved",
        value: galleryValue,
        confidence: 0.75,
        provenance: harvested[0]?.provenance,
      }),
    };
  } else {
    yield { type: "slot_update", slotId: "gallery", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
  }

  yield { type: "phase_complete", phase: "visual" };
  yield { type: "slot_update", slotId: "voice", patch: slotPatch({ status: "pending" }) };
  yield { type: "slot_update", slotId: "essence", patch: slotPatch({ status: "pending" }) };

  yield {
    type: "progress",
    phase: "copy",
    step: 4,
    totalSteps: CRAWL_TOTAL_STEPS,
    message: "Extrayendo claim y corpus…",
  };

  const extractedOneliner = extractOnelinerDeterministic(pages, brandName);
  const onelinerIsWeak = extractedOneliner ? isWeakOneliner(extractedOneliner.value.text, brandName) : false;

  const deterministicVoice = extractVoiceDeterministic(pages, brandName);
  const deterministicValues = extractValuesDeterministic(pages);
  const deterministicOneliners = onelinerIsWeak ? extractOnelinerCandidatesFromPages(pages, brandName) : [];
  const deterministicBeliefs = beliefsFromValues(deterministicValues);
  const pageUrl = pages[0]?.url;

  const applyDeterministicCopy = function* (reason: string): Generator<BrandKitStreamEvent> {
    yield { type: "llm_status", status: "skipped", reason };
    const provenance = { type: "og_meta" as const, detail: reason, sourceUrl: pageUrl };

    if (deterministicVoice) {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: slotPatch({
          status: "candidates",
          candidates: [
            {
              value: deterministicVoice,
              score: 0.6,
              provenance: { type: "file_upload", detail: reason, sourceUrl: pageUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else {
      yield { type: "slot_update", slotId: "voice", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
    }

    if (extractedOneliner && !onelinerIsWeak) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: [
            {
              value: {
                summary: "Claim extraído de la web — confirma o completa con una síntesis.",
                headline: extractedOneliner.value.text,
                headlineOrigin: "extracted",
                beliefs: deterministicBeliefs,
                evidence: [{ quote: extractedOneliner.value.text, sourceUrl: pageUrl }],
              } satisfies EssenceValue,
              score: 0.82,
              provenance: { type: "og_meta", detail: extractedOneliner.sourceDetail, sourceUrl: pageUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else if (deterministicOneliners.length >= 2) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: essenceCandidatesFromDeterministicOneliners(deterministicOneliners, deterministicBeliefs, provenance),
          confidence: 0.55,
        }),
      };
    } else if (deterministicOneliners.length === 1) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: essenceCandidatesFromDeterministicOneliners(deterministicOneliners, deterministicBeliefs, provenance),
          confidence: 0.55,
        }),
      };
    } else if (deterministicBeliefs.length) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: [
            {
              value: {
                summary: fallbackEssenceSummary(false),
                beliefs: deterministicBeliefs,
                evidence: deterministicBeliefs
                  .filter((belief) => belief.evidence)
                  .map((belief) => ({ quote: belief.evidence!, sourceUrl: pageUrl })),
              } satisfies EssenceValue,
              score: 0.58,
              provenance: { type: "file_upload", detail: reason, sourceUrl: pageUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else {
      yield { type: "slot_update", slotId: "essence", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
    }

    const fallbackVisual = buildVisualWorldFromGallery(galleryValue, brandName);
    if (fallbackVisual) {
      yield {
        type: "slot_update",
        slotId: "visualWorld",
        patch: slotPatch({
          status: "resolved",
          value: fallbackVisual,
          provenance: {
            type: "llm_synthesis",
            detail: `síntesis visual desde ${galleryUsefulCount(galleryValue)} imágenes`,
            sourceUrl: pageUrl,
          },
          confidence: 0.66,
        }),
      };
    } else {
      yield { type: "slot_update", slotId: "visualWorld", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
    }
  };

  if (!llmEnabled) {
    yield* applyDeterministicCopy(options?.llmSkipReason ?? "Síntesis IA desactivada");
  } else if (corpus.trim().length < 50) {
    yield* applyDeterministicCopy("Corpus demasiado corto para IA");
  } else {
    yield {
      type: "progress",
      phase: "llm",
      step: 5,
      totalSteps: CRAWL_TOTAL_STEPS,
      message: "Sintetizando ADN de marca con IA…",
    };
    yield { type: "llm_status", status: "running" };

    yield {
      type: "llm_progress",
      step: "batch",
      status: "running",
      substep: "essence",
      detail: "Esencia, voz y mundo visual…",
    };
    const batch = await synthesizeBrandKitBatch(synthesisInput);

    const essenceHeadline =
      extractedOneliner && !onelinerIsWeak ? extractedOneliner.value.text : batch.essence?.headline;
    const essenceValue = batch.essence
      ? {
          ...batch.essence,
          headline: essenceHeadline ?? batch.essence.headline,
          headlineOrigin: extractedOneliner && !onelinerIsWeak ? ("extracted" as const) : undefined,
        }
      : null;

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "essence",
      status: essenceValue ? "done" : "failed",
      detail: essenceValue ? `${essenceValue.beliefs.length} creencias` : "Degradado",
    };
    await batchStagger();

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "voice",
      status: batch.voice ? "done" : "failed",
      detail: batch.voice ? `${batch.voice.descriptors.length} descriptores` : "Degradado",
    };
    await batchStagger();

    yield {
      type: "llm_progress",
      step: "batch",
      substep: "visualWorld",
      status: batch.visualWorld ? "done" : "failed",
      detail: batch.visualWorld ? `${batch.visualWorld.limits.length} límites` : "Degradado",
    };

    let onelinerLlm = null;
    const needsOnelinerLlm = !extractedOneliner || onelinerIsWeak;
    if (needsOnelinerLlm) {
      yield { type: "llm_progress", step: "oneliner", status: "running", detail: "Generando claims…" };
      onelinerLlm = await synthesizeOnelinerOptions(synthesisInput);
      yield {
        type: "llm_progress",
        step: "oneliner",
        status: onelinerLlm ? "done" : "failed",
        detail: onelinerLlm ? "3 opciones" : "Sin resultado válido",
      };
    } else {
      yield { type: "llm_progress", step: "oneliner", status: "skipped", detail: "Claim extraído del sitio" };
    }

    const llmOk = Boolean(essenceValue || batch.voice || batch.visualWorld || onelinerLlm);
    yield {
      type: "llm_status",
      status: llmOk ? "done" : "skipped",
      reason: llmOk ? undefined : "IA sin resultados válidos",
    };

    const batchProv = batchLlmProvenance(rootUrl);
    const beliefs = essenceValue?.beliefs ?? deterministicBeliefs;

    if (essenceValue && canResolveEssence(essenceValue)) {
      const resolvedEssence: EssenceValue = {
        ...essenceValue,
        beliefs: essenceValue.beliefs.length ? essenceValue.beliefs : beliefs,
        headline:
          extractedOneliner && !onelinerIsWeak
            ? extractedOneliner.value.text
            : essenceValue.headline ??
              onelinerLlm?.options[0]?.text ??
              deterministicOneliners[0]?.text,
        headlineOrigin:
          extractedOneliner && !onelinerIsWeak
            ? ("extracted" as const)
            : onelinerLlm?.options[0]?.text || deterministicOneliners[0]?.text
              ? ("generated" as const)
              : undefined,
      };

      const headlineCandidates = needsOnelinerLlm
        ? buildEssenceHeadlineCandidates(
            resolvedEssence,
            { onelinerLlm, deterministicOneliners },
            batchProv,
          )
        : [];

      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          ...buildBatchSlotPatch({
            value: resolvedEssence,
            provenance: batchProv,
            confidence: needsOnelinerLlm ? 0.7 : 0.74,
          }),
          candidates: headlineCandidates,
        }),
      };
    } else if (needsOnelinerLlm) {
      if (onelinerLlm) {
        const resolvedFromOneliner = buildResolvedEssenceFromIngest({
          beliefs,
          onelinerLlm,
          brandName,
        });
        if (resolvedFromOneliner) {
          yield {
            type: "slot_update",
            slotId: "essence",
            patch: slotPatch({
              status: "resolved",
              value: resolvedFromOneliner,
              provenance: batchProv,
              confidence: 0.66,
              candidates: buildEssenceHeadlineAlternatives(resolvedFromOneliner, onelinerLlm, batchProv),
            }),
          };
        } else {
          yield {
            type: "slot_update",
            slotId: "essence",
            patch: slotPatch({
              status: "candidates",
              candidates: essenceCandidatesFromOnelinerLlm(onelinerLlm, beliefs, rootUrl),
              confidence: 0.5,
            }),
          };
        }
      } else if (deterministicOneliners.length >= 1) {
        yield {
          type: "slot_update",
          slotId: "essence",
          patch: slotPatch({
            status: "candidates",
            candidates: essenceCandidatesFromDeterministicOneliners(
              deterministicOneliners,
              beliefs,
              { type: "og_meta", detail: "texto web", sourceUrl: rootUrl },
              true,
            ),
            confidence: 0.48,
          }),
        };
      } else if (beliefs.length) {
        yield {
          type: "slot_update",
          slotId: "essence",
          patch: slotPatch({
            status: "candidates",
            candidates: [
              {
                value: {
                  summary: fallbackEssenceSummary(true),
                  beliefs,
                  evidence: beliefs
                    .filter((belief) => belief.evidence)
                    .map((belief) => ({ quote: belief.evidence!, sourceUrl: rootUrl })),
                } satisfies EssenceValue,
                score: 0.55,
                provenance: batchProv,
              },
            ],
            confidence: 0.55,
          }),
        };
      } else {
        yield { type: "slot_update", slotId: "essence", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
      }
    } else if (essenceValue) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: essenceValue,
            provenance: batchProv,
            confidence: 0.74,
          }),
        ),
      };
    } else if (extractedOneliner && !onelinerIsWeak) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: slotPatch({
          status: "candidates",
          candidates: [
            {
              value: {
                summary: "Claim extraído de la web — confirma o completa con una síntesis.",
                headline: extractedOneliner.value.text,
                headlineOrigin: "extracted",
                beliefs,
                evidence: [{ quote: extractedOneliner.value.text, sourceUrl: rootUrl }],
              } satisfies EssenceValue,
              score: 0.82,
              provenance: { type: "og_meta", detail: extractedOneliner.sourceDetail, sourceUrl: rootUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else if (deterministicValues || beliefs.length) {
      yield {
        type: "slot_update",
        slotId: "essence",
        patch: fallbackSlotPatchAfterLlmDegrade({
          status: "candidates",
          candidates: [
            {
              value: {
                summary: fallbackEssenceSummary(true),
                beliefs: deterministicBeliefs,
                evidence: deterministicBeliefs
                  .filter((belief) => belief.evidence)
                  .map((belief) => ({ quote: belief.evidence!, sourceUrl: rootUrl })),
              } satisfies EssenceValue,
              score: 0.58,
              provenance: { type: "file_upload", detail: "manifesto web", sourceUrl: rootUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else {
      yield { type: "slot_update", slotId: "essence", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
    }

    if (batch.voice) {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: batch.voice,
            provenance: batchProv,
            confidence: batch.voice.evidence.length >= 1 ? 0.72 : 0.68,
          }),
        ),
      };
    } else if (deterministicVoice) {
      yield {
        type: "slot_update",
        slotId: "voice",
        patch: fallbackSlotPatchAfterLlmDegrade({
          status: "candidates",
          candidates: [
            {
              value: deterministicVoice,
              score: 0.6,
              provenance: { type: "file_upload", detail: "manifesto web", sourceUrl: rootUrl },
            },
          ],
          confidence: 0.55,
        }),
      };
    } else {
      yield { type: "slot_update", slotId: "voice", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
    }

    if (batch.visualWorld) {
      const visualValue: VisualWorldValue = {
        ...batch.visualWorld,
        galleryRefs: galleryRefIds(galleryValue),
      };
      yield {
        type: "slot_update",
        slotId: "visualWorld",
        patch: slotPatch(
          buildBatchSlotPatch({
            value: visualValue,
            provenance: batchProv,
            confidence: 0.66,
          }),
        ),
      };
    } else {
      const fallbackVisual = buildVisualWorldFromGallery(galleryValue, brandName);
      if (fallbackVisual) {
        yield {
          type: "slot_update",
          slotId: "visualWorld",
          patch: fallbackSlotPatchAfterLlmDegrade({
            status: "resolved",
            value: fallbackVisual,
            provenance: {
              type: "llm_synthesis",
              detail: `síntesis visual desde ${galleryUsefulCount(galleryValue)} imágenes`,
              sourceUrl: rootUrl,
            },
            confidence: 0.68,
          }),
        };
      } else {
        yield { type: "slot_update", slotId: "visualWorld", patch: slotPatch({ status: "needs_user", confidence: 0 }) };
      }
    }
  }

  yield {
    type: "progress",
    phase: "finalize",
    step: 6,
    totalSteps: CRAWL_TOTAL_STEPS,
    message: "ADN listo",
  };
  yield { type: "phase_complete", phase: "copy" };
  yield { type: "phase_complete", phase: "llm" };
  yield { type: "phase_complete", phase: "finalize" };
  yield { type: "done", jobId };
}

export { analyzeStaticHtml } from "./static-analyze";
