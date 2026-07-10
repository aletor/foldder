import { box2dToBBoxPage, expandBBoxPage, isValidBox2d } from "@/lib/genoma/logo-intake/bbox";
import { cropLogoFromFrame, cropLogoFromImageDoc, renderCandidateAdjusted, renderEditPage, trimBBoxPageFromPage } from "@/lib/genoma/logo-intake/crop";
import { mapPool } from "@/lib/genoma/logo-intake/concurrency";
import { computeDHashHex, phashNear } from "@/lib/genoma/logo-intake/phash";
import {
  buildSemanticPalette,
  capRegionsForSampling,
  regionFromVision,
  renderSemanticPalettePages,
  type RegionSampleInput,
} from "@/lib/genoma/logo-intake/palette-sample";
import { scoreLogoQuality } from "@/lib/genoma/logo-intake/quality";
import type { IntakeDocInput, IntakeFrame, IntakePageSelector } from "@/lib/genoma/logo-intake/render";
import type { LogoCandidate, LogoProposal } from "@/lib/genoma/logo-intake/types";
import type { ParsedVisionBrandColorRegion, ParsedVisionLogo, ParsedVisionResponse } from "@/lib/genoma/logo-intake/vision-schema";
import { invokeLogoIntakeVision } from "@/lib/genoma/logo-intake/vision-invoker";
import { renderIntakeFrames } from "@/lib/genoma/logo-intake/render";
import sharp from "sharp";

const LOW_QUALITY_THRESHOLD = 45;
const MAX_ALTERNATIVES = 8;
const FRAME_CROP_CONCURRENCY = 12;

export type LogoIntakePipelineEvent =
  | { type: "pages_preparing"; done: number; total: number }
  | { type: "vision_started"; pages: number; thumbs: string[] }
  | { type: "vision_retrying"; attempt: number; max: number }
  | { type: "vision_finished"; ms: number }
  | { type: "candidates_found"; count: number; prohibitedExcluded: number }
  | { type: "logo_best_ready"; thumb: string; proposal: LogoProposal }
  | { type: "palette_sampling"; done: number; total: number }
  | { type: "color_crowned"; hex: string; name?: string; role: string }
  | { type: "palette_done"; count: number };

async function visionThumbDataUrl(jpegBase64: string): Promise<string> {
  const thumb = await sharp(Buffer.from(jpegBase64, "base64"))
    .resize(96, 96, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 55 })
    .toBuffer();
  return `data:image/jpeg;base64,${thumb.toString("base64")}`;
}

type RawCandidate = Omit<
  LogoCandidate,
  "quality" | "pHash" | "cropPng" | "cropMime" | "cropWidthPx" | "cropHeightPx"
>;

function parseVisionLogo(
  frame: IntakeFrame,
  logo: ParsedVisionLogo,
  idx: number,
): RawCandidate | null {
  if (logo.is_prohibited) return null;
  if (!isValidBox2d(logo.box_2d)) return null;
  const bboxPage = box2dToBBoxPage(logo.box_2d);
  if (!bboxPage) return null;

  return {
    id: `${frame.docId}:${frame.page}:${idx}`,
    docId: frame.docId,
    docName: frame.docName,
    page: frame.page,
    bboxPage,
    model: {
      isDocumentIssuerLogo: Boolean(logo.is_document_issuer_logo),
      isComplete: Boolean(logo.is_complete),
      cutEdges: Boolean(logo.cut_edges),
      variant: logo.variant ?? "unknown",
      brandText: logo.brand_text ?? null,
      variantLabel: logo.variant_label?.trim() || null,
      isProhibited: Boolean(logo.is_prohibited),
      confidence: Math.min(1, Math.max(0, Number(logo.confidence) || 0)),
    },
  };
}

function groupCandidates(candidates: LogoCandidate[]): {
  groups: LogoProposal["groups"];
  grouped: Map<string, LogoCandidate[]>;
} {
  const grouped = new Map<string, LogoCandidate[]>();
  for (const c of candidates) {
    let rep: string | null = null;
    for (const [key, list] of grouped) {
      if (phashNear(c.pHash, key)) {
        rep = key;
        list.push(c);
        break;
      }
    }
    if (!rep) grouped.set(c.pHash, [c]);
  }

  const groups = [...grouped.entries()].map(([pHashRep, list]) => ({
    pHashRep,
    count: list.length,
    docIds: [...new Set(list.map((c) => c.docId))],
  }));

  return { groups, grouped };
}

const MIN_LOGO_PALETTE_CROP_PX = 40;

function bboxPageArea(bbox: LogoCandidate["bboxPage"]): number {
  const [x0, y0, x1, y1] = bbox;
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function candidateCropArea(c: LogoCandidate): number {
  return c.cropWidthPx * c.cropHeightPx;
}

function pickBestCandidate(candidates: LogoCandidate[]): LogoCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const areaDiff = bboxPageArea(b.bboxPage) - bboxPageArea(a.bboxPage);
    if (Math.abs(areaDiff) > 0.002) return areaDiff > 0 ? 1 : -1;
    return b.quality.total - a.quality.total;
  })[0]!;
}

function normalizeBrandRegion(raw: unknown): ParsedVisionBrandColorRegion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isValidBox2d(o.box_2d)) return null;
  const kind = o.kind;
  if (
    kind !== "palette_swatch" &&
    kind !== "logo" &&
    kind !== "display_text" &&
    kind !== "brand_block" &&
    kind !== "graphic_element"
  ) {
    return null;
  }
  const prominence = Math.min(3, Math.max(1, Math.round(Number(o.prominence) || 1)));
  return {
    box_2d: o.box_2d as ParsedVisionBrandColorRegion["box_2d"],
    kind,
    prominence,
    label_text: typeof o.label_text === "string" ? o.label_text : null,
  };
}

async function buildSemanticPaletteFromVision(input: {
  docs: IntakeDocInput[];
  frames: IntakeFrame[];
  parsed: ParsedVisionResponse;
  logoCropPng: Buffer | null;
  onEvent?: (event: LogoIntakePipelineEvent) => void;
}): Promise<LogoProposal["semanticPalette"]> {
  const frameByKey = new Map(input.frames.map((f) => [`${f.docIndex}:${f.page}`, f]));
  const pageKeys: Array<{ docId: string; page: number }> = [];
  const regionDefs: Array<{ docId: string; page: number; region: ParsedVisionBrandColorRegion }> = [];

  for (const image of input.parsed.images ?? []) {
    const frame = frameByKey.get(`${image.docIndex}:${image.pageNumber}`);
    if (!frame) continue;
    const regions = (image.brand_color_regions ?? [])
      .map(normalizeBrandRegion)
      .filter((r): r is ParsedVisionBrandColorRegion => r != null);
    if (regions.length === 0) continue;
    pageKeys.push({ docId: frame.docId, page: frame.page });
    for (const region of regions) {
      regionDefs.push({ docId: frame.docId, page: frame.page, region });
    }
  }

  const cappedDefs = capRegionsForSampling(regionDefs);

  if (cappedDefs.length === 0 && !input.logoCropPng) {
    return { entries: [], samplingMs: 0, semanticChromaticCount: 0 };
  }

  const pageKeysDeduped = [...new Map(pageKeys.map((k) => [`${k.docId}:${k.page}`, k])).values()];
  const renderedPages = await renderSemanticPalettePages({ docs: input.docs, pageKeys: pageKeysDeduped });
  const regions: RegionSampleInput[] = [];

  for (const def of cappedDefs) {
    const page = renderedPages.get(`${def.docId}:${def.page}`);
    const partial = regionFromVision(def.region, def.page);
    if (!partial || !page) continue;
    regions.push({
      ...partial,
      pagePng: page.png,
      pageWidth: page.width,
      pageHeight: page.height,
    });
  }

  return buildSemanticPalette({
    docs: input.docs,
    regions,
    logoCropPng: input.logoCropPng,
    onSamplingProgress: (done, total) => {
      input.onEvent?.({ type: "palette_sampling", done, total });
    },
    onColorReady: (entry) => {
      input.onEvent?.({
        type: "color_crowned",
        hex: entry.hex,
        name: entry.name,
        role: entry.role,
      });
    },
  });
}

function countVisionCandidates(parsed: ParsedVisionResponse): { count: number; prohibitedExcluded: number } {
  let count = 0;
  let prohibitedExcluded = 0;
  for (const image of parsed.images ?? []) {
    for (const logo of image.logos ?? []) {
      const o = logo as ParsedVisionLogo;
      if (o.is_prohibited) {
        prohibitedExcluded += 1;
        continue;
      }
      if (isValidBox2d(o.box_2d)) count += 1;
    }
  }
  return { count, prohibitedExcluded };
}

function buildPartialProposal(input: {
  batchId: string;
  best: LogoCandidate | null;
  alternatives: LogoCandidate[];
  groups: LogoProposal["groups"];
  timings: LogoProposal["timings"];
  visionCalls: number;
  palettePending: boolean;
  semanticPalette?: LogoProposal["semanticPalette"];
}): LogoProposal {
  return {
    batchId: input.batchId,
    best: input.best,
    lowQuality: !input.best || input.best.quality.total < LOW_QUALITY_THRESHOLD,
    alternatives: input.alternatives,
    groups: input.groups,
    semanticPalette: input.semanticPalette,
    palettePending: input.palettePending,
    timings: input.timings,
    visionCalls: input.visionCalls,
  };
}

export async function runLogoIntakePipeline(input: {
  batchId: string;
  docs: IntakeDocInput[];
  userEmail?: string;
  selectPages?: IntakePageSelector;
  onEvent?: (event: LogoIntakePipelineEvent) => void;
}): Promise<LogoProposal> {
  const totalStarted = Date.now();
  const emit = (event: LogoIntakePipelineEvent) => input.onEvent?.(event);

  const renderStarted = Date.now();
  const frames = await renderIntakeFrames(input.docs, {
    onPagePrepared: (done, total) => emit({ type: "pages_preparing", done, total }),
    selectPages: input.selectPages,
  });
  const renderMs = Date.now() - renderStarted;

  const thumbs = await Promise.all(frames.slice(0, 4).map((f) => visionThumbDataUrl(f.jpegBase64)));
  emit({ type: "vision_started", pages: frames.length, thumbs });

  const { parsed, visionMs, visionCalls } = await invokeLogoIntakeVision({
    frames,
    userEmail: input.userEmail,
    route: "/api/genoma/logo-intake/analyze",
    onRetry: (attempt, max) => emit({ type: "vision_retrying", attempt, max }),
  });
  emit({ type: "vision_finished", ms: visionMs });

  const cropStarted = Date.now();
  const candidates = await buildFrameCandidates(input.docs, frames, parsed);
  const cropMs = Date.now() - cropStarted;

  const candidateStats = countVisionCandidates(parsed);
  emit({
    type: "candidates_found",
    count: candidates.length || candidateStats.count,
    prohibitedExcluded: candidateStats.prohibitedExcluded,
  });

  const { groups, grouped } = groupCandidates(candidates);
  let best = pickBestCandidate(candidates);
  const winnerList = best ? grouped.get(best.pHash) ?? [best] : [];

  const hiResStarted = Date.now();
  let logoCropPng: Buffer | null = null;
  if (best) {
    const docKind = docKindFor(input.docs, best.docId);
    const pageFrame = await renderEditPage({
      batchId: input.batchId,
      docId: best.docId,
      docKind,
      page: best.page,
    });
    const { bboxPage: trimmedBbox } = await trimBBoxPageFromPage({
      pagePng: pageFrame.png,
      pageWidth: pageFrame.width,
      pageHeight: pageFrame.height,
      bboxPage: best.bboxPage,
    });
    const hiRes = await renderCandidateAdjusted({
      batchId: input.batchId,
      docId: best.docId,
      docKind,
      page: best.page,
      bboxPage: trimmedBbox,
    });
    logoCropPng = hiRes.png;
    if (hiRes.height < MIN_LOGO_PALETTE_CROP_PX) {
      const padded = expandBBoxPage(trimmedBbox, 0.75);
      const paddedHiRes = await renderCandidateAdjusted({
        batchId: input.batchId,
        docId: best.docId,
        docKind,
        page: best.page,
        bboxPage: padded,
      });
      if (paddedHiRes.height >= MIN_LOGO_PALETTE_CROP_PX) {
        logoCropPng = paddedHiRes.png;
      }
    }
    const pHash = await computeDHashHex(hiRes.png);
    best = {
      ...best,
      bboxPage: trimmedBbox,
      pHash,
      cropPng: hiRes.png.toString("base64"),
      cropMime: "image/png",
      cropWidthPx: hiRes.width,
      cropHeightPx: hiRes.height,
    };
  }
  const hiResMs = Date.now() - hiResStarted;

  const altSet = new Map<string, LogoCandidate>();
  for (const [key, list] of grouped) {
    if (best && phashNear(key, best.pHash)) continue;
    const rep = [...list].sort((a, b) => b.quality.total - a.quality.total)[0];
    if (rep) altSet.set(rep.id, rep);
  }
  for (const c of winnerList.slice(1)) altSet.set(c.id, c);
  const alternatives = [...altSet.values()]
    .sort((a, b) => b.quality.total - a.quality.total)
    .slice(0, MAX_ALTERNATIVES);

  const partialTimings = {
    renderMs,
    visionMs,
    cropMs,
    hiResMs,
    totalMs: Date.now() - totalStarted,
  };
  const partialProposal = buildPartialProposal({
    batchId: input.batchId,
    best,
    alternatives,
    groups,
    timings: partialTimings,
    visionCalls,
    palettePending: true,
  });

  if (best) {
    const thumb = `data:${best.cropMime};base64,${best.cropPng}`;
    emit({ type: "logo_best_ready", thumb, proposal: partialProposal });
  }

  const paletteStarted = Date.now();
  const semanticPalette = await buildSemanticPaletteFromVision({
    docs: input.docs,
    frames,
    parsed,
    logoCropPng,
    onEvent: emit,
  });
  const paletteMs = Date.now() - paletteStarted;
  emit({ type: "palette_done", count: semanticPalette?.entries.length ?? 0 });

  const proposal: LogoProposal = {
    ...partialProposal,
    semanticPalette,
    palettePending: false,
    timings: {
      ...partialTimings,
      paletteMs,
      totalMs: Date.now() - totalStarted,
    },
  };

  console.info(
    "[logo-intake:analyze]",
    JSON.stringify({
      batchId: input.batchId,
      visionCalls,
      ...proposal.timings,
      bestId: best?.id ?? null,
      candidateCount: candidates.length,
      paletteEntries: semanticPalette?.entries.length ?? 0,
    }),
  );

  return proposal;
}

function docKindFor(docs: IntakeDocInput[], docId: string): "pdf" | "image" {
  return docs.find((d) => d.docId === docId)?.kind ?? "pdf";
}

async function buildFrameCandidates(
  docs: IntakeDocInput[],
  frames: IntakeFrame[],
  parsed: ParsedVisionResponse,
): Promise<LogoCandidate[]> {
  const docById = new Map(docs.map((d) => [d.docId, d]));
  const frameByKey = new Map(frames.map((f) => [`${f.docIndex}:${f.page}`, f]));
  const jobs: Array<{ raw: RawCandidate; frame: IntakeFrame; doc: IntakeDocInput }> = [];

  for (const image of parsed.images ?? []) {
    const frame = frameByKey.get(`${image.docIndex}:${image.pageNumber}`);
    if (!frame) continue;
    const doc = docById.get(frame.docId);
    if (!doc) continue;
    for (const [idx, logo] of (image.logos ?? []).entries()) {
      const raw = parseVisionLogo(frame, logo as ParsedVisionLogo, idx);
      if (raw) jobs.push({ raw, frame, doc });
    }
  }

  const results = await mapPool(jobs, FRAME_CROP_CONCURRENCY, async ({ raw, frame, doc }) => {
    try {
      const cropped =
        doc.kind === "image"
          ? await cropLogoFromImageDoc({ doc, bboxPage: raw.bboxPage })
          : await cropLogoFromFrame({
              jpegBase64: frame.jpegBase64,
              frameWidth: frame.width,
              frameHeight: frame.height,
              bboxPage: raw.bboxPage,
            });
      const pHash = await computeDHashHex(cropped.thumbJpeg);
      const quality = await scoreLogoQuality({
        cropPng: cropped.qualityCrop,
        widthPx: cropped.cropWidthPx,
        heightPx: cropped.cropHeightPx,
        isComplete: raw.model.isComplete,
        cutEdges: raw.model.cutEdges,
        confidence: raw.model.confidence,
      });
      const candidate: LogoCandidate = {
        ...raw,
        cropPng: cropped.thumbBase64,
        cropMime: "image/jpeg",
        cropWidthPx: cropped.cropWidthPx,
        cropHeightPx: cropped.cropHeightPx,
        pHash,
        quality,
      };
      return candidate;
    } catch {
      return null;
    }
  });

  return results.filter((c): c is LogoCandidate => c !== null);
}
